// Index de recherche : un tableau d'objets à clés courtes {u, n, c, d, f, s} (et x pour une page conservée).
import type { APIRoute } from "astro";
import { estEcole } from "@obs/shared/libelles";
import { lireIndex } from "../lib/donnees";

// Écoles retirées de la recherche jusqu'à la tâche 10 du plan phase Écoles (recherche des écoles), bien que leurs pages existent.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(lireIndex().filter((e) => !estEcole(e.f))), { headers: { "Content-Type": "application/json; charset=utf-8" } });
