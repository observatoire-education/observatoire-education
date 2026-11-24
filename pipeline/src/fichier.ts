// Client des sources publiées comme un simple fichier CSV à une URL directe (Code officiel géographique de l'Insee).
// Sobriété : aucune requête de métadonnées, un seul GET par source et par exécution (nouveaux essais sur 5xx et réseau).
// Le CSV est converti en Parquet pour suivre le même chemin que les jeux Opendatasoft : colonnes requises, réduction,
// empreinte, Release et manifest.
import { rm } from "node:fs/promises";
import { connexion, executer, ident, lignes, litteral } from "./duck.ts";
import { ErreurParquetInvalide, type OptionsClient, requeteAvecEssais, USER_AGENT } from "./ods.ts";
import type { Source } from "./sources.ts";

export class FichierClient {
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

  /** Le serveur n'annonce ni date ni empreinte : la date du millésime déclarée dans le registre en tient lieu. */
  async metadata(s: Source): Promise<{ modified: string }> {
    if (!s.millesimeLe) throw new Error(`date du millésime absente pour ${s.id}`);
    return { modified: s.millesimeLe };
  }

  /**
   * Télécharge le CSV (UTF-8, séparateur virgule, BOM toléré) et l'écrit en Parquet dans `dest` : noms de colonnes en
   * minuscules, toutes les valeurs en texte (les codes commune gardent leurs zéros), chaîne vide → NULL.
   */
  async telechargerParquet(s: Source, dest: string): Promise<{ chemin: string; url: string }> {
    if (!s.url) throw new Error(`URL du fichier absente pour ${s.id}`);
    const csv = `${dest}.csv`;
    try {
      await Bun.write(csv, await requeteAvecEssais(s.url, this.fetcher, this.userAgent, this.attendre, this.expirationMs));
      if (Bun.file(csv).size === 0) throw new ErreurParquetInvalide(`fichier CSV vide pour ${s.id}`);
      await convertir(csv, dest, s);
      return { chemin: dest, url: s.url };
    } finally {
      await rm(csv, { force: true });
    }
  }
}

async function convertir(csv: string, dest: string, s: Source): Promise<void> {
  const duck = await connexion();
  try {
    const src = `read_csv(${litteral(csv)}, header = true, delim = ',', quote = '"', encoding = 'utf-8', all_varchar = true)`;
    const cols = (await lignes<{ column_name: string }>(duck, `describe select * from ${src}`)).map((c) => c.column_name);
    const select = cols
      .map((c) => `nullif(${ident(c)}, '') as ${ident(c.replace(/^﻿/, "").trim().toLowerCase())}`)
      .join(", ");
    await executer(duck, `copy (select ${select} from ${src}) to ${litteral(dest)} (format parquet, compression zstd)`);
  } catch (e) {
    throw new ErreurParquetInvalide(`fichier CSV illisible pour ${s.id} : ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    duck.closeSync();
  }
}
