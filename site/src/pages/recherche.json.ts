// Index de recherche : un tableau d'objets à clés courtes {u, n, c, d, f, s} (et x pour une page conservée).
import type { APIRoute } from "astro";
import { lireIndex } from "../lib/donnees";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(lireIndex()), { headers: { "Content-Type": "application/json; charset=utf-8" } });
