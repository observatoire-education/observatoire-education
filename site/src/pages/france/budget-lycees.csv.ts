// Le budget des collectivités (lycees), une ligne par collectivité et par exercice, généré au build.
import type { APIRoute } from "astro";
import { lireFrance } from "../../lib/donnees";
import { csvBudget } from "../../lib/territoire";

export const GET: APIRoute = () =>
  new Response(csvBudget(lireFrance().budget.collectivites, "lycees"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
