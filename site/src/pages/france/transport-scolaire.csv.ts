// Le transport scolaire des régions et CTU, une ligne par collectivité et par exercice, généré au build.
import type { APIRoute } from "astro";
import { lireFrance } from "../../lib/donnees";
import { csvTransport } from "../../lib/territoire";

export const GET: APIRoute = () =>
  new Response(csvTransport(lireFrance().transportRegions ?? []), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
