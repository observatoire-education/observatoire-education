// Registre des pages : toutes les UAI ayant eu une page, avec leur dernière identité connue.
// Une URL publiée ne disparaît jamais : une UAI sortie du périmètre garde sa page, avec la mention
// de disparition, son identité d'ici et ses données statistiques encore présentes dans les sources.
// Le fichier est versionné dans git : il ne garde que l'identité (quelques Mo), une ligne par UAI.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Fiche, Identite } from "@obs/shared/types";

export interface EntreeRegistre {
  /** Date de la première collecte où l'UAI était dans le périmètre. */
  premiere: string;
  identite: Identite;
  /** Date de la première collecte où l'UAI n'était plus dans le périmètre (absent si présente). */
  disparuLe?: string;
}

export type Registre = Record<string, EntreeRegistre>;

export function lireRegistre(chemin: string): Registre {
  return existsSync(chemin) ? (JSON.parse(readFileSync(chemin, "utf8")) as Registre) : {};
}

/** Écriture atomique, triée par UAI, une entrée par ligne (diffs lisibles). */
export function ecrireRegistre(chemin: string, r: Registre): void {
  const lignes = Object.keys(r)
    .sort()
    .map((uai) => `  ${JSON.stringify(uai)}: ${JSON.stringify(r[uai])}`);
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  writeFileSync(tmp, `{\n${lignes.join(",\n")}\n}\n`);
  renameSync(tmp, chemin);
}

export function identiteDe(f: Fiche): Identite {
  const {
    nom, famille, secteur, contrat, adresse, codePostal, commune, codeCommune, dep, depLibelle, aca, acaLibelle,
    ep, segpa, ulis, internat, lat, lon, autresSites,
  } = f;
  return {
    nom, famille, secteur, contrat, adresse, codePostal, commune, codeCommune, dep, depLibelle, aca, acaLibelle,
    ep, segpa, ulis, internat, lat, lon, autresSites,
  };
}

/**
 * Nouveau registre après une génération : les fiches actives mettent à jour leur identité
 * (et perdent une éventuelle mention de disparition), les fiches disparues gardent la leur, complétée au besoin
 * d'un nom et d'une commune qui manquaient.
 */
export function mettreAJourRegistre(avant: Registre, fiches: Fiche[], date: string): Registre {
  const apres: Registre = { ...avant };
  for (const f of fiches) {
    const precedent = avant[f.uai];
    if (f.disparuLe === null) {
      apres[f.uai] = { premiere: precedent?.premiere ?? date, identite: identiteDe(f) };
    } else if (precedent) {
      // identité figée, sauf le nom et la commune qu'une génération a pu compléter (voir completerIdentite)
      const { nom, commune, codeCommune } = f;
      apres[f.uai] = { ...precedent, identite: { ...precedent.identite, nom, commune, codeCommune }, disparuLe: f.disparuLe };
    } else {
      // fiche historique (établissement fermé cité par une source) : son URL devient permanente
      apres[f.uai] = { premiere: date, identite: identiteDe(f), disparuLe: f.disparuLe };
    }
  }
  return apres;
}
