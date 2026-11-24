import { describe, expect, test } from "bun:test";
import { CODES_INDICATEURS, INDICATEURS, LIBELLES_ECOLES_PROCHES as LP, RAYON_ECOLES_PROCHES_KM } from "@obs/shared/libelles";
import type { Db } from "../pipeline/src/db.ts";
import { connexion } from "../pipeline/src/duck.ts";
import { calculerEleves } from "../pipeline/src/eleves.ts";
import {
  calculerClasses, calculerEcolesProches, DEPUIS, rentreeEffectifsEcoles, SEUILS_ISOLEMENT_KM, seuilIsolement,
} from "../pipeline/src/ecoles.ts";
import { distanceKm, FAMILLES_COMPATIBLES_ECOLES } from "../pipeline/src/fiches.ts";
import { calculerIndicateurs, calculerRepartitions } from "../pipeline/src/indicateurs.ts";
import { dbTest, indic } from "./aide.ts";

const db = await dbTest();
const classes = await calculerClasses(db);
const eleves = await calculerEleves(db);
const proches = await calculerEcolesProches(db);

// Coordonnées des fixtures (Annuaire)
const GPS: Record<string, [number, number]> = {
  "0440104D": [47.35, -1.4], "0440108H": [47.23, -1.54], "0440201A": [47.22, -1.55],
  "0440202B": [47.215, -1.56], "0440203C": [47.2205, -1.551],
};
const d = (a: string, b: string) => distanceKm(...GPS[a]!, ...GPS[b]!);
const FERMEES = ["0440106F", "0440107G", "0440109K", "0440110M"];

describe("écoles les plus proches", () => {
  test("seuils de la phrase « Aucune autre école à moins de n km »", () => {
    expect(SEUILS_ISOLEMENT_KM).toEqual([2, 5, 10]);
    // aucune école dans le rayon (null) : la phrase dit le rayon, 50 km
    expect([1.99, 2, 4.99, 5, 9.99, 10, 42, null].map(seuilIsolement)).toEqual([null, 2, 2, 5, 5, 10, 10, 50]);
  });

  test("libellés : phrase, plus proches et leurs absences à moins de 50 km", () => {
    expect(RAYON_ECOLES_PROCHES_KM).toBe(50);
    expect(LP.aucuneAMoinsDe(50)).toBe("Aucune autre école à moins de 50 km");
    expect(LP.aucuneMaternelle).toBe("Aucune école maternelle ou primaire à moins de 50 km");
    expect(LP.aucuneElementaire).toBe("Aucune école élémentaire ou primaire à moins de 50 km");
  });

  test("une entrée par école ouverte, aucune pour le second degré ni pour une école fermée", () => {
    expect([...proches.keys()].sort()).toEqual(["0440104D", "0440105E", "0440108H", "0440201A", "0440202B", "0440203C"]);
  });

  test("0440104D (élémentaire, Saint-Aubin) : écoles élémentaires ou primaires triées par distance, aucune à moins de 10 km", () => {
    const p = proches.get("0440104D")!;
    expect(p.liste.map((e) => e.uai)).toEqual(["0440108H", "0440203C", "0440202B"]);
    expect(p.liste[0]!.distanceKm).toBeCloseTo(d("0440104D", "0440108H"), 9);
    expect(p.liste[0]!.distanceKm).toBeGreaterThan(10);
    // l'école élémentaire du Moulin, fermée, est à moins d'1 km : elle ne compte pas
    expect(p.aucuneAMoinsDe).toBe(10);
    expect(p.plusProcheElementaire!.uai).toBe("0440108H");
    expect(p.plusProcheMaternelle!.uai).toBe("0440108H");
  });

  test("maternelle : liste des maternelles et primaires ; élémentaire ou primaire la plus proche, jamais une maternelle", () => {
    const p = proches.get("0440201A")!;
    expect(p.liste.map((e) => e.uai)).toEqual(["0440203C", "0440108H"]);
    expect(p.aucuneAMoinsDe).toBeNull(); // 0440203C à moins de 2 km
    expect(p.plusProcheElementaire!.uai).toBe("0440203C");
    expect(p.plusProcheMaternelle!.uai).toBe("0440203C");
    const { distanceKm: km, ...premiere } = p.liste[0]!;
    expect(premiere).toEqual({
      uai: "0440203C", nom: "École primaire Sainte-Marie", famille: "primaire", secteur: "prive_sous_contrat", commune: "Nantes",
      eleves: 166, classes: 7,
    });
    expect(km).toBeCloseTo(d("0440201A", "0440203C"), 9);
    for (const [, q] of proches) {
      if (!q) continue;
      expect(q.plusProcheElementaire?.famille).not.toBe("maternelle");
      expect(q.plusProcheMaternelle?.famille).not.toBe("elementaire");
    }
  });

  test("primaire : toutes les écoles, sans elle-même", () => {
    const p = proches.get("0440203C")!;
    expect(p.liste.map((e) => e.uai)).toEqual(["0440201A", "0440202B", "0440108H", "0440104D"]);
    expect(p.plusProcheMaternelle!.uai).toBe("0440201A");
    expect(p.plusProcheElementaire!.uai).toBe("0440202B");
  });

  test("0440105E (sans coordonnées) : null, et absente des listes des autres ; aucune école fermée dans une liste", () => {
    expect(proches.get("0440105E")).toBeNull();
    for (const [, q] of proches) {
      const uais = [...(q?.liste ?? []), q?.plusProcheMaternelle, q?.plusProcheElementaire].map((e) => e?.uai);
      expect(uais).not.toContain("0440105E");
      for (const f of FERMEES) expect(uais).not.toContain(f);
    }
  });

  test("depuis un point : toutes les écoles ouvertes, sans compatibilité ni exclusion", async () => {
    const auBourg = (await calculerEcolesProches(db, { lat: 47.35, lon: -1.4 })).get(DEPUIS)!;
    const attendu = Object.keys(GPS).sort((a, b) => d("0440104D", a) - d("0440104D", b));
    expect(attendu.slice(0, 2)).toEqual(["0440104D", "0440108H"]);
    expect(auBourg.liste.map((e) => e.uai)).toEqual(attendu);
    expect(auBourg.liste[0]!.distanceKm).toBe(0);
    expect(auBourg.aucuneAMoinsDe).toBeNull();
    expect(auBourg.plusProcheMaternelle!.uai).toBe("0440108H");
    expect(auBourg.plusProcheElementaire!.uai).toBe("0440104D");
    // 3,3 km puis 6,7 km de l'école du Bourg
    expect((await calculerEcolesProches(db, { lat: 47.38, lon: -1.4 })).get(DEPUIS)!.aucuneAMoinsDe).toBe(2);
    expect((await calculerEcolesProches(db, { lat: 47.41, lon: -1.4 })).get(DEPUIS)!.aucuneAMoinsDe).toBe(5);
    // au-delà de 50 km : liste vide, aucune école à moins de 50 km
    expect((await calculerEcolesProches(db, { lat: 45, lon: 2 })).get(DEPUIS)).toEqual({
      liste: [], plusProcheMaternelle: null, plusProcheElementaire: null, aucuneAMoinsDe: 50,
    });
  });

  test("élèves et classes de la rentrée demandée seulement (celle du titre de colonne)", async () => {
    const auBourg = async (rentree?: number | null) =>
      (await calculerEcolesProches(db, { lat: 47.35, lon: -1.4 }, rentree)).get(DEPUIS)!.liste.find((e) => e.uai === "0440202B")!;
    expect(await rentreeEffectifsEcoles(db)).toBe(2025);
    expect(await auBourg()).toMatchObject({ eleves: 196, classes: 8 });
    const [, e2020, c2020] = classes.get("0440202B")!.historique.find(([r]) => r === 2020)!;
    expect(await auBourg(2020)).toMatchObject({ eleves: e2020, classes: c2020 });
    expect(await auBourg(1990)).toMatchObject({ eleves: null, classes: null });
    expect(await auBourg(null)).toMatchObject({ eleves: null, classes: null });
  });
});

describe("écoles les plus proches : grille contre recherche exhaustive", () => {
  test("200 points (bords de cases, latitudes d'outre-mer) : mêmes 6 plus proches, même phrase, mêmes plus proches par niveau", async () => {
    // Générateur pseudo-aléatoire déterministe (mulberry32)
    let graine = 20261124;
    const alea = () => {
      graine = (graine + 0x6d2b79f5) | 0;
      let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const FAMILLES = ["maternelle", "elementaire", "primaire"] as const;
    const CENTRES: [number, number][] = [[-21.1, 55.5], [5, -52.5], [16.2, -61.5], [47, 2]];
    const points: [number, number][] = [];
    for (const [lat, lon] of CENTRES) {
      for (let k = 0; k < 35; k++) points.push([lat + (alea() - 0.5) * 0.8, lon + (alea() - 0.5) * 0.8]);
      // Bords des cases des deux passes (10 et 50 km), de part et d'autre
      for (const r of [10, 50]) {
        const pasLat = r / 111;
        const pasLon = r / (111 * Math.cos((52 * Math.PI) / 180));
        const cy = Math.round(lat / pasLat) * pasLat;
        const cx = Math.round(lon / pasLon) * pasLon;
        for (const e of [-1e-7, 1e-7]) {
          points.push([cy + e, lon + (alea() - 0.5) * 0.2], [lat + (alea() - 0.5) * 0.2, cx + e]);
        }
      }
    }
    // Écoles isolées : aucune autre à moins de 50 km
    points.push([-12.8, 45.1], [46.8, -56.2]);
    // Métropole, plus étalée
    for (let k = 0; k < 26; k++) points.push([47 + (alea() - 0.5) * 2, 2 + (alea() - 0.5) * 2]);
    expect(points.length).toBe(200);
    const ecoles = points.map(([lat, lon], k) => ({
      uai: `${String(k).padStart(7, "0")}X`, nom: `École ${k}`, famille: FAMILLES[k % 3]!, secteur: "public", commune: "C", lat, lon,
    }));

    const c = await connexion(null);
    await c.run(
      `create table etablissements as select unnest(from_json($1::json, '[{"uai":"VARCHAR","nom":"VARCHAR","famille":"VARCHAR",
        "secteur":"VARCHAR","commune":"VARCHAR","lat":"DOUBLE","lon":"DOUBLE"}]'), recursive := true)`,
      [JSON.stringify(ecoles)],
    );
    await c.run("create table classes_historique (uai varchar, rentree integer, eleves integer, classes integer, source varchar)");
    const synthetique = {
      async sql<T>(q: string, p?: unknown[]) {
        return (await c.runAndReadAll(q, p as never)).getRowObjectsJS() as T[];
      },
    } as Db;
    const grille = await calculerEcolesProches(synthetique);

    for (const a of ecoles) {
      const autres = ecoles
        .filter((b) => b.uai !== a.uai)
        .map((b) => ({ ...b, d: distanceKm(a.lat, a.lon, b.lat, b.lon) }))
        .filter((b) => b.d <= 50)
        .sort((x, y) => x.d - y.d || x.uai.localeCompare(y.uai));
      const liste = autres.filter((b) => FAMILLES_COMPATIBLES_ECOLES[a.famille].includes(b.famille)).slice(0, 6);
      const g = grille.get(a.uai)!;
      expect({ uai: a.uai, liste: g.liste.map((e) => e.uai), aucune: g.aucuneAMoinsDe }).toEqual({
        uai: a.uai, liste: liste.map((b) => b.uai), aucune: seuilIsolement(liste[0]?.d ?? null),
      });
      expect(g.plusProcheMaternelle?.uai).toBe(autres.find((b) => b.famille !== "elementaire")?.uai);
      expect(g.plusProcheElementaire?.uai).toBe(autres.find((b) => b.famille !== "maternelle")?.uai);
    }
    // le jeu exerce bien les cas : écoles isolées, listes complètes
    expect([...grille.values()].filter((g) => g!.aucuneAMoinsDe === 50).length).toBeGreaterThan(1);
    expect([...grille.values()].filter((g) => g!.liste.length === 6).length).toBeGreaterThan(50);
  });
});

describe("rentrée des jeux du premier degré", () => {
  test("rentree() lit l'année d'un champ date, d'une date en texte ou d'une année", async () => {
    expect(await db.sql(`select rentree(date '2025-09-01') as d, rentree(timestamp '2024-09-01 00:00:00') as t,
      rentree('2023-09-01') as x, rentree('2022') as a`)).toEqual([{ d: 2025, t: 2024, x: 2023, a: 2022 }]);
  });
});

describe("classes des écoles", () => {
  test("total de la dernière rentrée et historique complet, effectifs_ecoles l'emporte sur ecoles_ep", () => {
    const c = classes.get("0440202B")!;
    expect(c).toMatchObject({ rentree: 2025, total: 8 });
    expect(c.historique[0]).toEqual([2011, 180, 8]); // ecoles_ep
    expect(c.historique.at(-1)).toEqual([2025, 196, 8]);
    const rentrees = c.historique.map(([r]) => r);
    expect(rentrees).toEqual(Array.from({ length: 15 }, (_, i) => 2011 + i)); // sans doublon
    expect(c.historique.find(([r]) => r === 2019)).toEqual([2019, 190, 8]); // et non 188 (ecoles_ep)
    expect(c.source).toEqual(["effectifs_ecoles", "classes_ecoles", "ecoles_ep"]);
  });

  test("source de chaque point quand elle change", () => {
    const c = classes.get("0440202B")!;
    expect(c.sourcesHistorique).toEqual([...Array(8).fill("ecoles_ep"), ...Array(7).fill("effectifs_ecoles")]);
    expect(classes.get("0440201A")!.sourcesHistorique).toBeUndefined();
  });

  test("types de classes : nombre de niveaux d'après les segments", () => {
    expect(classes.get("0440104D")!.types).toEqual([{ libelle: "CP-CE1-CE2-CM1-CM2", niveaux: 5, classes: 1 }]);
    expect(classes.get("0440201A")!.types).toEqual([{ libelle: "Preel", niveaux: 1, classes: 4 }]);
    expect(classes.get("0440203C")!.types).toEqual([
      { libelle: "Preel", niveaux: 1, classes: 1 },
      { libelle: "CE1", niveaux: 1, classes: 3 },
      { libelle: "Preel-CP", niveaux: 2, classes: 1 },
      { libelle: "CM1-CM2", niveaux: 2, classes: 2 },
    ]);
  });

  test("typologie non publiée pour la rentrée : null", () => {
    expect(classes.get("0440108H")).toMatchObject({ rentree: 2025, total: 9, types: null, source: ["effectifs_ecoles"] });
  });

  test("école à 0 classe : total 0, pas de typologie", () => {
    expect(classes.get("0440105E")).toMatchObject({ rentree: 2025, total: 0, types: null });
  });

  test("écoles seulement", () => {
    expect(classes.has("0440001A")).toBe(false);
    expect(classes.has("0449999Z")).toBe(false);
  });

  test("UAI sans fiche : comptées dans ecoles_ignorees", async () => {
    expect(await db.sql("select source, n from ecoles_ignorees order by source")).toEqual([{ source: "effectifs_ecoles", n: 1 }]);
  });
});

describe("élèves par classe", () => {
  test("libellé", () => {
    expect(INDICATEURS.eleves_par_classe).toEqual({ libelle: "Élèves par classe", genre: "ratio", decimales: 1 });
    expect(CODES_INDICATEURS).toContain("eleves_par_classe");
  });

  test("classe unique : élèves par classe = élèves", async () => {
    const i = await indic("0440104D", "eleves_par_classe");
    expect(i.mesure).toEqual({ valeur: 10, statut: "ok", source: "effectifs_ecoles", rentree: 2025 });
    expect((await indic("0440104D", "eleves")).mesure.valeur).toBe(10);
  });

  test("0 classe à la dernière rentrée : non disponible à cette rentrée, pas la valeur d'une rentrée antérieure", async () => {
    // 0440105E : 2 classes de 2019 à 2024, 0 en 2025
    const i = await indic("0440105E", "eleves_par_classe");
    expect(i.mesure).toEqual({ valeur: null, statut: "non_disponible", source: null, rentree: 2025 });
    expect(i.historique).toEqual([2019, 2020, 2021, 2022, 2023, 2024].map((r) => [r, 22.5]));
    expect((await indic("0440105E", "eleves")).mesure).toMatchObject({ valeur: 45, rentree: 2025 });
  });

  test("moyennes Σ élèves / Σ classes parmi les écoles de la même famille", async () => {
    // élémentaires publiques de Loire-Atlantique en 2025 : 0440202B (196 / 8) et 0440104D (10 / 1)
    const c = (await indic("0440202B", "eleves_par_classe")).comparaisons.find((x) => x.niveau === "departement")!;
    expect(c.public).toMatchObject({ statut: "ok", rentree: 2025 });
    expect(c.public.valeur).toBeCloseTo(206 / 9, 10);
    expect(c.prive.statut).toBe("non_disponible");
  });
});

describe("indicateurs et répartitions selon la famille", () => {
  test("une école n'a pas les indicateurs propres au second degré", async () => {
    const tous = await calculerIndicateurs(db);
    expect(tous.get("0440202B")!.map((i) => i.code)).toEqual([
      "eleves", "ips", "etp_enseignants", "eleves_par_etp_ens", "part_enseignantes", "part_moins_35", "part_50_plus",
      "part_anciennete_moins_2", "part_anciennete_8_plus", "eleves_par_classe",
    ]);
    expect(tous.get("0440001A")!.map((i) => i.code)).not.toContain("eleves_par_classe");
  });

  test("une école n'a ni statuts, ni filles et garçons, ni langues", async () => {
    const r = (await calculerRepartitions(db)).get("0440202B")!.map((x) => x.code);
    expect(r).toEqual(["sexe_enseignants", "ages", "anciennete"]);
  });
});

describe("élèves des écoles", () => {
  test("primaire : préélémentaire puis CP à CM2, ULIS et UEEA lus", () => {
    const e = eleves.get("0440108H")!;
    expect(e).toMatchObject({ rentree: 2025, total: 216, ulis: 0, ueea: 0, segpa: null, source: ["effectifs_ecoles"] });
    expect(e.niveaux).toEqual([
      { libelle: "Préélémentaire", eleves: 70, filles: null, garcons: null },
      { libelle: "CP", eleves: 28, filles: null, garcons: null },
      { libelle: "CE1", eleves: 28, filles: null, garcons: null },
      { libelle: "CE2", eleves: 28, filles: null, garcons: null },
      { libelle: "CM1", eleves: 28, filles: null, garcons: null },
      { libelle: "CM2", eleves: 34, filles: null, garcons: null },
    ]);
  });

  test("élémentaire : ULIS lus, pas de ligne préélémentaire vide", () => {
    const e = eleves.get("0440202B")!;
    expect(e).toMatchObject({ total: 196, ulis: 6, ueea: 0 });
    expect(e.niveaux.map((n) => n.libelle)).toEqual(["CP", "CE1", "CE2", "CM1", "CM2"]);
  });

  test("maternelle : préélémentaire seulement", () => {
    expect(eleves.get("0440201A")!.niveaux).toEqual([{ libelle: "Préélémentaire", eleves: 102, filles: null, garcons: null }]);
  });

  test("second degré : pas de champ UEEA", () => {
    expect(eleves.get("0440001A")).not.toHaveProperty("ueea");
  });
});
