// Garde-fous de fin de build : volume de dist/ (limites de Cloudflare Workers, fichiers statiques) et fichiers d'hébergement.
// `bun scripts/garde-fous.ts [dist]` : échoue (code 1) si dist/ dépasse les limites.
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Limites {
  fichiers: number;
  octetsParFichier: number;
}

/**
 * 95 000 fichiers (marge sous les 100 000 des fichiers statiques Workers) et 25 Mio par fichier
 * (marge sous les 25 MiB autorisés). Plus de plafond sur le poids total.
 */
export const LIMITES: Limites = { fichiers: 95_000, octetsParFichier: 25 * 1024 * 1024 };

/** Poids maximal de recherche.json (chargé par le navigateur au premier focus de la recherche). */
export const OCTETS_RECHERCHE_MAX = 6_000_000;

export interface Config {
  SITE_URL: string;
  DOMAINE: string;
  DEPOT: string;
  INDEXABLE: boolean;
}

/** Taille et nombre de fichiers de `dossier` ; lève une erreur au-delà des limites. */
export function verifierDist(dossier: string, limites: Limites = LIMITES): { octets: number; fichiers: number } {
  let octets = 0;
  let fichiers = 0;
  const tropGros: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      const s = statSync(p);
      if (s.isDirectory()) parcourir(p);
      else {
        octets += s.size;
        fichiers++;
        if (s.size > limites.octetsParFichier) tropGros.push(`${p} (${s.size} octets)`);
        if (p === join(dossier, "recherche.json") && s.size > OCTETS_RECHERCHE_MAX) {
          throw new Error(`${p} pèse ${s.size} octets, au-delà de ${OCTETS_RECHERCHE_MAX} octets : l'index de recherche est trop lourd pour être chargé par la recherche`);
        }
      }
    }
  };
  parcourir(dossier);
  if (tropGros.length > 0) {
    throw new Error(
      `dist/ contient des fichiers de plus de ${limites.octetsParFichier} octets : ${tropGros.join(", ")} (voir la marge R2, spec phase Écoles 6.9)`,
    );
  }
  if (fichiers > limites.fichiers) {
    throw new Error(`dist/ contient trop de fichiers : ${fichiers} > ${limites.fichiers} (voir la marge R2, spec phase Écoles 6.9)`);
  }
  return { octets, fichiers };
}

/**
 * Robots qui collectent pour entraîner des modèles d'IA. Ils sont exclus même quand le site est
 * indexable ; les moteurs de recherche et les robots de recherche des assistants (OAI-SearchBot,
 * ChatGPT-User, Claude-SearchBot, PerplexityBot…) restent autorisés.
 */
export const ROBOTS_ENTRAINEMENT = [
  // Catégorie générique d'usage, reprise du robots.txt de google.com (novembre 2026).
  "__usage_ai-training",
  // Liste du groupe __usage_ai-training de google.com/robots.txt…
  "AI2Bot", "Ai2Bot-Dolma", "Amazonbot", "Applebot-Extended", "bedrockbot", "Bytespider", "CCBot",
  "ChatGLM-Spider", "ClaudeBot", "cohere-training-data-crawler", "Cotoyogi", "DeepSeekBot", "Diffbot",
  "ElevenlabsCrawler", "FacebookBot", "FriendlyCrawler", "GPTBot", "Grok", "HySpider",
  "ICC-Crawler", "ImagesiftBot", "img2dataset", "KimiBot", "LCC", "Meta-ExternalAgent",
  "MistralAI-Training", "MistralBot", "MoonshotBot", "NagetBot", "omgili", "omgilibot", "QwenBot",
  "recraft-image-dataset", "Reflectionbot", "SBIntuitionsBot", "Timpibot", "VelenPublicWebCrawler",
  "web-image-collection-research", "Webzio-Extended", "YiBot",
  // (sans ExaSearchBot, toléré : moteur de recherche interrogé par les assistants)
  // …complétée de ceux que Google n'y met pas (dont le sien).
  "Google-Extended", "anthropic-ai", "cohere-ai", "PanguBot",
] as const;

/** Supprime un éventuel CNAME (hérité de GitHub Pages) ; robots.txt selon INDEXABLE, robots d'entraînement exclus. */
export function ecrireFichiersHebergement(dossier: string, config: Config): void {
  const cname = join(dossier, "CNAME");
  if (existsSync(cname)) rmSync(cname);
  writeFileSync(
    join(dossier, "robots.txt"),
    config.INDEXABLE
      ? ROBOTS_ENTRAINEMENT.map((r) => `User-agent: ${r}\n`).join("") +
          `Disallow: /\n\nUser-agent: *\nAllow: /\nSitemap: ${config.SITE_URL}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
}

if (import.meta.main) {
  const dossier = process.argv[2] ?? "dist";
  const config = JSON.parse(readFileSync(process.env.OBS_CONFIG ?? "observatoire.config.json", "utf8")) as Config;
  try {
    ecrireFichiersHebergement(dossier, config);
    const { octets, fichiers } = verifierDist(dossier);
    console.log(`${dossier}/ : ${(octets / 1e6).toFixed(1)} Mo, ${fichiers} fichiers (limites : ${LIMITES.fichiers} fichiers, ${LIMITES.octetsParFichier / 1024 / 1024} Mio par fichier)`);
    console.log(config.INDEXABLE ? "référencement autorisé" : "aperçu non référencé (noindex, robots.txt Disallow)");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
