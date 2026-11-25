import { describe, expect, test } from "bun:test";
import type { Fiche, Indicateur, Mesure, SourceRef } from "@obs/shared/types";
import { sourcesVitrine, tuilesVitrine, vitrineDe } from "../site/src/lib/vitrine.ts";

const ref = (id: string, pageUrl: string, producteur = "MEN-DEPP"): SourceRef =>
  ({ id, producteur, titre: `Jeu ${id}`, pageUrl, rentree: 2025, collecteLe: "2026-11-25T02:00:00Z", brutUrl: "x" }) as SourceRef;
const mesure = (valeur: number | null, source: string, statut = "ok"): Mesure => ({ valeur, statut, source, rentree: 2025 }) as Mesure;
const ind = (code: string, m: Mesure, extra: Partial<Indicateur> = {}): Indicateur =>
  ({ code, mesure: m, comparaisons: [], historique: m.valeur === null ? [] : [[2025, m.valeur]], ...extra }) as Indicateur;

/** Fiche réduite aux champs que lit la vitrine. */
function ficheMinimale(partiel: Partial<Fiche>): Fiche {
  return {
    uai: "0440001A", nom: "Collège Essai", famille: "college", secteur: "public", commune: "Nantes", dep: "44",
    disparuLe: null, fermeLe: null, indicateurs: [], repartitions: [], resultats: [], sources: [],
    budget: { france: [] }, ...partiel,
  } as unknown as Fiche;
}

describe("sources de la vitrine", () => {
  test("dédoublonnées par page d'origine, numérotées 1..N", () => {
    const s = sourcesVitrine(ficheMinimale({
      sources: [ref("annuaire", "https://data.education.gouv.fr/a", "MEN"), ref("budget_2024", "https://data.economie.gouv.fr/b", "DGFiP"),
        ref("transport_2024", "https://data.economie.gouv.fr/b", "DGFiP"), ref("ivac", "https://data.education.gouv.fr/v")],
    }));
    expect(s.map((x) => x.numero)).toEqual([1, 2, 3]);
    expect(s.map((x) => x.id)).toEqual(["annuaire", "budget_2024", "ivac"]);
    expect(s[1]!.portail).toBe("data.economie.gouv.fr");
    expect(s[2]!.producteur).toBe("DEPP");
    expect(s[0]!.precision).toBe("relu chaque nuit");
    expect(s[2]!.precision).toBeUndefined();
  });
});

describe("tuiles de la vitrine", () => {
  test("fiche privée sans IPS ni budget : tuiles omises, jamais de zéro", () => {
    const f = ficheMinimale({
      secteur: "prive_sous_contrat",
      sources: [ref("effectifs_colleges", "https://data.education.gouv.fr/e")],
      indicateurs: [ind("eleves", mesure(452, "effectifs_colleges")), ind("ips", mesure(null, "ips_colleges", "non_publie"))],
    });
    const t = tuilesVitrine(f, sourcesVitrine(f));
    expect(t.map((x) => x.libelle).some((l) => l.startsWith("IPS"))).toBe(false);
    expect(t.map((x) => x.libelle).some((l) => l.startsWith("Fonctionnement"))).toBe(false);
    expect(t.every((x) => x.valeur !== "0")).toBe(true);
    expect(t[0]!.valeur).toBe("452");
    expect(t[0]!.numeros).toEqual([1]);
  });

  test("IPS sur deux jeux : deux pastilles et « deux séries raboutées »", () => {
    const f = ficheMinimale({
      sources: [ref("ips_colleges_2016", "https://data.education.gouv.fr/i16"), ref("ips_colleges", "https://data.education.gouv.fr/i22")],
      indicateurs: [ind("ips", mesure(103, "ips_colleges"), {
        historique: [[2016, 101], [2025, 103]], sourcesHistorique: ["ips_colleges_2016", "ips_colleges"],
      })],
    });
    const ips = tuilesVitrine(f, sourcesVitrine(f)).find((x) => x.libelle.startsWith("IPS"))!;
    expect(ips.numeros).toEqual([1, 2]);
    expect(ips.libelle).toContain("deux séries raboutées");
    expect(ips.large).toBe(true);
  });
});

describe("tuile sans source citée", () => {
  test("une tuile dont aucune source n'est citée par la fiche est omise", () => {
    const f = ficheMinimale({
      sources: [ref("effectifs_colleges", "https://data.education.gouv.fr/e")],
      indicateurs: [ind("eleves", mesure(452, "effectifs_colleges"))],
      ecolesDuSecteur: [{ uai: "0440100A", nom: "École A" }] as unknown as Fiche["ecolesDuSecteur"],
    });
    const t = tuilesVitrine(f, sourcesVitrine(f));
    expect(t.map((x) => x.libelle)).toEqual(["Élèves · 2025"]);
    expect(t.every((x) => x.numeros.length > 0)).toBe(true);
  });

  test("une tuile perdue faute de source citée est signalée au build", () => {
    const avertissements: string[] = [];
    const avant = console.warn;
    console.warn = (m: string) => { avertissements.push(m); };
    try {
      const f = ficheMinimale({
        sources: [ref("effectifs_colleges", "https://data.education.gouv.fr/e")],
        indicateurs: [ind("eleves", mesure(452, "effectifs_colleges"))],
        ecolesDuSecteur: [{ uai: "0440100A", nom: "École A" }] as unknown as Fiche["ecolesDuSecteur"],
      });
      tuilesVitrine(f, sourcesVitrine(f));
    } finally { console.warn = avant; }
    expect(avertissements.some((m) => m.includes("Secteur de recrutement"))).toBe(true);
  });
});

describe("chargement", () => {
  test("UAI inconnu : pas de vitrine", () => {
    expect(vitrineDe("9999999Z", () => [], () => { throw new Error("absente"); })).toBeNull();
  });
});
