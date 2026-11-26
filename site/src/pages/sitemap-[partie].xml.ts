// Listes d'URLs du plan du site (`sitemap-pages.xml`, `sitemap-communes.xml`, `sitemap-etablissements-1.xml`…).
import type { APIRoute } from "astro";
import { dateDuPlan, partiesDuPlan, SITE } from "../lib/contenu-du-plan";
import { reponseXml, urlsDuPlan } from "../lib/plan-du-site";

export function getStaticPaths() {
  const lastmod = dateDuPlan();
  return partiesDuPlan().map((p) => ({ params: { partie: p.fichier.replace(/^sitemap-|\.xml$/g, "") }, props: { chemins: p.chemins, lastmod } }));
}

export const GET: APIRoute = ({ props }) => reponseXml(urlsDuPlan(SITE, props.chemins as string[], props.lastmod as string));
