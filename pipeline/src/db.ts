// Base de croisement : une vue par source, les macros de normalisation, puis les fichiers .sql.
import { join } from "node:path";
import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";
import type { SourceId } from "@obs/shared/types";
import { connexion, litteral } from "./duck.ts";
import { etapeBudget } from "./budget.ts";
import { sqlEleves } from "./eleves.ts";
import { sqlIndicateurs } from "./indicateurs.ts";
import { macrosSql } from "./normalise.ts";
import type { Registre } from "./registre.ts";

export interface Db {
  sql<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  /** Exécute un script de plusieurs instructions. */
  executer(sql: string): Promise<void>;
  /** Exécute un fichier de plusieurs instructions (dossier pipeline/sql). */
  executerFichier(nom: string): Promise<void>;
  fermer(): void;
}

export const DOSSIER_SQL = join(import.meta.dir, "..", "sql");

/**
 * Étapes exécutées à l'ouverture, dans l'ordre : un fichier de pipeline/sql, ou un générateur de SQL
 * (quand les colonnes viennent de définitions TypeScript). Ordre du plan : 01, 03, 02, 04.
 */
export type Etape = string | ((db: Db) => string | Promise<string>);
export const ETAPES: Etape[] = ["01_normaliser.sql", "05_fermes.sql", "08_ecoles.sql", "03_ips_personnels.sql", sqlEleves, sqlIndicateurs, "06_resultats.sql", etapeBudget, "07_segregation.sql"];

async function executerScript(c: DuckDBConnection, sql: string): Promise<void> {
  const instructions = await c.extractStatements(sql);
  for (let i = 0; i < instructions.count; i++) await (await instructions.prepare(i)).run();
}

export interface OptionsOuverture {
  /** Registre des pages : ses UAI absentes du périmètre deviennent des pages « disparues ». */
  registre?: Registre;
  etapes?: Etape[];
}

/** Table `registre` (uai, famille, secteur, dep, aca, disparu_le), créée avant les étapes. */
async function chargerRegistre(c: DuckDBConnection, registre: Registre): Promise<void> {
  const lignes = Object.entries(registre).map(([uai, e]) => ({
    uai, famille: e.identite.famille, secteur: e.identite.secteur, dep: e.identite.dep, aca: e.identite.aca,
    disparu_le: e.disparuLe ?? null,
  }));
  await c.run(
    `create or replace table registre as
     select unnest(from_json($1::json,
       '[{"uai":"VARCHAR","famille":"VARCHAR","secteur":"VARCHAR","dep":"VARCHAR","aca":"VARCHAR","disparu_le":"VARCHAR"}]'),
       recursive := true)`,
    [JSON.stringify(lignes)],
  );
  if (lignes.length === 0) {
    await c.run(`create or replace table registre (uai varchar, famille varchar, secteur varchar, dep varchar,
      aca varchar, disparu_le varchar)`);
  }
}

export async function ouvrir(chemins: Record<SourceId, string>, opts: OptionsOuverture = {}): Promise<Db> {
  const etapes = opts.etapes ?? ETAPES;
  const c = await connexion(null);
  const vues = Object.entries(chemins)
    .map(([id, chemin]) => `create or replace view src_${id} as select * from read_parquet(${litteral(chemin)});`)
    .join("\n");
  await executerScript(c, vues);
  await executerScript(c, macrosSql());
  await chargerRegistre(c, opts.registre ?? {});

  const db: Db = {
    async sql<T>(q: string, params?: unknown[]) {
      const r = await c.runAndReadAll(q, params as DuckDBValue[] | undefined);
      return r.getRowObjectsJS() as T[];
    },
    async executer(sql: string) {
      await executerScript(c, sql);
    },
    async executerFichier(nom: string) {
      await executerScript(c, await Bun.file(join(DOSSIER_SQL, nom)).text());
    },
    fermer() {
      c.closeSync();
    },
  };
  for (const e of etapes) await (typeof e === "string" ? db.executerFichier(e) : db.executer(await e(db)));
  return db;
}
