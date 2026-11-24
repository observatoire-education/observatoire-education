import { describe, expect, test } from "bun:test";
import type { BudgetCollectivite, MontantBudget } from "@obs/shared/donnees";
import type { Famille, Fiche, Secteur } from "@obs/shared/types";
import { budgetDeFiche, calculerBudgets, elevesParCollectivite } from "../pipeline/src/budget-eleves.ts";
import { absenceBudget } from "../site/src/lib/budget.ts";
import type { Db } from "../pipeline/src/db.ts";
import { connexion } from "../pipeline/src/duck.ts";
import { identiteTest } from "./aide.ts";

type Poste = [exercice: number, collectivite: string, niveau: string, secteur: string, poste: string, montant: number];

/** Base vide, avec les tables de budget remplies à la main. */
async function dbBudget(postes: Poste[], nonDetaille: [number, string, string][] = [], cites: [number, string, number][] = []): Promise<Db> {
  const c = await connexion(null);
  const db = {
    sql: async <T>(q: string, params?: unknown[]) => (await c.runAndReadAll(q, params as never)).getRowObjectsJS() as T[],
    executer: async (sql: string) => void (await c.run(sql)),
  } as Db;
  await db.executer(`create table budget_postes (exercice integer, collectivite varchar, niveau varchar, secteur varchar, poste varchar, montant double);
    create table budget_non_detaille (exercice integer, collectivite varchar, niveau varchar);
    create table budget_cites (exercice integer, collectivite varchar, montant double);`);
  for (const p of postes) await db.sql("insert into budget_postes values (?, ?, ?, ?, ?, ?)", p);
  for (const n of nonDetaille) await db.sql("insert into budget_non_detaille values (?, ?, ?)", n);
  for (const c of cites) await db.sql("insert into budget_cites values (?, ?, ?)", c);
  return db;
}

/** Fiche de test : élèves par rentrée dans l'historique de l'indicateur `eleves`. */
function fiche(uai: string, o: {
  dep?: string; codeCommune?: string; famille?: Famille; secteur?: Secteur; eleves: [number, number][]; disparuLe?: string | null;
}): Fiche {
  return {
    ...identiteTest(uai), uai, dep: o.dep ?? "44", codeCommune: o.codeCommune ?? "44109", famille: o.famille ?? "college",
    secteur: o.secteur ?? "public", disparuLe: o.disparuLe ?? null, fermeLe: null, successeurs: [], predecesseurs: [],
    indicateurs: [{ code: "eleves", mesure: { valeur: null, statut: "ok", source: null, rentree: null }, comparaisons: [], historique: o.eleves }],
    repartitions: [], eleves: null, voisins: null, sources: [], budget: { france: [] },
  } as unknown as Fiche;
}

const dep44 = (c: Map<string, BudgetCollectivite>) => c.get("colleges|dep-44")!;
const exo = (c: BudgetCollectivite, e: number) => c.exercices.find((x) => x.exercice === e)!;

describe("elevesParCollectivite", () => {
  test("par niveau, secteur et rentrée ; erea compté aux lycées ; une fiche sans valeur ne compte pas", () => {
    const fiches = [
      fiche("A", { eleves: [[2023, 400]] }),
      fiche("B", { eleves: [[2023, 100]], secteur: "prive_sous_contrat" }),
      fiche("C", { eleves: [[2022, 50]] }),
      fiche("D", { eleves: [[2023, 70]], famille: "lpo" }),
      fiche("E", { eleves: [[2023, 30]], famille: "erea" }),
    ];
    const m = elevesParCollectivite(fiches, 2023);
    expect(m.get("colleges|dep-44")).toEqual({ public: 400, prive: 100 });
    expect(m.get("lycees|reg-52")).toEqual({ public: 100, prive: 0 });
    expect(m.size).toBe(2);
  });

  test("écoles : élèves des écoles publiques comptés pour leur commune, jamais pour le département ; privé non compté", () => {
    const fiches = [
      fiche("A", { eleves: [[2023, 400]] }),
      fiche("S", { eleves: [[2023, 200]], famille: "primaire" }),
      fiche("T", { eleves: [[2023, 50]], famille: "elementaire" }),
      fiche("M", { eleves: [[2023, 90]], famille: "maternelle", secteur: "prive_sous_contrat" }),
      // arrondissement : la commune de Paris
      fiche("P", { eleves: [[2023, 30]], famille: "maternelle", dep: "75", codeCommune: "75115" }),
    ];
    const m = elevesParCollectivite(fiches, 2023);
    expect(m.get("colleges|dep-44")).toEqual({ public: 400, prive: 0 });
    expect(m.get("ecoles|com-44109")).toEqual({ public: 250, prive: 0 });
    expect(m.get("ecoles|com-75056")).toEqual({ public: 30, prive: 0 });
    expect(m.size).toBe(3);
  });

  test("une fiche disparue compte dans les élèves des exercices où elle avait des élèves", async () => {
    const fiches = [
      fiche("A", { eleves: [[2022, 400], [2023, 400]] }),
      fiche("Z", { eleves: [[2022, 100]], disparuLe: "2026-01-01" }),
    ];
    expect(elevesParCollectivite(fiches, 2022).get("colleges|dep-44")!.public).toBe(500);
    expect(elevesParCollectivite(fiches, 2023).get("colleges|dep-44")!.public).toBe(400);
    const db = await dbBudget([
      [2023, "dep-44", "colleges", "public", "fonctionnement_hors_personnel", 5000],
      [2024, "dep-44", "colleges", "public", "fonctionnement_hors_personnel", 5000],
    ]);
    const { collectivites } = await calculerBudgets(db, fiches);
    expect(exo(dep44(collectivites), 2023).public.horsPersonnel.parEleve).toBe(10);
    expect(exo(dep44(collectivites), 2024).public.horsPersonnel.parEleve).toBe(12.5);
  });
});

describe("calculerBudgets", () => {
  const fiches = [
    fiche("A", { eleves: [[2023, 400]] }),
    fiche("B", { eleves: [[2023, 100]], secteur: "prive_sous_contrat" }),
  ];
  const lignes: Poste[] = [
    [2024, "dep-44", "colleges", "public", "fonctionnement_hors_personnel", 4000],
    [2024, "dep-44", "colleges", "public", "personnel", 40000],
    [2024, "dep-44", "colleges", "public", "investissement", 800],
    [2024, "dep-44", "colleges", "prive", "fonctionnement", 500],
  ];

  test("exercice 2024 divisé par les élèves de la rentrée 2023", async () => {
    const { collectivites } = await calculerBudgets(await dbBudget(lignes), fiches);
    const e = exo(dep44(collectivites), 2024);
    expect(e).toMatchObject({ exercice: 2024, rentree: 2023, source: "budget_2024", eleves: { public: 400, prive: 100 } });
    expect(e.public.horsPersonnel).toEqual({ total: 4000, parEleve: 10, statut: "ok" });
    expect(e.public.avecPersonnel).toEqual({ total: 44000, parEleve: 110, statut: "ok" });
    expect(e.public.investissement).toEqual({ total: 800, parEleve: 2, statut: "ok" });
    expect(e.prive.fonctionnement).toEqual({ total: 500, parEleve: 5, statut: "ok" });
    expect(e.prive.investissement.statut).toBe("non_disponible");
    expect(dep44(collectivites).libelle).toBe("Département de Loire-Atlantique");
  });

  test("personnel non rattaché : statut et null, jamais 0", async () => {
    for (const personnel of [null, 0, 8000, -500]) {
      // 8000 € pour 400 élèves = 20 € par élève, sous le seuil de 50 ; un total négatif n'est jamais « présent »
      const l = lignes.filter((x) => x[4] !== "personnel");
      if (personnel !== null) l.push([2024, "dep-44", "colleges", "public", "personnel", personnel]);
      const { collectivites } = await calculerBudgets(await dbBudget(l), fiches);
      const e = exo(dep44(collectivites), 2024);
      expect(e.public.avecPersonnel).toEqual({ total: null, parEleve: null, statut: "personnel_non_rattache" });
      expect(e.public.horsPersonnel.statut).toBe("ok");
    }
  });

  test("seuil : 50 € par élève rattache le personnel", async () => {
    const l = lignes.map((x): Poste => (x[4] === "personnel" ? [2024, "dep-44", "colleges", "public", "personnel", 20000] : x));
    const { collectivites } = await calculerBudgets(await dbBudget(l), fiches);
    expect(exo(dep44(collectivites), 2024).public.avecPersonnel.statut).toBe("ok");
  });

  test("aucun élève du privé : aucun_eleve_prive, pas d'Infinity ni de NaN", async () => {
    const sansPrive = [fiche("A", { eleves: [[2023, 400]] })];
    const db = await dbBudget([...lignes, [2024, "dep-44", "colleges", "prive", "investissement", 300]]);
    const { collectivites, france } = await calculerBudgets(db, sansPrive);
    const e = exo(dep44(collectivites), 2024);
    expect(e.eleves.prive).toBeNull();
    expect(e.prive.fonctionnement).toEqual({ total: null, parEleve: null, statut: "aucun_eleve_prive" });
    expect(e.prive.investissement.statut).toBe("aucun_eleve_prive");
    const nombres: number[] = [];
    JSON.stringify({ collectivites: [...collectivites.values()], france }, (_, v) => {
      if (typeof v === "number") nombres.push(v);
      return v;
    });
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.every(Number.isFinite)).toBe(true);
    // JSON.stringify écrit null pour Infinity / NaN : on vérifie aussi directement.
    const direct = (v: unknown): boolean =>
      typeof v === "number" ? Number.isFinite(v) : v && typeof v === "object" ? Object.values(v).every(direct) : true;
    expect(direct([...collectivites.values()]) && direct(france)).toBe(true);
  });

  test("élèves du privé mais aucune ligne privée : aucune_contribution_identifiee", async () => {
    const l = lignes.filter((x) => x[3] !== "prive");
    const { collectivites } = await calculerBudgets(await dbBudget(l), fiches);
    expect(exo(dep44(collectivites), 2024).prive.fonctionnement).toEqual({ total: null, parEleve: null, statut: "aucune_contribution_identifiee" });
  });

  test("exercice absent pour une collectivité : non_disponible, pas de zéro", async () => {
    const db = await dbBudget([...lignes, [2023, "dep-56", "colleges", "public", "fonctionnement_hors_personnel", 1]]);
    const f = [...fiches, fiche("M", { dep: "56", codeCommune: "56260", eleves: [[2023, 10]] })];
    const { collectivites } = await calculerBudgets(db, f);
    const e = exo(collectivites.get("colleges|dep-56")!, 2024);
    for (const m of [e.public.horsPersonnel, e.public.avecPersonnel, e.public.investissement, e.prive.fonctionnement, e.prive.investissement] as MontantBudget[]) {
      expect(m).toEqual({ total: null, parEleve: null, statut: "non_disponible" });
    }
  });

  test("Alsace : la cea n'a pas de 2020, non_disponible", async () => {
    const db = await dbBudget([
      [2020, "dep-67", "colleges", "public", "fonctionnement_hors_personnel", 1],
      [2021, "cea", "colleges", "public", "fonctionnement_hors_personnel", 1000],
    ]);
    const f = [fiche("S", { dep: "67", codeCommune: "67482", eleves: [[2019, 10], [2020, 10]] })];
    const { collectivites } = await calculerBudgets(db, f);
    const cea = collectivites.get("colleges|cea")!;
    expect(exo(cea, 2020).public.horsPersonnel.statut).toBe("non_disponible");
    expect(exo(cea, 2021).public.horsPersonnel).toEqual({ total: 1000, parEleve: 100, statut: "ok" });
  });

  test("fonction non détaillée : tous les postes", async () => {
    const db = await dbBudget(lignes, [[2024, "dep-44", "colleges"]]);
    const { collectivites } = await calculerBudgets(db, fiches);
    const e = exo(dep44(collectivites), 2024);
    for (const m of [e.public.horsPersonnel, e.public.avecPersonnel, e.public.investissement, e.prive.fonctionnement, e.prive.investissement]) {
      expect(m).toEqual({ total: null, parEleve: null, statut: "fonction_non_detaillee" });
    }
  });

  test("moyenne France du personnel compris : n ne compte que les collectivités ok", async () => {
    const f = [
      ...fiches,
      fiche("C", { dep: "56", codeCommune: "56260", eleves: [[2023, 200]] }),
      fiche("D", { dep: "29", codeCommune: "29019", eleves: [[2023, 100]] }),
    ];
    const db = await dbBudget([
      ...lignes,
      [2024, "dep-56", "colleges", "public", "fonctionnement_hors_personnel", 2000],
      [2024, "dep-56", "colleges", "public", "personnel", 0], // non rattaché
      [2024, "dep-29", "colleges", "public", "fonctionnement_hors_personnel", 1000],
      [2024, "dep-29", "colleges", "public", "personnel", 10000],
    ]);
    const { france } = await calculerBudgets(db, f);
    const m = france.find((x) => x.niveau === "colleges")!.exercices.find((x) => x.exercice === 2024)!;
    expect(m.public.avecPersonnel).toEqual({ valeur: (44000 + 11000) / 500, n: 2 });
    expect(m.public.horsPersonnel).toEqual({ valeur: (4000 + 2000 + 1000) / 700, n: 3 });
    expect(m.prive.fonctionnement).toEqual({ valeur: 5, n: 1 });
    expect(m.prive.investissement).toEqual({ valeur: null, n: 0 });
  });

  test("exercices avant 2020 ignorés ; cités scolaires, mentions et agricole", async () => {
    const db = await dbBudget(
      [...lignes, [2019, "dep-44", "colleges", "public", "personnel", 1],
        [2024, "reg-52", "lycees", "public", "fonctionnement_hors_personnel", 700]],
      [],
      [[2024, "dep-44", 123], [2024, "reg-52", 456], [2024, "ctu-corse", 789]],
    );
    const f = [...fiches, fiche("L", { famille: "lpo", eleves: [[2023, 70]] }),
      fiche("Q", { dep: "23", codeCommune: "23096", eleves: [[2023, 10]] }),
      fiche("K", { dep: "2A", codeCommune: "2A004", eleves: [[2023, 5]] }),
      fiche("KL", { dep: "2A", codeCommune: "2A004", famille: "lp", eleves: [[2023, 5]] })];
    const { collectivites } = await calculerBudgets(db, f);
    const c = dep44(collectivites);
    expect(c.exercices.map((x) => x.exercice)).toEqual([2024]);
    expect(exo(c, 2024).citesScolaires).toBe(123);
    expect(c.mentions).toEqual([]);
    const l = collectivites.get("lycees|reg-52")!;
    expect(l.mentions).toEqual(["agricole"]);
    expect(exo(l, 2024).public.horsPersonnel.parEleve).toBe(10);
    // fonction 24 d'une région : portée par ses lycées, jamais par ses collèges
    expect(exo(l, 2024).citesScolaires).toBe(456);
    // collectivité unique : sur les lycées seulement
    expect(exo(collectivites.get("lycees|ctu-corse")!, 2024).citesScolaires).toBe(789);
    expect(exo(collectivites.get("colleges|ctu-corse")!, 2024).citesScolaires).toBeNull();
    expect(exo(c, 2024).citesScolaires).toBe(123);
    const creuse = collectivites.get("colleges|dep-23")!;
    expect(creuse.mentions).toEqual(["cites_scolaires"]);
    expect(creuse.partCitesScolaires).toBe(9.1);
  });
});

describe("communes : dépenses pour leurs écoles", () => {
  const ecoles = [
    fiche("E1", { famille: "elementaire", eleves: [[2022, 300], [2023, 300]] }),
    fiche("E2", { famille: "maternelle", eleves: [[2022, 100], [2023, 100]] }),
    fiche("E3", { famille: "primaire", secteur: "prive_sous_contrat", eleves: [[2023, 500]] }),
    fiche("SA", { famille: "elementaire", codeCommune: "44150", eleves: [[2023, 10]] }),
    fiche("A", { eleves: [[2023, 400]] }),
  ];
  const postes: Poste[] = [
    [2023, "com-44109", "ecoles", "public", "fonctionnement_hors_personnel", 40_000],
    [2024, "com-44109", "ecoles", "public", "fonctionnement_hors_personnel", 160_000],
    [2024, "com-44109", "ecoles", "public", "personnel", 800_000],
    [2024, "com-44109", "ecoles", "public", "investissement", 200_000],
    [2024, "dep-44", "colleges", "public", "fonctionnement_hors_personnel", 4000],
  ];

  test("€ par élève des écoles publiques de la commune, rentrée N−1 ; libellé : le nom de la commune", async () => {
    const { collectivites } = await calculerBudgets(await dbBudget(postes), ecoles);
    const c = collectivites.get("ecoles|com-44109")!;
    expect(c).toMatchObject({ id: "com-44109", libelle: "Nantes", niveau: "ecoles", mentions: [] });
    const e = exo(c, 2024);
    expect(e.eleves).toEqual({ public: 400, prive: null });
    expect(e.public.horsPersonnel).toEqual({ total: 160_000, parEleve: 400, statut: "ok" });
    expect(e.public.avecPersonnel).toEqual({ total: 960_000, parEleve: 2400, statut: "ok" });
    expect(e.public.investissement).toEqual({ total: 200_000, parEleve: 500, statut: "ok" });
    expect(exo(c, 2023).public.avecPersonnel.statut).toBe("personnel_non_rattache");
    // département inchangé : les élèves des écoles ne comptent pas
    expect(exo(dep44(collectivites), 2024).public.horsPersonnel).toEqual({ total: 4000, parEleve: 10, statut: "ok" });
  });

  test("commune absente des balances : pas de budget, la fiche d'une école publique dit pourquoi", async () => {
    const budgets = await calculerBudgets(await dbBudget(postes), ecoles);
    expect(budgets.collectivites.has("ecoles|com-44150")).toBe(false);
    const f = budgetDeFiche({ famille: "elementaire", secteur: "public", dep: "44", codeCommune: "44150" }, budgets);
    expect(f).toEqual({ ecoles: null, france: budgets.france.filter((m) => m.niveau === "ecoles"), motif: "budget_communal_non_publie" });
    expect(absenceBudget("budget_communal_non_publie", "ecoles")).toBe(
      "Budget par fonction non publié pour cette commune (seules les communes de 3 500 habitants et plus le publient)",
    );
  });

  test("fiche d'une école publique : le budget de sa commune ; école privée : aucun bloc", async () => {
    const budgets = await calculerBudgets(await dbBudget(postes), ecoles);
    const pub = budgetDeFiche({ famille: "maternelle", secteur: "public", dep: "44", codeCommune: "44109" }, budgets);
    expect(pub.ecoles?.id).toBe("com-44109");
    expect(pub.france.map((m) => m.niveau)).toEqual(["ecoles"]);
    expect(budgetDeFiche({ famille: "primaire", secteur: "prive_sous_contrat", dep: "44", codeCommune: "44109" }, budgets)).toEqual({ france: [] });
  });

  test("exercice sans ligne pour une commune publiée ailleurs : statut de la commune non publiée, jamais 0", async () => {
    const db = await dbBudget([...postes, [2025, "dep-44", "colleges", "public", "fonctionnement_hors_personnel", 4000]]);
    const { collectivites } = await calculerBudgets(db, [...ecoles, fiche("E1b", { famille: "elementaire", eleves: [[2024, 300]] })]);
    const e = exo(collectivites.get("ecoles|com-44109")!, 2025);
    for (const m of [e.public.horsPersonnel, e.public.avecPersonnel, e.public.investissement]) {
      expect(m).toEqual({ total: null, parEleve: null, statut: "budget_communal_non_publie" });
    }
  });

  test("moyenne France des écoles : Σ dépenses ÷ Σ élèves des communes publiées ; départements et régions à part", async () => {
    const db = await dbBudget([...postes, [2024, "com-44150", "ecoles", "public", "fonctionnement_hors_personnel", 1_000]]);
    const { france } = await calculerBudgets(db, ecoles);
    expect(france.map((m) => m.niveau)).toEqual(["colleges", "lycees", "ecoles"]);
    const m = france.find((x) => x.niveau === "ecoles")!.exercices.find((x) => x.exercice === 2024)!;
    expect(m.public.horsPersonnel).toEqual({ valeur: 161_000 / 410, n: 2 });
    const c = france.find((x) => x.niveau === "colleges")!.exercices.find((x) => x.exercice === 2024)!;
    expect(c.public.horsPersonnel).toEqual({ valeur: 10, n: 1 });
  });

  test("commune nouvelle : exercices d'avant la fusion non calculés ; école sous un ancien code comptée à la commune d'aujourd'hui", async () => {
    const db = await dbBudget([
      [2023, "com-44400", "ecoles", "public", "fonctionnement_hors_personnel", 30_000],
      [2024, "com-44400", "ecoles", "public", "fonctionnement_hors_personnel", 60_000],
      [2025, "com-44400", "ecoles", "public", "fonctionnement_hors_personnel", 60_000],
    ]);
    // 44400 absorbe 44401 le 2024-01-01 (commune nouvelle) : la balance 2023 de 44400 ne couvre pas les écoles de 44401.
    await db.executer(`create table src_cog_communes (typecom varchar, com varchar, libelle varchar, comparent varchar);
      insert into src_cog_communes values ('COM', '44400', 'Bourg-Nouveau', null), ('COMD', '44400', 'Bourg', '44400'),
        ('COMD', '44401', 'Hameau', '44400');
      create table src_cog_mouvements (mod varchar, date_eff varchar, typecom_av varchar, com_av varchar, libelle_av varchar,
        typecom_ap varchar, com_ap varchar, libelle_ap varchar);
      insert into src_cog_mouvements values
        ('32', '2024-01-01', 'COM', '44400', 'Bourg', 'COM', '44400', 'Bourg-Nouveau'),
        ('32', '2024-01-01', 'COM', '44401', 'Hameau', 'COM', '44400', 'Bourg-Nouveau');`);
    const f = [
      fiche("B1", { famille: "primaire", dep: "44", codeCommune: "44400", eleves: [[2022, 100], [2023, 100], [2024, 100]] }),
      fiche("B2", { famille: "maternelle", dep: "44", codeCommune: "44401", eleves: [[2022, 50], [2023, 50], [2024, 50]] }),
    ];
    const budgets = await calculerBudgets(db, f);
    const c = budgets.collectivites.get("ecoles|com-44400")!;
    expect(c.libelle).toBe("Bourg-Nouveau");
    const e2023 = exo(c, 2023);
    for (const m of [e2023.public.horsPersonnel, e2023.public.avecPersonnel, e2023.public.investissement]) {
      expect(m).toEqual({ total: null, parEleve: null, statut: "commune_fusionnee_apres_exercice" });
    }
    expect(exo(c, 2024).public.horsPersonnel).toEqual({ total: 60_000, parEleve: 400, statut: "ok" });
    expect(budgets.collectivites.has("ecoles|com-44401")).toBe(false);
    expect(budgetDeFiche({ famille: "maternelle", secteur: "public", dep: "44", codeCommune: "44401" }, budgets).ecoles?.id).toBe("com-44400");
    expect(absenceBudget("commune_fusionnee_apres_exercice", "ecoles")).toBe(
      "Commune fusionnée après cet exercice : montant par élève non calculé",
    );
    // La moyenne France ne compte pas l'exercice non calculé.
    expect(budgets.france.find((m) => m.niveau === "ecoles")!.exercices.find((x) => x.exercice === 2023)!.public.horsPersonnel)
      .toEqual({ valeur: null, n: 0 });
  });
});
