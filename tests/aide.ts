// Aides partagées par les tests : fixtures CSV → Parquet, base de test unique par session.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeIndicateur, CodeRepartition } from "@obs/shared/libelles";
import type { Identite, Indicateur, Repartition, SourceId } from "@obs/shared/types";
import { Manifest } from "../pipeline/src/archive.ts";
import { type Db, ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, ident, lignes, litteral } from "../pipeline/src/duck.ts";
import { calculerIndicateurs, calculerRepartitions } from "../pipeline/src/indicateurs.ts";
import type { Registre } from "../pipeline/src/registre.ts";
import { EXERCICES_BUDGET, SOURCES, type Source, sourceBudget, sourceTransport } from "../pipeline/src/sources.ts";

export const FIXTURES = join(import.meta.dir, "fixtures");

/**
 * Convertit chaque `fixtures/{source}.csv` en Parquet. Toutes les valeurs sont lues en texte
 * (la normalisation ne doit pas dépendre des types) ; les colonnes requises absentes du CSV
 * sont ajoutées à NULL, pour garder des fixtures lisibles.
 */
export async function cheminsFixtures(dossier: string): Promise<Record<SourceId, string>> {
  const duck = await connexion();
  const chemins = {} as Record<SourceId, string>;
  const budgets = [2023, 2024].flatMap((e) => [sourceBudget(e, EXERCICES_BUDGET[e]!), sourceTransport(e, EXERCICES_BUDGET[e]!)]);
  for (const s of [...Object.values(SOURCES), ...budgets] as Source[]) {
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

// --- Manifest et registre de test (tâche 7) ---

/** Requête archivée fictive d'un exercice du budget. */
export const requeteTest = (id: string, datasetId: string): string =>
  `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${datasetId}/exports/parquet?where=${id}`;

/** Manifest avec une version fictive par source, collectée le 22/11/2026. */
export function manifestTest(dossier: string): Manifest {
  const m = Manifest.lire(join(dossier, "manifest.json"));
  for (const s of [...Object.values(SOURCES), ...[2023, 2024].flatMap((e) => [sourceBudget(e, EXERCICES_BUDGET[e]!), sourceTransport(e, EXERCICES_BUDGET[e]!)])]) {
    m.ajouter(s.id, {
      sha256: `${s.id}`.padEnd(64, "0"), tag: `archives-${s.id}-2026`, fichier: `${s.id}.parquet`,
      url: `https://github.com/org/depot/releases/download/archives-${s.id}-2026/${s.id}.parquet`,
      modified: "2026-11-01T00:00:00Z", collecteLe: "2026-11-22T02:17:00Z", lignes: 10,
      ...(s.id.startsWith("budget_") || s.id.startsWith("transport_") ? { requete: requeteTest(s.id, s.datasetId) } : {}),
    });
  }
  return m;
}

/** Identité minimale d'un collège public de Loire-Atlantique, pour peupler un registre de test. */
export function identiteTest(nom: string, lat: number | null = 47.2, lon: number | null = -1.55): Identite {
  return {
    nom, famille: "college", secteur: "public", contrat: null, adresse: "1 rue Disparue", codePostal: "44000",
    commune: "Nantes", codeCommune: "44109", dep: "44", depLibelle: "Loire-Atlantique", aca: "17", acaLibelle: "Nantes",
    ep: null, segpa: false, ulis: false, internat: false, lat, lon, autresSites: [],
  };
}

/** Base distincte de dbTest(), ouverte avec un registre. */
export async function dbAvecRegistre(registre: Registre): Promise<Db> {
  return ouvrir(await cheminsFixtures(await mkdtemp(join(tmpdir(), "obs-registre-"))), { registre });
}
