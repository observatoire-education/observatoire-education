// Aides partagées par les tests : fixtures CSV → Parquet, base de test unique par session.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceId } from "@obs/shared/types";
import { type Db, ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, ident, lignes, litteral } from "../pipeline/src/duck.ts";
import { SOURCES } from "../pipeline/src/sources.ts";

export const FIXTURES = join(import.meta.dir, "fixtures");

/**
 * Convertit chaque `fixtures/{source}.csv` en Parquet. Toutes les valeurs sont lues en texte
 * (la normalisation ne doit pas dépendre des types) ; les colonnes requises absentes du CSV
 * sont ajoutées à NULL, pour garder des fixtures lisibles.
 */
export async function cheminsFixtures(dossier: string): Promise<Record<SourceId, string>> {
  const duck = await connexion();
  const chemins = {} as Record<SourceId, string>;
  for (const s of Object.values(SOURCES)) {
    const csv = `read_csv(${litteral(join(FIXTURES, `${s.id}.csv`))}, header = true, all_varchar = true)`;
    const presentes = (await lignes<{ column_name: string }>(duck, `describe select * from ${csv}`)).map((c) => c.column_name);
    const ajouts = s.colonnesRequises.filter((c) => !presentes.includes(c)).map((c) => `null::varchar as ${ident(c)}`);
    const dest = join(dossier, `${s.id}.parquet`);
    await executer(duck, `copy (select *${ajouts.map((a) => `, ${a}`).join("")} from ${csv}) to ${litteral(dest)} (format parquet)`);
    chemins[s.id] = dest;
  }
  duck.closeSync();
  return chemins;
}

let base: Promise<Db> | undefined;

/** Base normalisée construite une seule fois sur les fixtures, partagée par tous les tests. */
export function dbTest(): Promise<Db> {
  base ??= (async () => ouvrir(await cheminsFixtures(await mkdtemp(join(tmpdir(), "obs-fixtures-")))))();
  return base;
}
