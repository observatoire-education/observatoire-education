import { describe, expect, test } from "bun:test";
import { cheminTerritoire, communeDeRattachement } from "@obs/shared/territoires";
import type { Fiche, Identite, Indicateur } from "@obs/shared/types";
import { communesRetenues, controlerPonderation, moyennePonderee } from "../pipeline/src/territoires.ts";
import { identiteTest } from "./aide.ts";

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
  options: { ips?: number; eleves?: number; disparuLe?: string; identite?: Partial<Identite> } = {},
): Fiche => {
  const indicateur = (code: "ips" | "eleves", v: number): Indicateur => ({
    code, mesure: { valeur: v, statut: "ok", source: null, rentree: 2025 }, comparaisons: [], historique: [],
  });
  return {
    ...identiteTest(`Collège ${uai}`), ...options.identite, uai, disparuLe: options.disparuLe ?? null,
    indicateurs: [
      ...(options.ips === undefined ? [] : [indicateur("ips", options.ips)]),
      ...(options.eleves === undefined ? [] : [indicateur("eleves", options.eleves)]),
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
    expect(controlerPonderation(actives, depp(122.5))).toEqual({ n: 1, mediane: 0, p90: 0 });
    expect(controlerPonderation(actives, depp(115)).mediane).toBe(7.5);
  });
});
