import { describe, expect, test } from "bun:test";
import type { DonneesTerritoire } from "@obs/shared/donnees";
import { csvTerritoire, nomFamille } from "../site/src/lib/territoire.ts";

const dep = (nom: string, commune = "Nantes"): DonneesTerritoire => ({
  ref: { niveau: "departement", code: "44", libelle: "Loire-Atlantique" },
  parents: [{ niveau: "france", code: "FR", libelle: "France" }, { niveau: "academie", code: "17", libelle: "Nantes" }],
  rentree: 2025, horsContrat: 0, enfants: [], communes: [], budget: { collectivites: [], france: [] }, carte: { genre: "points", points: [] },
  familles: {
    college: {
      compte: { public: 1, prive: 0 }, eleves: { public: 10, prive: null }, ipsMoyen: { public: 100, prive: null, calculee: false },
      ipsHistorique: [], distributionIps: { public: [], prive: [], bornes: [] }, moyennes: [],
      liste: [{ uai: "0440001A", nom, secteur: "public", commune, codeCommune: "44109", ep: null, eleves: 10, elevesParEtpEns: -1.5,
        elevesParEtpVs: null, statutVs: "non_disponible", partEnseignantes: null, ips: 100, reussite: [] }],
    },
  },
});

describe("CSV des territoires", () => {
  test("aucune cellule ne peut être lue comme une formule par un tableur", () => {
    for (const debut of ["=", "+", "-", "@", "\t", "\r"]) {
      const ligne = csvTerritoire(dep(`${debut}HYPERLINK("x")`)).trim().split("\n")[1]!;
      const nom = ligne.split(";")[1]!;
      expect(nom.replace(/^"/, "")).toStartWith("'");
    }
  });

  test("les nombres restent des nombres, même négatifs ; guillemets et retours échappés", () => {
    const ligne = csvTerritoire(dep('Collège "Les Pins"', "Saint-\rNazaire")).trim().split("\n")[1]!;
    expect(ligne).toContain(';"Collège ""Les Pins""";');
    expect(ligne).toContain('"Saint-\rNazaire"');
    expect(ligne).toContain(";-1.5;");
  });

  test("département : session, réussite et valeur ajoutée par source, vides si absentes (jamais 0)", () => {
    const d = dep("Lycée");
    d.familles.college!.liste[0]!.reussite = [
      { voie: "bac_gt", session: 2025, taux: 92, va: -2 },
      { voie: "bac_pro", session: 2025, taux: null, va: null },
    ];
    const [entete, ligne] = csvTerritoire(d).trim().split("\n");
    const cols = entete!.split(";");
    expect(cols.slice(-9)).toEqual([
      "session_brevet", "reussite_brevet", "va_brevet", "session_bac_gt", "reussite_bac_gt", "va_bac_gt",
      "session_bac_pro", "reussite_bac_pro", "va_bac_pro",
    ]);
    expect(ligne!.split(";").slice(-9)).toEqual(["", "", "", "2025", "92", "-2", "2025", "", ""]);
    const brevet = dep("Collège");
    brevet.familles.college!.liste[0]!.reussite = [{ voie: "brevet_general", session: 2025, taux: 80, va: 0 }];
    expect(csvTerritoire(brevet).trim().split("\n")[1]!.split(";").slice(-9)).toEqual(["2025", "80", "0", "", "", "", "", "", ""]);
  });

  test("académie : une ligne par département, point décimal, écart vide si absent", () => {
    const aca: DonneesTerritoire = {
      ...dep("x"),
      ref: { niveau: "academie", code: "17", libelle: "Nantes" },
      parents: [{ niveau: "france", code: "FR", libelle: "France" }],
      familles: {},
      carte: { genre: "departements", valeurs: [] },
      enfants: [
        { ref: { niveau: "departement", code: "44", libelle: "Loire-Atlantique" }, compte: { public: 4, prive: 2 },
          eleves: { public: 3090, prive: 600 }, partPrive: 16.3, ecartIpsColleges: null },
        { ref: { niveau: "departement", code: "49", libelle: "=Maine-et-Loire" }, compte: { public: 1, prive: 0 },
          eleves: { public: null, prive: null }, partPrive: null, ecartIpsColleges: -2.5 },
      ],
    };
    const lignes = csvTerritoire(aca).trim().split("\n");
    expect(lignes[0]).toBe("code;libelle;etablissements_public;etablissements_prive;eleves_public;eleves_prive;part_prive;ecart_ips_colleges");
    expect(lignes[1]).toBe("44;Loire-Atlantique;4;2;3090;600;16.3;");
    expect(lignes[2]).toBe("49;'=Maine-et-Loire;1;0;;;;-2.5");
    expect(lignes).toHaveLength(3);
  });
});

describe("nom des familles dans les phrases", () => {
  test("singulier et pluriel en minuscules, sauf le sigle EREA", () => {
    expect(nomFamille("college", 1)).toBe("collège");
    expect(nomFamille("college", 2)).toBe("collèges");
    expect(nomFamille("legt", 1)).toBe("lycée général et technologique");
    expect(nomFamille("lp", 3)).toBe("lycées professionnels");
    expect(nomFamille("erea", 1)).toBe("EREA");
    expect(nomFamille("erea", 2)).toBe("EREA");
  });
});
