import { describe, expect, test } from "bun:test";
import type { Batiment, Fiche } from "@obs/shared/types";
import { calculerBatiments, lignesTravaux, surfacesParDecennie } from "../pipeline/src/batiments.ts";
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

describe("lignesTravaux", () => {
  const f = (uai: string, nom: string, batiment?: Batiment) =>
    ({ uai, nom, commune: "Nantes", famille: "legt", ...(batiment ? { batiment } : {}) }) as unknown as Fiche;

  test("une ligne par établissement de la région, sommes et année la plus récente", () => {
    const l = lignesTravaux([
      f("B", "Lycée B", {
        anneeConstruction: 1965,
        batiments: [],
        ppi: [
          { ppi: "2001/2006", intitule: "x", enveloppeMeur: 10, etat: "Opération livrée", anneeIndividualisation: 2005, anneeLivraison: 2009 },
          { ppi: "2012/2022", intitule: "y", enveloppeMeur: null, etat: null, anneeIndividualisation: 2016, anneeLivraison: null },
        ],
        operations: [{ intitule: "z", premiereAnnee: 2021, derniereAnnee: 2023, montantVote: 500000, decisions: 2 }],
      }),
      f("A", "Lycée A", { anneeConstruction: 1990, batiments: [], ppi: [], operations: [] }),
      f("C", "Lycée C"),
    ])!;
    expect(l.map((x) => x.uai)).toEqual(["A", "B"]);
    expect(l[0]).toMatchObject({ anneeConstruction: 1990, ppi: 0, enveloppePpiMeur: null, operations: 0, montantVote: null, derniereAnnee: null });
    expect(l[1]).toMatchObject({ ppi: 2, enveloppePpiMeur: 10, operations: 1, montantVote: 500000, derniereAnnee: 2023 });
  });

  test("Bretagne : nombre de bâtiments, surface bâtie et plus ancien ; surface par décennie", () => {
    const bat = (annee: number | null, surface: number | null) => ({ libelle: "x", nom: null, fonction: null, annee, surface, niveaux: null });
    const fiches = [
      f("D", "Lycée D", { anneeConstruction: 1962, batiments: [bat(1962, 3600), bat(1998, 3200), bat(1965, 400), bat(null, 100)], ppi: [], operations: [] }),
      f("E", "Lycée E", { anneeConstruction: 1990, batiments: [bat(1991, 1000)], ppi: [], operations: [] }),
    ];
    expect(lignesTravaux(fiches)![0]).toMatchObject({ batiments: 4, surfaceBatie: 7300, anneePlusAncien: 1962 });
    // bâtiment sans année : hors des décennies
    expect(surfacesParDecennie(fiches)).toEqual([{ decennie: 1960, surface: 4000 }, { decennie: 1990, surface: 4200 }]);
    expect(surfacesParDecennie([f("C", "Lycée C")])).toBeUndefined();
  });

  test("aucun établissement avec des données : undefined", () => {
    expect(lignesTravaux([f("C", "Lycée C")])).toBeUndefined();
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
    expect(b.get("0350014P")).toEqual({ anneeConstruction: 1950, batiments: [], ppi: [], operations: [] });
    expect(b.has("0350013N")).toBe(false);
  });

  test("Bretagne : bâtiments un par un, hors site exclus ; année du lycée = celle du plus grand bâtiment", async () => {
    const g = (await calculerBatiments(await dbTest())).get("0350011L")!;
    expect(g.batiments.map((x) => [x.libelle, x.annee, x.surface])).toEqual([
      ["A-EXTERNAT", 1962, 3600], ["B-INTERNAT", 1998, 3200], ["M-ABRIS 2R", 2006, 60],
    ]);
    expect(g.batiments[1]).toMatchObject({ nom: "Bâtiment Vauban", fonction: "Internat", niveaux: 4 });
    expect(g.anneeConstruction).toBe(1962);
    expect(g.ppi).toEqual([]);
    expect(g.operations).toEqual([]);
  });

  test("Bretagne : bâtiment sans année ni surface, gardé, année du lycée inconnue", async () => {
    const g = (await calculerBatiments(await dbTest())).get("0350012M")!;
    expect(g.batiments).toEqual([{ libelle: "A-EXTERNAT", nom: null, fonction: "Externat", annee: null, surface: null, niveaux: 2 }]);
    expect(g.anneeConstruction).toBeNull();
  });
});
