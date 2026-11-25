// Collecte nocturne : vérifier, télécharger ce qui a changé, valider, archiver, journaliser.
// Une source en échec n'empêche jamais les autres ; une version douteuse n'est jamais publiée.
import { existsSync } from "node:fs";
import { appendFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { SourceId } from "@obs/shared/types";
import { decrireParquet, empreinte, type Manifest, motifRejet, type Version } from "./archive.ts";
import { ajouterCorrections, comparerVersions } from "./corrections.ts";
import type { Depot } from "./depot.ts";
import { connexion, executer, ident, litteral } from "./duck.ts";
import { ErreurParquetInvalide, type OdsClient, urlExport } from "./ods.ts";
import { API_ECO, API_FICHIER, type Source, sourceBudget, sourceTransport, toutesSources } from "./sources.ts";

/** Ce que la collecte attend d'un client par source : satisfait par OdsClient et par FichierClient. */
export interface ClientSource {
  metadata(s: Source): Promise<{ modified: string; recordsCount?: number }>;
  telechargerParquet(s: Source, dest: string): Promise<{ chemin: string; url: string }>;
}

export type ClientSources = ClientSource & Pick<OdsClient, "chercherJeu">;

/** Un seul client pour la collecte : les sources API_FICHIER vont au client fichier, les autres à Opendatasoft. */
export function aiguiller(ods: ClientSources, fichier: ClientSource): ClientSources {
  const pour = (s: Source): ClientSource => (s.api === API_FICHIER ? fichier : ods);
  return {
    metadata: (s) => pour(s).metadata(s),
    telechargerParquet: (s, dest) => pour(s).telechargerParquet(s, dest),
    chercherJeu: (api, titre) => ods.chercherJeu(api, titre),
  };
}

export type LigneJournal = {
  date: string;
  source: SourceId;
  /** local : source à collecte locale (Source.collecteLocale) sautée par une collecte sur serveur. */
  action: "inchange" | "telecharge" | "rejete" | "erreur" | "local";
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
  /** Fichier corrections.json : s'il est absent, les versions ne sont pas comparées. */
  corrections?: string;
  /** true : collecte sur un serveur (GitHub Actions), qui saute les sources à collecte locale. */
  distante?: boolean;
  /** true : ne traiter que les sources sans aucune version archivée (publication après l'ajout d'une source). */
  manquantes?: boolean;
}

/** Sources déclarées sans aucune version archivée : le build ne peut pas les lire. */
export function sourcesSansVersion(manifest: Manifest): SourceId[] {
  return toutesSources(manifest).filter((s) => !manifest.derniere(s.id)).map((s) => s.id);
}

/** Motif de la ligne de journal d'une source à collecte locale sautée sur serveur. */
export const MOTIF_COLLECTE_LOCALE = "collecte locale : serveur injoignable depuis GitHub, lancer bun run collect depuis un poste";

const TYPES_RETENUS = ["Collège", "Lycée", "EREA", "Ecole"];

type Resultat = Omit<LigneJournal, "date" | "source"> & { suite?: Omit<LigneJournal, "date" | "source"> };

export async function collecter(opts: OptionsCollecte): Promise<LigneJournal[]> {
  await mkdir(opts.tmp, { recursive: true });
  const duck = await connexion();
  const journal: LigneJournal[] = [];
  const date = opts.maintenant.toISOString();
  const essayer = async (id: SourceId, tache: () => Promise<Resultat | null>) => {
    try {
      const r = await tache();
      if (r) {
        const { suite, ...ligne } = r;
        journal.push({ date, source: id, ...ligne });
        if (suite) journal.push({ date, source: id, ...suite });
      }
    } catch (e) {
      const motif = e instanceof Error ? e.message : String(e);
      journal.push({ date, source: id, action: e instanceof ErreurParquetInvalide ? "rejete" : "erreur", motif });
    }
  };
  const connues = toutesSources(opts.manifest);
  for (const s of connues) {
    if (opts.manquantes && opts.manifest.derniere(s.id)) continue;
    if (s.collecteLocale && opts.distante) {
      journal.push({ date, source: s.id, action: "local", motif: MOTIF_COLLECTE_LOCALE });
      continue;
    }
    await essayer(s.id, () => traiter(s, opts, duck));
    // Le téléchargement continue (il reste valable) ; l'erreur rappelle de passer au millésime suivant.
    const perime = millesimePerime(s, opts.maintenant);
    if (perime) journal.push({ date, source: s.id, action: "erreur", motif: perime });
  }

  // Exercice suivant du budget : un seul jeu au catalogue, sinon rien n'est inventé.
  const suivant = Math.max(...connues.filter((s) => s.id.startsWith("budget_")).map((s) => Number(s.id.slice(7)))) + 1;
  const idSuivant: SourceId = `budget_${suivant}`;
  let nouvelle: Source | undefined;
  // --manquantes : pas de découverte, seules les sources déjà déclarées sont rattrapées.
  if (!opts.manquantes) await essayer(idSuivant, async () => {
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
    // Même jeu que le budget : le transport scolaire de l'exercice est collecté avec lui.
    const t = sourceTransport(suivant, s.datasetId);
    await essayer(t.id, () => traiter(t, opts, duck));
  }
  duck.closeSync();
  if (opts.journal) {
    await mkdir(dirname(opts.journal), { recursive: true });
    await appendFile(opts.journal, journal.map((l) => `${JSON.stringify(l)}\n`).join(""));
  }
  return journal;
}

/** Délai laissé à l'Insee pour publier le COG de l'année : du 1er janvier au 15 février. */
const GRACE_MILLESIME = { mois: 1, jour: 15 };

/**
 * Fichier du COG dont le millésime est dépassé (URL figée sur une année, aucune découverte automatique) : motif
 * d'erreur à partir du 15 février de l'année suivante, sinon null. Les autres sources fichier (bâtiments des lycées
 * bretons) ne sont pas millésimées : leur URL ne change pas d'une année à l'autre.
 */
export function millesimePerime(s: Source, maintenant: Date): string | null {
  if (s.api !== API_FICHIER || !s.millesimeLe || !s.id.startsWith("cog_")) return null;
  const annee = Number(s.millesimeLe.slice(0, 4));
  if (maintenant < new Date(Date.UTC(annee + 1, GRACE_MILLESIME.mois, GRACE_MILLESIME.jour))) return null;
  return `COG ${annee} périmé : passer au COG ${annee + 1} dans pipeline/src/sources.ts`;
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
    // Pas de comparaison quand le filtre a changé : les deux versions ne couvrent pas le même périmètre.
    const precedente = opts.corrections && s.millesime && !filtreChange ? manifest.derniere(s.id) : undefined;
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
    let comparaison: string | undefined;
    if (precedente) {
      try {
        await detecterCorrections(s, opts, duck, precedente, manifest.derniere(s.id)!);
      } catch (e) {
        comparaison = `comparaison des versions : ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    // La version reste archivée même si la comparaison échoue : l'échec s'ajoute au journal.
    return {
      action: "telecharge", modified: meta.modified, sha256: sha, lignes: desc.lignes,
      ...(comparaison ? { suite: { action: "erreur" as const, motif: comparaison } } : {}),
    };
  } finally {
    await rm(brut, { force: true });
    await rm(reduit, { force: true });
  }
}

/** Compare la version précédente à la nouvelle et ajoute les corrections de millésime à `opts.corrections`. */
async function detecterCorrections(
  s: Source,
  opts: OptionsCollecte,
  duck: DuckDBConnection,
  precedente: Version,
  corrigee: Version,
): Promise<void> {
  const ancien = join(opts.tmp, `${s.id}.precedente.parquet`);
  const nouveau = join(opts.tmp, `${s.id}.corrigee.parquet`);
  try {
    await opts.depot.recuperer(precedente, ancien);
    await opts.depot.recuperer(corrigee, nouveau);
    const touches = await comparerVersions(duck, s, ancien, nouveau);
    ajouterCorrections(
      opts.corrections!,
      touches.map((t) => ({
        source: s.id, millesime: t.millesime, cles: t.cles,
        precedente: precedente.sha256, corrigee: corrigee.sha256, le: corrigee.collecteLe,
      })),
    );
  } finally {
    await rm(ancien, { force: true });
    await rm(nouveau, { force: true });
  }
}

/**
 * Référentiel : colonnes requises seulement, ordre stable → empreinte stable. Annuaire : types d'établissement
 * retenus seulement ; carte scolaire : toutes les lignes.
 */
async function reduire(duck: DuckDBConnection, s: Source, src: string, dest: string): Promise<void> {
  const cols = s.colonnesRequises.map(ident).join(", ");
  const types = TYPES_RETENUS.map(litteral).join(", ");
  const where = s.id === "annuaire" ? `where type_etablissement in (${types})` : "";
  await executer(
    duck,
    `copy (select ${cols} from read_parquet(${litteral(src)}) ${where} order by all)
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
