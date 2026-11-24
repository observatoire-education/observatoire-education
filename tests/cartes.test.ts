import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { LIBELLES_BUDGET } from "@obs/shared/libelles";

process.env.OBS_CONTOURS = join(import.meta.dir, "fixtures", "contours");
const { contourCommune, contourDepartement, contoursDepartements, communesDuDepartement, formesCollectivites } = await import("../site/src/lib/contours.ts");

describe("contours", () => {
  test("un département connu a un contour, un département inconnu non", () => {
    expect(contourDepartement("44")).not.toBeNull();
    expect(contourDepartement("2A")?.properties?.code).toBe("2A");
    expect(contourDepartement("99")).toBeNull();
  });

  test("les départements peuvent être filtrés par code", () => {
    expect(contoursDepartements().features).toHaveLength(2);
    expect(contoursDepartements(["2A"]).features.map((f) => f.properties?.code)).toEqual(["2A"]);
  });

  test("les communes d'un département", () => {
    const c = communesDuDepartement("44");
    expect(c.features).toHaveLength(2);
    expect(c.features.every((f) => f.properties?.dep === "44")).toBe(true);
    expect(communesDuDepartement("2A").features).toHaveLength(0);
  });

  test("une commune sans contour est null", () => {
    expect(contourCommune("44109")).not.toBeNull();
    expect(contourCommune("75056")).toBeNull();
  });
});

const { DOMAINE, svgCarteBudget, notesCarteBudget, svgCarteDepartements, svgCartePoints, legendeCarte, projectionPour } = await import("../site/src/lib/cartes.ts");
const INTERDIT = /\b(rang|classement|top|meilleur|meilleure|meilleurs|meilleures|pire|pires)\b|<script/i;
const valeurs = [
  { dep: "44", partPrive: 41.2, ecartIpsColleges: 15 },
  { dep: "2A", partPrive: null, ecartIpsColleges: null },
];
const points = [
  { uai: "0440001A", nom: "Public", lat: 47.5, lon: -1.5, secteur: "public" as const, eleves: 500 },
  { uai: "0440002B", nom: "Privé", lat: 47.4, lon: -1.4, secteur: "prive_sous_contrat" as const, eleves: 200 },
];
// Plot porte fill/stroke sur le groupe <g> parent du cercle.
const rayons = (s: string, motif: RegExp) => [...s.matchAll(/<g([^>]*)><circle r="([\d.]+)"/g)].filter((m) => motif.test(m[1]!)).map((m) => Number(m[2]));

describe("cartes", () => {
  test("carte des départements : un département sans valeur est grisé", () => {
    const { svg, absents } = svgCarteDepartements(valeurs, "prive", { encartsDrom: false });
    expect(svg).toContain('role="img"');
    expect(svg.match(/fill="var\(--line\)"/g)).toHaveLength(1);
    expect(absents).toEqual([]);
    expect(svg).not.toMatch(INTERDIT);
  });

  test("un département sans contour est listé dans absents", () => {
    const { absents } = svgCarteDepartements([...valeurs, { dep: "99", partPrive: 1, ecartIpsColleges: 1 }], "ecart_ips", { encartsDrom: false });
    expect(absents).toEqual(["99"]);
  });

  test("encarts DROM : sans contour, le code est absent", () => {
    const { svg, absents } = svgCarteDepartements([...valeurs, { dep: "975", partPrive: 1, ecartIpsColleges: 1 }], "prive", { encartsDrom: true });
    expect(absents).toEqual(["975"]);
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });

  test("encarts DROM : métropole et encarts rendus séparément", () => {
    const r = svgCarteDepartements(valeurs, "prive", { encartsDrom: true });
    expect(r.metropole.match(/<svg/g)).toHaveLength(1);
    expect(r.encarts).toEqual([]);
    expect(r.svg).toBe(r.metropole + r.encarts.map((e) => e.svg).join(""));
  });

  test("domaines des rampes exportés", () => {
    expect(DOMAINE).toEqual({ prive: [0, 50], ecart_ips: [0, 40], budget: [0, 1000] });
  });

  test("valeurs hors domaine bornées sans erreur", () => {
    const { svg } = svgCarteDepartements([{ dep: "44", partPrive: 90, ecartIpsColleges: -5 }], "ecart_ips", { encartsDrom: false });
    expect(svg).toContain("<path");
  });

  test("points : public plein, privé en anneau, rayon selon les élèves", () => {
    const fond = { territoire: contourDepartement("44"), mailles: communesDuDepartement("44") };
    const { svg, absents } = svgCartePoints(points, fond);
    expect(absents).toEqual([]);
    const pub = rayons(svg, /fill="var\(--pub\)"/);
    const pri = rayons(svg, /fill="none"(?=[^>]*stroke="var\(--pri\)")|stroke="var\(--pri\)"(?=[^>]*fill="none")/);
    expect(pub).toHaveLength(1);
    expect(pri).toHaveLength(1);
    expect(pub[0]!).toBeGreaterThan(pri[0]!);
    expect(svg).not.toMatch(INTERDIT);
  });

  test("un point loin du contour n'est pas dessiné et est listé", () => {
    const loin = { uai: "9740001Z", nom: "Loin", lat: 10, lon: 60, secteur: "public" as const, eleves: 100 };
    const { svg, absents } = svgCartePoints([...points, loin], { territoire: contourDepartement("44"), mailles: null });
    expect(absents).toEqual(["9740001Z"]);
    expect(svg.match(/<circle/g)).toHaveLength(2);
  });

  test("sans territoire ni mailles, ajusté aux points", () => {
    const { svg, absents } = svgCartePoints(points, { territoire: null, mailles: null });
    expect(svg).toContain('role="img"');
    expect(absents).toEqual([]);
  });

  test("sans territoire mais avec mailles, ajusté aux mailles", () => {
    const { svg, absents } = svgCartePoints(points, { territoire: null, mailles: communesDuDepartement("44") });
    expect(svg).toContain("<path");
    expect(absents).toEqual([]);
  });

  test("légende HTML", () => {
    const h = legendeCarte("ecart_ips", [0, 40]);
    expect(h).toContain("Écart d'IPS moyen privé − public des collèges");
    expect(h).toContain("non disponible");
    expect(legendeCarte("prive", [0, 50])).toContain("Part des élèves dans le privé sous contrat");
    expect(h).toContain("40 points et plus");
    expect(h).toContain("0 ou moins");
    expect(legendeCarte("prive", [0, 50])).toContain("50 % et plus");
    expect(h).not.toMatch(INTERDIT);
  });

  test("projection : Mercator si tous les départements sont d'outre-mer, conique sinon", () => {
    expect(projectionPour(["971", "972", "973"]).type).toBe("mercator");
    expect(projectionPour(["976"]).type).toBe("mercator");
    expect(projectionPour(["44", "49"]).type).toBe("conic-conformal");
    expect(projectionPour(["44", "971"]).type).toBe("conic-conformal");
  });
});

describe("carte du budget", () => {
  /** Fixture avec le Rhône découpé en communes (Lyon et une commune du reste du Rhône). */
  function avecContoursBudget<T>(f: () => T): T {
    const avant = process.env.OBS_CONTOURS;
    process.env.OBS_CONTOURS = join(import.meta.dir, "fixtures", "contours-budget");
    try { return f(); } finally { process.env.OBS_CONTOURS = avant; }
  }
  const fills = (s: string) => [...s.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]!).filter((c) => c.startsWith("color-mix") || c === "var(--line)");

  test("Rhône et Métropole de Lyon : deux formes, valeurs distinctes", () => {
    avecContoursBudget(() => {
      const formes = formesCollectivites();
      expect(formes.filter((f) => f.contour.properties.code === "69").map((f) => f.id).sort()).toEqual(["dep-69", "ml-lyon"]);
      const { svg } = svgCarteBudget([
        { id: "dep-69", deps: ["69"], budget: 200 }, { id: "ml-lyon", deps: ["69"], budget: 800 },
        { id: "dep-44", deps: ["44"], budget: 500 }, { id: "cea", deps: ["67", "68"], budget: 400 },
      ], { encartsDrom: false });
      const couleurs = fills(svg);
      expect(couleurs).toHaveLength(5);
      expect(new Set(couleurs.filter((c) => c.includes("20%") || c.includes("80%"))).size).toBe(2);
      expect(svg).not.toMatch(INTERDIT);
    });
  });

  test("Bas-Rhin et Haut-Rhin : même valeur cea, note sous la carte", () => {
    avecContoursBudget(() => {
      const valeurs = [{ id: "cea", deps: ["67", "68"], budget: 400 }];
      const { svg } = svgCarteBudget(valeurs, { encartsDrom: false });
      const alsace = fills(svg).filter((c) => c.includes("40%"));
      expect(alsace).toHaveLength(2);
      expect(alsace[0]).toBe(alsace[1]!);
      const notes = notesCarteBudget(valeurs, (d) => (d === "67" ? "Bas-Rhin" : "Haut-Rhin"), () => "Collectivité européenne d'Alsace");
      expect(notes).toEqual(["Bas-Rhin et Haut-Rhin : valeur de la collectivité unique, Collectivité européenne d'Alsace."]);
    });
  });

  test("collectivité sans valeur : grisée, « non disponible » dans la légende", () => {
    avecContoursBudget(() => {
      const { svg } = svgCarteBudget([{ id: "dep-44", deps: ["44"], budget: null }, { id: "cea", deps: ["67", "68"], budget: 400 }], { encartsDrom: false });
      expect(fills(svg).filter((c) => c === "var(--line)").length).toBeGreaterThanOrEqual(3); // 44 et les deux formes du Rhône
      expect(svg).not.toContain("NaN");
    });
    const legende = legendeCarte("budget", DOMAINE.budget);
    expect(legende).toContain("non disponible");
    expect(legende).toContain("Dépense de fonctionnement hors personnel par élève des collèges publics");
    expect(legende).toContain("var(--pub-soft)");
    expect(legende).toContain("var(--pub-ink)");
  });

  test("outre-mer : cinq encarts dont Mayotte en gris, avec sa note d'absence", () => {
    const avant = process.env.OBS_CONTOURS;
    process.env.OBS_CONTOURS = join(import.meta.dir, "..", "site", "contours");
    try {
      const valeurs = [
        { id: "dep-971", deps: ["971"], budget: 300 }, { id: "ctu-martinique", deps: ["972"], budget: 300 },
        { id: "ctu-guyane", deps: ["973"], budget: 300 }, { id: "dep-974", deps: ["974"], budget: 300 },
      ];
      const { encarts } = svgCarteBudget(valeurs, { encartsDrom: true });
      expect(encarts.map((e) => e.code).sort()).toEqual(["971", "972", "973", "974", "976"]);
      expect(fills(encarts.find((e) => e.code === "976")!.svg)).toEqual(["var(--line)"]);
      const notes = notesCarteBudget(valeurs, (d) => (d === "976" ? "Mayotte" : d), (id) => id);
      expect(notes).toContain(`Mayotte : ${LIBELLES_BUDGET.absences.aucuneCollectivite}.`);
    } finally { process.env.OBS_CONTOURS = avant; }
  });
});
