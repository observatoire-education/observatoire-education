// Mise en forme du bloc « Moyens de la collectivité » : absences, montants, comparaisons à la moyenne France.
import type { MontantBudget, MoyenneBudget, StatutBudget } from "@obs/shared/donnees";
import type { NiveauBudget } from "@obs/shared/collectivites";
import { lireSources } from "./donnees";
import { ecart, entier } from "@obs/shared/format";
import { LIBELLES, LIBELLES_BUDGET as L } from "@obs/shared/libelles";

import type { Famille } from "@obs/shared/types";

export { millions } from "@obs/shared/format";

/** Libellé exact de l'absence d'un montant, selon son statut (et collèges ou lycées). Jamais « 0 € ». */
export function absenceBudget(statut: StatutBudget, niveau: NiveauBudget): string {
  const colleges = niveau === "colleges";
  switch (statut) {
    case "personnel_non_rattache":
      return colleges ? L.absences.personnelNonRattacheColleges : L.absences.personnelNonRattacheLycees;
    case "fonction_non_detaillee":
      return colleges ? L.absences.fonctionNonDetailleeColleges : L.absences.fonctionNonDetailleeLycees;
    case "aucun_eleve_prive":
      return L.absences.aucunElevePrive;
    case "collectivite_non_identifiee":
      return L.absences.collectiviteNonIdentifiee;
    case "aucune_collectivite":
      return L.absences.aucuneCollectivite;
    case "aucune_contribution_identifiee":
      return L.absences.aucuneContributionIdentifiee;
    case "ok":
    case "non_disponible":
      return LIBELLES.nonDisponible;
  }
}

/** Montant par élève, arrondi à l'euro ; à défaut, l'absence en toutes lettres. */
export function montantBudget(m: MontantBudget, niveau: NiveauBudget): { texte: string; absent: boolean } {
  return m.statut === "ok" && m.parEleve !== null
    ? { texte: entier(m.parEleve), absent: false }
    : { texte: absenceBudget(m.statut === "ok" ? "non_disponible" : m.statut, niveau), absent: true };
}

/** « +2 429 (8 011) » et le nombre de collectivités de la moyenne ; null si le montant est absent. */
export function comparaisonBudget(m: MontantBudget, moyenne: MoyenneBudget | undefined): { texte: string; n: number | null } | null {
  if (m.statut !== "ok" || m.parEleve === null) return null;
  if (!moyenne || moyenne.valeur === null) return { texte: L.moyenne.nonDisponible, n: null };
  return { texte: ecart(m.parEleve, moyenne.valeur, 0), n: moyenne.n };
}

/** Écart signé en euros par élève, « +18 132 » ou « −1 204 ». */
export function ecartSigne(a: number, b: number): string {
  const d = a - b;
  const t = entier(Math.abs(d));
  return Math.round(d) === 0 ? t : `${d > 0 ? "+" : "−"}${t}`;
}

/** Niveau de budget d'une famille d'établissement : collèges, ou lycées (lycées GT, polyvalents, professionnels, EREA). */
export const niveauDe = (famille: Famille): NiveauBudget => (famille === "college" ? "colleges" : "lycees");

/** Lien vers la donnée brute archivée d'un exercice (`budget_N`), si elle est connue. */
export const brutBudget = (id: string): string | undefined => lireSources()[id]?.actuelle?.url;
