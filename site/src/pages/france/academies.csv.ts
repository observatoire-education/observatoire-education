// Les académies en CSV (une ligne par académie), générées au build.
import type { APIRoute } from "astro";
import { lireFrance } from "../../lib/donnees";
import { csvTerritoire } from "../../lib/territoire";

export const GET: APIRoute = () =>
  new Response(csvTerritoire(lireFrance()), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
