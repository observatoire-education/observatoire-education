import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DonneesFrance, DonneesSource, DonneesTerritoire, EntreeIndex } from "@obs/shared/donnees";
import type { Fiche } from "@obs/shared/types";
import { assemblerFiches, calculerVoisins, distanceKm, exporter } from "../pipeline/src/fiches.ts";
import { exporterTerritoires } from "../pipeline/src/territoires.ts";
import { ecrireRegistre, lireRegistre, mettreAJourRegistre, type Registre } from "../pipeline/src/registre.ts";
import { dbAvecRegistre, dbTest, identiteTest, manifestTest } from "./aide.ts";

const dossiers: string[] = [];
const temporaire = async () => {
  const d = await mkdtemp(join(tmpdir(), "obs-fiches-"));
  dossiers.push(d);
  return d;
};
afterAll(async () => {
  for (const d of dossiers) await rm(d, { recursive: true, force: true });
});

const db = await dbTest();
const manifest = manifestTest(await temporaire());
const maintenant = new Date("2026-11-23T02:17:00Z");
const fiches = await assemblerFiches(db, manifest, {}, maintenant);
const fiche = (uai: string): Fiche => fiches.find((f) => f.uai === uai)!;

describe("voisinage", () => {
  test("distance", () => {
    expect(Math.round(distanceKm(47.218, -1.553, 47.225, -1.553) * 100) / 100).toBe(0.78);
  });

  test("voisins d'un collège : même famille, public et privé, triés par distance", async () => {
    const v = (await calculerVoisins(db)).get("0440001A")!;
    expect(v.map((x) => x.uai)).toEqual(["0440002B", "0440007G"]); // hors contrat, lycées, sans GPS exclus
    expect(v[0]).toMatchObject({ nom: "Collège Saint-Exemple", secteur: "prive_sous_contrat", commune: "Nantes" });
    expect(v[0]!.distanceKm).toBeCloseTo(0.78, 2);
    expect(v[0]!.ips.valeur).toBe(123);
    expect(v[0]!.elevesParEtpEns.valeur).toBe(20);
    expect(v[0]!.eleves.valeur).toBe(600);
  });

  test("lycées : familles compatibles", async () => {
    // un LEGT voit les LEGT et les LPO ; un LPO voit aussi les LP
    expect((await calculerVoisins(db)).get("0440003C")!.map((x) => x.uai)).toEqual(["0440006F"]);
  });

  test("sans coordonnées : voisins null, et voisin de personne", async () => {
    const tous = await calculerVoisins(db);
    expect(tous.get("0440005E")).toBeNull();
    for (const liste of tous.values()) expect(liste?.map((x) => x.uai) ?? []).not.toContain("0440005E");
  });

  test("rayon : seul en Corse", async () => {
    expect((await calculerVoisins(db)).get("6200001F")).toEqual([]);
  });

  test("k et rayon paramétrables", async () => {
    expect((await calculerVoisins(db, 1)).get("0440001A")!.map((x) => x.uai)).toEqual(["0440002B"]);
    expect((await calculerVoisins(db, 6, 5)).get("0440001A")!.map((x) => x.uai)).toEqual(["0440002B"]);
  });
});

describe("fiches", () => {
  test("une fiche par établissement du périmètre, triées par UAI", () => {
    expect(fiches.map((f) => f.uai)).toEqual([
      "0440001A", "0440002B", "0440003C", "0440005E", "0440006F", "0440007G", "6200001F",
      "9711023K", "9750001C", "9770001G",
    ]);
  });

  test("identité, indicateurs, élèves, voisins", () => {
    const f = fiche("0440001A");
    expect(f).toMatchObject({
      nom: "Collège Jules-Verne", famille: "college", secteur: "public", dep: "44", depLibelle: "Loire-Atlantique",
      aca: "17", acaLibelle: "Nantes", codeCommune: "44109", ep: "REP", segpa: true, disparuLe: null, autresSites: [],
    });
    expect(f.indicateurs).toHaveLength(16);
    expect(f.eleves!.total).toBe(590);
    expect(f.voisins!.map((v) => v.uai)).toEqual(["0440002B", "0440007G"]);
  });

  test("autres sites d'un établissement multi-sites", () => {
    expect(fiche("0440003C").autresSites).toEqual([
      { nom: "Guist'hau sup", adresse: "31 rue du Campus", codePostal: "44300", commune: "Nantes" },
      { nom: "Annexe du lycée Guist'hau", adresse: "30 rue de l'Annexe", codePostal: "44100", commune: "Nantes" },
    ]);
  });

  test("sources d'une fiche : seulement celles utilisées, avec millésime et lien brut", () => {
    const s = fiche("0440003C").sources;
    expect(s.map((x) => x.id)).toEqual(["annuaire", "ips_lycees", "effectifs_lycees_gt", "personnels"]);
    expect(s.find((x) => x.id === "ips_lycees")).toMatchObject({
      producteur: "MEN-DEPP", rentree: 2025, collecteLe: "2026-11-22T02:17:00Z",
      brutUrl: "https://github.com/org/depot/releases/download/archives-ips_lycees-2026/ips_lycees.parquet",
    });
    expect(s.find((x) => x.id === "annuaire")!.rentree).toBeNull();
    expect(fiche("0440006F").sources.map((x) => x.id)).toContain("effectifs_lycees_pro");
  });

  test("établissement sans aucune statistique : seul l'annuaire est cité", () => {
    expect(fiche("0440007G").sources.map((x) => x.id)).toEqual(["annuaire"]);
  });
});

describe("registre des pages", () => {
  test("page conservée après disparition, avec ses dernières données", async () => {
    const registre: Registre = {
      "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" },
    };
    const f = (await assemblerFiches(await dbAvecRegistre(registre), manifest, registre, maintenant))
      .find((x) => x.uai === "0440099Z")!;
    expect(f).toMatchObject({ nom: "Collège Disparu", disparuLe: "2026-10-01", voisins: null });
    const ips = f.indicateurs.find((i) => i.code === "ips")!;
    expect(ips.mesure).toMatchObject({ valeur: 88, rentree: 2024 }); // encore présent dans la source
    expect(f.sources.map((x) => x.id)).toEqual(["annuaire", "ips_colleges"]);
  });

  test("nouvelle disparition : datée de cette collecte ; voisin de personne ; hors des moyennes", async () => {
    const registre: Registre = { "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu", 47.2185, -1.553) } };
    const d = await dbAvecRegistre(registre);
    const toutes = await assemblerFiches(d, manifest, registre, maintenant);
    expect(toutes.find((x) => x.uai === "0440099Z")!.disparuLe).toBe("2026-11-23");
    for (const f of toutes) expect(f.voisins?.map((v) => v.uai) ?? []).not.toContain("0440099Z");
    // la moyenne IPS est celle de la source ; la moyenne Σ/Σ des collèges publics ignore la page disparue
    const jv = toutes.find((x) => x.uai === "0440001A")!;
    expect(jv.indicateurs.find((i) => i.code === "eleves_par_etp_ens")!.comparaisons[0]!.public.valeur).toBe(14.75);
  });

  test("mise à jour du registre : identité des actives, disparition conservée, réapparition", async () => {
    const avant: Registre = {
      "0440001A": { premiere: "2026-01-01", identite: identiteTest("Ancien nom"), disparuLe: "2026-06-01" },
      "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu") },
    };
    const d = await dbAvecRegistre(avant);
    const apres = mettreAJourRegistre(avant, await assemblerFiches(d, manifest, avant, maintenant), "2026-11-23");
    expect(apres["0440001A"]).toEqual({ premiere: "2026-01-01", identite: expect.objectContaining({ nom: "Collège Jules-Verne" }) });
    expect(apres["0440002B"]!.premiere).toBe("2026-11-23");
    expect(apres["0440099Z"]).toMatchObject({ disparuLe: "2026-11-23", identite: { nom: "Collège Disparu" } });
    expect(Object.keys(apres)).toHaveLength(11);
  });

  test("lecture et écriture : une ligne par UAI, triée", async () => {
    const chemin = join(await temporaire(), "archives", "registre-pages.json");
    expect(lireRegistre(chemin)).toEqual({});
    const r = mettreAJourRegistre({}, fiches, "2026-11-23");
    ecrireRegistre(chemin, r);
    const texte = await Bun.file(chemin).text();
    expect(texte.split("\n")).toHaveLength(10 + 3); // accolades, 10 entrées, fin de fichier
    expect(texte.indexOf("0440001A")).toBeLessThan(texte.indexOf("6200001F"));
    expect(lireRegistre(chemin)).toEqual(r);
  });
});

describe("export des données du site", () => {
  test("fichiers produits", async () => {
    const sortie = join(await temporaire(), "data");
    await exporter(fiches, db, manifest, sortie);
    expect((await readdir(join(sortie, "fiches"))).sort()).toEqual(fiches.map((f) => `${f.uai}.json`));
    const f: Fiche = await Bun.file(join(sortie, "fiches", "0440001A.json")).json();
    expect(f.nom).toBe("Collège Jules-Verne");

    const index: EntreeIndex[] = await Bun.file(join(sortie, "index.json")).json();
    expect(index).toHaveLength(10);
    expect(index[0]).toEqual({ u: "0440001A", n: "Collège Jules-Verne", c: "Nantes", d: "44", f: "college", s: "public" });

    const dep: DonneesTerritoire = await Bun.file(join(sortie, "departements", "44.json")).json();
    expect(dep).toMatchObject({ horsContrat: 1, rentree: 2025 });
    expect(dep.ref).toEqual({ niveau: "departement", code: "44", libelle: "Loire-Atlantique" });
    expect(dep.parents.map((p) => p.niveau)).toEqual(["france", "academie"]);
    expect(dep.parents[1]).toEqual({ niveau: "academie", code: "17", libelle: "Nantes" });
    expect(dep.communes).toContainEqual({ niveau: "commune", code: "44109", libelle: "Nantes" });
    expect(dep.enfants).toEqual([]);
    expect(dep.carte.genre).toBe("points");
    if (dep.carte.genre === "points") {
      expect(dep.carte.points.map((p) => p.uai)).not.toContain("0440005E"); // sans GPS
      expect(dep.carte.points.find((p) => p.uai === "0440001A")).toEqual({
        uai: "0440001A", nom: "Collège Jules-Verne", lat: 47.218, lon: -1.553, secteur: "public", eleves: fiche("0440001A").indicateurs.find((i) => i.code === "eleves")!.mesure.valeur,
      });
    }
    const col = dep.familles.college!;
    expect(col.compte).toEqual({ public: 2, prive: 2 });
    expect(col.liste.map((l) => l.nom)).toEqual(["Collège Jules-Verne", "Collège Saint-Exemple", "Collège Sans GPS", "Collège Simple"]);
    expect(col.liste.find((l) => l.uai === "0440002B")).toMatchObject({ statutVs: "non_publie_prive", elevesParEtpVs: null, ips: 123 });
    expect(col.ipsMoyen).toEqual({ public: 106.4, prive: 121.4, calculee: false });
    expect(col.distributionIps.bornes).toHaveLength(21);
    expect(col.distributionIps.public.reduce((a, b) => a + b, 0)).toBe(1); // 0440005E n'a pas d'IPS
    expect(col.moyennes.find((m) => m.code === "eleves_par_etp_ens")!.comparaisons[0]!.public.valeur).toBe(14.75);
    expect(Object.keys(dep.familles).sort()).toEqual(["college", "legt", "lpo"]);
    expect(await Bun.file(join(sortie, "departements", "2A.json")).exists()).toBe(true);

    const commune: DonneesTerritoire = await Bun.file(join(sortie, "communes", "44109.json")).json();
    expect(commune.ref).toEqual({ niveau: "commune", code: "44109", libelle: "Nantes" });
    expect(commune.parents.map((p) => `${p.niveau} ${p.code}`)).toEqual(["france FR", "academie 17", "departement 44"]);
    const colCommune = commune.familles.college!;
    expect(colCommune.ipsMoyen.calculee).toBe(true);
    const avecIpsEtEleves = (secteur: string) =>
      fiches.filter((f) =>
        f.disparuLe === null && f.famille === "college" && f.codeCommune === "44109" && f.secteur === secteur &&
        ["ips", "eleves"].every((c) => f.indicateurs.find((i) => i.code === c)?.mesure.statut === "ok")).length;
    expect(colCommune.ipsMoyen.n).toEqual({ public: avecIpsEtEleves("public"), prive: avecIpsEtEleves("prive_sous_contrat") });
    const noms = colCommune.liste.map((l) => l.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    expect(colCommune.liste.length).toBe(4);
    expect(commune.carte.genre).toBe("points");
    expect(await Bun.file(join(sortie, "communes", "2A004.json")).exists()).toBe(false); // moins de 3 établissements

    const aca: DonneesTerritoire = await Bun.file(join(sortie, "academies", "17.json")).json();
    expect(aca.ref).toEqual({ niveau: "academie", code: "17", libelle: "Nantes" });
    expect(aca.parents.map((p) => p.niveau)).toEqual(["france"]);
    const ligne44 = aca.enfants.find((e) => e.ref.niveau === "departement" && e.ref.code === "44")!;
    expect(ligne44.ref.libelle).toBe("Loire-Atlantique");
    expect(ligne44.ecartIpsColleges).toBe(15); // 121,4 − 106,4
    expect(aca.carte.genre).toBe("departements");
    expect(aca.familles.college!.ipsMoyen).toEqual({ public: 104, prive: 120, calculee: false });
    expect(aca.familles.college!.liste).toEqual([]);

    const france: DonneesFrance = await Bun.file(join(sortie, "france.json")).json();
    expect(france.ref.code).toBe("FR");
    expect(france.parents).toEqual([]);
    expect(france.enfants.map((e) => `${e.ref.niveau} ${e.ref.code}`)).toContain("academie 17");
    expect(france.familles.college!.compte).toEqual({ public: 6, prive: 2 });
    expect(france.familles.college!.ipsMoyen.calculee).toBe(false);
    expect(france.familles.college!.liste).toEqual([]);
    expect(france.horsContrat).toBe(1);
    expect(france.academies.find((a) => a.aca === "17")!.departements).toEqual([{ dep: "44", libelle: "Loire-Atlantique" }]);
    expect(france.carte.genre).toBe("departements");

    const sources: Record<string, DonneesSource> = await Bun.file(join(sortie, "sources.json")).json();
    expect(Object.keys(sources)).toHaveLength(7);
    expect(sources.ips_colleges!.actuelle!.collecteLe).toBe("2026-11-22T02:17:00Z");
  });

  test("index : pages disparues marquées", async () => {
    const registre: Registre = { "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" } };
    const d = await dbAvecRegistre(registre);
    const sortie = join(await temporaire(), "data");
    await exporter(await assemblerFiches(d, manifest, registre, maintenant), d, manifest, sortie);
    const index: EntreeIndex[] = await Bun.file(join(sortie, "index.json")).json();
    expect(index.find((e) => e.u === "0440099Z")).toMatchObject({ n: "Collège Disparu", x: 1 });
    const dep: DonneesTerritoire = await Bun.file(join(sortie, "departements", "44.json")).json();
    expect(dep.familles.college!.liste.map((l) => l.uai)).not.toContain("0440099Z");
  });

  test("commune sous le seuil : pas de page, absente du département", async () => {
    const sortie = join(await temporaire(), "data");
    const deux = fiches.filter((f) => f.dep === "44" && f.disparuLe === null).slice(0, 2);
    expect(deux.every((f) => f.codeCommune === "44109")).toBe(true);
    await exporterTerritoires(deux, db, sortie, 2025);
    expect(await Bun.file(join(sortie, "communes", "44109.json")).exists()).toBe(false);
    const dep: DonneesTerritoire = await Bun.file(join(sortie, "departements", "44.json")).json();
    expect(dep.communes).toEqual([]);
  });
});
