// Client minimal de l'API Opendatasoft v2.1 (data.education.gouv.fr).
// Sobriété : une requête de métadonnées et un téléchargement par source et par exécution ;
// les nouveaux essais ne portent que sur les erreurs 5xx et réseau.
import { API, type Source } from "./sources.ts";

export const USER_AGENT = "observatoireeducation/0.1 (+https://observatoireeducation.fr)";

export interface SourceMeta {
  modified: string;
  recordsCount: number;
}

export interface OptionsClient {
  /** Attente entre deux essais (injectable pour les tests). */
  attendre?: (ms: number) => Promise<void>;
  /** Délai d'expiration d'une requête, en millisecondes. */
  expirationMs?: number;
}

const ATTENTES_MS = [2000, 4000]; // 3 essais au total
const MAGIQUE_PARQUET = "PAR1";

export class ErreurHttp extends Error {
  constructor(
    readonly statut: number,
    url: string,
  ) {
    super(`HTTP ${statut} sur ${url}`);
  }
}

/** Fichier reçu mais inutilisable (tronqué, pas un Parquet) : la version est rejetée, pas en erreur. */
export class ErreurParquetInvalide extends Error {}

export class OdsClient {
  private readonly attendre: (ms: number) => Promise<void>;
  private readonly expirationMs: number;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly userAgent: string = USER_AGENT,
    opts: OptionsClient = {},
  ) {
    this.attendre = opts.attendre ?? ((ms) => Bun.sleep(ms));
    this.expirationMs = opts.expirationMs ?? 120_000;
  }

  async metadata(s: Source): Promise<SourceMeta> {
    const url = `${API}/${s.datasetId}`;
    const corps = (await (await this.requete(url)).json()) as {
      metas?: { default?: { modified?: string; records_count?: number } };
    };
    const meta = corps.metas?.default;
    if (typeof meta?.modified !== "string" || typeof meta.records_count !== "number") {
      throw new Error(`métadonnées incomplètes pour ${s.datasetId} (modified ou records_count absent)`);
    }
    return { modified: meta.modified, recordsCount: meta.records_count };
  }

  /** Télécharge l'export Parquet complet vers `dest` (écriture en flux) et vérifie qu'il n'est pas tronqué. */
  async telechargerParquet(s: Source, dest: string): Promise<string> {
    const url = `${API}/${s.datasetId}/exports/parquet`;
    await Bun.write(dest, await this.requete(url));
    const f = Bun.file(dest);
    // La taille doit être lue avant de découper : slice(-4) sur un fichier non encore mesuré renvoie vide.
    const taille = f.size;
    const debut = await f.slice(0, 4).text();
    const fin = await f.slice(taille - 4, taille).text();
    if (taille < 8 || debut !== MAGIQUE_PARQUET || fin !== MAGIQUE_PARQUET) {
      throw new ErreurParquetInvalide(`fichier Parquet tronqué ou invalide pour ${s.datasetId} (${taille} octets)`);
    }
    return dest;
  }

  private async requete(url: string): Promise<Response> {
    let derniere: unknown;
    for (let essai = 0; essai <= ATTENTES_MS.length; essai++) {
      if (essai > 0) await this.attendre(ATTENTES_MS[essai - 1]!);
      try {
        const r = await this.fetcher(url, {
          headers: { "User-Agent": this.userAgent, "Accept-Encoding": "gzip" },
          signal: AbortSignal.timeout(this.expirationMs),
        });
        if (r.ok) return r;
        derniere = new ErreurHttp(r.status, url);
        if (r.status < 500) throw derniere; // 4xx : inutile de réessayer
      } catch (e) {
        if (e instanceof ErreurHttp && e.statut < 500) throw e;
        derniere = e;
      }
    }
    throw derniere;
  }
}
