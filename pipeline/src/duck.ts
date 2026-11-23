// Accès minimal à DuckDB (en mémoire) pour la collecte. La tâche 4 bâtit db.ts au-dessus.
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

/**
 * Connexion en mémoire. Un seul fil par défaut : sorties Parquet déterministes (empreintes stables).
 * `null` laisse DuckDB utiliser tous les cœurs (croisement).
 */
export async function connexion(threads: number | null = 1): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(":memory:", threads === null ? {} : { threads: String(threads) });
  return instance.connect();
}

export async function executer(c: DuckDBConnection, sql: string): Promise<void> {
  await c.run(sql);
}

/** Lignes sous forme d'objets JS. Les entiers 64 bits sont à convertir en SQL (`::int`, `::double`). */
export async function lignes<T>(c: DuckDBConnection, sql: string): Promise<T[]> {
  return (await c.runAndReadAll(sql)).getRowObjectsJS() as T[];
}

/** Littéral de chaîne SQL (chemins, valeurs). */
export function litteral(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

/** Identifiant SQL entre guillemets (noms de colonnes commençant par un chiffre, etc.). */
export function ident(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}
