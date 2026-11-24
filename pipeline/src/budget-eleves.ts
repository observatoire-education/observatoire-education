// Montants par élève des collectivités et moyennes France.
// Un exercice N est divisé par les élèves de la rentrée N−1 (DEPP) ; fiches disparues comprises.
import { collectiviteDe, libelleCollectivite, type IdCollectivite, type NiveauBudget } from "@obs/shared/collectivites";
import type {
  BudgetCollectivite, ExerciceBudget, MontantBudget, MoyenneBudget, MoyennesBudgetFrance, ParSecteur, StatutBudget,
} from "@obs/shared/donnees";
import type { Fiche } from "@obs/shared/types";
import { AGRICOLE, CITES_SCOLAIRES, EXERCICE_MIN, SEUIL_PERSONNEL_PAR_ELEVE } from "./budget-constantes.ts";
import type { Db } from "./db.ts";

const NIVEAUX: NiveauBudget[] = ["colleges", "lycees"];

/** Niveau de budget d'une famille d'établissement : collèges, ou lycées (legt, lpo, lp, erea). */
function niveauDe(famille: Fiche["famille"]): NiveauBudget {
  return famille === "college" ? "colleges" : "lycees";
}

/**
 * Élèves de la rentrée par collectivité (clé `${niveau}|${id}`) et secteur. Les fiches disparues comptent
 * pour les rentrées où elles avaient des élèves ; une fiche sans valeur pour la rentrée ne compte pas.
 */
export function elevesParCollectivite(fiches: Fiche[], rentree: number): Map<string, ParSecteur<number>> {
  const r = new Map<string, ParSecteur<number>>();
  for (const f of fiches) {
    const niveau = niveauDe(f.famille);
    const valeur = f.indicateurs.find((i) => i.code === "eleves")?.historique.find(([an]) => an === rentree)?.[1];
    if (valeur === undefined || valeur === null) continue;
    const id = collectiviteDe(niveau, f.dep, f.codeCommune);
    if (!id) continue;
    const cle = `${niveau}|${id}`;
    const e = r.get(cle) ?? { public: 0, prive: 0 };
    e[f.secteur === "public" ? "public" : "prive"] += valeur;
    r.set(cle, e);
  }
  return r;
}

const absent = (statut: StatutBudget): MontantBudget => ({ total: null, parEleve: null, statut });
const montant = (total: number, eleves: number): MontantBudget => ({ total, parEleve: total / eleves, statut: "ok" });

interface Ligne { exercice: number; collectivite: string; niveau: NiveauBudget; secteur: "public" | "prive"; poste: string; montant: number }

/** Montants d'une collectivité pour un exercice : les lignes de `budget_postes` (par secteur et poste), les élèves, le statut. */
function exercice(
  n: number, lignes: Map<string, number>, nonDetaille: boolean, eleves: ParSecteur<number>, cites: number | null,
): ExerciceBudget {
  const pub = eleves.public > 0 ? eleves.public : null;
  const priv = eleves.prive > 0 ? eleves.prive : null;
  const v = (secteur: string, poste: string) => lignes.get(`${secteur}|${poste}`);
  let sortie: Pick<ExerciceBudget, "public" | "prive">;
  if (nonDetaille) {
    const nd = absent("fonction_non_detaillee");
    sortie = { public: { horsPersonnel: nd, avecPersonnel: nd, investissement: nd }, prive: { fonctionnement: nd, investissement: nd } };
  } else if (lignes.size === 0) {
    const nd = absent("non_disponible");
    sortie = { public: { horsPersonnel: nd, avecPersonnel: nd, investissement: nd }, prive: { fonctionnement: nd, investissement: nd } };
  } else {
    const parPublic = (poste: string): MontantBudget => {
      const t = v("public", poste);
      return pub === null || t === undefined ? absent("non_disponible") : montant(t, pub);
    };
    const hors = v("public", "fonctionnement_hors_personnel");
    const personnel = v("public", "personnel") ?? 0; // absent = 0 pour le seuil seulement ; jamais affiché
    let avec: MontantBudget;
    if (pub === null || hors === undefined) avec = absent("non_disponible");
    else if (personnel / pub < SEUIL_PERSONNEL_PAR_ELEVE) avec = absent("personnel_non_rattache");
    else avec = montant(hors + personnel, pub);
    const parPrive = (poste: string, sansLigne: StatutBudget): MontantBudget => {
      if (priv === null) return absent("aucun_eleve_prive");
      const t = v("prive", poste);
      return t === undefined ? absent(sansLigne) : montant(t, priv);
    };
    sortie = {
      public: { horsPersonnel: parPublic("fonctionnement_hors_personnel"), avecPersonnel: avec, investissement: parPublic("investissement") },
      prive: {
        fonctionnement: parPrive("fonctionnement", "aucune_contribution_identifiee"),
        investissement: parPrive("investissement", "non_disponible"),
      },
    };
  }
  return { exercice: n, rentree: n - 1, source: `budget_${n}`, eleves: { public: pub, prive: priv }, ...sortie, citesScolaires: cites };
}

type Poste = { get(e: ExerciceBudget): MontantBudget; elevesDe(e: ExerciceBudget): number | null };
const POSTES: Record<string, Poste> = {
  "public.horsPersonnel": { get: (e) => e.public.horsPersonnel, elevesDe: (e) => e.eleves.public },
  "public.avecPersonnel": { get: (e) => e.public.avecPersonnel, elevesDe: (e) => e.eleves.public },
  "public.investissement": { get: (e) => e.public.investissement, elevesDe: (e) => e.eleves.public },
  "prive.fonctionnement": { get: (e) => e.prive.fonctionnement, elevesDe: (e) => e.eleves.prive },
  "prive.investissement": { get: (e) => e.prive.investissement, elevesDe: (e) => e.eleves.prive },
};

/** Σ montants ÷ Σ élèves des collectivités `ok` du poste ; `n` = leur nombre. */
function moyenne(exercices: ExerciceBudget[], p: Poste): MoyenneBudget {
  let total = 0, eleves = 0, n = 0;
  for (const e of exercices) {
    const m = p.get(e), el = p.elevesDe(e);
    if (m.statut !== "ok" || m.total === null || !el) continue;
    total += m.total;
    eleves += el;
    n++;
  }
  return { valeur: n > 0 ? total / eleves : null, n };
}

/** Niveau qui porte les cités scolaires : lycées pour les régions et collectivités uniques, collèges pour les autres. */
const niveauDesCites = (id: IdCollectivite): NiveauBudget => (id.startsWith("reg-") || id.startsWith("ctu-") ? "lycees" : "colleges");

/**
 * Budgets de chaque collectivité (clé `${niveau}|${id}`) pour tous les exercices ≥ `EXERCICE_MIN` présents dans
 * les balances, et moyennes France. Une collectivité sans élève dans les fiches n'a pas de budget.
 */
export async function calculerBudgets(
  db: Db, fiches: Fiche[],
): Promise<{ collectivites: Map<string, BudgetCollectivite>; france: MoyennesBudgetFrance[] }> {
  const postes = await db.sql<Ligne>(
    `select exercice::int as exercice, collectivite, niveau, secteur, poste, montant from budget_postes where exercice >= ${EXERCICE_MIN}`,
  );
  const lignesNonDetaillees = await db.sql<{ exercice: number; collectivite: string; niveau: string }>(
    `select exercice::int as exercice, collectivite, niveau from budget_non_detaille where exercice >= ${EXERCICE_MIN}`,
  );
  const cites = await db.sql<{ exercice: number; collectivite: string; montant: number }>(
    `select exercice::int as exercice, collectivite, montant from budget_cites where exercice >= ${EXERCICE_MIN}`,
  );
  const exercices = [...new Set([...postes, ...lignesNonDetaillees, ...cites].map((l) => l.exercice))].sort((a, b) => a - b);

  const lignes = new Map<string, Map<string, number>>(); // `${exercice}|${niveau}|${collectivite}` → `${secteur}|${poste}` → montant
  for (const l of postes) {
    const cle = `${l.exercice}|${l.niveau}|${l.collectivite}`;
    const m = lignes.get(cle) ?? new Map<string, number>();
    m.set(`${l.secteur}|${l.poste}`, l.montant);
    lignes.set(cle, m);
  }
  const nonDetaille = new Set(lignesNonDetaillees.map((l) => `${l.exercice}|${l.niveau}|${l.collectivite}`));
  const citesParCle = new Map(cites.map((c) => [`${c.exercice}|${c.collectivite}`, c.montant]));
  const eleves = new Map(exercices.map((e) => [e, elevesParCollectivite(fiches, e - 1)]));

  // Collectivités connues : celles qui ont des élèves à l'une des rentrées des exercices publiés.
  const cles = new Set<string>();
  for (const m of eleves.values()) for (const [cle, e] of m) if (e.public + e.prive > 0) cles.add(cle);

  const collectivites = new Map<string, BudgetCollectivite>();
  for (const cle of [...cles].sort()) {
    const [niveau, id] = cle.split("|") as [NiveauBudget, IdCollectivite];
    const parExercice = exercices.map((e) =>
      exercice(
        e, lignes.get(`${e}|${niveau}|${id}`) ?? new Map(), nonDetaille.has(`${e}|${niveau}|${id}`),
        eleves.get(e)!.get(cle) ?? { public: 0, prive: 0 },
        // Cités scolaires (fonction 24) : au niveau du financeur, jamais aux deux.
        niveauDesCites(id) === niveau ? (citesParCle.get(`${e}|${id}`) ?? null) : null,
      ),
    );
    const mentions: BudgetCollectivite["mentions"] = [];
    if (niveau === "lycees" && AGRICOLE.mode === "mention") mentions.push("agricole");
    const part = niveau === "colleges" ? CITES_SCOLAIRES[id] : undefined;
    if (part !== undefined) mentions.push("cites_scolaires");
    collectivites.set(cle, {
      id, libelle: libelleCollectivite(id), niveau, exercices: parExercice, mentions,
      ...(part !== undefined ? { partCitesScolaires: part } : {}),
    });
  }

  const france: MoyennesBudgetFrance[] = NIVEAUX.map((niveau) => {
    const duNiveau = [...collectivites.values()].filter((c) => c.niveau === niveau);
    return {
      niveau,
      exercices: exercices.map((e) => {
        const es = duNiveau.map((c) => c.exercices.find((x) => x.exercice === e)!);
        const m = (k: string) => moyenne(es, POSTES[k]!);
        return {
          exercice: e,
          public: { horsPersonnel: m("public.horsPersonnel"), avecPersonnel: m("public.avecPersonnel"), investissement: m("public.investissement") },
          prive: { fonctionnement: m("prive.fonctionnement"), investissement: m("prive.investissement") },
        };
      }),
    };
  });
  return { collectivites, france };
}
