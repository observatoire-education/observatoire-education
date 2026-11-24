// Constantes du budget des collectivités, fixées par les contrôles sur les balances réelles
// (`scripts/budget-controles.ts`, résultats et décisions dans docs/budget-controles.md).
import type { IdCollectivite } from "@obs/shared/collectivites";

/**
 * € de comptes 64 de la fonction 221 par élève du public en dessous desquels le personnel des collèges est
 * « non rattaché ». 2024 : 38 collectivités entre −51 € et 0,56 €, 61 entre 124 € et 1 436 € ; le seuil est
 * dans ce creux, sous la plus basse valeur rattachée observée de 2020 à 2025 (Haute-Loire, 85 € en 2020).
 */
export const SEUIL_PERSONNEL_PAR_ELEVE = 50;

/**
 * Enseignement agricole : aucun compte des fonctions 222 / 223 ne le sépare (dotations 655121 / 655122 et
 * subventions communes à tous les lycées, aucun bénéficiaire dans les balances) → mention sur les pages.
 */
export const AGRICOLE: { mode: "isole"; comptes: string[] } | { mode: "mention" } = { mode: "mention" };

/**
 * Part (%) des reversements à des départements et régions (65732, 65733, 20412, 20413 et sous-comptes) dans les
 * dépenses retenues du niveau, exercice 2024, pour les collectivités au-dessus de 3 %.
 */
export const CITES_SCOLAIRES: Record<IdCollectivite, number> = {
  "dep-23": 9.1,
  "dep-54": 7.3,
  "dep-47": 7.0,
};

/** Premier exercice publié ; il n'y a pas de borne haute : tout exercice collecté est publié. */
export const EXERCICE_MIN = 2020;
