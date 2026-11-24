// Collecte nocturne : vérifier, télécharger ce qui a changé, valider, archiver, journaliser.
// Une source en échec n'empêche jamais les autres ; une version douteuse n'est jamais publiée.
import { existsSync } from "node:fs";
import { appendFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { SourceId } from "@obs/shared/types";
import { decrireParquet, empreinte, type Manifest, motifRejet } from "./archive.ts";
import type { Depot } from "./depot.ts";
import { connexion, executer, ident, litteral } from "./duck.ts";
import { ErreurParquetInvalide, type OdsClient, urlExport } from "./ods.ts";
import { API_ECO, type Source, sourceBudget, toutesSources } from "./sources.ts";

export type ClientSources = Pick<OdsClient, "metadata" | "telechargerParquet" | "chercherJeu">;

export type LigneJournal = {
  date: string;
  source: SourceId;
  action: "inchange" | "telecharge" | "rejete" | "erreur";
  modified?: string;
  sha256?: string;
  lignes?: number;
  motif?: string;
};

export interface OptionsCollecte {
  manifest: Manifest;
  client: ClientSources;
  depot: Depot;
  maintenant: Date;
  /** Dossier de travail (fichiers téléchargés avant publication). */
  tmp: string;
  /** Fichier JSONL auquel ajouter les lignes du journal. */
  journal?: string;
}

const TYPES_RETENUS = ["Collège", "Lycée", "EREA"];

type Resultat = Omit<LigneJournal, "date" | "source">;

export async function collecter(opts: OptionsCollecte): Promise<LigneJournal[]> {
  await mkdir(opts.tmp, { recursive: true });
  const duck = await connexion();
  const journal: LigneJournal[] = [];
  const date = opts.maintenant.toISOString();
  const essayer = async (id: SourceId, tache: () => Promise<Resultat | null>) => {
    try {
      const r = await tache();
      if (r) journal.push({ date, source: id, ...r });
    } catch (e) {
      const motif = e instanceof Error ? e.message : String(e);
      journal.push({ date, source: id, action: e instanceof ErreurParquetInvalide ? "rejete" : "erreur", motif });
    }
  };
  const connues = toutesSources(opts.manifest);
  for (const s of connues) await essayer(s.id, () => traiter(s, opts, duck));

  // Exercice suivant du budget : un seul jeu au catalogue, sinon rien n'est inventé.
  const suivant = Math.max(...connues.filter((s) => s.id.startsWith("budget_")).map((s) => Number(s.id.slice(7)))) + 1;
  const idSuivant: SourceId = `budget_${suivant}`;
  let nouvelle: Source | undefined;
  await essayer(idSuivant, async () => {
    const jeux = await opts.client.chercherJeu(API_ECO, `nature-fonction ${suivant}`);
    if (jeux.length === 0) return null;
    if (jeux.length > 1) return { action: "erreur", motif: `plusieurs jeux pour l'exercice ${suivant} : ${jeux.join(", ")}` };
    opts.manifest.decouvrir(idSuivant, jeux[0]!);
    nouvelle = sourceBudget(suivant, jeux[0]!);
    return null;
  });
  if (nouvelle) {
    const s = nouvelle;
    await essayer(s.id, () => traiter(s, opts, duck));
  }
  duck.closeSync();
  if (opts.journal) {
    await mkdir(dirname(opts.journal), { recursive: true });
    await appendFile(opts.journal, journal.map((l) => `${JSON.stringify(l)}\n`).join(""));
  }
  return journal;
}

async function traiter(s: Source, opts: OptionsCollecte, duck: DuckDBConnection): Promise<Resultat> {
  const { manifest, maintenant } = opts;
  const meta = await opts.client.metadata(s);
  // Le filtre a changé depuis la version archivée : le périmètre n'est plus le même, on retélécharge.
  const filtreChange = !!s.filtre && manifest.derniere(s.id)?.requete !== urlExport(s);
  if (!s.referentiel && !filtreChange && manifest.modifiedVu(s.id) === meta.modified) {
    return { action: "inchange", modified: meta.modified };
  }

  const brut = join(opts.tmp, `${s.id}.brut.parquet`);
  const reduit = join(opts.tmp, `${s.id}.reduit.parquet`);
  try {
    const { url: requete } = await opts.client.telechargerParquet(s, brut);
    let fichier = brut;
    let desc = await decrireParquet(duck, brut);
    const manque = motifRejet(s, { ...desc, lignes: Math.max(desc.lignes, 1) });
    if (manque) return { action: "rejete", modified: meta.modified, motif: manque };

    if (s.referentiel) {
      await reduire(duck, s, brut, reduit);
      fichier = reduit;
      desc = await decrireParquet(duck, reduit);
    } else if (s.filtre) {
      await trier(duck, brut, reduit);
      fichier = reduit;
    }
    const motif = motifRejet(s, desc, filtreChange ? undefined : manifest.derniere(s.id));
    if (motif) return { action: "rejete", modified: meta.modified, lignes: desc.lignes, motif };

    const sha = await empreinte(fichier);
    manifest.marquerVu(s.id, meta.modified);
    if (manifest.connait(s.id, sha)) {
      manifest.rendreActuelle(s.id, sha);
      if (s.filtre) manifest.majRequete(s.id, sha, requete);
      manifest.ecrire();
      return { action: "inchange", modified: meta.modified, sha256: sha, lignes: desc.lignes, motif: "contenu identique" };
    }

    const nom = `${sha.slice(0, 16)}.parquet`;
    const final = join(opts.tmp, nom);
    await rename(fichier, final);
    const tag = `archives-${s.id}-${maintenant.getUTCFullYear()}`;
    try {
      const url = await opts.depot.publier(tag, final);
      manifest.ajouter(s.id, {
        sha256: sha, tag, fichier: nom, url, modified: meta.modified,
        collecteLe: maintenant.toISOString(), lignes: desc.lignes,
        ...(s.filtre ? { requete } : {}),
      });
      manifest.ecrire();
    } finally {
      await rm(final, { force: true });
    }
    return { action: "telecharge", modified: meta.modified, sha256: sha, lignes: desc.lignes };
  } finally {
    await rm(brut, { force: true });
    await rm(reduit, { force: true });
  }
}

/** Annuaire : colonnes requises seulement, second degré seulement, ordre stable → empreinte stable. */
async function reduire(duck: DuckDBConnection, s: Source, src: string, dest: string): Promise<void> {
  const cols = s.colonnesRequises.map(ident).join(", ");
  const types = TYPES_RETENUS.map(litteral).join(", ");
  await executer(
    duck,
    `copy (select ${cols} from read_parquet(${litteral(src)})
      where type_etablissement in (${types}) order by all)
     to ${litteral(dest)} (format parquet, compression zstd)`,
  );
}

/**
 * Extrait filtré (budget) : toutes les colonnes et toutes les lignes, dans un ordre stable. Le portail ne garantit
 * pas l'ordre de l'export : sans ce tri, les mêmes lignes réordonnées donneraient une nouvelle empreinte et une
 * nouvelle version archivée.
 */
async function trier(duck: DuckDBConnection, src: string, dest: string): Promise<void> {
  await executer(
    duck,
    `copy (select * from read_parquet(${litteral(src)}) order by all)
     to ${litteral(dest)} (format parquet, compression zstd)`,
  );
}

/** Chemin local de la dernière version de chaque source, récupérée au besoin et vérifiée par empreinte. */
export async function assurerCache(
  manifest: Manifest,
  depot: Depot,
  cache = ".cache/archives",
): Promise<Record<SourceId, string>> {
  const chemins = {} as Record<SourceId, string>;
  for (const s of toutesSources(manifest)) {
    const v = manifest.derniere(s.id);
    if (!v) throw new Error(`aucune version archivée pour ${s.id}`);
    const chemin = join(cache, s.id, v.fichier);
    if (!existsSync(chemin) || (await empreinte(chemin)) !== v.sha256) {
      await depot.recuperer(v, chemin);
      if ((await empreinte(chemin)) !== v.sha256) throw new Error(`empreinte invalide pour ${s.id} (${v.url})`);
    }
    chemins[s.id] = chemin;
  }
  return chemins;
}
