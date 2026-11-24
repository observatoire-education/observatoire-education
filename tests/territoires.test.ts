import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cheminTerritoire, communeDeRattachement } from "@obs/shared/territoires";
import type { Fiche, Identite, Indicateur } from "@obs/shared/types";
import { assemblerFiches } from "../pipeline/src/fiches.ts";
import {
  communesRetenues, ecolesDesCommunes, type EcolesDUneCommune, libelleListe, controlerPonderation, moyennePonderee, verifierPonderation,
} from "../pipeline/src/territoires.ts";
import { partPrive } from "../site/src/lib/territoire.ts";
import { dbTest, FIXTURES, identiteTest, manifestTest } from "./aide.ts";

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
    ...identiteTest(`Collège ${uai}`), ...options.identite, uai, disparuLe: options.disparuLe ?? null, fermeLe: null, successeurs: [], predecesseurs: [], budget: { france: [] },
    indicateurs: [
      ...(options.ips === undefined ? [] : [indicateur("ips", options.ips)]),
      ...(options.eleves === undefined ? [] : [indicateur("eleves", options.eleves, options.rentreeEleves)]),
    ],
    repartitions: [], eleves: null, voisins: null, resultats: [], sources: [],
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

  test("contrôle de la pondération : un IPS d'une autre rentrée que la dernière n'entre pas", () => {
    const actives = [ficheTest("0440101A", { ips: 100, eleves: 100 }), ficheTest("0440102B", { ips: 130, eleves: 300 })];
    const depp = new Map([["college|44", { famille: "college" as const, territoire: "44", pub: 122.5, priv: null }]]);
    expect(controlerPonderation(actives, depp, 2025, 2026).n).toBe(0); // IPS de 2025, dernière rentrée d'IPS : 2026
    expect(controlerPonderation(actives, depp, 2025, 2025).n).toBe(1);
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

describe("écoles des communes (pages commune étendues)", () => {
  let parCommune: Map<string, EcolesDUneCommune>;
  beforeAll(async () => {
    const db = await dbTest();
    const dossier = await mkdtemp(join(tmpdir(), "obs-territoires-"));
    const fiches = await assemblerFiches(db, manifestTest(dossier), {}, new Date("2026-11-23T02:17:00Z"));
    const avant = process.env.OBS_CONTOURS;
    process.env.OBS_CONTOURS = join(FIXTURES, "contours");
    try {
      parCommune = await ecolesDesCommunes(db, fiches.filter((f) => f.disparuLe === null));
    } finally {
      if (avant === undefined) delete process.env.OBS_CONTOURS;
      else process.env.OBS_CONTOURS = avant;
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("une entrée par commune d'aujourd'hui qui a ou a eu une école depuis 2012 ; aucune pour un code disparu", () => {
    expect([...parCommune.keys()].sort()).toEqual(["44109", "44150", "44903"]);
  });

  test("Saint-Aubin : écoles ouvertes, jamais « plus d'école » ; Le Moulin a sa partie, avec son école fermée", () => {
    const c = parCommune.get("44150")!;
    expect(c.libelle).toBe("Saint-Aubin");
    expect(c.dep).toEqual({ code: "44", libelle: "Loire-Atlantique" });
    const e = c.ecoles;
    expect(e.plusDEcoleDepuis).toBeNull();
    expect(e.plusProches).toBeNull();
    expect(e.ecoles.map((x) => [x.uai, x.classes])).toEqual([["0440104D", 1], ["0440105E", null]]); // 0 classe : absence
    const moulin = { uai: "0440106F", nom: "École élémentaire du Moulin", fermeLe: "2016-07-05", famille: "elementaire" as const, ancienneCommune: "Le Moulin" };
    expect(e.fermees).toEqual([moulin]);
    // pas de partie pour le chef-lieu (même code que la commune nouvelle) : ce code ne dit pas de quelle commune déléguée vient l'école
    expect(e.deleguees).toEqual([{ code: "44999", nom: "Le Moulin", fermees: [moulin] }]);
    expect(e.rentrees).toEqual({ eleves: 2025, ips: 2024 });
  });

  test("historique de la commune : somme des écoles, ouvertes et fermées, par rentrée", () => {
    expect(parCommune.get("44150")!.ecoles.historique).toEqual([
      [2014, 70, 3], [2015, 70, 3],
      [2019, 55, 3], [2020, 55, 3], [2021, 55, 3], [2022, 55, 3], [2023, 55, 3], [2024, 55, 3], [2025, 55, 1],
    ]);
  });

  test("Val-de-l'Erdre : plus d'école depuis 2018, école fermée sans fiche avec son ancienne commune, écoles proches depuis le centre", () => {
    const c = parCommune.get("44903")!;
    expect(c.libelle).toBe("Val-de-l'Erdre");
    const e = c.ecoles;
    expect(e.ecoles).toEqual([]);
    expect(e.plusDEcoleDepuis).toBe(2018);
    expect(e.fermees).toEqual([
      { uai: "0440111N", nom: "École maternelle des Landes", fermeLe: "2018-07-06", famille: "maternelle", ancienneCommune: "Les Landes", sansFiche: true },
    ]);
    expect(e.deleguees).toEqual([]);
    // centre du contour (carré de test) : 47,25 ; −1,25. L'école du Bourg, la plus proche, est à plus de 10 km.
    expect(e.plusProches!.liste[0]!.uai).toBe("0440104D");
    expect(e.plusProches!.aucuneAMoinsDe).toBe(10);
    expect(e.points).toEqual([]);
  });

  test("Nantes : écoles fermées triées par date ; points de la carte des écoles", () => {
    const e = parCommune.get("44109")!.ecoles;
    expect(e.fermees.map((f) => [f.uai, f.fermeLe])).toEqual([
      ["0440110M", "2013-07-05"], ["0440109K", "2019-07-04"], ["0440107G", "2019-07-04"],
    ]);
    expect(e.fermees.every((f) => f.ancienneCommune === undefined)).toBe(true);
    expect(e.plusDEcoleDepuis).toBeNull();
    expect(e.points.map((p) => p.uai).sort()).toEqual(["0440108H", "0440201A", "0440202B", "0440203C"]);
  });
});
