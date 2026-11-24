import { beforeAll, describe, expect, test } from "bun:test";
import { centreCommune, chargerCommunes, type TableCommunes } from "../pipeline/src/communes.ts";
import { dbTest } from "./aide.ts";

let table: TableCommunes;
beforeAll(async () => {
  table = await chargerCommunes(await dbTest());
});

describe("commune d'aujourd'hui (Code officiel géographique)", () => {
  test("une commune déléguée est rangée sous sa commune nouvelle", () => {
    expect(table.actuelle("44999")).toBe("44150");
  });

  test("une commune en vigueur garde son code", () => {
    expect(table.actuelle("44109")).toBe("44109");
    // chef-lieu d'une commune nouvelle : même code que sa commune déléguée
    expect(table.actuelle("44150")).toBe("44150");
  });

  test("chaîne de fusions : A → B en 2016, B → C en 2019, puis commune déléguée B supprimée", () => {
    expect(table.actuelle("44901")).toBe("44903");
    expect(table.actuelle("44902")).toBe("44903");
  });

  test("arrondissement municipal : la commune, comme les pages commune existantes", () => {
    expect(table.actuelle("75101")).toBe("75056");
  });

  test("code inconnu du Code officiel géographique : inchangé", () => {
    expect(table.actuelle("44777")).toBe("44777");
  });
});

describe("communes déléguées d'une commune nouvelle", () => {
  test("Saint-Aubin : ses communes déléguées, triées par nom", () => {
    expect(table.deleguees("44150")).toEqual([
      { code: "44999", nom: "Le Moulin" },
      { code: "44150", nom: "Saint-Aubin" },
    ]);
  });

  test("aucune pour une commune sans commune déléguée, ni pour un arrondissement", () => {
    expect(table.deleguees("44109")).toEqual([]);
    expect(table.deleguees("75056")).toEqual([]);
  });
});

describe("centre d'une commune", () => {
  test("centroïde du contour de Nantes", () => {
    const c = centreCommune("44109");
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(47.23, 1);
    expect(c!.lon).toBeCloseTo(-1.55, 1);
  });

  test("aucun contour : null", () => {
    expect(centreCommune("44999")).toBeNull();
    expect(centreCommune("99999")).toBeNull();
  });
});
