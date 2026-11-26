// Recette de la bascule d'hébergement : compare un échantillon de pages entre deux hôtes.
// `bun scripts/comparer-hebergements.ts <urlA> <urlB> <n>` : code 1 au moindre écart.
// Requêtes séquentielles, sans rafale, pour ne pas surcharger les hôtes.

export interface Ecart {
  chemin: string;
  ecart: string;
}

function deséchapper(xml: string): string {
  return xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Chemins de `n` URL du sitemap : la première, la dernière et un pas régulier entre les deux. */
export function echantillonUrls(sitemap: string, n: number): string[] {
  const chemins = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => {
    const u = new URL(deséchapper(m[1]!));
    return u.pathname + u.search;
  });
  if (n <= 0 || chemins.length === 0) return [];
  if (n >= chemins.length) return chemins;
  if (n === 1) return [chemins[0]!];
  const indices = new Set<number>();
  for (let i = 0; i < n; i++) indices.add(Math.round((i * (chemins.length - 1)) / (n - 1)));
  return [...indices].map((i) => chemins[i]!);
}

/** Corps sans les parties qui varient légitimement : script Umami et date de génération (fiche, fiche A4). */
export function normaliserCorps(html: string): string {
  return html
    .replace(/<script\b[^>]*umami[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*data-website-id[^>]*>\s*<\/script>/gi, "")
    .replace(/(Page générée le|Fiche éditée le) [^<.]+/g, "$1 …");
}

type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

async function lireXml(url: URL, chercher: Fetch): Promise<string> {
  const r = await chercher(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${url.pathname} illisible : statut ${r.status}`);
  return r.text();
}

/**
 * Plan du site de `base`, toutes listes d'URLs mises bout à bout. Si `sitemap.xml` est un index, chaque liste est lue
 * sur `base` (par son chemin) : l'index d'un aperçu pointe vers le domaine de production.
 */
export async function lireSitemap(base: string, chercher: Fetch = fetch): Promise<string> {
  const racine = await lireXml(new URL("/sitemap.xml", base), chercher);
  if (!racine.includes("<sitemapindex")) return racine;
  const listes: string[] = [];
  for (const m of racine.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    listes.push(await lireXml(new URL(new URL(deséchapper(m[1]!)).pathname, base), chercher));
  }
  return listes.join("\n");
}

async function lire(base: string, chemin: string, chercher: Fetch): Promise<{ statut: number; location: string; corps: string }> {
  const r = await chercher(new URL(chemin, base), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const location = r.status >= 300 && r.status < 400 ? (r.headers.get("location") ?? "") : "";
  return { statut: r.status, location, corps: normaliserCorps(await r.text()) };
}

/** Écarts de statut HTTP, de redirection ou de corps entre `a` et `b` pour chaque chemin, un par un. `chercher` est injectable pour les tests. */
export async function comparer(a: string, b: string, chemins: string[], chercher: Fetch = fetch): Promise<Ecart[]> {
  const ecarts: Ecart[] = [];
  for (const chemin of chemins) {
    try {
      const [ra, rb] = [await lire(a, chemin, chercher), await lire(b, chemin, chercher)];
      if (ra.statut !== rb.statut) ecarts.push({ chemin, ecart: `statut ${ra.statut} contre ${rb.statut}` });
      else if (ra.location !== rb.location) ecarts.push({ chemin, ecart: `redirection ${ra.location} contre ${rb.location}` });
      else if (ra.corps !== rb.corps) ecarts.push({ chemin, ecart: "corps différent" });
    } catch (e) {
      ecarts.push({ chemin, ecart: `erreur réseau : ${e instanceof Error ? e.message : e}` });
    }
  }
  return ecarts;
}

if (import.meta.main) {
  const [a, b, n] = process.argv.slice(2);
  if (!a || !b || !Number.isInteger(Number(n)) || Number(n) < 1) {
    console.error("Usage : bun scripts/comparer-hebergements.ts <urlA> <urlB> <n>");
    process.exit(2);
  }
  let sitemap: string;
  try {
    sitemap = await lireSitemap(a);
  } catch (e) {
    console.error(`plan du site inaccessible sur ${a} : ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  const chemins = echantillonUrls(sitemap, Number(n));
  if (chemins.length === 0) {
    console.error(`Recette échouée : le sitemap de ${a} ne contient aucune URL exploitable.`);
    process.exit(1);
  }
  const ecarts = await comparer(a, b, chemins);
  for (const e of ecarts) console.log(`${e.chemin} : ${e.ecart}`);
  console.log(`${ecarts.length} écart(s) sur ${chemins.length} page(s) comparée(s)`);
  process.exit(ecarts.length > 0 ? 1 : 0);
}
