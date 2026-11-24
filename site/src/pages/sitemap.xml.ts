// Plan du site : toutes les pages, avec pour date la collecte de source la plus récente.
import type { APIRoute } from "astro";
import { CONFIG } from "../lib/config";
import { academiesDisponibles, communesDisponibles, departementsDisponibles, lireIndex, lireSources } from "../lib/donnees";

export const GET: APIRoute = () => {
  const dates = Object.values(lireSources()).flatMap((s) => (s.actuelle ? [s.actuelle.collecteLe] : [])).sort();
  const lastmod = (dates.at(-1) ?? new Date().toISOString()).slice(0, 10);
  const chemins = ["/", "/france/", "/sources/", "/methode/", ...academiesDisponibles().map((a) => `/academie/${a}/`),
    ...departementsDisponibles().map((d) => `/departement/${d}/`),
    ...[...communesDisponibles()].sort().map((c) => `/commune/${c}/`),
    ...lireIndex().map((e) => `/etablissement/${e.u}/`)];
  const url = (c: string) => `<url><loc>${CONFIG.SITE_URL}${c}</loc><lastmod>${lastmod}</lastmod></url>`;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chemins.map(url).join("\n")}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
