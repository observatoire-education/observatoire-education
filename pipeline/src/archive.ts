// Manifest des versions archivées, empreintes et validation des fichiers téléchargés.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { VersionSource } from "@obs/shared/donnees";
import type { SourceId } from "@obs/shared/types";
import { lignes, litteral } from "./duck.ts";
import type { Source } from "./sources.ts";

/** Une version d'une source, publiée comme fichier joint d'une GitHub Release. */
export type Version = VersionSource;

interface Contenu {
  versions: Partial<Record<SourceId, Version[]>>;
  /** Dernière date `modified` traitée sans rejet, même si le contenu était identique. */
  vus: Partial<Record<SourceId, string>>;
  /** Empreinte de la version actuelle : pas forcément la dernière ajoutée (un portail peut revenir à un état connu). */
  actuelles: Partial<Record<SourceId, string>>;
  /** Identifiant du jeu pour un exercice découvert au catalogue (budget), absent du registre des sources. */
  jeux: Partial<Record<SourceId, string>>;
}

export class Manifest {
  private constructor(
    readonly chemin: string,
    private readonly contenu: Contenu,
  ) {}

  static lire(chemin: string): Manifest {
    if (!existsSync(chemin)) return new Manifest(chemin, { versions: {}, vus: {}, actuelles: {}, jeux: {} });
    const c = JSON.parse(readFileSync(chemin, "utf8")) as Partial<Contenu>;
    return new Manifest(chemin, { versions: c.versions ?? {}, vus: c.vus ?? {}, actuelles: c.actuelles ?? {}, jeux: c.jeux ?? {} });
  }

  versions(id: SourceId): Version[] {
    return this.contenu.versions[id] ?? [];
  }

  /** Version actuelle de la source (celle que reflète le site). */
  derniere(id: SourceId): Version | undefined {
    const sha = this.contenu.actuelles[id];
    return this.versions(id).find((v) => v.sha256 === sha) ?? this.versions(id).at(-1);
  }

  connait(id: SourceId, sha256: string): boolean {
    return this.versions(id).some((v) => v.sha256 === sha256);
  }

  /** Ajoute une version ; false si son empreinte est déjà connue. */
  ajouter(id: SourceId, v: Version): boolean {
    if (this.connait(id, v.sha256)) return false;
    (this.contenu.versions[id] ??= []).push(v);
    this.contenu.actuelles[id] = v.sha256;
    return true;
  }

  /** Met à jour la requête gardée avec une version (même contenu obtenu avec un autre filtre). */
  majRequete(id: SourceId, sha256: string, requete: string): void {
    const v = this.versions(id).find((x) => x.sha256 === sha256);
    if (v) v.requete = requete;
  }

  /** Une version déjà archivée redevient l'actuelle. */
  rendreActuelle(id: SourceId, sha256: string): void {
    if (!this.connait(id, sha256)) throw new Error(`version inconnue pour ${id} : ${sha256}`);
    this.contenu.actuelles[id] = sha256;
  }

  jeuDecouvert(id: SourceId): string | undefined {
    return this.contenu.jeux[id];
  }

  jeuxDecouverts(): [SourceId, string][] {
    return Object.entries(this.contenu.jeux) as [SourceId, string][];
  }

  decouvrir(id: SourceId, datasetId: string): void {
    this.contenu.jeux[id] = datasetId;
  }

  modifiedVu(id: SourceId): string | undefined {
    return this.contenu.vus[id] ?? this.derniere(id)?.modified;
  }

  marquerVu(id: SourceId, modified: string): void {
    this.contenu.vus[id] = modified;
  }

  /** Écriture atomique : fichier temporaire puis renommage. */
  ecrire(): void {
    const tmp = `${this.chemin}.tmp`;
    mkdirSync(dirname(this.chemin), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(this.contenu, null, 2)}\n`);
    renameSync(tmp, this.chemin);
  }
}

/** SHA-256 hexadécimal, lu en flux. */
export async function empreinte(chemin: string): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  for await (const morceau of Bun.file(chemin).stream()) h.update(morceau);
  return h.digest("hex");
}

export interface Description {
  colonnes: string[];
  lignes: number;
}

export async function decrireParquet(c: DuckDBConnection, chemin: string): Promise<Description> {
  const src = `read_parquet(${litteral(chemin)})`;
  const cols = await lignes<{ column_name: string }>(c, `describe select * from ${src}`);
  const [n] = await lignes<{ n: number }>(c, `select count(*)::int as n from ${src}`);
  return { colonnes: cols.map((x) => x.column_name), lignes: n!.n };
}

/** Motif de rejet, ou null si la version est acceptable. */
export function motifRejet(s: Source, d: Description, precedente?: Version): string | null {
  const manquantes = s.colonnesRequises.filter((c) => !d.colonnes.includes(c));
  if (manquantes.length > 0) return `colonne manquante : ${manquantes.join(", ")}`;
  if (d.lignes === 0) return "aucune ligne";
  if (precedente && d.lignes < 0.8 * precedente.lignes) {
    return `${d.lignes} lignes < 80 % de ${precedente.lignes}`;
  }
  return null;
}

/** Sérialisation stable (clés triées) de ce qui compte pour le site : versions et version actuelle de chaque source.
 * `vus` (date vue, qui bouge chaque jour pour l'annuaire) et `jeux` sont ignorés. */
export function contenuUtile(json: string): string {
  const { versions = {}, actuelles = {} } = JSON.parse(json) as Partial<Contenu>;
  const trier = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(trier)
    : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, trier(v)]))
    : x;
  return JSON.stringify(trier({ versions, actuelles }));
}

/** Le site doit-il être republié ? `avant` est le manifeste de la dernière publication réussie (null : aucune). */
export function donneesChangees(avant: string | null, apres: string): boolean {
  return avant === null || contenuUtile(avant) !== contenuUtile(apres);
}
