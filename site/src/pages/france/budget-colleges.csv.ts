// Le budget des collectivités (colleges), une ligne par collectivité et par exercice, généré au build.
import type { APIRoute } from "astro";
import { lireFrance } from "../../lib/donnees";
import { csvBudget } from "../../lib/territoire";

export const GET: APIRoute = () =>
  new Response(csvBudget(lireFrance().budget.collectivites, "colleges"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
