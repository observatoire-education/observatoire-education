// Rattachement des arrondissements municipaux et chemins des pages de territoire.
import type { RefTerritoire } from "./donnees.ts";

/** Nombre minimum d'établissements pour publier une moyenne de territoire. */
export const SEUIL_COMMUNE = 3;

/** Intervalles de codes INSEE des arrondissements, avec la commune de rattachement. */
const ARRONDISSEMENTS: readonly { min: number; max: number; commune: string }[] = [
  { min: 75101, max: 75120, commune: "75056" },
  { min: 69381, max: 69389, commune: "69123" },
  { min: 13201, max: 13216, commune: "13055" },
];

/** Arrondissement → commune ; tout autre code est renvoyé inchangé. */
export function communeDeRattachement(codeCommune: string): string {
  if (!/^\d{5}$/.test(codeCommune)) return codeCommune;
  const n = Number(codeCommune);
  const trouve = ARRONDISSEMENTS.find((a) => n >= a.min && n <= a.max);
  return trouve ? trouve.commune : codeCommune;
}

export const LIBELLES_PLM: Record<"75056" | "69123" | "13055", string> = {
  "75056": "Paris",
  "69123": "Lyon",
  "13055": "Marseille",
};

/** Chemin (avec barres de début et de fin) de la page d'un territoire. */
export function cheminTerritoire(ref: RefTerritoire): string {
  return ref.niveau === "france" ? "/france/" : `/${ref.niveau}/${ref.code}/`;
}
