// Lecture des fichiers produits par le pipeline (site/data/, ou OBS_DATA pour les tests).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DonneesFrance, DonneesSource, DonneesTerritoire, EntreeIndex, RefTerritoire } from "@obs/shared/donnees";
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
export const lireFrance = (): DonneesFrance => lire<DonneesFrance>("france.json", true);
export const lireSources = (): Record<string, DonneesSource> => lire<Record<string, DonneesSource>>("sources.json", true);

const DOSSIERS = { departement: "departements", region: "regions", academie: "academies", commune: "communes" } as const;
const codes = (dossier: string): string[] =>
  existsSync(join(DOSSIER, dossier)) ? readdirSync(join(DOSSIER, dossier)).map((f) => f.replace(/\.json$/, "")).sort() : [];

/** Données d'un territoire ; celles des communes (un millier) ne sont pas gardées en mémoire. */
export const lireTerritoire = (ref: Pick<RefTerritoire, "niveau" | "code">): DonneesTerritoire =>
  ref.niveau === "france"
    ? lireFrance()
    : lire<DonneesTerritoire>(`${DOSSIERS[ref.niveau]}/${ref.code}.json`, ref.niveau !== "commune");
export const departementsDisponibles = (): string[] => codes("departements");
export const regionsDisponibles = (): string[] => codes("regions");
export const academiesDisponibles = (): string[] => codes("academies");
let communes: Set<string> | undefined;
/** Communes ayant une page (au moins SEUIL_COMMUNE collèges et lycées, ou une école depuis 2012 ; décidé par le pipeline). */
export const communesDisponibles = (): Set<string> => (communes ??= new Set(codes("communes")));
/**
 * Communes de la recherche : toutes celles qui ont une page, second degré (`communes` du département) ou écoles
 * (`communesEcoles`), triées par code. `i` code, `l` nom, `d` département.
 */
export function communesRecherche(): { i: string; l: string; d: string }[] {
  const r = new Map<string, { i: string; l: string; d: string }>();
  for (const dep of departementsDisponibles()) {
    const t = lireTerritoire({ niveau: "departement", code: dep });
    for (const c of [...t.communes, ...(t.communesEcoles ?? [])]) {
      if (communesDisponibles().has(c.code) && !r.has(c.code)) r.set(c.code, { i: c.code, l: c.libelle, d: dep });
    }
  }
  return [...r.values()].sort((a, b) => a.i.localeCompare(b.i));
}

let avecCsv: Set<string> | undefined;
/**
 * Communes qui ont leur `etablissements.csv` : celles retenues pour le second degré (au moins SEUIL_COMMUNE collèges
 * et lycées), listées par leur département. Les autres pages commune renvoient au CSV du département (spec, 6.7).
 */
export const communesAvecCsv = (): Set<string> =>
  (avecCsv ??= new Set(departementsDisponibles().flatMap((dep) => lireTerritoire({ niveau: "departement", code: dep }).communes.map((c) => c.code))));
