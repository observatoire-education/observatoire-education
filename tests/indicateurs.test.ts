import { describe, expect, test } from "bun:test";
import { CODES_INDICATEURS } from "@obs/shared/libelles";
import { calculerIndicateurs, SEUIL_COUVERTURE } from "../pipeline/src/indicateurs.ts";
import { dbTest, indic, repart, repartitionsDe } from "./aide.ts";

describe("indicateurs situés", () => {
  test("IPS et moyennes de la source", async () => {
    const i = await indic("0440001A", "ips");
    expect(i.mesure).toEqual({ valeur: 92.4, statut: "ok", source: "ips_colleges", rentree: 2025 });
    expect(i.comparaisons[0]).toMatchObject({
      niveau: "departement", calculee: false, public: { valeur: 106.4 }, prive: { valeur: 121.4 },
    });
    expect(i.comparaisons.map((c) => c.niveau)).toEqual(["departement", "academie", "france"]);
    expect(i.historique).toEqual([[2024, 93.0], [2025, 92.4]]);
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
    expect(e.historique).toEqual([[2024, 600], [2025, 590]]);
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

  test("chaque établissement a les seize indicateurs, dans l'ordre", async () => {
    const tous = await calculerIndicateurs(await dbTest());
    expect(tous.size).toBe(7);
    for (const liste of tous.values()) expect(liste.map((i) => i.code)).toEqual([...CODES_INDICATEURS]);
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
