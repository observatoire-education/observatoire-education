// Les départements d'une région en CSV (une ligne par département), générés au build.
import type { APIRoute } from "astro";
import { lireTerritoire, regionsDisponibles } from "../../../lib/donnees";
import { csvTerritoire } from "../../../lib/territoire";

export function getStaticPaths() {
  return regionsDisponibles().map((code) => ({ params: { code } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(csvTerritoire(lireTerritoire({ niveau: "region", code: params.code! })), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
