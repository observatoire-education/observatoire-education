import { beforeAll, describe, expect, test } from "bun:test";
import { calculerSegregation } from "../pipeline/src/segregation.ts";
import { dbTest } from "./aide.ts";
import { doc, siteTest, texte } from "./site.ts";

describe("ségrégation sociale entre collèges (données)", () => {
  test("département : 12 années", async () => {
    const seg = await calculerSegregation(await dbTest());
    expect([...seg.keys()].sort()).toEqual(["44", "75"]);
    const annees = seg.get("44")!;
    expect(annees.map((a) => a.annee)).toEqual(Array.from({ length: 12 }, (_, i) => 2014 + i));
    expect(annees.at(-1)).toMatchObject({
      annee: 2025, colleges: 180, partPrive: 36.3,
      entropie: { ensemble: 0.194, public: 0.087, prive: 0.149, publicPrive: 0.097 },
      contributions: { public: 29.4, prive: 19.9, publicPrive: 50.7 },
    });
  });

  test("valeur vide : null, jamais 0", async () => {
    const seg = await calculerSegregation(await dbTest());
    const a2015 = seg.get("44")!.find((a) => a.annee === 2015)!;
    expect(a2015.entropie.publicPrive).toBeNull();
    expect(a2015.contributions.publicPrive).toBeNull();
    expect(a2015.entropie.ensemble).not.toBeNull();
    expect(seg.get("75")!.find((a) => a.annee === 2020)!.entropie.prive).toBeNull();
  });
});

describe("ségrégation sociale entre collèges (pages)", () => {
  beforeAll(async () => {
    await siteTest();
  }, 180_000);

  const bloc = (chemin: string) => doc(chemin).querySelector("#segregation");

  test("page département : bloc, courbe et tableau, source et année", () => {
    const b = bloc("departement/44")!;
    expect(b).not.toBeNull();
    // Dans la section des collèges, après la carte « IPS moyen comparé ».
    expect(b.closest("section")!.id).toBe("college");
    expect(b.querySelector("h3")!.textContent!.trim()).toBe("Ségrégation sociale entre collèges");
    expect(b.querySelectorAll("svg")).toHaveLength(1);
    expect(b.querySelector("svg")!.outerHTML).not.toMatch(/NaN/);
    const t = b.textContent!.replace(/\s+/g, " ");
    for (const l of ["Ensemble des collèges", "Entre collèges publics", "Entre collèges privés sous contrat", "Entre public et privé",
      "Part de la ségrégation due à l'écart entre public et privé", "Collèges pris en compte", "Part du privé"]) expect(t).toContain(l);
    // Cinq dernières années en colonnes ; indices à trois décimales, parts à une décimale.
    expect([...b.querySelectorAll("thead th")].map((h) => h.textContent!.trim())).toEqual(["Indicateur", "2021", "2022", "2023", "2024", "2025"]);
    expect(t).toContain("0,194");
    expect(t).toContain("50,7 %");
    expect(t).toContain("36,3 %");
    // Source datée, avec le lien vers la donnée brute.
    expect(b.querySelector(".src")!.textContent).toContain("Source :");
    expect(b.querySelector(".src")!.textContent).toContain("2025");
    expect(b.querySelector(".src a[href*='segregation']")).not.toBeNull();
  });

  test("pages académie, région, France : phrase de renvoi, pas de valeurs", () => {
    for (const p of ["academie/17", "region/52", "france"]) {
      const t = texte(p);
      expect(t).toContain("La DEPP publie la ségrégation sociale entre collèges par département seulement : voir les pages des départements.");
      expect(bloc(p)).toBeNull();
      expect(t).not.toContain("Part de la ségrégation due");
    }
  });

  test("page commune : ni bloc ni renvoi", () => {
    const t = texte("commune/44109");
    expect(t).not.toContain("Ségrégation sociale");
    expect(t).not.toContain("par département seulement");
  });
});
