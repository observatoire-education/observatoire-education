import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Identite, SourceId } from "@obs/shared/types";
import { ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { completerIdentite, exporter } from "../pipeline/src/fiches.ts";
import { communeCitee, etapeNomsCites, NOM_NON_PUBLIE, nomCite } from "../pipeline/src/noms-cites.ts";
import { mettreAJourRegistre } from "../pipeline/src/registre.ts";
import type { Fiche } from "@obs/shared/types";

describe("nomCite : nom en capitales d'une source remis en forme", () => {
  test("accents de la nature, patronyme en capitales initiales", () => {
    expect(nomCite("LYCEE PROFESSIONNEL ARBEZ CARME")).toBe("Lycée professionnel Arbez Carme");
    expect(nomCite("COLLEGE PRIVE SACRE COEUR")).toBe("Collège privé Sacre Coeur");
    expect(nomCite("ETABLISSEMENT REGIONAL D ENSEIGNEMENT ADAPTE BEAUREGARD")).toBe("Établissement régional d'enseignement adapté Beauregard");
  });

  test("tiret de patronyme absent retiré, accent mal encodé, nom vide", () => {
    expect(nomCite("ECOLE PRIMAIRE PUBLIQUE -")).toBe("École primaire publique");
    expect(nomCite("LYCEE MICRO-LYC?E DE SOISSONS")).toBe("Lycée Micro-lycée de Soissons");
    expect(nomCite(" - ")).toBeNull();
    expect(nomCite(null)).toBeNull();
  });

  test("casse mixte gardée telle quelle", () => {
    expect(nomCite("École primaire Jules Ferry")).toBe("École primaire Jules Ferry");
  });

  test("commune sans code reconnu", () => {
    expect(communeCitee("CHARLEVILLE MEZIERES")).toBe("Charleville Mezieres");
    expect(communeCitee("LA ROCHE SUR YON")).toBe("La Roche sur Yon");
    expect(communeCitee("")).toBeNull();
  });
});

/** Base sur un scénario propre (CSV en ligne), sans toucher aux fixtures partagées. */
async function scenario(csv: Record<string, string>) {
  const dossier = await mkdtemp(join(tmpdir(), "obs-noms-"));
  const duck = await connexion();
  const chemins: Record<string, string> = {};
  for (const [id, contenu] of Object.entries(csv)) {
    await Bun.write(join(dossier, `${id}.csv`), contenu);
    chemins[id] = join(dossier, `${id}.parquet`);
    await executer(duck, `copy (select * from read_csv(${litteral(join(dossier, `${id}.csv`))}, header = true, all_varchar = true))
      to ${litteral(chemins[id])} (format parquet)`);
  }
  duck.closeSync();
  const db = await ouvrir(chemins as Record<SourceId, string>, { etapes: [etapeNomsCites] });
  const lignes = await db.sql<{ uai: string; nom: string | null; commune: string | null; code_commune: string | null }>(
    "select * from noms_cites order by uai",
  );
  db.fermer();
  await rm(dossier, { recursive: true, force: true });
  return lignes;
}

const FERMES = "numero_uai,appellation_officielle,libelle_commune\n0011120M,,Bellignat\n0021071D,,\n0440001A,Collège A,Nantes\n";

describe("noms_cites : nom et commune des fermés d'après les sources qui les citent", () => {
  test("patronyme préféré, puis millésime récent ; commune du COG par son code", async () => {
    const lignes = await scenario({
      fermes: FERMES,
      cog_communes: "typecom,com,libelle\nCOM,02160,Beaurieux\nCOM,01031,Bellignat\n",
      ival_pro: "annee,uai,libelle_uai,libelle_commune,code_commune\n2012,0011120M,LYCEE PROFESSIONNEL ARBEZ CARME,BELLIGNAT,01031\n2013,0011120m,LYCEE PROFESSIONNEL,OYONNAX,01283\n",
      effectifs_ecoles: "rentree_scolaire,numero_ecole,denomination_principale,patronyme,commune,code_commune_insee\n2011,0021071D,ECOLE PRIMAIRE PUBLIQUE,-,BEAURIEUX,02160\n2009,0021071D,ECOLE PRIMAIRE PUBLIQUE,DES TILLEULS,BEAURIEUX,02160\n",
      // source sans colonne de nom (ancienne version) : ignorée
      ival_gt: "annee,uai,secteur\n2015,0011120M,public\n",
    });
    expect(lignes).toEqual([
      { uai: "0011120M", nom: "Lycée professionnel Arbez Carme", commune: "Oyonnax", code_commune: null },
      { uai: "0021071D", nom: "École primaire publique des Tilleuls", commune: "Beaurieux", code_commune: "02160" },
    ]);
  });

  test("aucune source citante : table vide", async () => {
    expect(await scenario({ fermes: FERMES })).toEqual([]);
  });
});

describe("pages conservées : identité figée complétée", () => {
  const identite = { nom: null, commune: "Bellignat", codeCommune: "01031", famille: "lp" } as unknown as Identite;

  test("nom absent ou générique remplacé, commune connue gardée", () => {
    const ferme = { uai: "0011120M", nom: "Lycée professionnel Arbez Carme", commune: "Oyonnax", code_commune: null };
    expect(completerIdentite(identite, ferme)).toMatchObject({ nom: "Lycée professionnel Arbez Carme", commune: "Bellignat", codeCommune: "01031" });
    expect(completerIdentite({ ...identite, nom: NOM_NON_PUBLIE }, ferme).nom).toBe("Lycée professionnel Arbez Carme");
    expect(completerIdentite({ ...identite, nom: "Lycée Arbez" }, ferme).nom).toBe("Lycée Arbez");
  });

  test("commune absente : commune et code du jeu des fermés", () => {
    const i = { ...identite, nom: NOM_NON_PUBLIE, commune: null, codeCommune: null } as unknown as Identite;
    expect(completerIdentite(i, { uai: "x", nom: "École des Tilleuls", commune: "Beaurieux", code_commune: "02160" }))
      .toMatchObject({ nom: "École des Tilleuls", commune: "Beaurieux", codeCommune: "02160" });
    expect(completerIdentite(i, undefined)).toBe(i);
  });

  test("le registre garde le nom et la commune complétés", () => {
    const avant = { "0011120M": { premiere: "2026-11-24", identite, disparuLe: "2014-08-31" } };
    const f = { ...identite, uai: "0011120M", nom: "Lycée professionnel Arbez Carme", disparuLe: "2014-08-31" } as unknown as Fiche;
    const apres = mettreAJourRegistre(avant, [f], "2026-11-25");
    expect(apres["0011120M"]).toMatchObject({ premiere: "2026-11-24", disparuLe: "2014-08-31" });
    expect(apres["0011120M"]!.identite).toMatchObject({ nom: "Lycée professionnel Arbez Carme", commune: "Bellignat", famille: "lp" });
  });
});

test("export refusé pour une fiche sans nom ou sans commune", async () => {
  const f = { uai: "0011120M", nom: null, commune: "Bellignat" } as unknown as Fiche;
  const g = { uai: "0021071D", nom: "École", commune: null } as unknown as Fiche;
  // refus avant toute écriture : ni la base ni le dossier de sortie ne sont touchés
  await expect(exporter([f, g], {} as never, {} as never, "/inexistant")).rejects.toThrow("2 fiche(s) sans nom ou sans commune : 0011120M, 0021071D");
});
