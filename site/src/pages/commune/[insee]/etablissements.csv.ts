// Liste des établissements d'une commune en CSV, générée au build.
import type { APIRoute } from "astro";
import { communesDisponibles, lireTerritoire } from "../../../lib/donnees";
import { csvTerritoire } from "../../../lib/territoire";

export function getStaticPaths() {
  return [...communesDisponibles()].map((insee) => ({ params: { insee } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(csvTerritoire(lireTerritoire({ niveau: "commune", code: params.insee! })), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
