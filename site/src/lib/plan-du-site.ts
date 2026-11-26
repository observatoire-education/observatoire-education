// Plan du site (sitemaps.org) : un index, `sitemap.xml`, qui renvoie vers une liste d'URLs par type de page.
// Le protocole plafonne chaque liste à 50 000 URLs : les groupes plus gros sont numérotés.
// Fonctions pures ; la liste des pages vient de contenu-du-plan.ts.

/** Plafond du protocole sitemaps.org pour une liste d'URLs. */
export const URLS_MAX_PROTOCOLE = 50_000;
/** URLs par fichier : marge sous le plafond, pour qu'une région de plus ne le fasse pas déborder. */
export const URLS_PAR_FICHIER = 40_000;

export interface PartieDuPlan {
  fichier: string;
  chemins: string[];
}

/** Un fichier `sitemap-<groupe>.xml` par groupe, ou `sitemap-<groupe>-1.xml`, `-2`… au-delà de `taille` URLs. Groupes vides omis. */
export function decouperPlan(groupes: Record<string, string[]>, taille = URLS_PAR_FICHIER): PartieDuPlan[] {
  return Object.entries(groupes).flatMap(([nom, chemins]) => {
    if (chemins.length <= taille) return chemins.length ? [{ fichier: `sitemap-${nom}.xml`, chemins }] : [];
    return Array.from({ length: Math.ceil(chemins.length / taille) }, (_, i) => ({
      fichier: `sitemap-${nom}-${i + 1}.xml`,
      chemins: chemins.slice(i * taille, (i + 1) * taille),
    }));
  });
}

const XMLNS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

export const indexDuPlan = (site: string, fichiers: string[], lastmod: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex ${XMLNS}>\n${fichiers
    .map((f) => `<sitemap><loc>${site}/${f}</loc><lastmod>${lastmod}</lastmod></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`;

export const urlsDuPlan = (site: string, chemins: string[], lastmod: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${XMLNS}>\n${chemins
    .map((c) => `<url><loc>${site}${c}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`;

export const reponseXml = (xml: string): Response => new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
