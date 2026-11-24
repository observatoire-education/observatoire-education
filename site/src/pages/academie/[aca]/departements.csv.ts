// Les départements d'une académie en CSV (une ligne par département), générés au build.
import type { APIRoute } from "astro";
import { academiesDisponibles, lireTerritoire } from "../../../lib/donnees";
import { csvTerritoire } from "../../../lib/territoire";

export function getStaticPaths() {
  return academiesDisponibles().map((aca) => ({ params: { aca } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(csvTerritoire(lireTerritoire({ niveau: "academie", code: params.aca! })), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
