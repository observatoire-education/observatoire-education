// Base de croisement : une vue par source, les macros de normalisation, puis les fichiers .sql.
import { join } from "node:path";
import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";
import type { SourceId } from "@obs/shared/types";
import { connexion, litteral } from "./duck.ts";
import { macrosSql } from "./normalise.ts";

export interface Db {
  sql<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  /** Exécute un fichier de plusieurs instructions (dossier pipeline/sql). */
  executerFichier(nom: string): Promise<void>;
  fermer(): void;
}

export const DOSSIER_SQL = join(import.meta.dir, "..", "sql");

/** Fichiers exécutés à l'ouverture, dans l'ordre (les tâches suivantes allongent la liste). */
export const FICHIERS_SQL = ["01_normaliser.sql"];

async function executerScript(c: DuckDBConnection, sql: string): Promise<void> {
  const instructions = await c.extractStatements(sql);
  for (let i = 0; i < instructions.count; i++) await (await instructions.prepare(i)).run();
}

export async function ouvrir(chemins: Record<SourceId, string>, fichiers = FICHIERS_SQL): Promise<Db> {
  const c = await connexion(null);
  const vues = Object.entries(chemins)
    .map(([id, chemin]) => `create or replace view src_${id} as select * from read_parquet(${litteral(chemin)});`)
    .join("\n");
  await executerScript(c, vues);
  await executerScript(c, macrosSql());

  const db: Db = {
    async sql<T>(q: string, params?: unknown[]) {
      const r = await c.runAndReadAll(q, params as DuckDBValue[] | undefined);
      return r.getRowObjectsJS() as T[];
    },
    async executerFichier(nom: string) {
      await executerScript(c, await Bun.file(join(DOSSIER_SQL, nom)).text());
    },
    fermer() {
      c.closeSync();
    },
  };
  for (const f of fichiers) await db.executerFichier(f);
  return db;
}
