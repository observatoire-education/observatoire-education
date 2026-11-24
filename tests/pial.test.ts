import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Famille, Fiche, MembreEtab, Secteur } from "@obs/shared/types";
import { ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { assemblerFiches } from "../pipeline/src/fiches.ts";
import { calculerPial, type RapportPial } from "../pipeline/src/pial.ts";
import { cheminsFixtures, dbTest, manifestTest } from "./aide.ts";

const dossiers: string[] = [];
const temporaire = async () => {
  const d = await mkdtemp(join(tmpdir(), "obs-pial-"));
  dossiers.push(d);
  return d;
};
afterAll(async () => {
  for (const d of dossiers) await rm(d, { recursive: true, force: true });
});

const maintenant = new Date("2026-11-23T02:17:00Z");
const manifest = manifestTest(await temporaire());
const fiches = await assemblerFiches(await dbTest(), manifest, {}, maintenant);
const fiche = (uai: string): Fiche => fiches.find((f) => f.uai === uai)!;

/** Base des fixtures où la colonne `pial` de l'annuaire change pour quelques UAI. */
async function dbPialModifie(pial: Record<string, string>) {
  const dossier = await temporaire();
  const chemins = await cheminsFixtures(dossier);
  const duck = await connexion();
  const cas = Object.entries(pial)
    .map(([uai, p]) => `when identifiant_de_l_etablissement = ${litteral(uai)} then ${litteral(p)}`)
    .join(" ");
  const annuaire = join(dossier, "annuaire.modifie.parquet");
  await executer(
    duck,
    `copy (select * replace (case ${cas} else pial end as pial) from read_parquet(${litteral(chemins.annuaire)}))
     to ${litteral(annuaire)} (format parquet)`,
  );
  duck.closeSync();
  return ouvrir({ ...chemins, annuaire });
}

const MEMBRE = (uai: string, nom: string, famille: Famille, secteur: Secteur = "public"): MembreEtab => ({ uai, nom, fermeLe: null, famille, secteur });
const JULES_VERNE = MEMBRE("0440001A", "Collège Jules-Verne", "college");
const BOURG = MEMBRE("0440104D", "École élémentaire du Bourg", "elementaire");
const JULES_FERRY = MEMBRE("0440202B", "École élémentaire Jules-Ferry", "elementaire");
const LILAS = MEMBRE("0440201A", "École maternelle Les Lilas", "maternelle");
const PIAL_JULES_VERNE = { tete: JULES_VERNE, membres: [BOURG, JULES_FERRY, LILAS] };

describe("PIAL", () => {
  test("calculerPial : clé pour chaque membre et pour la tête, membres triés par nom, tête exclue", async () => {
    const pial = await calculerPial(await dbTest());
    expect(pial.get("0440201A")).toEqual(PIAL_JULES_VERNE);
    expect(pial.get("0440001A")).toEqual(PIAL_JULES_VERNE);
    expect([...pial.keys()].sort()).toEqual(["0440001A", "0440104D", "0440201A", "0440202B"]);
  });

  test("fiche école : PIAL dans les rattachements (la page retire sa propre UAI de la liste)", () => {
    const r = fiche("0440201A").rattachements!;
    expect(r.pial).toEqual(PIAL_JULES_VERNE);
    expect(r.pial!.tete.uai).toBe("0440001A");
    expect(r.pial!.membres.map((m) => m.uai)).toEqual(["0440104D", "0440202B", "0440201A"]);
    expect(fiche("0440105E").rattachements!.pial).toBeNull(); // pas de PIAL dans l'annuaire
  });

  test("fiche du second degré : PIAL au premier niveau, null hors PIAL", () => {
    expect(fiche("0440001A").pial).toEqual(PIAL_JULES_VERNE);
    expect(fiche("0440002B").pial).toBeNull();
    expect(fiche("0440003C").pial).toBeNull();
    expect(fiche("0440001A").rattachements).toBeUndefined();
  });

  test("tête sans fiche (circonscription) : pial null, compté", async () => {
    // 0440105E et 0440108H rattachées au PIAL de la circonscription 0441002B, qui n'a pas de fiche
    const db = await dbPialModifie({ "0440105E": "0441002B", "0440108H": "0441002B" });
    const rapport: RapportPial = { tetesSansFiche: 0, membresSansTete: 0 };
    const pial = await calculerPial(db, rapport);
    expect(pial.has("0440105E")).toBe(false);
    expect(rapport).toEqual({ tetesSansFiche: 1, membresSansTete: 2 });
    const toutes = await assemblerFiches(db, manifest, {}, maintenant, { pial: rapport });
    expect(toutes.find((f) => f.uai === "0440105E")!.rattachements!.pial).toBeNull();
    expect(rapport).toEqual({ tetesSansFiche: 1, membresSansTete: 2 });
  });

  test("tête qui est une école : libellé de sa famille", async () => {
    const db = await dbPialModifie({ "0440105E": "0440104D" });
    const pial = await calculerPial(db);
    expect(pial.get("0440105E")!.tete).toEqual(BOURG);
    expect(pial.get("0440105E")!.membres.map((m) => m.uai)).toEqual(["0440105E"]);
    // 0440104D est tête d'un PIAL et membre d'un autre : la fiche montre celui dont elle est la tête
    expect(pial.get("0440104D")!.tete.uai).toBe("0440104D");
  });
});

describe("rattachements des écoles", () => {
  test("secteur, PIAL et circonscription", () => {
    expect(fiche("0440201A").rattachements).toEqual({
      secteur: { statut: "voie", colleges: [{ uai: "0440001A", nom: "Collège Jules-Verne", fermeLe: null }] },
      pial: PIAL_JULES_VERNE,
      circonscription: "NANTES 1",
    });
    expect(fiche("0440104D").rattachements!.circonscription).toBe("SAINT-AUBIN");
  });

  test("école privée sous contrat : secteur calculé aussi", () => {
    expect(fiche("0440203C").rattachements).toEqual({
      secteur: { statut: "non_rapproche", colleges: [] },
      pial: null,
      circonscription: "NANTES 1",
    });
  });

  test("école fermée : pas de rattachements", () => {
    expect(fiche("0440106F").fermeLe).not.toBeNull();
    expect(fiche("0440106F").rattachements).toBeUndefined();
  });
});

describe("écoles du secteur d'un collège", () => {
  test("collège public : écoles ouvertes dont l'adresse relève de son secteur, triées par nom", () => {
    const liste = fiche("0440001A").ecolesDuSecteur!;
    // 0440203C (non rapprochée) et 0440202B (secteur de 0440002B) n'y sont pas
    expect(liste.map((l) => l.uai)).toEqual(["0440104D", "0440105E", "0440201A"]);
    expect(liste[0]).toEqual({
      uai: "0440104D", nom: "École élémentaire du Bourg", famille: "elementaire", secteur: "public", commune: "Saint-Aubin",
      eleves: 10, ips: null,
    });
  });

  test("collège privé, lycée : null", () => {
    expect(fiche("0440002B").ecolesDuSecteur).toBeNull();
    expect(fiche("0440003C").ecolesDuSecteur).toBeNull();
  });

  test("les fiches des écoles n'ont ni pial ni ecolesDuSecteur au premier niveau", () => {
    expect(fiche("0440201A").pial).toBeUndefined();
    expect(fiche("0440201A").ecolesDuSecteur).toBeUndefined();
  });
});
