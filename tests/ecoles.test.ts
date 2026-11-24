import { describe, expect, test } from "bun:test";
import { CODES_INDICATEURS, INDICATEURS } from "@obs/shared/libelles";
import { calculerEleves } from "../pipeline/src/eleves.ts";
import { calculerClasses } from "../pipeline/src/ecoles.ts";
import { calculerIndicateurs, calculerRepartitions } from "../pipeline/src/indicateurs.ts";
import { dbTest, indic } from "./aide.ts";

const db = await dbTest();
const classes = await calculerClasses(db);
const eleves = await calculerEleves(db);

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
