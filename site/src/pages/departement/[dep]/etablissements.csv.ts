// Liste des établissements d'un département en CSV, générée au build.
import type { APIRoute } from "astro";
import { departementsDisponibles, lireDepartement } from "../../../lib/donnees";
import { csvDepartement } from "../../../lib/territoire";

export function getStaticPaths() {
  return departementsDisponibles().map((dep) => ({ params: { dep } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(csvDepartement(lireDepartement(params.dep!)), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
