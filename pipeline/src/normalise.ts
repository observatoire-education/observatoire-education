// Fonctions de normalisation, en TypeScript et en macros DuckDB générées à partir des mêmes listes.
// Correspondances explicites, sans approximation : un libellé inconnu donne null (et un motif d'exclusion).
import type { Famille, Secteur } from "@obs/shared/types";
import { litteral } from "./duck.ts";

/** Natures de l'annuaire (`libelle_nature`, en majuscules) → famille. */
export const NATURES: Record<Famille, readonly string[]> = {
  college: ["COLLEGE", "COLLEGE SPECIALISE", "COLLEGE CLIMATIQUE"],
  legt: [
    "LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE",
    "LYCEE D ENSEIGNEMENT GENERAL",
    "LYCEE D ENSEIGNEMENT TECHNOLOGIQUE",
    "LYCEE CLIMATIQUE",
    "LYCEE EXPERIMENTAL",
  ],
  lpo: ["LYCEE POLYVALENT", "LYCEE ENS GENERAL TECHNO PROF AGRICOLE"],
  lp: ["LYCEE PROFESSIONNEL"],
  erea: ["ETAB REGIONAL/LYCEE ENSEIGNEMENT ADAPTE"],
};

/** `type_de_lycee` de l'IPS des lycées : il l'emporte sur la nature de l'annuaire. */
export const TYPES_LYCEE = ["LEGT", "LPO", "LP"] as const;

/** Contrats du privé sous contrat, à l'identique (« C0NTRAT » avec un zéro figure tel quel dans la source). */
export const CONTRATS_SOUS_CONTRAT = [
  "CONTRAT D'ASSOCIATION TOUTES CLASSES",
  "CONTRAT ASSOCIATION PARTIE DES CLASSES",
  "CONTRAT SIMPLE TOUTES CLASSES",
  "C0NTRAT SIMPLE POUR PARTIE DES CLASSES",
  "CONTRAT PARTIE DES CLASSES SIMPLE+ASSOC",
  "CONTRAT TTES CLASSES SIMPLE+ASSOCIATION",
  "SOUS CONTRAT ETABLISSEMENT AGRICOLE",
] as const;
export const HORS_CONTRAT = "HORS CONTRAT";

/** Valeurs vraies des indicateurs oui/non de l'annuaire (texte « 1 » ou entier 1 selon les colonnes). */
export const VRAIS = ["1", "Oui", "OUI", "oui", "true"] as const;

const texte = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).trim());

/** « 001 » → « 01 », « 02A » → « 2A », « 1 » → « 01 » ; « 971 » inchangé. */
export function depCanonique(code: string): string {
  const c = code.trim().toUpperCase();
  if (c.length === 3 && c.startsWith("0")) return c.slice(1);
  if (c.length === 1) return `0${c}`;
  return c;
}

/** Année de la rentrée de septembre : « 2025-2026 », « 2025 », « 2025-01-01 » → 2025. */
export function rentree(v: unknown): number | null {
  const m = texte(v)?.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

const NOMBRE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** Nombre ou null : « NA », vide, texte, NaN et infinis ne deviennent jamais 0. Virgule décimale acceptée. */
export function nombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  const s = texte(v)?.replace(",", ".");
  return s && NOMBRE.test(s) ? Number(s) : null;
}

export function famille(nature: string | null, typeLycee: string | null): Famille | null {
  const t = typeLycee?.trim().toUpperCase();
  if (t && (TYPES_LYCEE as readonly string[]).includes(t)) return t.toLowerCase() as Famille;
  const n = nature?.trim().toUpperCase();
  if (!n) return null;
  for (const [f, natures] of Object.entries(NATURES)) if (natures.includes(n)) return f as Famille;
  return null;
}

export function secteur(statut: string | null, contrat: string | null): Secteur | "prive_hors_contrat" | null {
  const s = statut?.trim();
  const c = contrat?.trim() ?? null;
  if (s === "Public") return "public";
  if (s !== "Privé" || c === null) return null;
  if ((CONTRATS_SOUS_CONTRAT as readonly string[]).includes(c)) return "prive_sous_contrat";
  if (c === HORS_CONTRAT) return "prive_hors_contrat";
  return null;
}

const liste = (valeurs: readonly string[]) => valeurs.map(litteral).join(", ");

/** Les mêmes fonctions en macros DuckDB. */
export function macrosSql(): string {
  const casFamille = Object.entries(NATURES)
    .map(([f, natures]) => `when upper(trim(nature)) in (${liste(natures)}) then '${f}'`)
    .join("\n      ");
  const nb = "try_cast(replace(trim(v::varchar), ',', '.') as double)";
  return `
create or replace macro dep_canonique(c) as (
  case
    when c is null then null
    when length(trim(c::varchar)) = 3 and starts_with(trim(c::varchar), '0') then upper(trim(c::varchar))[2:3]
    when length(trim(c::varchar)) = 1 then '0' || trim(c::varchar)
    else upper(trim(c::varchar))
  end);

create or replace macro rentree(v) as (
  case when regexp_matches(trim(v::varchar), '^[0-9]{4}') then left(trim(v::varchar), 4)::integer end);

create or replace macro nombre(v) as (case when isfinite(${nb}) then ${nb} end);

create or replace macro vrai(v) as (coalesce(trim(v::varchar) in (${liste(VRAIS)}), false));

create or replace macro famille(nature, type_lycee) as (
  case
    when upper(trim(type_lycee)) in (${liste(TYPES_LYCEE)}) then lower(upper(trim(type_lycee)))
      ${casFamille}
  end);

create or replace macro secteur(statut, contrat) as (
  case
    when trim(statut) = 'Public' then 'public'
    when trim(statut) = 'Privé' and trim(contrat) in (${liste(CONTRATS_SOUS_CONTRAT)}) then 'prive_sous_contrat'
    when trim(statut) = 'Privé' and trim(contrat) = ${litteral(HORS_CONTRAT)} then 'prive_hors_contrat'
  end);
`;
}
