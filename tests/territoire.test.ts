import { describe, expect, test } from "bun:test";
import type { DonneesTerritoire } from "@obs/shared/donnees";
import { csvDepartement } from "../site/src/lib/territoire.ts";

const dep = (nom: string, commune = "Nantes"): DonneesTerritoire => ({
  ref: { niveau: "departement", code: "44", libelle: "Loire-Atlantique" },
  parents: [{ niveau: "france", code: "FR", libelle: "France" }, { niveau: "academie", code: "17", libelle: "Nantes" }],
  rentree: 2025, horsContrat: 0, enfants: [], communes: [], carte: { genre: "points", points: [] },
  familles: {
    college: {
      compte: { public: 1, prive: 0 }, eleves: { public: 10, prive: null }, ipsMoyen: { public: 100, prive: null, calculee: false },
      distributionIps: { public: [], prive: [], bornes: [] }, moyennes: [],
      liste: [{ uai: "0440001A", nom, secteur: "public", commune, ep: null, eleves: 10, elevesParEtpEns: -1.5,
        elevesParEtpVs: null, statutVs: "non_disponible", partEnseignantes: null, ips: 100 }],
    },
  },
});

describe("CSV des départements", () => {
  test("aucune cellule ne peut être lue comme une formule par un tableur", () => {
    for (const debut of ["=", "+", "-", "@", "\t", "\r"]) {
      const ligne = csvDepartement(dep(`${debut}HYPERLINK("x")`)).trim().split("\n")[1]!;
      const nom = ligne.split(";")[1]!;
      expect(nom.replace(/^"/, "")).toStartWith("'");
    }
  });

  test("les nombres restent des nombres, même négatifs ; guillemets et retours échappés", () => {
    const ligne = csvDepartement(dep('Collège "Les Pins"', "Saint-\rNazaire")).trim().split("\n")[1]!;
    expect(ligne).toContain(';"Collège ""Les Pins""";');
    expect(ligne).toContain('"Saint-\rNazaire"');
    expect(ligne).toContain(";-1.5;");
  });
});
