// Contenu du plan du site : les pages publiées, réparties en fichiers (voir plan-du-site.ts).
import { CONFIG } from "./config";
import { academiesDisponibles, communesDisponibles, departementsDisponibles, lireIndex, lireSources, regionsDisponibles } from "./donnees";
import { decouperPlan, type PartieDuPlan } from "./plan-du-site";

export const SITE = CONFIG.SITE_URL;

/** Date de la collecte de source la plus récente. */
export function dateDuPlan(): string {
  const dates = Object.values(lireSources()).flatMap((s) => (s.actuelle ? [s.actuelle.collecteLe] : [])).sort();
  return (dates.at(-1) ?? new Date().toISOString()).slice(0, 10);
}

/** Toutes les pages du site, réparties en fichiers : pages fixes et territoires, communes, établissements. */
export function partiesDuPlan(): PartieDuPlan[] {
  return decouperPlan({
    pages: [
      "/", "/france/", "/sources/", "/methode/", "/a-propos/", "/mentions-legales/",
      ...regionsDisponibles().map((r) => `/region/${r}/`),
      ...academiesDisponibles().map((a) => `/academie/${a}/`),
      ...departementsDisponibles().map((d) => `/departement/${d}/`),
    ],
    communes: [...communesDisponibles()].sort().map((c) => `/commune/${c}/`),
    etablissements: lireIndex().map((e) => e.u).sort().map((u) => `/etablissement/${u}/`),
  });
}
