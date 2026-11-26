// Index du plan du site : renvoie vers une liste d'URLs par type de page (voir lib/plan-du-site).
import type { APIRoute } from "astro";
import { dateDuPlan, partiesDuPlan, SITE } from "../lib/contenu-du-plan";
import { indexDuPlan, reponseXml } from "../lib/plan-du-site";

export const GET: APIRoute = () => reponseXml(indexDuPlan(SITE, partiesDuPlan().map((p) => p.fichier), dateDuPlan()));
