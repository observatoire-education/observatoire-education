import { describe, expect, test } from "bun:test";
import type { ExerciceTransport } from "@obs/shared/donnees";
import { svgEvolutionTransport } from "../site/src/lib/plot.ts";
import { exerciceArret, montantRecent, uniteTransport } from "../site/src/lib/transport.ts";

const ex = (exercice: number, fonctionnement: number | null): ExerciceTransport =>
  ({ exercice, fonctionnement, investissement: null, produitsServices: null });

/** Département du Cantal : quelques milliers d'euros en 2020 et 2021, plus rien ensuite. */
const cantal = [ex(2020, 10_541), ex(2021, 5_940), ex(2022, null), ex(2023, null), ex(2024, null), ex(2025, null)];

describe("unité des montants de transport", () => {
  test("k€ sous le million, M€ au-delà", () => {
    expect(uniteTransport(cantal)).toEqual({ unite: "k€", diviseur: 1e3 });
    expect(uniteTransport([ex(2024, 156_000_000)])).toEqual({ unite: "M€", diviseur: 1e6 });
    expect(uniteTransport([ex(2024, -50_000)])).toEqual({ unite: "k€", diviseur: 1e3 });
  });
});

describe("courbe d'évolution", () => {
  test("petits montants : axe en k€, aucune graduation dupliquée à 0", () => {
    const s = svgEvolutionTransport(cantal);
    expect(s).toContain("en k€");
    expect(s).toContain("2021 5,9 k€");
    const graduations = [...s.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!).filter((t) => !/^20\d\d$/.test(t));
    expect(new Set(graduations).size).toBe(graduations.length);
  });

  test("gros montants : axe en M€", () => {
    expect(svgEvolutionTransport([ex(2023, 140_000_000), ex(2024, 156_000_000)])).toContain("en M€");
  });
});

describe("dernier montant d'un groupement", () => {
  test("son propre dernier exercice, pas celui du total", () => {
    expect(montantRecent([ex(2024, 5_716), ex(2025, null)], "fonctionnement")).toEqual({ exercice: 2024, montant: 5_716 });
    expect(montantRecent([ex(2024, null)], "fonctionnement")).toBeNull();
  });
});

describe("arrêt des déclarations", () => {
  test("exercice qui suit le dernier montant, s'il en manque à la fin", () => {
    expect(exerciceArret(cantal)).toBe(2022);
    expect(exerciceArret([ex(2024, 1), ex(2025, 2)])).toBeNull();
    expect(exerciceArret([ex(2024, null), ex(2025, null)])).toBeNull();
  });
});
