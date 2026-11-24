import { describe, expect, test } from "bun:test";
import { cheminTerritoire, communeDeRattachement } from "@obs/shared/territoires";
import type { Fiche, Identite, Indicateur } from "@obs/shared/types";
import { communesRetenues, libelleListe, controlerPonderation, moyennePonderee, verifierPonderation } from "../pipeline/src/territoires.ts";
import { partPrive } from "../site/src/lib/territoire.ts";
import { identiteTest } from "./aide.ts";

describe("libellé de commune", () => {
  const fiche = (codeCommune: string, commune: string) =>
    ({ codeCommune, commune } as unknown as Fiche);
  test("arrondissement dérivé du code, commune ordinaire inchangée", () => {
    expect(libelleListe(fiche("75115", "Paris"))).toBe("Paris 15e arrondissement");
    expect(libelleListe(fiche("69381", "Lyon"))).toBe("Lyon 1er arrondissement");
    expect(libelleListe(fiche("69389", "Lyon 9e  Arrondissement"))).toBe("Lyon 9e arrondissement");
    expect(libelleListe(fiche("13201", "Marseille"))).toBe("Marseille 1er arrondissement");
    expect(libelleListe(fiche("44109", "Nantes"))).toBe("Nantes");
  });
});

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

/** Fiche minimale : collège public de Nantes, avec IPS et élèves facultatifs. */
const ficheTest = (
  uai: string,
  options: { ips?: number; eleves?: number; rentreeEleves?: number; disparuLe?: string; identite?: Partial<Identite> } = {},
): Fiche => {
  const indicateur = (code: "ips" | "eleves", v: number, rentree = 2025): Indicateur => ({
    code, mesure: { valeur: v, statut: "ok", source: null, rentree }, comparaisons: [], historique: [],
  });
  return {
    ...identiteTest(`Collège ${uai}`), ...options.identite, uai, disparuLe: options.disparuLe ?? null, budget: { france: [] },
    indicateurs: [
      ...(options.ips === undefined ? [] : [indicateur("ips", options.ips)]),
      ...(options.eleves === undefined ? [] : [indicateur("eleves", options.eleves, options.rentreeEleves)]),
    ],
    repartitions: [], eleves: null, voisins: null, sources: [],
  };
};

describe("synthèses de territoire", () => {
  test("moyenne pondérée", () => {
    expect(moyennePonderee([{ valeur: 100, poids: 100 }, { valeur: 130, poids: 300 }])).toBe(122.5);
    expect(moyennePonderee([])).toBeNull();
    expect(moyennePonderee([{ valeur: 90, poids: 0 }])).toBeNull();
  });

  test("communes retenues : au moins trois établissements actifs", () => {
    const avecDisparu = [ficheTest("0440101A"), ficheTest("0440102B"), ficheTest("0440103C", { disparuLe: "2026-10-01" })];
    expect(communesRetenues(avecDisparu).has("44109")).toBe(false);
    const actifs = [ficheTest("0440101A"), ficheTest("0440102B"), ficheTest("0440103C")];
    expect(communesRetenues(actifs).get("44109")!.map((f) => f.uai)).toEqual(["0440101A", "0440102B", "0440103C"]);
  });

  test("communes retenues : les arrondissements sont rattachés à leur commune", () => {
    const paris = (uai: string, codeCommune: string) =>
      ficheTest(uai, { identite: { codeCommune, commune: "Paris", dep: "75", depLibelle: "Paris" } });
    const r = communesRetenues([paris("0750001A", "75115"), paris("0750002B", "75107"), paris("0750003C", "75107")]);
    expect([...r.keys()]).toEqual(["75056"]);
    expect(r.has("75115")).toBe(false);
  });

  test("contrôle de la pondération face aux moyennes de la DEPP", () => {
    const actives = [ficheTest("0440101A", { ips: 100, eleves: 100 }), ficheTest("0440102B", { ips: 130, eleves: 300 })];
    const depp = (pub: number) => new Map([["college|44", { famille: "college" as const, territoire: "44", pub, priv: null }]]);
    expect(controlerPonderation(actives, depp(122.5), 2025)).toEqual({ n: 1, mediane: 0, p90: 0 });
    expect(controlerPonderation(actives, depp(115), 2025).mediane).toBe(7.5);
  });

  test("contrôle de la pondération : écart mesuré sur la moyenne non arrondie, à 0,01 près", () => {
    // (100 × 1 + 101 × 2) / 3 = 100,666… : arrondie à 100,7 pour l'affichage, écart de 0,67 face à 100
    const actives = [ficheTest("0440101A", { ips: 100, eleves: 1 }), ficheTest("0440102B", { ips: 101, eleves: 2 })];
    expect(moyennePonderee([{ valeur: 100, poids: 1 }, { valeur: 101, poids: 2 }])).toBe(100.7);
    const depp = new Map([["college|44", { famille: "college" as const, territoire: "44", pub: 100, priv: null }]]);
    expect(controlerPonderation(actives, depp, 2025)).toEqual({ n: 1, mediane: 0.67, p90: 0.67 });
  });

  test("contrôle de la pondération : seuls les élèves de la dernière rentrée pondèrent", () => {
    const actives = [
      ficheTest("0440101A", { ips: 100, eleves: 100 }),
      ficheTest("0440102B", { ips: 130, eleves: 300, rentreeEleves: 2024 }), // effectifs d'une rentrée ancienne : ignoré
    ];
    const depp = new Map([["college|44", { famille: "college" as const, territoire: "44", pub: 100, priv: null }]]);
    expect(controlerPonderation(actives, depp, 2025)).toEqual({ n: 1, mediane: 0, p90: 0 });
  });

  test("garde de la pondération : n = 0 ou écarts au-delà des seuils font échouer", () => {
    expect(() => verifierPonderation({ n: 0, mediane: 0, p90: 0 })).toThrow(/aucun groupe/);
    expect(() => verifierPonderation({ n: 10, mediane: 0.3, p90: 0.5 })).toThrow(/10 groupes, écart médian 0.3, 90e centile 0.5/);
    expect(() => verifierPonderation({ n: 10, mediane: 0.1, p90: 1.2 })).toThrow();
    expect(verifierPonderation({ n: 746, mediane: 0.06, p90: 0.52 })).toBe("746 groupes, écart médian 0.06, 90e centile 0.52");
  });
});

describe("part du privé d'un territoire", () => {
  test("zéro sans établissement privé, tiret si élèves inconnus", () => {
    expect(partPrive({ public: 500, prive: null }, true)).toBe(0);
    expect(partPrive({ public: 500, prive: null }, false)).toBeNull();
    expect(partPrive({ public: null, prive: null }, true)).toBeNull();
    expect(partPrive({ public: 300, prive: 100 })).toBe(25);
  });
});
