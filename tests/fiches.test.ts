import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DonneesFrance, DonneesSource, DonneesTerritoire, EntreeIndex } from "@obs/shared/donnees";
import type { Fiche } from "@obs/shared/types";
import { budgetDeFiche } from "../pipeline/src/budget-eleves.ts";
import { estEcole, FAMILLES, FAMILLES_ECOLES, FAMILLES_PLURIEL, FAMILLES_SECOND_DEGRE } from "@obs/shared/libelles";
import {
  assemblerFiches, calculerVoisins, distanceKm, attacherBudgets, exporter, FAMILLES_COMPATIBLES_ECOLES, millesimesAffiches,
} from "../pipeline/src/fiches.ts";
import { communesRetenues, controlerPonderation, exporterTerritoires, ipsMoyens } from "../pipeline/src/territoires.ts";
import { ecrireRegistre, lireRegistre, mettreAJourRegistre, type Registre } from "../pipeline/src/registre.ts";
import type { BudgetCollectivite } from "@obs/shared/donnees";
import { calculerBudgets } from "../pipeline/src/budget-eleves.ts";
import { dbAvecRegistre, dbTest, identiteTest, manifestTest } from "./aide.ts";
import { comparerVersions } from "../pipeline/src/corrections.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { SOURCES } from "../pipeline/src/sources.ts";

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

  test("voisin : reussite et partAgreges", async () => {
    const v = (await calculerVoisins(db)).get("0440001A")!;
    expect(v[0]!.reussite).toEqual([{ voie: "brevet_general", session: 2025, taux: 60, va: 1 }]);
    expect(v[0]!.partAgreges).toMatchObject({ statut: "non_disponible", valeur: null });
    const inverse = (await calculerVoisins(db)).get("0440002B")!.find((x) => x.uai === "0440001A")!;
    expect(inverse.partAgreges).toMatchObject({ statut: "ok", valeur: 8 });
    expect(v[1]!.reussite).toEqual([{ voie: "brevet_general", session: 2025, taux: null, va: null }]);
    const lpo = (await calculerVoisins(db)).get("0440003C")!;
    expect(lpo[0]).toMatchObject({ uai: "0440006F", reussite: [{ voie: "bac_pro", session: 2025, taux: 70 }] });
  });

  test("lycées : familles compatibles", async () => {
    // un LEGT voit les LEGT et les LPO ; un LPO voit aussi les LP
    expect((await calculerVoisins(db)).get("0440003C")!.map((x) => x.uai)).toEqual(["0440006F"]);
  });

  test("IPS de 2018 seulement : absent des agrégats et des voisins de la dernière rentrée", async () => {
    const f = fiches.find((x) => x.uai === "0440005E")!;
    expect(f.indicateurs.find((i) => i.code === "ips")!.mesure).toMatchObject({ valeur: 86, rentree: 2018 }); // la fiche garde son IPS daté
    // un voisin géolocalisé dont le dernier IPS date de 2018 : son IPS n'est pas comparé
    const ind = new Map(fiches.map((x) => [x.uai, x.indicateurs.map((i) => (
      x.uai === "0440002B" && i.code === "ips" ? { ...i, mesure: { ...i.mesure, rentree: 2018 } } : i))]));
    const v = (await calculerVoisins(db, 1, 30, ind)).get("0440001A")!;
    expect(v[0]!.uai).toBe("0440002B");
    expect(v[0]!.ips).toMatchObject({ valeur: null, statut: "non_disponible" });
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

describe("écoles", () => {
  const ECOLES = ["0440104D", "0440105E", "0440108H", "0440201A", "0440202B", "0440203C"];

  test("libellés, familles du second degré et des écoles", () => {
    expect(FAMILLES_SECOND_DEGRE).toEqual(["college", "legt", "lpo", "lp", "erea"]);
    expect(FAMILLES_ECOLES).toEqual(["maternelle", "elementaire", "primaire"]);
    expect([FAMILLES.maternelle, FAMILLES.elementaire, FAMILLES.primaire]).toEqual(["École maternelle", "École élémentaire", "École primaire"]);
    expect([FAMILLES_PLURIEL.maternelle, FAMILLES_PLURIEL.elementaire, FAMILLES_PLURIEL.primaire])
      .toEqual(["Écoles maternelles", "Écoles élémentaires", "Écoles primaires"]);
    expect(FAMILLES_ECOLES.every(estEcole)).toBe(true);
    expect(FAMILLES_SECOND_DEGRE.some(estEcole)).toBe(false);
  });

  test("écoles compatibles", () => {
    expect(FAMILLES_COMPATIBLES_ECOLES).toEqual({
      maternelle: ["maternelle", "primaire"],
      elementaire: ["elementaire", "primaire"],
      primaire: ["maternelle", "elementaire", "primaire"],
    });
  });

  test("une fiche par école ouverte, avec sa famille", () => {
    expect(Object.fromEntries(fiches.filter((f) => estEcole(f.famille) && f.fermeLe === null).map((f) => [f.uai, f.famille]))).toEqual({
      "0440104D": "elementaire", "0440105E": "maternelle", "0440108H": "primaire",
      "0440201A": "maternelle", "0440202B": "elementaire", "0440203C": "primaire",
    });
  });

  test("écoles les plus proches : écoles ouvertes seulement, null sans coordonnées", () => {
    expect(fiche("0440104D").ecolesProches!.aucuneAMoinsDe).toBe(10);
    expect(fiche("0440105E").ecolesProches).toBeNull();
    for (const uai of ["0440106F", "0440107G", "0440001A"]) expect(fiche(uai)).not.toHaveProperty("ecolesProches");
  });

  test("une fiche historique par école fermée citée, famille d'après la nature", () => {
    expect(Object.fromEntries(fiches.filter((f) => estEcole(f.famille) && f.fermeLe !== null).map((f) => [f.uai, f.famille]))).toEqual({
      "0440106F": "elementaire", "0440107G": "maternelle", "0440109K": "elementaire", "0440110M": "maternelle",
    });
  });

  test("ni voisins ni voisines de personne", async () => {
    const tous = await calculerVoisins(db);
    for (const uai of ECOLES) expect(tous.has(uai)).toBe(false);
    for (const liste of tous.values()) for (const v of liste ?? []) expect(estEcole(v.famille)).toBe(false);
    for (const uai of ECOLES) expect(fiche(uai).voisins).toBeNull(); // 0440201A a des coordonnées
  });

  test("ni budget de collèges ou de lycées, ni résultats", () => {
    for (const uai of ECOLES) {
      expect(fiche(uai).budget).toEqual({ france: [] });
      expect(fiche(uai).resultats).toEqual([]);
      expect(fiche(uai).sources.map((s) => s.id).filter((id) => id.startsWith("budget_"))).toEqual([]);
    }
  });

  test("classes et élèves par classe sur la fiche d'une école, pas sur celle d'un collège", () => {
    const f = fiche("0440202B");
    expect(f.classes).toMatchObject({ rentree: 2025, total: 8 });
    expect(f.indicateurs.find((i) => i.code === "eleves_par_classe")!.mesure.statut).toBe("ok");
    expect(f.sources.map((s) => s.id)).toEqual([
      "annuaire", "effectifs_ecoles", "ips_ecoles_2016", "ips_ecoles", "personnels_ecoles", "classes_ecoles", "ecoles_ep",
    ]);
    expect(f.sources.find((s) => s.id === "ips_ecoles")!.rentree).toBe(2024);
    expect(f.sources.find((s) => s.id === "personnels_ecoles")!.rentree).toBe(2025);
    expect(f.sources.find((s) => s.id === "ecoles_ep")!.rentree).toBe(2018); // dernière rentrée affichée de la série
    expect(millesimesAffiches(f).get("ecoles_ep")).toEqual(new Set([2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018]));
    expect(millesimesAffiches(f).get("classes_ecoles")).toEqual(new Set([2025]));
    expect(fiche("0440108H").classes!.types).toBeNull();
    expect(fiche("0440001A")).not.toHaveProperty("classes");
    expect(fiche("0440001A").indicateurs.map((i) => i.code)).not.toContain("eleves_par_classe");
  });

  test("absentes des territoires", async () => {
    const actives = fiches.filter((f) => f.disparuLe === null);
    expect(communesRetenues(actives).get("44109")!.some((f) => estEcole(f.famille))).toBe(false);
    // une école fictive avec IPS et élèves, et une moyenne DEPP pour sa famille : ignorée par le contrôle
    const ipsDep = await ipsMoyens(db, "dep");
    const sansEcole = controlerPonderation(actives, ipsDep, 2025);
    const fictive: Fiche = { ...fiche("0440001A"), uai: "0440299Z", famille: "maternelle" };
    ipsDep.set("maternelle|44", { ...ipsDep.get("college|44")!, pub: 50 });
    expect(controlerPonderation([...actives, fictive], ipsDep, 2025)).toEqual(sansEcole);
    expect(communesRetenues([...actives, fictive]).get("44109")!.map((f) => f.uai)).not.toContain("0440299Z");
  });
});

describe("fiches", () => {
  test("une fiche par établissement du périmètre, triées par UAI", () => {
    expect(fiches.map((f) => f.uai)).toEqual([
      "0350001A", "0350002B", "0350003C", "0350004D", "0350005E", "0350011L", "0350012M", "0350013N", "0350014P", "0350015R",
      "0440001A", "0440002B", "0440003C", "0440005E", "0440006F", "0440007G", "0440020P", "0440021R", "0440023T", "0440099Z", "0440101A", "0440102B", "0440103C",
      "0440104D", "0440105E", "0440106F", "0440107G", "0440108H", "0440109K", "0440110M", "0440200E", "0440201A", "0440202B", "0440203C",
      "0750701C", "0751501A", "0751502B", "6200001F", "9711023K", "9750001C", "9770001G",
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
    expect(s.map((x) => x.id)).toEqual(["annuaire", "ips_lycees", "effectifs_lycees_gt", "personnels", "ips_lycees_2016", "ips_lycees_2022"]);
    expect(s.find((x) => x.id === "ips_lycees")).toMatchObject({
      producteur: "MEN-DEPP", rentree: 2025, collecteLe: "2026-11-22T02:17:00Z",
      brutUrl: "https://github.com/org/depot/releases/download/archives-ips_lycees-2026/ips_lycees.parquet",
    });
    expect(s.find((x) => x.id === "annuaire")!.rentree).toBeNull();
    expect(fiche("0440006F").sources.map((x) => x.id)).toContain("effectifs_lycees_pro");
  });

  test("résultats : sources ivac et ival avec la dernière session, millésimes affichés", () => {
    expect(fiche("0440001A").sources.find((x) => x.id === "ivac")!.rentree).toBe(2025);
    expect(fiche("0440103C").sources.map((x) => x.id)).toEqual(expect.arrayContaining(["ival_gt", "ival_pro"]));
    expect([...millesimesAffiches(fiche("0440103C")).get("ival_gt")!].sort()).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(fiche("0440200E").resultats).toEqual([]);
    expect(fiche("0440021R").resultats.map((r) => r.voie)).toEqual(["bac_pro"]); // fermé : historique conservé
  });

  test("établissement dont seul l'effectif du brevet est publié : annuaire et IVAC cités", () => {
    expect(fiche("0440007G").sources.map((x) => x.id)).toEqual(["annuaire", "ivac"]); // effectif publié, aucune valeur
  });
});

describe("établissements fermés", () => {
  test("fermé cité par une source historique : une fiche, disparuLe = fermeLe = date officielle", () => {
    expect(fiche("0440020P")).toMatchObject({
      nom: "Collège Ancien Port", famille: "college", secteur: "public", contrat: null, ep: null, segpa: false,
      ulis: false, internat: false, autresSites: [], dep: "44", depLibelle: "Loire-Atlantique", aca: "17",
      fermeLe: "2019-08-31", disparuLe: "2019-08-31", voisins: null,
    });
  });

  test("source de la date de fermeture : jeu des fermés sur les fiches qui affichent une date", async () => {
    const ids = (f: Fiche) => f.sources.map((s) => s.id);
    // Fiche historique : l'identité vient du jeu des fermés, qui remplace l'Annuaire.
    expect(ids(fiche("0440101A"))).toContain("fermes");
    expect(ids(fiche("0440101A"))).not.toContain("annuaire");
    // Successeur actif dont les prédécesseurs ont une date de fermeture.
    expect(fiche("0440103C").predecesseurs.every((p) => p.fermeLe !== null)).toBe(true);
    expect(ids(fiche("0440103C"))).toEqual(expect.arrayContaining(["annuaire", "fermes"]));
    // Fiche active sans prédécesseur : pas de jeu des fermés.
    expect(ids(fiche("0440001A"))).not.toContain("fermes");
    // Fiche fermée tirée du registre (identité de l'Annuaire) avec une date officielle : les deux sources.
    const registre: Registre = { "0440022S": { premiere: "2026-01-01", identite: identiteTest("Collège Oublié"), disparuLe: "2026-10-01" } };
    const f = (await assemblerFiches(await dbAvecRegistre(registre), manifest, registre, maintenant)).find((x) => x.uai === "0440022S")!;
    expect(f.fermeLe).toBe("2018-08-31");
    expect(ids(f)).toEqual(expect.arrayContaining(["annuaire", "fermes"]));
    // Fiche disparue sans date officielle : pas de jeu des fermés.
    const r2: Registre = { "0440097X": { premiere: "2026-01-01", identite: identiteTest("Collège Parti"), disparuLe: "2026-10-01" } };
    const g = (await assemblerFiches(await dbAvecRegistre(r2), manifest, r2, maintenant)).find((x) => x.uai === "0440097X")!;
    expect(g.fermeLe).toBeNull();
    expect(ids(g)).not.toContain("fermes");
  });

  test("fermé que rien ne cite : pas de fiche", () => {
    expect(fiches.some((f) => f.uai === "0440022S")).toBe(false);
  });

  test("LP fermé en 2014 cité par l'IVAL seul : une fiche", () => {
    expect(fiche("0440021R")).toMatchObject({ famille: "lp", fermeLe: "2014-08-31", disparuLe: "2014-08-31" });
  });

  test("fermé déjà au registre : fermeLe = date officielle, identité du registre gardée", async () => {
    const registre: Registre = {
      "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" },
    };
    const toutes = await assemblerFiches(await dbAvecRegistre(registre), manifest, registre, maintenant);
    expect(toutes.filter((f) => f.uai === "0440099Z")).toHaveLength(1);
    expect(toutes.find((f) => f.uai === "0440099Z")).toMatchObject({
      nom: "Collège Disparu", fermeLe: "2020-08-31", disparuLe: "2020-08-31",
    });
  });

  test("successeurs : le LPO succède au LGT et au LP fermés (règle 1)", () => {
    const lien = (uai: string, nom: string, fermeLe: string | null) => ({ uai, nom, fermeLe });
    expect(fiche("0440103C").predecesseurs).toEqual([
      lien("0440101A", "Lycée général du Port", "2020-08-31"), lien("0440102B", "Lycée professionnel du Port", "2020-08-31"),
    ]);
    expect(fiche("0440101A").successeurs).toEqual([lien("0440103C", "Lycée polyvalent du Port", null)]);
    expect(fiche("0440102B").successeurs).toEqual([lien("0440103C", "Lycée polyvalent du Port", null)]);
    expect(fiche("0440103C").successeurs).toEqual([]);
  });

  test("fiche active : fermeLe null", () => {
    expect(fiche("0440001A").fermeLe).toBeNull();
  });

  test("secteur des fermés : tiré des sources qui les citent (la liste donne « - »)", async () => {
    expect(fiche("0440020P").secteur).toBe("public"); // IPS des collèges
    expect(fiche("0440021R").secteur).toBe("public"); // IVAL seul
    expect(fiche("0440023T")).toMatchObject({ secteur: "prive_sous_contrat", famille: "college", fermeLe: "2021-08-31" }); // IVAC « PR »
    const [r] = await db.sql<{ secteur: string | null }>("select secteur from fermes where uai = '0440101A'");
    expect(r!.secteur).toBe("public");
  });

  test("UAI active aussi présente chez les fermés : ni fermeLe ni disparuLe", () => {
    expect(fiche("0440002B")).toMatchObject({ fermeLe: null, disparuLe: null });
  });

  test("la date officielle remplace celle du registre, et entre au registre", async () => {
    const avant: Registre = {
      "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" },
    };
    const d = await dbAvecRegistre(avant);
    expect(await d.sql("select disparu_le from disparus where uai = '0440099Z'")).toEqual([{ disparu_le: "2020-08-31" }]);
    const apres = mettreAJourRegistre(avant, await assemblerFiches(d, manifest, avant, maintenant), "2026-11-23");
    expect(apres["0440099Z"]).toMatchObject({ premiere: "2026-01-01", disparuLe: "2020-08-31", identite: { nom: "Collège Disparu" } });
  });

  test("les fiches historiques entrent au registre", () => {
    const r = mettreAJourRegistre({}, fiches, "2026-11-23");
    expect(r["0440020P"]).toMatchObject({ premiere: "2026-11-23", disparuLe: "2019-08-31", identite: { nom: "Collège Ancien Port" } });
    expect(r["0440021R"]!.disparuLe).toBe("2014-08-31");
    expect(r["0440022S"]).toBeUndefined();
  });

  test("les historiques ne sont ni voisins ni comptés dans les établissements actifs", async () => {
    const tous = await calculerVoisins(db);
    expect(tous.has("0440020P")).toBe(false);
    for (const liste of tous.values()) expect(liste?.map((x) => x.uai) ?? []).not.toContain("0440020P");
  });
});

describe("registre des pages", () => {
  test("page conservée après disparition, avec ses dernières données", async () => {
    const registre: Registre = {
      "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" },
    };
    const f = (await assemblerFiches(await dbAvecRegistre(registre), manifest, registre, maintenant))
      .find((x) => x.uai === "0440099Z")!;
    expect(f).toMatchObject({ nom: "Collège Disparu", disparuLe: "2020-08-31", voisins: null });
    const ips = f.indicateurs.find((i) => i.code === "ips")!;
    expect(ips.mesure).toMatchObject({ valeur: 88, rentree: 2024 }); // encore présent dans la source
    // Sa date de fermeture officielle vient du jeu des fermés.
    expect(f.sources.map((x) => x.id)).toEqual(["annuaire", "ips_colleges", "fermes", "ival_gt"]);
  });

  test("disparition absente des fermés officiels : datée de cette collecte", async () => {
    const registre: Registre = { "0440098Y": { premiere: "2026-01-01", identite: identiteTest("Collège Évanoui") } };
    const toutes = await assemblerFiches(await dbAvecRegistre(registre), manifest, registre, maintenant);
    expect(toutes.find((x) => x.uai === "0440098Y")).toMatchObject({ disparuLe: "2026-11-23", fermeLe: null });
  });

  test("nouvelle disparition : date officielle ; voisin de personne ; hors des moyennes", async () => {
    const registre: Registre = { "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu", 47.2185, -1.553) } };
    const d = await dbAvecRegistre(registre);
    const toutes = await assemblerFiches(d, manifest, registre, maintenant);
    expect(toutes.find((x) => x.uai === "0440099Z")!.disparuLe).toBe("2020-08-31");
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
    expect(apres["0440099Z"]).toMatchObject({ disparuLe: "2020-08-31", identite: { nom: "Collège Disparu" } });
    expect(Object.keys(apres)).toHaveLength(41); // + 5 fiches historiques + 10 d'Ille-et-Vilaine (nuages) + 6 écoles + 4 écoles fermées
  });

  test("lecture et écriture : une ligne par UAI, triée", async () => {
    const chemin = join(await temporaire(), "archives", "registre-pages.json");
    expect(lireRegistre(chemin)).toEqual({});
    const r = mettreAJourRegistre({}, fiches, "2026-11-23");
    ecrireRegistre(chemin, r);
    const texte = await Bun.file(chemin).text();
    expect(texte.split("\n")).toHaveLength(41 + 3); // accolades, 41 entrées (dont 6 écoles et 4 écoles fermées), fin de fichier
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
    expect(index).toHaveLength(41); // dont 6 écoles et 4 écoles fermées : l'index des données les contient, seules les routes du site les retirent
    expect(index[0]).toEqual({ u: "0350001A", n: "Collège Les Ajoncs", c: "Rennes", d: "35", f: "college", s: "public" });

    const dep: DonneesTerritoire = await Bun.file(join(sortie, "departements", "44.json")).json();
    expect(dep).toMatchObject({ horsContrat: 1, rentree: 2025 });
    expect(dep.ref).toEqual({ niveau: "departement", code: "44", libelle: "Loire-Atlantique" });
    expect(dep.parents.map((p) => p.niveau)).toEqual(["france", "region", "academie"]);
    expect(dep.parents[1]).toEqual({ niveau: "region", code: "52", libelle: "Pays de la Loire" });
    expect(dep.parents[2]).toEqual({ niveau: "academie", code: "17", libelle: "Nantes" });
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
    expect(col.liste.find((l) => l.uai === "0440005E")!.ips).toBeNull(); // IPS de 2018 : hors de la liste
    expect(col.distributionIps.bornes).toHaveLength(21);
    expect(col.distributionIps.public.reduce((a, b) => a + b, 0)).toBe(1); // 0440005E : son seul IPS (2018) n'est pas de la dernière rentrée
    expect(col.moyennes.find((m) => m.code === "eleves_par_etp_ens")!.comparaisons[0]!.public.valeur).toBe(14.75);
    expect(Object.keys(dep.familles).sort()).toEqual(["college", "erea", "legt", "lpo"]);
    expect(dep.familles.college!.ipsHistorique.find((p) => p.rentree === 2018)).toEqual({ rentree: 2018, public: 91.6, prive: 120, calculee: true });
    expect(dep.familles.college!.ipsHistorique.find((p) => p.rentree === 2025)).toMatchObject({ calculee: false });
    expect(await Bun.file(join(sortie, "departements", "2A.json")).exists()).toBe(true);

    const commune: DonneesTerritoire = await Bun.file(join(sortie, "communes", "44109.json")).json();
    expect(commune.ref).toEqual({ niveau: "commune", code: "44109", libelle: "Nantes" });
    expect(commune.parents.map((p) => `${p.niveau} ${p.code}`)).toEqual(["france FR", "region 52", "academie 17", "departement 44"]);
    expect(commune.budget).toEqual({ collectivites: [], france: [] });
    const colCommune = commune.familles.college!;
    expect(colCommune.ipsMoyen.calculee).toBe(true);
    const avecIpsEtEleves = (secteur: string) =>
      fiches.filter((f) =>
        f.disparuLe === null && f.famille === "college" && f.codeCommune === "44109" && f.secteur === secteur &&
        f.indicateurs.find((i) => i.code === "ips")?.mesure.rentree === 2025 &&
        ["ips", "eleves"].every((c) => f.indicateurs.find((i) => i.code === c)?.mesure.statut === "ok")).length;
    expect(colCommune.ipsMoyen.n).toEqual({ public: avecIpsEtEleves("public"), prive: avecIpsEtEleves("prive_sous_contrat") });
    const noms = colCommune.liste.map((l) => l.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    expect(colCommune.liste.length).toBe(4);
    expect(commune.carte.genre).toBe("points");
    expect(await Bun.file(join(sortie, "communes", "2A004.json")).exists()).toBe(false); // moins de 3 établissements

    const aca: DonneesTerritoire = await Bun.file(join(sortie, "academies", "17.json")).json();
    expect(aca.ref).toEqual({ niveau: "academie", code: "17", libelle: "Nantes" });
    expect(aca.parents.map((p) => `${p.niveau} ${p.code}`)).toEqual(["france FR", "region 52"]);
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
    expect(france.familles.college!.compte).toEqual({ public: 11, prive: 5 }); // + 3 publics et 2 privés d'Ille-et-Vilaine
    expect(france.familles.college!.ipsMoyen.calculee).toBe(false);
    expect(france.familles.college!.liste).toEqual([]);
    expect(france.horsContrat).toBe(1);
    expect(france.academiesEtDepartements.find((a) => a.aca === "17")!.departements).toEqual([{ dep: "44", libelle: "Loire-Atlantique" }]);
    expect(france.carte.genre).toBe("departements");

    const sources: Record<string, DonneesSource> = await Bun.file(join(sortie, "sources.json")).json();
    expect(Object.keys(sources).filter((k) => !k.startsWith("budget_"))).toHaveLength(27);
    expect(Object.keys(sources)).toContain("budget_2024");
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

  test("commune sous le seuil : pas de page du second degré, absente du département (pas de CSV)", async () => {
    const sortie = join(await temporaire(), "data");
    const deux = fiches.filter((f) => f.dep === "44" && f.disparuLe === null).slice(0, 2);
    expect(deux.every((f) => f.codeCommune === "44109")).toBe(true);
    await exporterTerritoires(deux, db, sortie, 2025);
    // Nantes a eu des écoles depuis 2012 (fermées, dans la liste des fermés) : page de ses écoles seulement.
    const nantes: DonneesTerritoire = await Bun.file(join(sortie, "communes", "44109.json")).json();
    expect(nantes.familles).toEqual({});
    expect(nantes.ecoles!.ecoles).toEqual([]); // aucune école ouverte parmi les fiches exportées
    expect(nantes.ecoles!.fermees.map((f) => f.uai)).toEqual(["0440110M", "0440109K", "0440107G"]);
    const dep: DonneesTerritoire = await Bun.file(join(sortie, "departements", "44.json")).json();
    expect(dep.communes).toEqual([]);
  });
});

const avecEleves = (f: Fiche): Fiche => ({
  ...f,
  indicateurs: f.indicateurs.map((i) =>
    i.code === "eleves" && ["0440001A", "0440003C"].includes(f.uai)
      ? { ...i, historique: [[2022, 500], [2023, 600], ...i.historique] }
      : i),
});
const budgets = await calculerBudgets(db, fiches.map(avecEleves));

describe("budget des fiches et des territoires", () => {
  // Les fixtures n'ont pas d'élèves aux rentrées 2022 et 2023 : on en ajoute à deux fiches pour que
  // les exercices 2023 et 2024 des balances de test aient des dénominateurs.
  const fichesBudget = fiches.map(avecEleves);
  const budgetDe = (uai: string) => budgetDeFiche(fichesBudget.find((f) => f.uai === uai)!, budgets);
  const sortieBudget = async () => {
    const sortie = join(await temporaire(), "data");
    await exporterTerritoires(fichesBudget.filter((f) => f.disparuLe === null), db, sortie, 2025, budgets);
    return sortie;
  };
  const lire = async <T>(sortie: string, ...chemin: string[]): Promise<T> => Bun.file(join(sortie, ...chemin)).json();

  test("assemblerFiches attache à chaque fiche le budget de sa collectivité", async () => {
    const attendu = await calculerBudgets(db, fiches);
    for (const f of fiches) expect(f.budget).toEqual(budgetDeFiche(f, attendu));
  });

  test("fiche collège de Loire-Atlantique : budget dep-44, pas de lycées", () => {
    const b = budgetDe("0440001A");
    expect(b.colleges?.id).toBe("dep-44");
    expect(b.lycees).toBeUndefined();
    expect(b.motif).toBeUndefined();
    expect(b.france.map((m) => m.niveau)).toEqual(["colleges"]);
  });

  test("fiche de lycée : collectivité de la région, moyennes des lycées", () => {
    const b = budgetDe("0440003C");
    expect(b.colleges).toBeUndefined();
    expect(b.lycees?.id).toBe("reg-52");
    expect(b.france.map((m) => m.niveau)).toEqual(["lycees"]);
  });

  test("Saint-Pierre-et-Miquelon : budget null, collectivité non identifiée", () => {
    expect(fiche("9750001C").budget).toMatchObject({ colleges: null, motif: "collectivite_non_identifiee" });
  });

  test("Mayotte : budget null, aucune collectivité", () => {
    const f = { famille: "college", dep: "976", codeCommune: "97611" } as const;
    expect(budgetDeFiche(f, { collectivites: new Map(), france: [] })).toEqual({ colleges: null, france: [], motif: "aucune_collectivite" });
  });

  test("page région : parents [France], IPS moyens calculés, départements et académies, budget de la région", async () => {
    const sortie = await sortieBudget();
    const reg: DonneesTerritoire = await lire(sortie, "regions", "52.json");
    expect(reg.ref).toEqual({ niveau: "region", code: "52", libelle: "Pays de la Loire" });
    expect(reg.parents).toEqual([{ niveau: "france", code: "FR", libelle: "France" }]);
    expect(reg.familles.college!.ipsMoyen.calculee).toBe(true);
    expect(reg.familles.college!.liste).toEqual([]);
    for (const m of reg.familles.college!.moyennes) for (const c of m.comparaisons) expect(c.niveau).toBe("france");
    expect(reg.enfants.map((e) => `${e.ref.niveau} ${e.ref.code}`)).toEqual(["departement 44"]);
    expect(reg.academies).toEqual([{ niveau: "academie", code: "17", libelle: "Nantes" }]);
    expect(reg.carte.genre).toBe("departements");
    expect(reg.budget.collectivites.map((c) => `${c.niveau}|${c.id}`)).toEqual(["colleges|dep-44", "lycees|reg-52"]);
    expect(reg.budget.france.map((m) => m.niveau)).toEqual(["colleges", "lycees"]);
    const regions = await readdir(join(sortie, "regions"));
    expect(regions).not.toContain("975.json");
    expect(regions.sort()).toEqual(["01.json", "11.json", "52.json", "53.json", "94.json"]);
  });

  test("fil d'Ariane des données : département → [France, région, académie] ; 975 → [France, académie]", async () => {
    const sortie = await sortieBudget();
    const dep44: DonneesTerritoire = await lire(sortie, "departements", "44.json");
    expect(dep44.parents.map((p) => p.niveau)).toEqual(["france", "region", "academie"]);
    const dep975: DonneesTerritoire = await lire(sortie, "departements", "975.json");
    expect(dep975.parents.map((p) => p.niveau)).toEqual(["france", "academie"]);
    expect(dep975.budget.collectivites).toEqual([]);
    const aca975: DonneesTerritoire = await lire(sortie, "academies", `${fiche("9750001C").aca}.json`);
    expect(aca975.parents.map((p) => p.niveau)).toEqual(["france"]);
    expect(dep44.budget.collectivites.map((c) => c.id)).toEqual(["dep-44", "reg-52"]);
  });

  test("France : toutes les collectivités, régions, carte du budget par collectivité", async () => {
    const sortie = await sortieBudget();
    const france: DonneesFrance = await lire(sortie, "france.json");
    expect(france.regions.map((r) => r.code).sort()).toEqual(["01", "11", "52", "53", "94"]);
    expect(france.regions.every((r) => r.niveau === "region")).toBe(true);
    expect(france.budget.collectivites.map((c) => `${c.niveau}|${c.id}`)).toContain("colleges|dep-44");
    expect(france.carteBudget.genre).toBe("collectivites");
    const dep44 = france.carteBudget.valeurs.find((v) => v.id === "dep-44")!;
    expect(dep44.budget).not.toBeNull();
    expect(dep44.deps).toEqual(["44"]);
    expect(france.carteBudget.valeurs.every((v) => !v.id.startsWith("reg-"))).toBe(true);
  });

  test("département du Rhône : deux collectivités des collèges ; la carte les couvre toutes les deux", async () => {
    const modele = fiche("0440001A");
    const rhone = [
      { ...modele, uai: "0690001A", dep: "69", depLibelle: "Rhône", codeCommune: "69385" }, // Lyon 5e : Métropole
      { ...modele, uai: "0690002B", dep: "69", depLibelle: "Rhône", codeCommune: "69245" }, // Tarare : Département
    ];
    const bud = (id: string, montant: number): BudgetCollectivite => ({
      id, libelle: id, niveau: "colleges", mentions: [], citesScolaires: undefined,
      exercices: [{
        exercice: 2024, rentree: 2023, source: "budget_2024", eleves: { public: 10, prive: null }, citesScolaires: null,
        public: {
          horsPersonnel: { total: montant * 10, parEleve: montant, statut: "ok" },
          avecPersonnel: { total: null, parEleve: null, statut: "personnel_non_rattache" },
          investissement: { total: null, parEleve: null, statut: "non_disponible" },
        },
        prive: {
          fonctionnement: { total: null, parEleve: null, statut: "aucun_eleve_prive" },
          investissement: { total: null, parEleve: null, statut: "aucun_eleve_prive" },
        },
      }],
    }) as unknown as BudgetCollectivite;
    const budgets = {
      collectivites: new Map([["colleges|ml-lyon", bud("ml-lyon", 500)], ["colleges|dep-69", bud("dep-69", 300)]]),
      france: [],
    };
    const sortie = join(await temporaire(), "data");
    await exporterTerritoires(rhone, db, sortie, 2025, budgets);
    const dep: DonneesTerritoire = await lire(sortie, "departements", "69.json");
    expect(dep.budget.collectivites.map((c) => c.id)).toEqual(["dep-69", "ml-lyon"]);
    const france: DonneesFrance = await lire(sortie, "france.json");
    expect(france.carteBudget.valeurs).toEqual([
      { id: "dep-69", deps: ["69"], budget: 300 },
      { id: "ml-lyon", deps: ["69"], budget: 500 },
    ]);
  });


  describe("corrections de millésime", () => {
    const lire = async <T>(sortie: string, ...chemin: string[]): Promise<T> => Bun.file(join(sortie, ...chemin)).json();
    const urlPrec = "https://github.com/org/depot/releases/download/archives-ips_colleges-2025/ips_colleges.parquet";
    const manifestCorrige = async () => {
      const m = manifestTest(await temporaire());
      m.ajouter("ips_colleges", {
        sha256: "a".repeat(64), tag: "archives-ips_colleges-2025", fichier: "ips_colleges.parquet", url: urlPrec,
        modified: "2025-11-01T00:00:00Z", collecteLe: "2025-11-22T02:17:00Z", lignes: 10,
      });
      m.rendreActuelle("ips_colleges", "ips_colleges".padEnd(64, "0"));
      return m;
    };
    const entree = (millesime: number, cles: string[]) => ({
      source: "ips_colleges" as const, millesime, cles, precedente: "a".repeat(64), corrigee: "ips_colleges".padEnd(64, "0"),
      le: "2026-11-22T02:17:00Z",
    });

    test("millesimesAffiches : rentrées des séries, répartitions, élèves et exercices", () => {
      const f = fiche("0440001A");
      const m = millesimesAffiches(f);
      expect(m.get("ips_colleges")?.has(f.indicateurs.find((i) => i.code === "ips")!.mesure.rentree!)).toBe(true);
    });

    test("millesimesAffiches : chaque rentrée d'IPS sous le jeu dont elle vient", () => {
      const m = millesimesAffiches(fiche("0440001A"));
      expect([...m.get("ips_colleges_2016")!].sort()).toEqual([2016, 2017, 2018, 2019, 2020, 2021]);
      expect([...m.get("ips_colleges_2022")!]).toEqual([2022]);
      expect(m.get("ips_colleges")!.has(2016)).toBe(false);
    });

    test("correction de l'IPS 2024 d'un collège : sur sa fiche seulement", async () => {
      const m = await manifestCorrige();
      const toutes = await assemblerFiches(db, m, {}, maintenant, { corrections: [entree(2024, ["0440001A"])] });
      const sur = toutes.find((f) => f.uai === "0440001A")!.sources.find((s) => s.id === "ips_colleges")!;
      expect(sur.corrections).toEqual([
        { millesime: 2024, le: "2026-11-22T02:17:00Z", precedente: urlPrec, corrigee: sur.brutUrl },
      ]);
      expect(toutes.filter((f) => f.uai !== "0440001A").flatMap((f) => f.sources).some((s) => s.corrections)).toBe(false);
    });

    test("version publiée après la correction (rentrée ajoutée) : la mention reste (spec 6.3)", async () => {
      const m = await manifestCorrige();
      // Une troisième version, plus récente, qui ne touche pas 2024 : le chiffre corrigé est toujours affiché.
      m.ajouter("ips_colleges", {
        sha256: "d".repeat(64), tag: "t", fichier: "ips_colleges-apres.parquet", url: "https://exemple.org/ips-apres.parquet",
        modified: "2026-11-23T00:00:00Z", collecteLe: "2026-11-23T02:17:00Z", lignes: 10,
      });
      const toutes = await assemblerFiches(db, m, {}, maintenant, { corrections: [entree(2024, ["0440001A"])] });
      const sur = toutes.find((f) => f.uai === "0440001A")!.sources.find((s) => s.id === "ips_colleges")!;
      expect(sur.corrections?.map((c) => c.millesime)).toEqual([2024]);
    });

    test("retour du portail à la version d'avant la correction : mention absente", async () => {
      const m = await manifestCorrige();
      m.rendreActuelle("ips_colleges", "a".repeat(64));
      const toutes = await assemblerFiches(db, m, {}, maintenant, { corrections: [entree(2024, ["0440001A"])] });
      expect(toutes.flatMap((f) => f.sources).some((s) => s.corrections)).toBe(false);
    });

    test("correction d'un millésime que la fiche n'affiche pas : absente", async () => {
      const m = await manifestCorrige();
      const toutes = await assemblerFiches(db, m, {}, maintenant, { corrections: [entree(2015, ["0440001A"])] });
      expect(toutes.flatMap((f) => f.sources).some((s) => s.corrections)).toBe(false);
    });

    const exercice = (n: number) => ({
      exercice: n, rentree: n - 1, source: `budget_${n}`, eleves: { public: 10, prive: null }, citesScolaires: null,
      public: {
        horsPersonnel: { total: 100, parEleve: 10, statut: "ok" },
        avecPersonnel: { total: null, parEleve: null, statut: "personnel_non_rattache" },
        investissement: { total: null, parEleve: null, statut: "non_disponible" },
      },
      prive: {
        fonctionnement: { total: null, parEleve: null, statut: "aucun_eleve_prive" },
        investissement: { total: null, parEleve: null, statut: "aucun_eleve_prive" },
      },
    });
    const budgetDep = (id: string, exercices: number[]) => ({
      id, libelle: id, niveau: "colleges", mentions: [], exercices: exercices.map(exercice),
    }) as unknown as BudgetCollectivite;
    const versionAvant = (m: ReturnType<typeof manifestTest>, source: "budget_2023" | "budget_2024") =>
      m.ajouter(source, {
        sha256: "c".repeat(64), tag: "t", fichier: "avant.parquet", url: `https://exemple.org/${source}-avant.parquet`,
        modified: "2025-11-01T00:00:00Z", collecteLe: "2025-11-22T02:17:00Z", lignes: 1,
      }) && m.rendreActuelle(source, source.padEnd(64, "0"));
    const budgetCorrige = (source: "budget_2023" | "budget_2024", cles: string[]) => ({
      source, millesime: Number(source.slice(7)), cles, precedente: "c".repeat(64), corrigee: source.padEnd(64, "0"), le: "2026-11-22T02:17:00Z",
    });

    test("fiche : exercice de budget antérieur au dernier, corrigé et affiché : mention sur sa propre source", async () => {
      const m = manifestTest(await temporaire());
      versionAvant(m, "budget_2023");
      const f = structuredClone(fiche("0440001A"));
      const budgets = { collectivites: new Map([["colleges|dep-44", budgetDep("dep-44", [2023, 2024])]]), france: [] };
      attacherBudgets([f], budgets, m, [budgetCorrige("budget_2023", ["DEPT|044|052|DEP LOIRE-ATLANTIQUE"])]);
      expect(f.sources.find((x) => x.id === "budget_2024")?.corrections).toBeUndefined();
      const s = f.sources.find((x) => x.id === "budget_2023")!;
      expect(s.rentree).toBe(2022);
      expect(s.corrections).toEqual([
        { millesime: 2023, le: "2026-11-22T02:17:00Z", precedente: "https://exemple.org/budget_2023-avant.parquet", corrigee: s.brutUrl },
      ]);
      // Un exercice que le bloc n'affiche pas : aucune source ajoutée.
      const g = structuredClone(fiche("0440001A"));
      attacherBudgets([g], { collectivites: new Map([["colleges|dep-44", budgetDep("dep-44", [2024])]]), france: [] }, m,
        [budgetCorrige("budget_2023", ["DEPT|044|052|DEP LOIRE-ATLANTIQUE"])]);
      expect(g.sources.some((x) => x.id === "budget_2023")).toBe(false);
    });

    test("territoire : correction de budget d'un exercice affiché présente, d'un exercice non affiché absente", async () => {
      const m = manifestTest(await temporaire());
      versionAvant(m, "budget_2023");
      versionAvant(m, "budget_2024");
      const sortie = join(await temporaire(), "data");
      const budgets = { collectivites: new Map([["colleges|dep-44", budgetDep("dep-44", [2024])]]), france: [] };
      const actives = fiches.filter((f) => f.disparuLe === null);
      const cles = ["DEPT|044|052|DEP LOIRE-ATLANTIQUE"];
      await exporterTerritoires(actives, db, sortie, 2025, budgets, [budgetCorrige("budget_2023", cles), budgetCorrige("budget_2024", cles)], m);
      const d44: DonneesTerritoire = await lire(sortie, "departements", "44.json");
      expect(d44.corrections?.map((c) => `${c.source} ${c.millesime}`)).toEqual(["budget_2024 2024"]);
    });

    test("correction de ségrégation : page du département seulement", async () => {
      // Deux versions de la fixture (dep « 044 ») dont la seconde modifie la ligne 2024 de la Loire-Atlantique.
      const duck = await connexion();
      const dossier = await temporaire();
      const csv = join(import.meta.dir, "fixtures", "segregation.csv");
      const avant = join(dossier, "avant.parquet");
      const apres = join(dossier, "apres.parquet");
      await executer(duck, `copy (select * from read_csv(${litteral(csv)}, all_varchar = true)) to ${litteral(avant)} (format parquet)`);
      await executer(duck, `copy (select * replace (case when annee = '2024' and dep = '044' then '0.999' else i_entropie_tot end as i_entropie_tot)
        from read_csv(${litteral(csv)}, all_varchar = true)) to ${litteral(apres)} (format parquet)`);
      const diff = await comparerVersions(duck, SOURCES.segregation, avant, apres);
      expect(diff).toEqual([{ millesime: 2024, cles: [expect.stringMatching(/^0?44$/)] }]);
      const m = await manifestCorrige();
      m.ajouter("segregation", {
        sha256: "b".repeat(64), tag: "t", fichier: "segregation.parquet", url: "https://exemple.org/seg-avant.parquet",
        modified: "2025-11-01T00:00:00Z", collecteLe: "2025-11-22T02:17:00Z", lignes: 1,
      });
      m.rendreActuelle("segregation", "segregation".padEnd(64, "0"));
      const sortie = join(await temporaire(), "data");
      const e = { source: "segregation" as const, millesime: 2024, cles: diff[0]!.cles, precedente: "b".repeat(64), corrigee: "segregation".padEnd(64, "0"), le: "2026-11-22T02:17:00Z" };
      const actives = fiches.filter((f) => f.disparuLe === null);
      await exporterTerritoires(actives, db, sortie, 2025, undefined, [e], m);
      const d44: DonneesTerritoire = await lire(sortie, "departements", "44.json");
      expect(d44.corrections).toEqual([
        { source: "segregation", millesime: 2024, le: e.le, precedente: "https://exemple.org/seg-avant.parquet", corrigee: expect.stringContaining("segregation.parquet") },
      ]);
      const d75: DonneesTerritoire = await lire(sortie, "departements", "75.json");
      expect(d75.corrections).toBeUndefined();
      expect(((await lire(sortie, "france.json")) as DonneesFrance).corrections).toBeUndefined();
    });
  });
});
