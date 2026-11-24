import { describe, expect, test } from "bun:test";
import { CODES_INDICATEURS } from "@obs/shared/libelles";
import { calculerIndicateurs, INDICATEURS_ECOLES, SEUIL_COUVERTURE } from "../pipeline/src/indicateurs.ts";
import { dbTest, indic, repart, repartitionsDe } from "./aide.ts";

// écoles ouvertes, puis écoles fermées (fiches historiques)
const ECOLES = ["0350201R", "0440104D", "0440105E", "0440108H", "0440201A", "0440202B", "0440203C", "0440106F", "0440107G", "0440109K", "0440110M"];

describe("indicateurs situés", () => {
  test("IPS et moyennes de la source", async () => {
    const i = await indic("0440001A", "ips");
    expect(i.mesure).toEqual({ valeur: 92.4, statut: "ok", source: "ips_colleges", rentree: 2025 });
    expect(i.comparaisons[0]).toMatchObject({
      niveau: "departement", calculee: false, public: { valeur: 106.4 }, prive: { valeur: 121.4 },
    });
    expect(i.comparaisons.map((c) => c.niveau)).toEqual(["departement", "academie", "france"]);
    expect(i.historique.map(([r]) => r)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  });

  test("IPS : moyenne privée absente (Corse), IPS lycée NA", async () => {
    const corse = await indic("6200001F", "ips");
    expect(corse.comparaisons[0]!.prive).toMatchObject({ valeur: null, statut: "non_disponible" });
    const lpo = await indic("0440006F", "ips");
    expect(lpo.mesure).toMatchObject({ valeur: null, statut: "non_disponible" });
    expect(lpo.comparaisons[0]!.public.valeur).toBe(105); // moyennes LPO publiées malgré tout
  });

  test("vie scolaire : public calculé, privé non publié", async () => {
    expect((await indic("0440001A", "eleves_par_etp_vs")).mesure.valeur).toBe(118);
    const prive = await indic("0440002B", "eleves_par_etp_vs");
    expect(prive.mesure).toMatchObject({ valeur: null, statut: "non_publie_prive" });
    expect(prive.historique).toEqual([]);
    const dep = (await indic("0440001A", "eleves_par_etp_vs")).comparaisons[0]!;
    expect(dep.prive.statut).toBe("non_publie_prive");
    expect(dep.calculee).toBe(true);
    expect((await indic("0440002B", "etp_vs")).mesure.statut).toBe("non_publie_prive");
  });

  test("ETP nul exclu des moyennes", async () => {
    expect((await indic("0440005E", "eleves_par_etp_vs")).mesure.statut).toBe("non_disponible");
    expect((await indic("0440001A", "eleves_par_etp_vs")).comparaisons[0]!.public.valeur).toBe(118); // 0440005E exclu
  });

  test("moyenne par famille", async () => {
    // le lycée 0440003C n'entre pas dans la moyenne des collèges publics : 590 / 40 = 14,75
    expect((await indic("0440001A", "eleves_par_etp_ens")).comparaisons[0]!.public.valeur).toBe(14.75);
    expect((await indic("0440001A", "eleves_par_etp_ens")).comparaisons[0]!.prive.valeur).toBe(20);
  });

  test("privé : ratios enseignants publiés", async () => {
    expect((await indic("0440002B", "eleves_par_etp_ens")).mesure).toMatchObject({ valeur: 20, statut: "ok", source: "personnels" });
  });

  test("part de filles", async () => {
    const i = await indic("0440001A", "part_filles");
    expect(i.mesure.valeur).toBeCloseTo(49.15, 1);
    expect(i.mesure.couverture).toBeUndefined(); // tous les niveaux publiés
  });

  test("part de filles partielle : couverture affichée", async () => {
    // Seconde (210 F / 190 G) et Première (190 F / 210 G) publiées, Terminale non : 800 élèves sur 1 200
    const i = await indic("0440003C", "part_filles");
    expect(i.mesure.valeur).toBe(50);
    expect(i.mesure.couverture).toBeCloseTo(66.67, 1);
    expect(i.comparaisons[0]!.public.valeur).toBe(50);
  });

  test("part de filles sous le seuil de couverture : non disponible, couverture conservée", async () => {
    // 0440006F : seule la seconde pro (40 F / 60 G) est publiée, soit 100 élèves sur 1 000
    const i = await indic("0440006F", "part_filles");
    expect(i.mesure).toMatchObject({ valeur: null, statut: "non_disponible", couverture: 10 });
    expect(i.historique).toEqual([]);
    // exclu des moyennes : aucun autre LPO public dans le département
    expect(i.comparaisons[0]!.public.statut).toBe("non_disponible");
    expect(SEUIL_COUVERTURE).toBe(50);
  });

  test("volumes : historique, sans comparaison", async () => {
    const e = await indic("0440001A", "eleves");
    expect(e.mesure).toMatchObject({ valeur: 590, rentree: 2025, source: "effectifs_colleges" });
    expect(e.historique).toEqual([[2019, 500], [2024, 600], [2025, 590]]);
    expect(e.comparaisons).toEqual([]);
    expect((await indic("0440001A", "ecart_type_ips")).comparaisons).toEqual([]);
  });

  test("aucune donnée : non disponible, jamais 0", async () => {
    const e = await indic("0440007G", "eleves");
    expect(e.mesure).toEqual({ valeur: null, statut: "non_disponible", source: null, rentree: null });
    expect((await indic("0440005E", "part_enseignantes")).mesure.statut).toBe("non_disponible");
    // les comparaisons restent affichées pour situer
    expect((await indic("0440005E", "eleves_par_etp_ens")).comparaisons[0]!.public.valeur).toBe(14.75);
  });

  test("chaque établissement a les indicateurs de sa famille, dans l'ordre", async () => {
    const tous = await calculerIndicateurs(await dbTest());
    expect(tous.size).toBe(42); // 25 actifs + 5 historiques sans registre, + 7 écoles, + 4 écoles fermées
    const secondDegre = CODES_INDICATEURS.filter((c) => c !== "eleves_par_classe");
    expect(secondDegre).toHaveLength(16);
    for (const [uai, liste] of tous) {
      expect(liste.map((i) => i.code)).toEqual(ECOLES.includes(uai) ? [...INDICATEURS_ECOLES] : secondDegre);
    }
  });
});

describe("répartitions", () => {
  test("répartition des statuts", async () => {
    const r = await repart("0440001A", "statuts");
    expect(r.parts!.map(Math.round)).toEqual([8, 78, 0, 4, 10]);
    expect(r).toMatchObject({ statut: "ok", source: "personnels", rentree: 2025 });
    expect(r.references.find((x) => x.niveau === "departement" && x.secteur === "public")!.parts).not.toBeNull();
    expect(r.references.map((x) => `${x.niveau}/${x.secteur}`)).toEqual([
      "departement/public", "departement/prive_sous_contrat", "france/public", "france/prive_sous_contrat",
    ]);
  });

  test("femmes et hommes enseignants", async () => {
    expect((await repart("0440001A", "sexe_enseignants")).parts!.map((x) => Math.round(x * 10) / 10)).toEqual([64, 36]); // 25,6 / 40
  });

  test("catégorie absente : non disponible, pas de part partielle", async () => {
    // 0440002B : agrégés, certifiés… vides, seuls les non-titulaires sont publiés
    const r = await repart("0440002B", "statuts");
    expect(r).toMatchObject({ statut: "non_disponible", parts: null });
    expect(r.references.find((x) => x.secteur === "prive_sous_contrat" && x.niveau === "departement")).toMatchObject({
      statut: "non_disponible", parts: null,
    });
  });

  test("filles et garçons : partielle avec couverture", async () => {
    const r = await repart("0440003C", "sexe_eleves");
    expect(r.parts).toEqual([50, 50]);
    expect(r.couverture).toBeCloseTo(66.67, 1);
  });

  test("filles et garçons sous le seuil : non disponible", async () => {
    expect(await repart("0440006F", "sexe_eleves")).toMatchObject({ statut: "non_disponible", parts: null, couverture: 10 });
  });

  test("langues : collèges seulement", async () => {
    const r = await repart("0440001A", "lv1");
    expect(r.categories).toEqual(["Anglais", "Allemand", "Espagnol", "Autres"]);
    expect(r.parts!.map((x) => Math.round(x * 10) / 10)).toEqual([97.3, 1.7, 1, 0]);
    expect(r.source).toBe("effectifs_colleges");
    expect((await repartitionsDe("0440003C")).map((x) => x.code)).not.toContain("lv1");
  });
});

describe("enseignants des écoles", () => {
  test("ETP d'enseignants et élèves par ETP, source du premier degré", async () => {
    const etp = await indic("0440202B", "etp_enseignants");
    expect(etp.mesure).toEqual({ valeur: 8, statut: "ok", source: "personnels_ecoles", rentree: 2025 });
    expect(etp.historique).toEqual([[2024, 8], [2025, 8]]);
    expect((await indic("0440202B", "eleves_par_etp_ens")).mesure).toMatchObject({ valeur: 24.5, source: "personnels_ecoles" });
    expect((await indic("0440202B", "part_enseignantes")).mesure.valeur).toBe(80);
    // privé sous contrat : publié comme le public
    const prive = await indic("0440203C", "eleves_par_etp_ens");
    expect(prive.mesure).toEqual({ valeur: 20.75, statut: "ok", source: "personnels_ecoles", rentree: 2025 });
    expect(prive.comparaisons[0]).toMatchObject({ niveau: "departement", prive: { valeur: 20.75, statut: "ok" } });
  });

  test("ni vie scolaire, ni agrégés, ni statuts : absents de la fiche, pas affichés comme absences", async () => {
    const codes = (await calculerIndicateurs(await dbTest())).get("0440202B")!.map((i) => i.code);
    for (const c of ["etp_total", "etp_vs", "eleves_par_etp_vs", "part_agreges", "part_non_titulaires", "ecart_type_ips", "part_filles"]) {
      expect(codes).not.toContain(c);
    }
    expect((await repartitionsDe("0440202B")).map((r) => r.code)).toEqual(["sexe_enseignants", "ages", "anciennete"]);
  });

  test("répartitions des enseignants d'une école", async () => {
    const sexe = await repart("0440202B", "sexe_enseignants");
    expect(sexe).toMatchObject({ statut: "ok", source: "personnels_ecoles", rentree: 2025 });
    expect(sexe.parts!.map((x) => Math.round(x * 10) / 10)).toEqual([80, 20]);
    const ages = await repart("0440202B", "ages");
    expect(ages.parts).toEqual([25, 50, 25]);
    expect(ages.references.find((x) => x.niveau === "departement" && x.secteur === "public")!.parts).not.toBeNull();
    expect((await repart("0440202B", "anciennete")).parts).toEqual([25, 37.5, 12.5, 25]);
    expect(await repart("0440203C", "ages")).toMatchObject({ statut: "ok", parts: [25, 50, 25], source: "personnels_ecoles" });
  });
});
