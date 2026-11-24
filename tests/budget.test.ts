import { describe, expect, test } from "bun:test";
import { collectiviteDuBudget, fonctionNormalisee } from "../pipeline/src/budget.ts";
import { dbTest } from "./aide.ts";

describe("collectiviteDuBudget", () => {
  const l = (categ: string, ndept: string | null, cregi: string | null, lbudg: string) => ({ categ, ndept, cregi, lbudg });

  test("un cas par catégorie", () => {
    expect(collectiviteDuBudget(l("DEPT", "044", "052", "DEP LOIRE-ATLANTIQUE"))).toBe("dep-44");
    expect(collectiviteDuBudget(l("DEPT", "001", "084", "DEP AIN"))).toBe("dep-01");
    expect(collectiviteDuBudget(l("DEPT", "067", "044", "COLLECTIVITE EUROPEENNE D'ALSACE"))).toBe("cea");
    expect(collectiviteDuBudget(l("DEPT", "106", "106", "DEP MAYOTTE"))).toBe("dep-976");
    expect(collectiviteDuBudget(l("DEPT", "101", "101", "DEP GUADELOUPE"))).toBe("dep-971");
    expect(collectiviteDuBudget(l("REG", "044", "052", "REG PAYS-DE-LA-LOIRE"))).toBe("reg-52");
    expect(collectiviteDuBudget(l("REG", "101", "101", "REG GUADELOUPE"))).toBe("reg-01");
    expect(collectiviteDuBudget(l("REG", "104", "104", "REG REUNION"))).toBe("reg-04");
    expect(collectiviteDuBudget(l("ML", "069", "084", "MET DE LYON"))).toBe("ml-lyon");
    expect(collectiviteDuBudget(l("PARIS", "075", "011", "VILLE DE PARIS"))).toBe("paris");
    expect(collectiviteDuBudget(l("CTU", "02A", "094", "COLLECTIVITE DE CORSE"))).toBe("ctu-corse");
    expect(collectiviteDuBudget(l("CTU", "103", "103", "CTU COLL TERRITORIALE MARTINIQUE"))).toBe("ctu-martinique");
    expect(collectiviteDuBudget(l("CTU", "102", "102", "CTU Guyane"))).toBe("ctu-guyane");
  });

  test("codes DGFiP de l'outre-mer : 102 Guyane, 103 Martinique (pas dans l'ordre INSEE)", () => {
    expect(collectiviteDuBudget(l("DEPT", "102", "102", "DEP X"))).toBe("dep-973");
    expect(collectiviteDuBudget(l("DEPT", "103", "103", "DEP X"))).toBe("dep-972");
    expect(collectiviteDuBudget(l("REG", "102", "102", "REG X"))).toBe("reg-03");
    expect(collectiviteDuBudget(l("REG", "103", "103", "REG X"))).toBe("reg-02");
    expect(collectiviteDuBudget(l("REG", "106", "106", "REG X"))).toBe("reg-06");
  });

  test("collectivité inconnue : null", () => {
    expect(collectiviteDuBudget(l("CTU", "199", "199", "CTU ILE INCONNUE"))).toBeNull();
    expect(collectiviteDuBudget(l("REG", null, "999", "REG X"))).toBeNull();
    expect(collectiviteDuBudget(l("COM", "044", "052", "COMMUNE"))).toBeNull();
  });
});

describe("fonctionNormalisee", () => {
  test("221, 222, 223 et 22", () => {
    expect(fonctionNormalisee("93221")).toBe("221");
    expect(fonctionNormalisee("90222")).toBe("222");
    expect(fonctionNormalisee("223")).toBe("223");
    expect(fonctionNormalisee("9322")).toBe("22");
    expect(fonctionNormalisee("22")).toBe("22");
    expect(fonctionNormalisee("922")).toBeNull();
    expect(fonctionNormalisee("932")).toBeNull();
    expect(fonctionNormalisee("2210")).toBeNull();
    expect(fonctionNormalisee("81")).toBeNull();
  });
});

describe("balances normalisées", () => {
  const postes = async (collectivite: string, exercice: number, niveau?: string) => {
    const db = await dbTest();
    const r = await db.sql<{ niveau: string; secteur: string; poste: string; montant: number }>(
      `select niveau, secteur, poste, montant from budget_postes where collectivite = ? and exercice = ?
       ${niveau ? `and niveau = '${niveau}'` : ""} order by niveau, secteur, poste`,
      [collectivite, exercice],
    );
    return Object.fromEntries(r.map((x) => [`${x.niveau}/${x.secteur}/${x.poste}`, x.montant]));
  };

  test("M52 puis M57 : même total public et privé", async () => {
    const attendu = {
      "colleges/public/fonctionnement_hors_personnel": 9_500_000,
      "colleges/public/personnel": 2_000_000,
      "colleges/public/investissement": 1_000_000,
      "colleges/prive/fonctionnement": 16_000_000,
      "colleges/prive/investissement": 700_000,
    };
    expect(await postes("dep-44", 2023)).toEqual(attendu);
    expect(await postes("dep-44", 2024)).toEqual(attendu);
  });

  test("M57 655122 (dotations aux lycées privés) en fonction 221 : contribution aux collèges privés", async () => {
    // Corrèze et Nièvre 2024 imputent leur forfait des collèges privés au compte des lycées privés.
    expect(await postes("dep-19", 2024)).toEqual({
      "colleges/prive/fonctionnement": 900_000,
      "colleges/public/fonctionnement_hors_personnel": 3_000_000,
    });
  });

  test("opérations d'ordre, amortissements et emprunts exclus", async () => {
    const db = await dbTest();
    const [ordre] = await db.sql<{ montant: number }>(
      "select montant from budget_lignes where collectivite = 'dep-44' and exercice = 2023 and compte = '6068'",
    );
    expect(ordre!.montant).toBe(500_000); // 600 000 − 100 000 d'ordre
    // 675, 676 (cessions) et 166 (emprunt) sont présents dans la fixture et exclus
    const [bruts] = await db.sql<{ n: number }>(
      "select count(*)::int as n from budget_lignes where collectivite = 'dep-44' and exercice = 2023 and compte in ('675', '676', '166')",
    );
    expect(bruts!.n).toBe(3);
    const [total] = await db.sql<{ t: number }>("select sum(montant) as t from budget_postes where collectivite = 'dep-44' and exercice = 2023");
    expect(total!.t).toBe(29_200_000); // sans 6811 (300 000) ni 1641 (400 000)
  });

  test("région : 222 public, 223 privé, codes préfixés et nus additionnés de la même façon", async () => {
    expect(await postes("reg-52", 2023)).toEqual({
      "lycees/public/fonctionnement_hors_personnel": 1_000_000,
      "lycees/public/personnel": 400_000,
      "lycees/public/investissement": 500_000,
      "lycees/prive/fonctionnement": 300_000,
    });
    expect(await postes("reg-93", 2023)).toEqual({
      "lycees/public/fonctionnement_hors_personnel": 750_000,
      "lycees/prive/fonctionnement": 100_000,
    });
  });

  test("Corse : collèges et lycées dans la même collectivité, niveaux séparés", async () => {
    expect(await postes("ctu-corse", 2023)).toEqual({
      "colleges/public/fonctionnement_hors_personnel": 700_000,
      "lycees/public/fonctionnement_hors_personnel": 400_000,
    });
  });

  test("personnel en 0201 : aucune ligne de personnel, jamais 0", async () => {
    expect(await postes("dep-35", 2023)).toEqual({ "colleges/public/fonctionnement_hors_personnel": 1_000_000 });
  });

  test("fonction non détaillée : présente dans budget_non_detaille, absente de budget_postes", async () => {
    const db = await dbTest();
    const nd = await db.sql("select exercice::int as exercice, niveau from budget_non_detaille where collectivite = 'dep-56' order by 1");
    expect(nd).toEqual([{ exercice: 2023, niveau: "colleges" }, { exercice: 2024, niveau: "colleges" }]);
    expect(await db.sql("select 1 from budget_postes where collectivite = 'dep-56'")).toEqual([]);
    expect(await db.sql("select 1 from budget_non_detaille where collectivite = 'dep-44'")).toEqual([]);
  });

  test("budget sans libellé (lbudg nul) : ni perdu ni inconnu", async () => {
    const db = await dbTest();
    expect(await postes("dep-49", 2024)).toEqual({ "colleges/public/fonctionnement_hors_personnel": 5 });
    expect(await db.sql("select 1 from budget_inconnus where ident = '49000000100'")).toEqual([]);
  });

  test("budgets non identifiés listés à part", async () => {
    const db = await dbTest();
    const r = await db.sql<{ exercice: number; lbudg: string }>("select exercice::int as exercice, lbudg from budget_inconnus");
    expect(r).toEqual([{ exercice: 2024, lbudg: "CTU ILE INCONNUE" }]);
    expect(await db.sql("select 1 from budget_lignes where collectivite is null")).toEqual([]);
  });
});
