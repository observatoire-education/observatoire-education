// Communes de la recherche, chargées avec l'index au premier focus : un tableau {i, l, d} (code, nom, département),
// toutes les communes qui ont une page (second degré ou écoles).
import type { APIRoute } from "astro";
import { communesRecherche } from "../lib/donnees";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(communesRecherche()), { headers: { "Content-Type": "application/json; charset=utf-8" } });
