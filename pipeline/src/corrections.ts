// Corrections de millésime : une nouvelle version d'une source millésimée qui modifie ou retire des lignes
// d'un millésime déjà publié. Seules les valeurs publiées comptent (colonnes requises, texte rogné).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { Correction, SourceId } from "@obs/shared/types";
import type { Manifest } from "./archive.ts";
import { collectiviteDuBudget } from "./budget.ts";
import { ident, lignes, litteral } from "./duck.ts";
import type { Source } from "./sources.ts";

export interface EntreeCorrection {
  source: SourceId;
  millesime: number;
  /** Valeurs de la clé des lignes touchées (jointes par `|` si la clé a plusieurs colonnes). */
  cles: string[];
  /** Empreintes `sha256` de la version précédente et de la version corrigée. */
  precedente: string;
  corrigee: string;
  /** Date de collecte de la version corrigée. */
  le: string;
}

/**
 * Millésimes de `ancien` dont au moins une ligne (clé, millésime) a changé de valeur ou disparu dans `nouveau`.
 * Les lignes sont comparées comme des multiensembles : l'ordre ne compte pas, un doublon compte autant de fois
 * qu'il apparaît. Une ligne d'un millésime nouveau n'est jamais une correction.
 */
export async function comparerVersions(
  duck: DuckDBConnection,
  s: Source,
  ancien: string,
  nouveau: string,
): Promise<{ millesime: number; cles: string[] }[]> {
  if (!s.millesime) return [];
  const { colonne, cles } = s.millesime;
  const colonnes = [...new Set([...s.colonnesRequises, colonne, ...cles])];
  // NULL et chaîne vide sont égaux ; tout est comparé comme texte rogné.
  const projection = (fichier: string) =>
    `select ${colonnes.map((c) => `coalesce(trim(${ident(c)}::varchar), '') as ${ident(c)}`).join(", ")}
     from read_parquet(${litteral(fichier)})`;
  const cle = cles.map((c) => `d.${ident(c)}`).join(` || '|' || `);
  const rentree = `case when regexp_matches(d.${ident(colonne)}, '^[0-9]{4}') then left(d.${ident(colonne)}, 4)::integer end`;
  const rows = await lignes<{ millesime: number | null; cle: string }>(
    duck,
    `with
       a as (${projection(ancien)}),
       n as (${projection(nouveau)}),
       perdues as (select * from a except all select * from n)
     select ${rentree} as millesime, ${cle} as cle from perdues d order by 1, 2`,
  );
  const parMillesime = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.millesime === null) continue;
    const m = Number(r.millesime);
    (parMillesime.get(m) ?? parMillesime.set(m, new Set()).get(m)!).add(r.cle);
  }
  return [...parMillesime].sort(([x], [y]) => x - y).map(([millesime, c]) => ({ millesime, cles: [...c].sort() }));
}

export function lireCorrections(chemin: string): EntreeCorrection[] {
  if (!existsSync(chemin)) return [];
  return JSON.parse(readFileSync(chemin, "utf8")) as EntreeCorrection[];
}

const cleEntree = (e: EntreeCorrection) => `${e.source}|${e.millesime}|${e.corrigee}`;
const comparer = (a: EntreeCorrection, b: EntreeCorrection) =>
  a.source.localeCompare(b.source) || a.millesime - b.millesime || a.le.localeCompare(b.le);

/** Ajoute des entrées (dédoublonnées sur source|millésime|corrigée), fichier trié, écriture atomique. */
export function ajouterCorrections(chemin: string, e: EntreeCorrection[]): void {
  const toutes = new Map(lireCorrections(chemin).map((x) => [cleEntree(x), x]));
  for (const x of e) if (!toutes.has(cleEntree(x))) toutes.set(cleEntree(x), x);
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  writeFileSync(tmp, `${JSON.stringify([...toutes.values()].sort(comparer), null, 2)}\n`);
  renameSync(tmp, chemin);
}

/** URL permanente d'une version archivée, par empreinte. Une empreinte inconnue est une erreur : le manifeste est incohérent. */
export function urlVersion(manifest: Manifest, source: SourceId, sha256: string): string {
  const v = manifest.versions(source).find((x) => x.sha256 === sha256);
  if (!v) throw new Error(`version archivée inconnue pour ${source} : ${sha256}`);
  return v.url;
}

/** Une correction résolue en URL, pour l'affichage. */
export function resoudreCorrection(manifest: Manifest, e: EntreeCorrection): Correction {
  return {
    millesime: e.millesime, le: e.le,
    precedente: urlVersion(manifest, e.source, e.precedente), corrigee: urlVersion(manifest, e.source, e.corrigee),
  };
}

/** Collectivités (id) touchées par une correction de budget : clés `categ|ndept|cregi|lbudg`. */
export function collectivitesCorrigees(e: EntreeCorrection): Set<string> {
  const ids = new Set<string>();
  for (const cle of e.cles) {
    const [categ = "", ndept = "", cregi = "", ...reste] = cle.split("|");
    const id = collectiviteDuBudget({ categ, ndept: ndept || null, cregi: cregi || null, lbudg: reste.join("|") });
    if (id) ids.add(id);
  }
  return ids;
}
