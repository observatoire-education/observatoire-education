// Aides partagées par les tests : fixtures CSV → Parquet, base de test unique par session.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeIndicateur, CodeRepartition } from "@obs/shared/libelles";
import type { Indicateur, Repartition, SourceId } from "@obs/shared/types";
import { type Db, ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, ident, lignes, litteral } from "../pipeline/src/duck.ts";
import { calculerIndicateurs, calculerRepartitions } from "../pipeline/src/indicateurs.ts";
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

// --- Indicateurs et répartitions, calculés une fois par session (tâche 6) ---

let indicateurs: Promise<Map<string, Indicateur[]>> | undefined;
let repartitions: Promise<Map<string, Repartition[]>> | undefined;

export async function indic(uai: string, code: CodeIndicateur): Promise<Indicateur> {
  indicateurs ??= dbTest().then(calculerIndicateurs);
  const i = (await indicateurs).get(uai)?.find((x) => x.code === code);
  if (!i) throw new Error(`indicateur ${code} absent pour ${uai}`);
  return i;
}

export async function repart(uai: string, code: CodeRepartition): Promise<Repartition> {
  repartitions ??= dbTest().then(calculerRepartitions);
  const r = (await repartitions).get(uai)?.find((x) => x.code === code);
  if (!r) throw new Error(`répartition ${code} absente pour ${uai}`);
  return r;
}

export async function repartitionsDe(uai: string): Promise<Repartition[]> {
  repartitions ??= dbTest().then(calculerRepartitions);
  return (await repartitions).get(uai) ?? [];
}
