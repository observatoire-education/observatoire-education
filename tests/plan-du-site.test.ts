import { describe, expect, test } from "bun:test";
import { decouperPlan, indexDuPlan, urlsDuPlan, URLS_MAX_PROTOCOLE, URLS_PAR_FICHIER } from "../site/src/lib/plan-du-site.ts";

describe("découpage du plan du site", () => {
  test("un fichier par groupe tant qu'il tient, numéroté au-delà", () => {
    const parties = decouperPlan({ pages: ["/", "/france/"], etablissements: ["/e1/", "/e2/", "/e3/", "/e4/", "/e5/"] }, 2);
    expect(parties).toEqual([
      { fichier: "sitemap-pages.xml", chemins: ["/", "/france/"] },
      { fichier: "sitemap-etablissements-1.xml", chemins: ["/e1/", "/e2/"] },
      { fichier: "sitemap-etablissements-2.xml", chemins: ["/e3/", "/e4/"] },
      { fichier: "sitemap-etablissements-3.xml", chemins: ["/e5/"] },
    ]);
  });

  test("un groupe vide ne produit pas de fichier", () => {
    expect(decouperPlan({ pages: ["/"], communes: [] }, 10).map((p) => p.fichier)).toEqual(["sitemap-pages.xml"]);
  });

  test("la taille par défaut laisse de la marge sous la limite du protocole", () => {
    expect(URLS_PAR_FICHIER).toBeLessThan(URLS_MAX_PROTOCOLE);
    expect(URLS_MAX_PROTOCOLE).toBe(50_000);
  });

  test("index et liste d'URLs au format sitemaps.org", () => {
    const index = indexDuPlan("https://x.fr", ["sitemap-pages.xml", "sitemap-communes.xml"], "2026-11-22");
    expect(index).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(index).toContain("<sitemap><loc>https://x.fr/sitemap-pages.xml</loc><lastmod>2026-11-22</lastmod></sitemap>");
    expect(index).toContain("<loc>https://x.fr/sitemap-communes.xml</loc>");
    const urls = urlsDuPlan("https://x.fr", ["/", "/france/"], "2026-11-22");
    expect(urls).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(urls).toContain("<url><loc>https://x.fr/france/</loc><lastmod>2026-11-22</lastmod></url>");
  });
});
