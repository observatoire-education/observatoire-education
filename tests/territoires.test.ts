import { describe, expect, test } from "bun:test";
import { cheminTerritoire, communeDeRattachement } from "@obs/shared/territoires";

describe("rattachement des communes", () => {
  test("un arrondissement est rattaché à sa commune de Paris, Lyon ou Marseille", () => {
    expect(communeDeRattachement("75115")).toBe("75056");
    expect(communeDeRattachement("75101")).toBe("75056");
    expect(communeDeRattachement("69385")).toBe("69123");
    expect(communeDeRattachement("13216")).toBe("13055");
  });

  test("les autres codes sont inchangés", () => {
    expect(communeDeRattachement("44109")).toBe("44109");
    expect(communeDeRattachement("75056")).toBe("75056");
    expect(communeDeRattachement("2A004")).toBe("2A004");
  });
});

describe("chemin d'un territoire", () => {
  test("chaque niveau a son chemin", () => {
    expect(cheminTerritoire({ niveau: "france", code: "FR", libelle: "France" })).toBe("/france/");
    expect(cheminTerritoire({ niveau: "academie", code: "17", libelle: "Nantes" })).toBe("/academie/17/");
    expect(cheminTerritoire({ niveau: "departement", code: "2A", libelle: "Corse-du-Sud" })).toBe("/departement/2A/");
    expect(cheminTerritoire({ niveau: "commune", code: "44109", libelle: "Nantes" })).toBe("/commune/44109/");
  });
});
