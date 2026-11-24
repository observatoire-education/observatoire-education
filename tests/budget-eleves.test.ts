import { describe, expect, test } from "bun:test";
import type { BudgetCollectivite, MontantBudget } from "@obs/shared/donnees";
import type { Famille, Fiche, Secteur } from "@obs/shared/types";
import { calculerBudgets, elevesParCollectivite } from "../pipeline/src/budget-eleves.ts";
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
    secteur: o.secteur ?? "public", disparuLe: o.disparuLe ?? null, fermeLe: null,
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
