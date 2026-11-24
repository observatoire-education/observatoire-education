// Lecture des fichiers produits par le pipeline (site/data/, ou OBS_DATA pour les tests).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DonneesFrance, DonneesSource, DonneesTerritoire, EntreeIndex } from "@obs/shared/donnees";
import type { Fiche } from "@obs/shared/types";

const DOSSIER = process.env.OBS_DATA ?? resolve(process.cwd(), "data");
const cache = new Map<string, unknown>();

function lire<T>(chemin: string, garder = false): T {
  if (garder && cache.has(chemin)) return cache.get(chemin) as T;
  const v = JSON.parse(readFileSync(join(DOSSIER, chemin), "utf8")) as T;
  if (garder) cache.set(chemin, v);
  return v;
}

export const lireFiche = (uai: string): Fiche => lire<Fiche>(`fiches/${uai}.json`);
export const lireIndex = (): EntreeIndex[] => lire<EntreeIndex[]>("index.json", true);
export const lireDepartement = (dep: string): DonneesTerritoire => lire<DonneesTerritoire>(`departements/${dep}.json`, true);
export const lireFrance = (): DonneesFrance => lire<DonneesFrance>("france.json", true);
export const lireSources = (): Record<string, DonneesSource> => lire<Record<string, DonneesSource>>("sources.json", true);
export const departementsDisponibles = (): string[] =>
  readdirSync(join(DOSSIER, "departements")).map((f) => f.replace(/\.json$/, "")).sort();
