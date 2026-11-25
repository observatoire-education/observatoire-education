// Transport scolaire : choix d'unité et repérage des exercices, pour le bloc et sa courbe.
import type { ExerciceTransport } from "@obs/shared/donnees";

type Poste = "fonctionnement" | "investissement" | "produitsServices";

const aDesDonnees = (e: ExerciceTransport) => e.fonctionnement !== null || e.investissement !== null || e.produitsServices !== null;

/**
 * Unité de la courbe : k€ quand aucun fonctionnement n'atteint le million (un département qui ne finance plus le
 * transport scolaire n'impute que quelques milliers d'euros, que le M€ écrase à 0), M€ sinon.
 */
export function uniteTransport(serie: ExerciceTransport[]): { unite: "k€" | "M€"; diviseur: number } {
  const max = Math.max(0, ...serie.map((e) => Math.abs(e.fonctionnement ?? 0)));
  return max < 1e6 ? { unite: "k€", diviseur: 1e3 } : { unite: "M€", diviseur: 1e6 };
}

/** Dernier exercice où le poste a un montant, avec ce montant ; null si aucun. */
export function montantRecent(serie: ExerciceTransport[], poste: Poste): { exercice: number; montant: number } | null {
  const e = serie.findLast((x) => x[poste] !== null);
  return e ? { exercice: e.exercice, montant: e[poste]! } : null;
}

/**
 * Exercice à partir duquel plus aucun poste n'apparaît dans les comptes de la collectivité, quand ses derniers
 * exercices sont vides ; null si le dernier exercice a un montant ou si la série n'en a aucun.
 */
export function exerciceArret(serie: ExerciceTransport[]): number | null {
  const i = serie.findLastIndex(aDesDonnees);
  return i === -1 || i === serie.length - 1 ? null : serie[i + 1]!.exercice;
}

