// Recette de la bascule d'hébergement : compare un échantillon de pages entre deux hôtes.
// `bun scripts/comparer-hebergements.ts <urlA> <urlB> <n>` : code 1 au moindre écart.
// Requêtes séquentielles, sans rafale, pour ne pas surcharger les hôtes.

export interface Ecart {
  chemin: string;
  ecart: string;
}

/** Chemins de `n` URL du sitemap : la première, la dernière et un pas régulier entre les deux. */
export function echantillonUrls(sitemap: string, n: number): string[] {
  const chemins = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => {
    const u = new URL(m[1]!);
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

async function lire(base: string, chemin: string): Promise<{ statut: number; corps: string }> {
  const r = await fetch(new URL(chemin, base), { redirect: "manual" });
  return { statut: r.status, corps: normaliserCorps(await r.text()) };
}

/** Écarts de statut HTTP ou de corps entre `a` et `b` pour chaque chemin, un par un. */
export async function comparer(a: string, b: string, chemins: string[]): Promise<Ecart[]> {
  const ecarts: Ecart[] = [];
  for (const chemin of chemins) {
    try {
      const [ra, rb] = [await lire(a, chemin), await lire(b, chemin)];
      if (ra.statut !== rb.statut) ecarts.push({ chemin, ecart: `statut ${ra.statut} contre ${rb.statut}` });
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
  const r = await fetch(new URL("/sitemap.xml", a));
  if (!r.ok) {
    console.error(`sitemap.xml illisible sur ${a} : statut ${r.status}`);
    process.exit(1);
  }
  const chemins = echantillonUrls(await r.text(), Number(n));
  const ecarts = await comparer(a, b, chemins);
  for (const e of ecarts) console.log(`${e.chemin} : ${e.ecart}`);
  console.log(`${ecarts.length} écart(s) sur ${chemins.length} page(s) comparée(s)`);
  process.exit(ecarts.length > 0 ? 1 : 0);
}
