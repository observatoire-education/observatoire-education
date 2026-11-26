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

/**
 * Poids maximal (brut) de recherche.json et recherche-communes.json réunis, chargés ensemble au premier focus de la
 * recherche (Cloudflare les sert compressés). Au-delà : découper l'index par département.
 */
export const OCTETS_RECHERCHE_MAX = 10_000_000;
const FICHIERS_RECHERCHE = ["recherche.json", "recherche-communes.json"];

/** URLs par liste du plan du site (`sitemap*.xml` à la racine) : plafond du protocole sitemaps.org. */
export const URLS_PAR_SITEMAP_MAX = 50_000;

function verifierPlanDuSite(dossier: string): void {
  for (const nom of readdirSync(dossier).filter((f) => /^sitemap.*\.xml$/.test(f))) {
    const urls = readFileSync(join(dossier, nom), "utf8").split("<url>").length - 1;
    if (urls > URLS_PAR_SITEMAP_MAX) {
      throw new Error(`${nom} liste ${urls} URLs, au-delà des ${URLS_PAR_SITEMAP_MAX} du protocole sitemaps.org : réduire URLS_PAR_FICHIER (site/src/lib/plan-du-site.ts)`);
    }
  }
}

/** Poids maximal (brut) d'une fiche (`etablissement/*\/index.html`). */
export const OCTETS_PAGE_MAX = 150_000;
/**
 * Poids maximal (brut) d'une page commune (`commune/*\/index.html`) : les grandes villes listent toutes leurs écoles
 * (Paris : environ 540 Ko au premier build réel, le 2026-11-25), servies compressées.
 */
export const OCTETS_COMMUNE_MAX = 750_000;

export interface PoidsPages {
  pages: number;
  mediane: number;
  centile95: number;
  max: number;
  /** Le fichier le plus lourd. */
  fichier: string;
}

/** Valeur de rang `ceil(q × n)` d'une liste triée (méthode du rang le plus proche). */
const rang = (tries: number[], q: number) => tries[Math.max(0, Math.ceil(q * tries.length) - 1)]!;

/** Poids des fiches et des pages commune de `dossier` : médiane, 95e centile, maximum et le fichier le plus lourd. */
export function poidsPages(dossier: string): Partial<Record<"etablissement" | "commune", PoidsPages>> {
  const r: Partial<Record<"etablissement" | "commune", PoidsPages>> = {};
  for (const niveau of ["etablissement", "commune"] as const) {
    const racine = join(dossier, niveau);
    if (!existsSync(racine)) continue;
    const pages = readdirSync(racine)
      .map((nom) => join(racine, nom, "index.html"))
      .filter((p) => existsSync(p))
      .map((p) => ({ p, o: statSync(p).size }));
    if (pages.length === 0) continue;
    const tries = pages.map((x) => x.o).sort((a, b) => a - b);
    const lourde = pages.reduce((a, b) => (b.o > a.o ? b : a));
    r[niveau] = { pages: pages.length, mediane: rang(tries, 0.5), centile95: rang(tries, 0.95), max: lourde.o, fichier: lourde.p };
  }
  return r;
}

/** Lève une erreur qui nomme chaque fiche ou page commune au-delà de `plafond` octets. */
function verifierPoidsPages(dossier: string): void {
  const lourdes: string[] = [];
  for (const [niveau, plafond] of [["etablissement", OCTETS_PAGE_MAX], ["commune", OCTETS_COMMUNE_MAX]] as const) {
    const racine = join(dossier, niveau);
    if (!existsSync(racine)) continue;
    for (const nom of readdirSync(racine)) {
      const p = join(racine, nom, "index.html");
      if (existsSync(p) && statSync(p).size > plafond) lourdes.push(`${p} pèse ${statSync(p).size} octets, au-delà de ${plafond}`);
    }
  }
  if (lourdes.length > 0) throw new Error(`pages trop lourdes : ${lourdes.join(" ; ")}`);
}

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
      }
    }
  };
  parcourir(dossier);
  const recherche = FICHIERS_RECHERCHE.map((f) => join(dossier, f)).filter((p) => existsSync(p)).reduce((a, p) => a + statSync(p).size, 0);
  if (recherche > OCTETS_RECHERCHE_MAX) {
    throw new Error(`${FICHIERS_RECHERCHE.join(" et ")} pèsent ${recherche} octets, au-delà de ${OCTETS_RECHERCHE_MAX} octets : l'index de recherche est trop lourd pour être chargé par la recherche`);
  }
  if (tropGros.length > 0) {
    throw new Error(
      `dist/ contient des fichiers de plus de ${limites.octetsParFichier} octets : ${tropGros.join(", ")} (voir la marge R2, spec phase Écoles 6.9)`,
    );
  }
  if (fichiers > limites.fichiers) {
    throw new Error(`dist/ contient trop de fichiers : ${fichiers} > ${limites.fichiers} (voir la marge R2, spec phase Écoles 6.9)`);
  }
  verifierPoidsPages(dossier);
  verifierPlanDuSite(dossier);
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
    for (const [niveau, p] of Object.entries(poidsPages(dossier))) {
      console.log(`pages ${niveau} : ${p.pages}, médiane ${p.mediane} octets, 95e centile ${p.centile95}, max ${p.max} (${p.fichier}) ; plafond ${niveau === "commune" ? OCTETS_COMMUNE_MAX : OCTETS_PAGE_MAX}`);
    }
    console.log(config.INDEXABLE ? "référencement autorisé" : "aperçu non référencé (noindex, robots.txt Disallow)");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
