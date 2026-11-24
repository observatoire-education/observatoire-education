import { describe, expect, test } from "bun:test";

const HEADERS = await Bun.file(new URL("../site/public/_headers", import.meta.url)).text();

/**
 * En-têtes servis pour `chemin`, comme Cloudflare applique `_headers` : chaque règle qui correspond s'ajoute, dans
 * l'ordre du fichier (valeurs d'un même en-tête jointes) ; `! Nom` détache l'en-tête ajouté par les règles précédentes.
 */
function entetes(chemin: string): Record<string, string[]> {
  const r: Record<string, string[]> = {};
  let applique = false;
  for (const ligne of HEADERS.split("\n")) {
    if (!ligne.trim() || ligne.trim().startsWith("#")) continue;
    if (!/^\s/.test(ligne)) {
      const motif = new RegExp(`^${ligne.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      applique = motif.test(chemin);
    } else if (applique) {
      const l = ligne.trim();
      if (l.startsWith("! ")) delete r[l.slice(2).trim().toLowerCase()];
      else {
        const i = l.indexOf(":");
        (r[l.slice(0, i).trim().toLowerCase()] ??= []).push(l.slice(i + 1).trim());
      }
    }
  }
  return r;
}

describe("_headers (cache de Cloudflare)", () => {
  test("une seule valeur de Cache-Control par chemin (aucun cumul avec /*)", () => {
    for (const c of ["/", "/etablissement/0440001A/", "/_astro/a.B1c2.css", "/js/recherche.js", "/recherche.json"]) {
      expect(`${c} ${entetes(c)["cache-control"]?.length}`).toBe(`${c} 1`);
    }
  });

  test("/_astro/* (fichiers hachés) : immutable ; /js/* (adresses non versionnées) : une heure, comme les pages", () => {
    expect(entetes("/_astro/a.B1c2.css")["cache-control"]).toEqual(["public, max-age=31536000, immutable"]);
    for (const c of ["/js/recherche.js", "/js/fiche.js", "/", "/recherche.json"]) {
      expect(entetes(c)["cache-control"]).toEqual(["public, max-age=3600"]);
    }
  });
});
