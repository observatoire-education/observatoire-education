import { beforeAll, describe, expect, test } from "bun:test";
import type { EntreeIndex } from "@obs/shared/donnees";
import { doc, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

describe("page département", () => {
  test("tri par nom, onglets par famille, hors contrat", () => {
    const d = doc("departement/44");
    const noms = [...d.querySelectorAll("#liste-college tbody td:first-child")].map((td) => td.textContent!.trim());
    expect(noms).toEqual(["Collège Jules-Verne", "Collège Saint-Exemple", "Collège Sans GPS", "Collège Simple"]);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    expect([...d.querySelectorAll(".tabs a")].map((a) => a.getAttribute("href"))).toEqual(["#college", "#legt", "#lpo"]);
    expect(texte("departement/44")).toContain("non couvert par les statistiques publiques");
  });

  test("bandeau, moyennes, vie scolaire du privé non publiée", () => {
    const t = texte("departement/44");
    expect(t).toContain("Loire-Atlantique");
    expect(t).toContain("Académie de Nantes");
    expect(t).toContain("14,8"); // moyenne publique élèves / ETP enseignant des collèges (590 / 40)
    expect(t).toContain("non publié pour le privé");
    expect(doc("departement/44").querySelector("#college svg[role=img]")).not.toBeNull();
  });

  test("liste : valeurs de tri numériques, absence dite", () => {
    const d = doc("departement/44");
    const ligne = [...d.querySelectorAll("#liste-college tbody tr")].find((tr) => tr.textContent!.includes("Saint-Exemple"))!;
    expect(ligne.getAttribute("data-s")).toBe("pri");
    const cellules = [...ligne.querySelectorAll("td")];
    expect(cellules.some((c) => c.textContent!.includes("non publié pour le privé"))).toBe(true);
    expect(cellules.find((c) => c.textContent!.trim() === "123,0")!.getAttribute("data-v")).toBe("123");
    expect(d.querySelector("#liste-college a[href='/etablissement/0440002B/']")).not.toBeNull();
  });

  test("CSV de la liste, généré au build", () => {
    const csv = page("departement/44/etablissements.csv");
    const lignes = csv.trim().split("\n");
    expect(lignes[0]).toBe("uai;nom;famille;secteur;commune;ep;eleves;eleves_par_etp_ens;eleves_par_etp_vs;part_enseignantes;ips");
    expect(lignes.find((l) => l.startsWith("0440002B"))).toContain(";non_publie_prive;");
    expect(lignes).toHaveLength(1 + 6); // 6 établissements actifs dans le 44
  });

  test("pas de page disparue dans les listes, Corse générée", () => {
    expect(page("departement/44")).not.toContain("0440099Z");
    expect(texte("departement/2A")).toContain("Collège Ajaccio");
  });
});

describe("accueil et recherche", () => {
  test("accueil : recherche et territoires", () => {
    const d = doc("index.html");
    expect(d.querySelector("input#q")).not.toBeNull();
    expect(d.querySelector("a[href='/departement/44/']")).not.toBeNull();
    const t = texte("index.html");
    expect(t).toContain("Les chiffres publics de chaque collège et lycée de France.");
    expect(t).toContain("Nantes");
    expect([...d.querySelectorAll(".acad b")].some((b) => b.textContent!.includes("Nantes") && !b.querySelector("a"))).toBe(true);
    expect(t).toContain("Sans classement");
    expect(t).toContain("non couvert par les statistiques publiques");
  });

  test("accueil : départements intégrés pour la recherche, script chargé", () => {
    const d = doc("index.html");
    const deps = JSON.parse(d.querySelector("script#departements")!.textContent!) as { d: string; l: string }[];
    expect(deps).toContainEqual(expect.objectContaining({ d: "44", l: "Loire-Atlantique" }));
    expect([...d.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"))).toContain("/js/recherche.js");
  });

  test("recherche.json : clés courtes", () => {
    const idx = JSON.parse(page("recherche.json")) as EntreeIndex[];
    expect(idx.length).toBe(8); // 7 actifs + 1 page conservée
    expect(Object.keys(idx.find((e) => e.u === "0440001A")!).sort()).toEqual(["c", "d", "f", "n", "s", "u"]);
    expect(idx.find((e) => e.u === "0440004D")).toBeUndefined();
  });
});

describe("sources, méthode, 404, sitemap", () => {
  test("sources : chaque source, ses versions et leurs liens de téléchargement", () => {
    const d = doc("sources");
    const t = texte("sources");
    expect(t).toContain("Indices de position sociale des collèges");
    expect(d.querySelector("a[href='https://github.com/org/depot/releases/download/archives-ips_colleges-2026/ips_colleges.parquet']")).not.toBeNull();
    expect(t).toContain("Licence Ouverte");
  });

  test("méthode : périmètre, moyennes, voisinage, absences, pages conservées", () => {
    const d = doc("methode");
    const t = texte("methode");
    for (const id of ["perimetre", "moyennes", "voisinage", "absences", "pages-conservees", "multi-sites"]) {
      expect(d.getElementById(id)).not.toBeNull();
    }
    expect(t).toContain("30 km");
    expect(t).toContain("Σ");
    expect(t).toContain("50 %");
  });

  test("404 : redirection des UAI en minuscules", () => {
    const h = page("404.html");
    expect(h).toContain("toUpperCase");
    expect(h).toContain('href="/"');
  });

  test("sitemap : toutes les pages, date de collecte", () => {
    const s = page("sitemap.xml");
    expect(s).toContain("/etablissement/0440001A/");
    expect(s).toContain("/departement/2A/");
    expect(s).toContain("/methode/");
    expect(s).toContain("<lastmod>2026-11-22</lastmod>");
  });
});
