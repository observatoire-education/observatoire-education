// Liste des établissements d'une commune en CSV, générée au build : communes retenues pour le second degré seulement
// (les autres pages commune renvoient au CSV de leur département, plafond de fichiers oblige).
import type { APIRoute } from "astro";
import { communesAvecCsv, lireTerritoire } from "../../../lib/donnees";
import { csvTerritoire } from "../../../lib/territoire";

export function getStaticPaths() {
  return [...communesAvecCsv()].map((insee) => ({ params: { insee } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(csvTerritoire(lireTerritoire({ niveau: "commune", code: params.insee! })), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
