// Montants par élève des collectivités et moyennes France.
// Un exercice N est divisé par les élèves de la rentrée N−1 (DEPP) ; fiches disparues comprises.
// Écoles : la commune, en € par élève de ses écoles publiques (fonctions 21x de ses comptes).
import { collectiviteDe, libelleCollectivite, motifSansCollectivite, type IdCollectivite, type NiveauBudget } from "@obs/shared/collectivites";
import type {
  BudgetCollectivite, ExerciceBudget, MontantBudget, MoyenneBudget, MoyennesBudgetFrance, ParSecteur, StatutBudget,
} from "@obs/shared/donnees";
import { estEcole, estSecondDegre } from "@obs/shared/libelles";
import { communeDeRattachement, LIBELLES_PLM } from "@obs/shared/territoires";
import type { Fiche, FamilleSecondDegre } from "@obs/shared/types";
import { AGRICOLE, CITES_SCOLAIRES, EXERCICE_MIN, SEUIL_PERSONNEL_PAR_ELEVE } from "./budget-constantes.ts";
import { chargerCommunes, type TableCommunes } from "./communes.ts";
import type { Db } from "./db.ts";

const NIVEAUX: NiveauBudget[] = ["colleges", "lycees", "ecoles"];

/**
 * Code de la commune d'aujourd'hui, celui des pages commune : arrondissement → Paris, Lyon ou Marseille ; ancien code
 * (commune fusionnée) → commune en vigueur, si le Code officiel géographique est chargé.
 */
export type CommuneDe = (codeCommune: string) => string;
const communeSansCog: CommuneDe = (code) => communeDeRattachement(code);
export const communeAvecCog = (t: TableCommunes): CommuneDe => (code) => t.actuelle(communeDeRattachement(code));

/** Collectivité des écoles d'une commune : la commune d'aujourd'hui. */
export const communeDuBudget = (codeCommune: string, communeDe: CommuneDe = communeSansCog): IdCollectivite =>
  `com-${communeDe(codeCommune)}`;

const vuePresente = async (db: Db, nom: string) =>
  (await db.sql<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = '${nom}'`))[0]!.n > 0;

/**
 * Communes d'aujourd'hui qui en ont absorbé d'autres (fusion simple, commune nouvelle, fusion-association : mouvements
 * 31, 32, 33 du Code officiel géographique) et date de la dernière absorption. La balance d'un exercice antérieur porte
 * la commune d'avant, sans les écoles des communes absorbées.
 */
async function fusionsDesCommunes(db: Db, communeDe: CommuneDe): Promise<Map<string, string>> {
  if (!(await vuePresente(db, "src_cog_mouvements"))) return new Map();
  const r = await db.sql<{ av: string; ap: string; le: string }>(
    `select distinct trim(com_av) as av, trim(com_ap) as ap, trim(date_eff) as le from src_cog_mouvements
     where trim(mod) in ('31', '32', '33') and trim(typecom_av) = 'COM' and trim(typecom_ap) = 'COM' and trim(com_av) <> trim(com_ap)`,
  );
  const fusions = new Map<string, string>();
  for (const { ap, le } of r) {
    const code = communeDe(ap);
    if ((fusions.get(code) ?? "") < le) fusions.set(code, le);
  }
  return fusions;
}

/** Niveau de budget d'une famille du second degré : collèges, ou lycées (legt, lpo, lp, erea). Les écoles n'en ont pas. */
export function niveauDe(famille: FamilleSecondDegre): NiveauBudget {
  return famille === "college" ? "colleges" : "lycees";
}

/**
 * Élèves de la rentrée par collectivité (clé `${niveau}|${id}`) et secteur. Les fiches disparues comptent
 * pour les rentrées où elles avaient des élèves ; une fiche sans valeur pour la rentrée ne compte pas.
 * Écoles : seulement les écoles publiques, comptées pour leur commune (`ecoles|com-44109`).
 */
export function elevesParCollectivite(
  fiches: Fiche[], rentree: number, communeDe: CommuneDe = communeSansCog,
): Map<string, ParSecteur<number>> {
  const r = new Map<string, ParSecteur<number>>();
  for (const f of fiches) {
    if (estEcole(f.famille) && f.secteur !== "public") continue; // le budget des communes va à leurs écoles publiques
    const valeur = f.indicateurs.find((i) => i.code === "eleves")?.historique.find(([an]) => an === rentree)?.[1];
    if (valeur === undefined || valeur === null) continue;
    const niveau: NiveauBudget = estSecondDegre(f.famille) ? niveauDe(f.famille) : "ecoles";
    const id = niveau === "ecoles" ? communeDuBudget(f.codeCommune, communeDe) : collectiviteDe(niveau, f.dep, f.codeCommune);
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

/**
 * Montants d'une collectivité pour un exercice : les lignes de `budget_postes` (par secteur et poste), les élèves, le
 * statut. Sans aucune ligne : `non_disponible`, ou pour une commune `budget_communal_non_publie`. Commune qui en a
 * absorbé d'autres après le début de l'exercice : `commune_fusionnee_apres_exercice` (les élèves comptés sont ceux de
 * toutes ses écoles d'aujourd'hui, la balance ne couvre que la commune d'avant).
 */
function exercice(
  n: number, lignes: Map<string, number>, nonDetaille: boolean, eleves: ParSecteur<number>, cites: number | null,
  niveau: NiveauBudget, fusionneeApres = false,
): ExerciceBudget {
  const pub = eleves.public > 0 ? eleves.public : null;
  const priv = eleves.prive > 0 ? eleves.prive : null;
  const v = (secteur: string, poste: string) => lignes.get(`${secteur}|${poste}`);
  let sortie: Pick<ExerciceBudget, "public" | "prive">;
  if (fusionneeApres) {
    const nd = absent("commune_fusionnee_apres_exercice");
    sortie = { public: { horsPersonnel: nd, avecPersonnel: nd, investissement: nd }, prive: { fonctionnement: nd, investissement: nd } };
  } else if (nonDetaille) {
    const nd = absent("fonction_non_detaillee");
    sortie = { public: { horsPersonnel: nd, avecPersonnel: nd, investissement: nd }, prive: { fonctionnement: nd, investissement: nd } };
  } else if (lignes.size === 0) {
    const nd = absent(niveau === "ecoles" ? "budget_communal_non_publie" : "non_disponible");
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

/**
 * Nom de chaque commune des écoles (`com-44109` → « Nantes ») : Paris, Lyon et Marseille pour leurs arrondissements,
 * sinon le nom du Code officiel géographique, à défaut celui de la fiche.
 */
function nomsDesCommunes(fiches: Fiche[], communeDe: CommuneDe, t: TableCommunes | null): Map<IdCollectivite, string> {
  const r = new Map<IdCollectivite, string>();
  for (const f of fiches) {
    if (!estEcole(f.famille)) continue;
    const code = communeDe(f.codeCommune);
    const nom = LIBELLES_PLM[code as keyof typeof LIBELLES_PLM] ?? t?.nom(code) ?? f.commune;
    if (!r.has(`com-${code}`) || f.disparuLe === null) r.set(`com-${code}`, nom);
  }
  return r;
}

/** Niveau qui porte les cités scolaires : lycées pour les régions et collectivités uniques, collèges pour les autres. */
const niveauDesCites = (id: IdCollectivite): NiveauBudget => (id.startsWith("reg-") || id.startsWith("ctu-") ? "lycees" : "colleges");

/**
 * Budgets de chaque collectivité (clé `${niveau}|${id}`) pour tous les exercices ≥ `EXERCICE_MIN` présents dans
 * les balances, et moyennes France. Une collectivité sans élève dans les fiches n'a pas de budget.
 */
export async function calculerBudgets(db: Db, fiches: Fiche[]): Promise<Budgets> {
  // Code officiel géographique : absent des bases de test du budget seul (alors arrondissements seulement).
  const t = (await vuePresente(db, "src_cog_communes")) && (await vuePresente(db, "src_cog_mouvements")) ? await chargerCommunes(db) : null;
  const communeDe = t ? communeAvecCog(t) : communeSansCog;
  const fusions = await fusionsDesCommunes(db, communeDe);
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
  const eleves = new Map(exercices.map((e) => [e, elevesParCollectivite(fiches, e - 1, communeDe)]));

  // Collectivités connues : celles qui ont des élèves à l'une des rentrées des exercices publiés. Communes : seulement
  // celles qui ont des lignes pour l'un des exercices (les autres n'ont pas de budget, la fiche dit pourquoi).
  const communesPubliees = new Set(postes.filter((l) => l.niveau === "ecoles").map((l) => `ecoles|${l.collectivite}`));
  const cles = new Set<string>();
  for (const m of eleves.values()) {
    for (const [cle, e] of m) if (e.public + e.prive > 0 && (!cle.startsWith("ecoles|") || communesPubliees.has(cle))) cles.add(cle);
  }
  const noms = nomsDesCommunes(fiches, communeDe, t);

  const collectivites = new Map<string, BudgetCollectivite>();
  for (const cle of [...cles].sort()) {
    const [niveau, id] = cle.split("|") as [NiveauBudget, IdCollectivite];
    const parExercice = exercices.map((e) =>
      exercice(
        e, lignes.get(`${e}|${niveau}|${id}`) ?? new Map(), nonDetaille.has(`${e}|${niveau}|${id}`),
        eleves.get(e)!.get(cle) ?? { public: 0, prive: 0 },
        // Cités scolaires (fonction 24) : au niveau du financeur, jamais aux deux.
        niveauDesCites(id) === niveau ? (citesParCle.get(`${e}|${id}`) ?? null) : null,
        niveau,
        niveau === "ecoles" && (fusions.get(id.slice(4)) ?? "") > `${e}-01-01`,
      ),
    );
    const mentions: BudgetCollectivite["mentions"] = [];
    if (niveau === "lycees" && AGRICOLE.mode === "mention") mentions.push("agricole");
    const part = niveau === "colleges" ? CITES_SCOLAIRES[id] : undefined;
    if (part !== undefined) mentions.push("cites_scolaires");
    collectivites.set(cle, {
      id, libelle: niveau === "ecoles" ? noms.get(id)! : libelleCollectivite(id), niveau, exercices: parExercice, mentions,
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
  return { collectivites, france, communeDe };
}

export interface Budgets {
  collectivites: Map<string, BudgetCollectivite>;
  france: MoyennesBudgetFrance[];
  /** Commune d'aujourd'hui d'un code commune (écoles) ; à défaut, arrondissements seulement. */
  communeDe?: CommuneDe;
}

/**
 * Bloc budget d'une fiche : la collectivité du niveau de sa famille et les moyennes France de ce niveau.
 * Collectivité null (avec son motif) si aucune n'est rattachée ou si elle n'a aucun élève dans les fiches.
 * École publique : sa commune (null si elle est absente des balances) ; école privée : aucun bloc.
 */
export function budgetDeFiche(f: Pick<Fiche, "famille" | "secteur" | "dep" | "codeCommune">, budgets: Budgets): Fiche["budget"] {
  if (estEcole(f.famille)) {
    if (f.secteur !== "public") return { france: [] };
    const commune = budgets.collectivites.get(`ecoles|${communeDuBudget(f.codeCommune, budgets.communeDe)}`) ?? null;
    const france = budgets.france.filter((m) => m.niveau === "ecoles");
    return commune ? { ecoles: commune, france } : { ecoles: null, france, motif: "budget_communal_non_publie" };
  }
  const niveau = niveauDe(f.famille);
  const id = collectiviteDe(niveau, f.dep, f.codeCommune);
  const france = budgets.france.filter((m) => m.niveau === niveau);
  const collectivite = id ? (budgets.collectivites.get(`${niveau}|${id}`) ?? null) : null;
  const cle = niveau === "colleges" ? "colleges" : "lycees";
  return collectivite
    ? { [cle]: collectivite, france }
    : { [cle]: null, france, motif: id ? "collectivite_non_identifiee" : motifSansCollectivite(f.dep, f.codeCommune) };
}

/** Nombre de collectivités par statut du fonctionnement hors personnel du public, au dernier exercice, par niveau. */
export function statutsDernierExercice(budgets: Budgets): Record<NiveauBudget, Record<string, number>> {
  const r: Record<NiveauBudget, Record<string, number>> = { colleges: {}, lycees: {}, ecoles: {} };
  for (const c of budgets.collectivites.values()) {
    const e = c.exercices.at(-1);
    const statut = e?.public.horsPersonnel.statut ?? "non_disponible";
    r[c.niveau][statut] = (r[c.niveau][statut] ?? 0) + 1;
  }
  return r;
}
