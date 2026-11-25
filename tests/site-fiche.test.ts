import { beforeAll, describe, expect, test } from "bun:test";
import { doc, octets, page, siteTest, texte, UMAMI_TEST } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

describe("fiche établissement", () => {
  test("fiche publique : nom, écart (moyenne), voisin nommé, ligne de source", () => {
    const t = texte("etablissement/0440001A");
    expect(t).toContain("Collège Jules-Verne");
    expect(t).toContain("−14,0 (106,4)");
    expect(t).toContain("Saint-Exemple"); // voisin nommé
    expect(t).toMatch(/Source : MEN-DEPP, Indices de position sociale des collèges · rentrée 2025-2026 · collecté le \d\d\/\d\d\/\d{4}/);
  });

  test("fil d'Ariane : France, région, académie, département et commune sont des liens", () => {
    const liens = [...doc("etablissement/0440001A").querySelectorAll(".crumb a")].map((a) => a.getAttribute("href"));
    expect(liens).toEqual(["/france/", "/region/52/", "/academie/17/", "/departement/44/", "/commune/44109/"]);
    expect(texte("etablissement/0440001A")).toContain("Académie de Nantes");
  });

  test("fiche privée : vie scolaire non publiée, jamais 0", () => {
    const h = page("etablissement/0440002B");
    expect(texte("etablissement/0440002B")).toContain("non publié pour le privé");
    expect(h).not.toMatch(/ETP de vie scolaire[^<]*<[^>]*>\s*0[,<]/);
    expect(texte("etablissement/0440002B")).toContain("Contrat d'association");
  });

  test("IPS ancien : moyennes calculées, jamais « publiées par la DEPP » ; IPS actuel : publiées", () => {
    const calculee = texte("etablissement/0440005E");
    expect(calculee).toContain("moyenne calculée par l'observatoire");
    expect(calculee).not.toContain("moyennes publiées par la DEPP");
    expect(texte("etablissement/0440001A")).toContain("moyennes publiées par la DEPP");
  });

  /** Cartes « Évolution de l'IPS » d'une page : [carte, ronds creux, ronds pleins, ronds de la ligne de l'établissement]. */
  const courbesIps = (chemin: string) =>
    [...doc(chemin).querySelectorAll(".card")].filter((c) => c.querySelector(".lab")?.textContent?.startsWith("Évolution de l'IPS")).map((carte) => {
      const ronds = [...carte.querySelectorAll("svg circle")];
      const groupe = (r: Element) => r.parentElement!.getAttribute("fill") ?? "";
      return { carte, creux: ronds.filter((r) => groupe(r) === "var(--surface)").length, me: ronds.filter((r) => groupe(r) === "var(--me)").length, tous: ronds.length };
    });

  test("fiche : courbe de l'IPS de 2016 à 2025, références départementales", () => {
    const [c] = courbesIps("etablissement/0440001A");
    const t = c!.carte.textContent!.replace(/\s+/g, " ");
    expect(c!.carte.querySelector(".yr")!.textContent).toBe("2016 → 2025");
    expect(c!.carte.querySelector("svg")!.getAttribute("aria-label")).toBe("Évolution : 2016 94,0, 2017 94,5, 2018 95,0, 2019 95,5, 2020 96,0, 2021 96,5, 2022 91,5, 2023 93,5, 2024 93,0, 2025 92,4");
    expect(c!.me).toBe(10);
    expect(c!.carte.querySelector("svg g[stroke='var(--pub)']")).not.toBeNull();
    expect(c!.carte.querySelector("svg g[stroke='var(--pri)']")).not.toBeNull();
    expect(t).toContain("établissement · moyenne départementale public · privé s. c.");
    // Étiquettes des rentrées : une sur deux au-delà de six, la dernière toujours écrite.
    const annees = [...c!.carte.querySelectorAll("svg g[text-anchor=middle] text, svg g[font-variant] text")].map((x) => x.textContent!.trim()).filter((x) => /^20\d\d$/.test(x));
    expect(annees).toContain("2025");
    expect(annees.length).toBeLessThanOrEqual(5);
  });

  test("rentrée calculée signalée : rond creux et légende, rond plein pour une valeur publiée", () => {
    const [c] = courbesIps("etablissement/0440001A");
    expect(c!.creux).toBeGreaterThan(0);
    expect(c!.tous - c!.me - c!.creux).toBeGreaterThan(0);
    expect(c!.carte.textContent!).toContain("○ moyenne calculée par l'observatoire");
  });

  test("sans GPS : voisins non calculables, pas de bouton carte", () => {
    expect(texte("etablissement/0440005E")).toContain("Voisins non calculables (coordonnées absentes)");
    expect(doc("etablissement/0440005E").querySelector("#afficher-carte")).toBeNull();
    expect(doc("etablissement/0440001A").querySelector("#afficher-carte")!.getAttribute("data-lat")).toBe("47.218");
  });

  test("pas de SEGPA", () => {
    expect(texte("etablissement/0440002B")).toContain("pas de SEGPA");
  });

  test("SVG rendus au build, aucun script Plot", () => {
    const h = page("etablissement/0440001A");
    expect(h).toContain("<svg");
    expect(h).toContain('role="img"');
    expect(h).not.toContain("observablehq");
    expect([...doc("etablissement/0440001A").querySelectorAll("script")].map((s) => s.getAttribute("src"))).toEqual([
      "/js/theme.js", UMAMI_TEST.SCRIPT, "/js/signalement.js", "/js/onglets.js", "/js/fiche.js",
    ]);
  });

  test("la source IVAC porte une session, jamais une rentrée", () => {
    const lignes = [...doc("etablissement/0440001A").querySelectorAll("li")].map((l) => l.textContent ?? "").filter((t) => t.includes("valeur ajoutée des collèges"));
    expect(lignes.length).toBeGreaterThan(0);
    for (const t of lignes) {
      expect(t).toContain("session 2025");
      expect(t).not.toContain("rentrée 2025-2026");
    }
  });

  // 60 000 octets jusqu'à la phase Écoles ; relevé à 63 000 par les blocs « Écoles de son secteur » et « PIAL » ;
  // relevé à 71 000 par la barre d'onglets et la Synthèse (deux courbes reprises, mesuré : 70 433 octets) ;
  // relevé à 71 900 par le logo GitHub du pied de page et le lien de signalement (71 790). Garde-fou de production : 150 000.
  test("poids d'une fiche complète", () => {
    expect(octets("etablissement/0440001A")).toBeLessThanOrEqual(71_900);
  });

  test("part de filles partielle : couverture dite", () => {
    expect(texte("etablissement/0440003C")).toContain("sur 67 % des élèves");
    expect(texte("etablissement/0440006F")).toContain("filles et garçons publiés pour 10 % des élèves seulement");
  });

  test("établissement multi-sites : autres sites listés", () => {
    const t = texte("etablissement/0440003C");
    expect(t).toContain("Établissement réparti sur 3 sites");
    expect(t).toContain("Annexe du lycée Guist'hau");
  });

  test("lycée : pas de bloc SEGPA ni de langues de collège", () => {
    const t = texte("etablissement/0440003C");
    expect(t).not.toContain("pas de SEGPA");
    expect(t).not.toContain("LV2 (5e à 3e)");
  });

  test("page fermée : mention « Fermé le », page générée", () => {
    const t = texte("etablissement/0440099Z");
    expect(t).toContain("Fermé le 31/08/2020");
    expect(t).toContain("Collège Disparu");
  });

  test("référencement : noindex tant que INDEXABLE vaut false ; pied de page des licences", () => {
    expect(page("etablissement/0440001A")).toContain('<meta name="robots" content="noindex">');
    expect(texte("etablissement/0440001A")).toContain("Données : Licence Ouverte 2.0. Code : AGPL-3.0. Ce site ne commente pas les chiffres.");
    expect(doc("etablissement/0440001A").documentElement.getAttribute("lang")).toBe("fr");
  });

  test("MapLibre copié pour le chargement au clic", async () => {
    expect(await Bun.file(".cache/dist-test/js/maplibre/maplibre-gl.mjs").exists()).toBe(true);
  });
});
