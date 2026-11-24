import { describe, expect, test } from "bun:test";
import { COMMUNES_METROPOLE_LYON, REGIONS, collectiviteDe, libelleCollectivite, motifSansCollectivite, regionDe } from "@obs/shared/collectivites";
import { cheminTerritoire } from "@obs/shared/territoires";

describe("collectivités", () => {
  test("régions : 18, chaque département du site dans une seule, sauf 975", () => {
    expect(REGIONS).toHaveLength(18);
    const tous = REGIONS.flatMap((r) => r.deps);
    expect(new Set(tous).size).toBe(tous.length);
    expect(regionDe("44")).toBe("52");
    expect(regionDe("2A")).toBe("94");
    expect(regionDe("976")).toBe("06");
    expect(regionDe("975")).toBeNull();
  });
  test("collèges : Métropole de Lyon, Rhône, Paris, Alsace, Corse, Mayotte", () => {
    expect(collectiviteDe("colleges", "69", "69266")).toBe("ml-lyon"); // Villeurbanne
    expect(collectiviteDe("colleges", "69", "69385")).toBe("ml-lyon"); // Lyon 5e
    expect(collectiviteDe("colleges", "69", "69243")).toBe("dep-69"); // Tarare
    expect(collectiviteDe("colleges", "75", "75115")).toBe("paris");
    expect(collectiviteDe("colleges", "68", "68224")).toBe("cea");
    expect(collectiviteDe("colleges", "2B", "2B033")).toBe("ctu-corse");
    expect(collectiviteDe("colleges", "972", "97209")).toBe("ctu-martinique");
    expect(collectiviteDe("colleges", "976", "97611")).toBeNull();
    expect(collectiviteDe("colleges", "44", "44109")).toBe("dep-44");
  });
  test("lycées : région, collectivités uniques, Mayotte", () => {
    expect(collectiviteDe("lycees", "44", "44109")).toBe("reg-52");
    expect(collectiviteDe("lycees", "2A", "2A004")).toBe("ctu-corse");
    expect(collectiviteDe("lycees", "973", "97302")).toBe("ctu-guyane");
    expect(collectiviteDe("lycees", "976", "97611")).toBeNull();
  });
  test("Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon : non identifiés tant que la tâche 4 n'a rien trouvé", () => {
    expect(collectiviteDe("colleges", "971", "97801")).toBeNull();
    expect(collectiviteDe("lycees", "971", "97701")).toBeNull();
    expect(collectiviteDe("colleges", "975", "97502")).toBeNull();
  });
  test("Métropole de Lyon : 58 communes et 9 arrondissements", () => {
    expect(COMMUNES_METROPOLE_LYON.size).toBe(67);
    expect(COMMUNES_METROPOLE_LYON.has("69381")).toBe(true);
  });
  test("libellés", () => {
    expect(libelleCollectivite("dep-44")).toBe("Département de Loire-Atlantique");
    expect(libelleCollectivite("reg-52")).toBe("Région Pays de la Loire");
    expect(libelleCollectivite("ml-lyon")).toBe("Métropole de Lyon");
    expect(libelleCollectivite("paris")).toBe("Ville de Paris");
    expect(libelleCollectivite("cea")).toBe("Collectivité européenne d'Alsace");
    expect(libelleCollectivite("ctu-corse")).toBe("Collectivité de Corse");
    expect(libelleCollectivite("ctu-martinique")).toBe("Collectivité territoriale de Martinique");
    expect(libelleCollectivite("ctu-guyane")).toBe("Collectivité territoriale de Guyane");
    expect(libelleCollectivite("dep-976")).toBe("Département de Mayotte");
  });
  test("chemin d'une page région", () => {
    expect(cheminTerritoire({ niveau: "region", code: "52", libelle: "Pays de la Loire" })).toBe("/region/52/");
  });
});

describe("motifSansCollectivite", () => {
  test("Mayotte : aucune collectivité ; les autres : non identifiée", () => {
    expect(motifSansCollectivite("976", "97611")).toBe("aucune_collectivite");
    expect(motifSansCollectivite("971", "97801")).toBe("collectivite_non_identifiee");
    expect(motifSansCollectivite("971", "97701")).toBe("collectivite_non_identifiee");
    expect(motifSansCollectivite("975", "97502")).toBe("collectivite_non_identifiee");
  });
});
