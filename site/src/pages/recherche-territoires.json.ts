// Régions et départements de la recherche, chargés avec l'index à la première saisie : {regions: {r, l}[],
// departements: {d, l, a}[]} (code, nom, et académie pour les départements).
import { academie } from "@obs/shared/libelles";
import type { APIRoute } from "astro";
import { lireFrance } from "../lib/donnees";

export const GET: APIRoute = () => {
  const france = lireFrance();
  const regions = [...france.regions].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")).map((r) => ({ r: r.code, l: r.libelle }));
  const departements = france.academiesEtDepartements.flatMap((a) => a.departements.map((d) => ({ d: d.dep, l: d.libelle, a: academie(a.libelle) })));
  return new Response(JSON.stringify({ regions, departements }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
