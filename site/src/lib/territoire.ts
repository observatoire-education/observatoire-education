// Aides des pages de territoire (France, académie, département, commune) : synthèses, lignes de liste, CSV.
import { comparerCollectivites, type NiveauBudget } from "@obs/shared/collectivites";
import type { BudgetCollectivite, DonneesTerritoire, LigneListe, LigneTerritoire, SyntheseFamille } from "@obs/shared/donnees";
import { entier } from "@obs/shared/format";
import { FAMILLES, FAMILLES_SECOND_DEGRE } from "@obs/shared/libelles";
import type { Famille, FamilleSecondDegre, ResumeResultat } from "@obs/shared/types";

/** Familles des pages de territoire : second degré seulement (les écoles n'y figurent pas). */
export const ORDRE_FAMILLES: FamilleSecondDegre[] = [...FAMILLES_SECOND_DEGRE];

export const famillesDe = (d: DonneesTerritoire): [FamilleSecondDegre, SyntheseFamille][] =>
  ORDRE_FAMILLES.flatMap((f) => (d.familles[f] ? [[f, d.familles[f]!] as [FamilleSecondDegre, SyntheseFamille]] : []));

/** Pluriel des familles dans une phrase (« 2 lycées professionnels ») ; le sigle EREA est invariable. */
const PLURIEL: Record<Famille, string> = {
  college: "collèges",
  legt: "lycées généraux et technologiques",
  lpo: "lycées polyvalents",
  lp: "lycées professionnels",
  erea: "EREA",
  maternelle: "écoles maternelles",
  elementaire: "écoles élémentaires",
  primaire: "écoles primaires",
};

/** Nom d'une famille dans une phrase : en minuscules, au singulier ou au pluriel selon n ; EREA reste un sigle. */
export const nomFamille = (f: Famille, n: number): string =>
  f === "erea" ? FAMILLES.erea : n > 1 ? PLURIEL[f] : FAMILLES[f].toLowerCase();

/** Valeur de tri d'une cellule numérique (vide si absente : triée en dernier). */
export const valeurTri = (v: number | null): string => (v === null ? "" : String(Math.round(v * 100) / 100));

const COLONNES_CSV = [
  "uai", "nom", "famille", "secteur", "commune", "ep", "eleves", "eleves_par_etp_ens", "eleves_par_etp_vs",
  "part_enseignantes", "ips",
  "session_brevet", "reussite_brevet", "va_brevet", "session_bac_gt", "reussite_bac_gt", "va_bac_gt",
  "session_bac_pro", "reussite_bac_pro", "va_bac_pro",
] as const;

/** Résumés d'une ligne : brevet (série générale, sinon professionnelle), bac GT, bac pro ; vide si absent, jamais 0. */
const colonnesReussite = (r: ResumeResultat[]): (number | null)[] =>
  [
    r.find((x) => x.voie === "brevet_general") ?? r.find((x) => x.voie === "brevet_pro"),
    r.find((x) => x.voie === "bac_gt"),
    r.find((x) => x.voie === "bac_pro"),
  ].flatMap((x) => [x?.session ?? null, x?.taux ?? null, x?.va ?? null]);

/**
 * Champ CSV. Un texte qui commence par =, +, -, @, tabulation ou retour chariot est préfixé d'une
 * apostrophe, pour qu'aucun tableur ne l'interprète comme une formule ; les nombres sont laissés tels quels.
 */
const champ = (v: string | number | null): string => {
  if (v === null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const COLONNES_CSV_ENFANTS = [
  "code", "libelle", "etablissements_public", "etablissements_prive", "eleves_public", "eleves_prive", "part_prive",
  "ecart_ips_colleges",
] as const;

const csv = (colonnes: readonly string[], lignes: (string | number | null)[][]): string =>
  `${[colonnes.join(";"), ...lignes.map((l) => l.map(champ).join(";"))].join("\n")}\n`;

/**
 * CSV (séparateur « ; », point décimal) ; une absence est vide, ou porte son statut (« non_publie_prive »).
 * Département et commune : un établissement par ligne ; région, académie et France : un territoire enfant par ligne.
 */
export function csvTerritoire(d: DonneesTerritoire): string {
  if (d.ref.niveau === "academie" || d.ref.niveau === "france" || d.ref.niveau === "region") {
    return csv(COLONNES_CSV_ENFANTS, d.enfants.map((e: LigneTerritoire) => [
      e.ref.code, e.ref.libelle, e.compte.public, e.compte.prive, e.eleves.public, e.eleves.prive, e.partPrive,
      e.ecartIpsColleges,
    ]));
  }
  return csv(COLONNES_CSV, famillesDe(d).flatMap(([famille, s]) =>
    s.liste.map((l: LigneListe) => [
      l.uai, l.nom, famille, l.secteur, l.commune, l.ep, l.eleves, l.elevesParEtpEns,
      l.elevesParEtpVs ?? (l.statutVs === "non_publie_prive" ? "non_publie_prive" : null),
      l.partEnseignantes, l.ips, ...colonnesReussite(l.reussite),
    ]),
  ));
}

/**
 * Part des élèves du privé (%) : null si les élèves sont inconnus ; 0 quand le territoire n'a aucun
 * établissement privé (`aucunPrive`) et que les élèves du public sont connus.
 */
export function partPrive(e: { public: number | null; prive: number | null }, aucunPrive = false): number | null {
  if (aucunPrive && e.prive === null && e.public) return 0;
  const t = e.public === null && e.prive === null ? null : (e.public ?? 0) + (e.prive ?? 0);
  return t && e.prive !== null ? (100 * e.prive) / t : null;
}

const COLONNES_CSV_BUDGET = [
  "collectivite", "libelle", "exercice", "rentree", "eleves_public", "eleves_prive", "fonct_hors_personnel_par_eleve",
  "fonct_avec_personnel_par_eleve", "invest_public_par_eleve", "contribution_prive_par_eleve", "invest_prive_par_eleve",
  "statut_personnel",
] as const;

const arrondi = (v: number | null): number | null => (v === null ? null : Math.round(v * 100) / 100);

/**
 * Budget des collectivités d'un niveau, une ligne par collectivité et par exercice (tri par libellé puis exercice).
 * Une absence est une cellule vide, jamais « 0 » ; `statut_personnel` dit pourquoi le personnel manque (« ok » sinon).
 */
export function csvBudget(collectivites: BudgetCollectivite[], niveau: NiveauBudget): string {
  const lignes = [...collectivites]
    .filter((c) => c.niveau === niveau)
    .sort(comparerCollectivites)
    .flatMap((c) =>
      [...c.exercices].sort((a, b) => a.exercice - b.exercice).map((e) => [
        c.id, c.libelle, e.exercice, e.rentree, e.eleves.public, e.eleves.prive,
        arrondi(e.public.horsPersonnel.parEleve), arrondi(e.public.avecPersonnel.parEleve), arrondi(e.public.investissement.parEleve),
        arrondi(e.prive.fonctionnement.parEleve), arrondi(e.prive.investissement.parEleve), e.public.avecPersonnel.statut,
      ]),
    );
  return csv(COLONNES_CSV_BUDGET, lignes);
}

/** « 1 académie », « 12 académies » (nombre à la française, pluriel dès 2). */
export function pluriel(n: number, nom: string): string {
  return `${entier(n)} ${nom}${n > 1 ? "s" : ""}`;
}
