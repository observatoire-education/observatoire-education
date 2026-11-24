// Plan du site : toutes les pages, avec pour date la collecte de source la plus récente.
import type { APIRoute } from "astro";
import { estEcole } from "@obs/shared/libelles";
import { CONFIG } from "../lib/config";
import { academiesDisponibles, communesDisponibles, departementsDisponibles, lireIndex, lireSources, regionsDisponibles } from "../lib/donnees";

export const GET: APIRoute = () => {
  const dates = Object.values(lireSources()).flatMap((s) => (s.actuelle ? [s.actuelle.collecteLe] : [])).sort();
  const lastmod = (dates.at(-1) ?? new Date().toISOString()).slice(0, 10);
  const chemins = ["/", "/france/", "/sources/", "/methode/", ...regionsDisponibles().map((r) => `/region/${r}/`),
    ...academiesDisponibles().map((a) => `/academie/${a}/`),
    ...departementsDisponibles().map((d) => `/departement/${d}/`),
    ...[...communesDisponibles()].sort().map((c) => `/commune/${c}/`),
    // Pas de page d'école jusqu'à la tâche 9 du plan phase Écoles.
    ...lireIndex().filter((e) => !estEcole(e.f)).map((e) => `/etablissement/${e.u}/`)];
  const url = (c: string) => `<url><loc>${CONFIG.SITE_URL}${c}</loc><lastmod>${lastmod}</lastmod></url>`;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chemins.map(url).join("\n")}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
