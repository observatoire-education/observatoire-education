import { describe, expect, test } from "bun:test";
import { calculerBatiments } from "../pipeline/src/batiments.ts";
import { SOURCES } from "../pipeline/src/sources.ts";
import { dbTest } from "./aide.ts";

describe("sources de la Région Île-de-France", () => {
  test("trois jeux du portail régional, retéléchargés à chaque nouvelle version", () => {
    for (const id of ["idf_lycees", "idf_ppi", "idf_operations"] as const) {
      expect(SOURCES[id].api).toBe("https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets");
      expect(SOURCES[id].producteur).toBe("Région Île-de-France");
      expect(SOURCES[id].referentiel).toBe(false);
    }
  });
});

describe("calculerBatiments", () => {
  test("année de construction, opérations PPI et opérations votées par lycée", async () => {
    const b = await calculerBatiments(await dbTest());
    const g = b.get("0440003C")!;
    expect(g.anneeConstruction).toBe(1965);
    // PPI : livrée en 2009, puis programmée en 2016 sans livraison → la plus récente d'abord
    expect(g.ppi.map((o) => o.intitule)).toEqual(["Rénovation thermique", "Réhabilitation - gros entretien"]);
    expect(g.ppi[1]).toMatchObject({ ppi: "2001/2006", enveloppeMeur: 33.66, etat: "Opération livrée", anneeIndividualisation: 2005, anneeLivraison: 2009 });
    // Opérations votées : un dossier par intitulé, désaffectation retranchée ; même dernière année → montant décroissant
    expect(g.operations).toEqual([
      { intitule: "44 NANTES GUISTHAU RESTRUCT GLOBALE", premiereAnnee: 2021, derniereAnnee: 2023, montantVote: 42000000, decisions: 3 },
      { intitule: "44 NANTES GUISTHAU REMPLACEMENT RESEAUX CHAUFFAGE", premiereAnnee: 2023, derniereAnnee: 2023, montantVote: 720000, decisions: 1 },
    ]);
  });

  test("année absente : null, les opérations restent", async () => {
    const g = (await calculerBatiments(await dbTest())).get("0440006F")!;
    expect(g.anneeConstruction).toBeNull();
    expect(g.ppi).toHaveLength(1);
    expect(g.operations).toEqual([]);
  });

  test("seule l'année de construction suffit ; un établissement absent des jeux n'a pas d'entrée", async () => {
    const b = await calculerBatiments(await dbTest());
    expect(b.get("0350014P")).toEqual({ anneeConstruction: 1950, ppi: [], operations: [] });
    expect(b.has("0350011L")).toBe(false);
  });
});
