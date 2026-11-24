import { describe, expect, test } from "bun:test";
import { REPARTITIONS } from "@obs/shared/libelles";
import { colonnesDe, JEUX_EFFECTIFS } from "../pipeline/src/colonnes-eleves.ts";
import { calculerEleves } from "../pipeline/src/eleves.ts";
import { SOURCES } from "../pipeline/src/sources.ts";
import { dbTest } from "./aide.ts";

const db = await dbTest();
const eleves = await calculerEleves(db);

describe("élèves par niveau et par sexe", () => {
  test("collège : niveaux et sexe", () => {
    const e = eleves.get("0440001A")!;
    expect(e).toMatchObject({ rentree: 2025, total: 590, segpa: 48, ulis: 12, source: ["effectifs_colleges"] });
    expect(e.niveaux).toHaveLength(4);
    expect(e.niveaux[0]).toEqual({ libelle: "6e", eleves: 150, filles: 76, garcons: 74 });
    expect(e.niveaux.map((n) => n.libelle)).toEqual(["6e", "5e", "4e", "3e"]);
  });

  test("LPO somme GT et pro", () => {
    const e = eleves.get("0440006F")!;
    expect(e.total).toBe(1000);
    expect(e.source).toEqual(["effectifs_lycees_gt", "effectifs_lycees_pro"]);
    expect(e.niveaux.map((n) => n.libelle)).toContain("Seconde pro");
    expect(e.niveaux.find((n) => n.libelle === "Seconde pro")!.eleves).toBe(100);
    expect(e.segpa).toBeNull(); // pas de SEGPA dans les jeux des lycées : absent, pas 0
  });

  test("lycée GT : filles en seconde", () => {
    expect(eleves.get("0440003C")!.niveaux[0]).toEqual({ libelle: "Seconde GT", eleves: 400, filles: 210, garcons: 190 });
  });

  test("valeur absente : aucune somme partielle", () => {
    const e = eleves.get("0440003C")!;
    expect(e.niveaux.find((n) => n.libelle === "Terminale")).toEqual({
      libelle: "Terminale", eleves: null, filles: null, garcons: null,
    });
    expect(e.total).toBe(1200); // le total vient de la source, pas de la somme des niveaux
  });

  test("voie sans élève : 0 fille certain, même si la source laisse la case vide", () => {
    // Première = G (350 : 180 F) + STI2D (50 : 10 F) ; STL, STMG… valent 0 avec filles vides
    expect(eleves.get("0440003C")!.niveaux.find((n) => n.libelle === "Première")).toEqual({
      libelle: "Première", eleves: 400, filles: 190, garcons: 210,
    });
  });

  test("voie avec élèves mais sans répartition publiée : filles inconnues", () => {
    // seconde GT de 200 élèves, filles et garçons non publiés (secret statistique)
    expect(eleves.get("0440006F")!.niveaux.find((n) => n.libelle === "Seconde GT")).toEqual({
      libelle: "Seconde GT", eleves: 200, filles: null, garcons: null,
    });
  });

  test("dernière rentrée seulement ; collège sans détail", () => {
    const e = eleves.get("0440002B")!;
    expect(e).toMatchObject({ rentree: 2025, total: 600, segpa: null });
    expect(e.niveaux.every((n) => n.eleves === null)).toBe(true);
  });

  test("hors périmètre et sans effectifs : absents", () => {
    expect(eleves.has("0440004D")).toBe(false); // hors contrat
    expect(eleves.has("0440007G")).toBe(false); // aucune ligne d'effectifs
  });
});

describe("tables d'effectifs", () => {
  test("historique des totaux", async () => {
    expect(await db.sql("select rentree, eleves from effectifs where uai = '0440001A' order by rentree")).toEqual([
      { rentree: 2019, eleves: 500 },
      { rentree: 2024, eleves: 600 },
      { rentree: 2025, eleves: 590 },
    ]);
  });

  test("filles et garçons de l'établissement : somme des niveaux, sinon null", async () => {
    expect(await db.sql("select filles, garcons from effectifs where uai = '0440001A' and rentree = 2025")).toEqual([
      { filles: 290, garcons: 300 },
    ]);
    expect(await db.sql("select filles from effectifs where uai = '0440003C'")).toEqual([{ filles: null }]); // Terminale inconnue
  });

  test("langues vivantes du collège", async () => {
    const lv = await db.sql<{ rang: number; langue: string; eleves: number }>(
      "select rang, langue, eleves from lv where uai = '0440001A' and rentree = 2025 order by rang, ordre",
    );
    expect(lv.filter((l) => l.rang === 1)).toEqual([
      { rang: 1, langue: "Anglais", eleves: 574 },
      { rang: 1, langue: "Allemand", eleves: 10 },
      { rang: 1, langue: "Espagnol", eleves: 6 },
      { rang: 1, langue: "Autres", eleves: 0 },
    ]);
    expect(lv.filter((l) => l.rang === 2).map((l) => l.langue)).toEqual([...REPARTITIONS.lv2.categories]);
  });
});

describe("cohérence des définitions", () => {
  test("les colonnes requises sont exactement celles que lit le calcul", () => {
    for (const j of JEUX_EFFECTIFS) expect(SOURCES[j.source]!.colonnesRequises).toEqual(colonnesDe(j));
  });

  test("ordres uniques et langues alignées sur les répartitions", () => {
    const ordres = JEUX_EFFECTIFS.flatMap((j) => j.niveaux.map((n) => n.ordre));
    expect(new Set(ordres).size).toBe(ordres.length);
    const lv1 = JEUX_EFFECTIFS[0].langues.filter((l) => l.rang === 1).map((l) => l.langue);
    expect(lv1).toEqual([...REPARTITIONS.lv1.categories]);
  });
});
