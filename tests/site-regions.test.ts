import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DIST_TEST, doc, page, planDuSite, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const existe = (chemin: string) => existsSync(join(DIST_TEST, chemin));

describe("page région", () => {
  test("titre, mention de la moyenne calculée, départements et académies de la région", () => {
    const d = doc("region/52");
    expect(d.querySelector("h1")!.textContent!.trim()).toBe("Pays de la Loire");
    expect(d.querySelector("title")!.textContent).toContain("Pays de la Loire");
    expect(texte("region/52")).toContain("moyenne calculée par l'observatoire");
    expect(texte("region/52")).toContain("Départements de la région");
    expect(d.querySelector("#territoires a[href='/departement/44/']")).not.toBeNull();
    expect(d.querySelector("a[href='/academie/17/']")).not.toBeNull();
    expect(d.querySelector(".crumb a[href='/france/']")).not.toBeNull();
    expect(d.querySelector("a[href='/region/52/departements.csv']")).not.toBeNull();
  });

  test("badges : accord du pluriel (« 1 département », « 1 académie »)", () => {
    const t = texte("region/52");
    expect(t).not.toMatch(/\b1 (départements|académies)/);
    expect(t).toMatch(/\b1 (département|académie)\b/);
  });

  test("CSV des départements : mêmes colonnes que celui des académies", () => {
    const lignes = page("region/52/departements.csv").trim().split("\n");
    expect(lignes[0]).toBe(page("france/academies.csv").split("\n")[0]!);
    expect(lignes.filter((l) => l.startsWith("44;Loire-Atlantique;"))).toHaveLength(1);
    expect(lignes).toHaveLength(2);
  });

  test("aucune page pour le 975, qui n'a pas de région", () => {
    expect(existe("region/975")).toBe(false);
  });
});

describe("maillage des régions", () => {
  test("fil d'Ariane d'une fiche : France › région › académie › département, chaque maillon lié", () => {
    const crumb = doc("etablissement/0440001A").querySelector(".crumb")!;
    const liens = [...crumb.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(liens.slice(0, 4)).toEqual(["/france/", "/region/52/", "/academie/17/", "/departement/44/"]);
    expect(crumb.textContent!.replaceAll("›", " › ")).toContain("France › Pays de la Loire › Académie de Nantes › Loire-Atlantique");
  });

  test("fil d'Ariane d'un département et d'une académie : la région est un maillon", () => {
    expect(doc("departement/44").querySelector(".crumb a[href='/region/52/']")).not.toBeNull();
    expect(doc("academie/17").querySelector(".crumb a[href='/region/52/']")).not.toBeNull();
  });

  test("tout lien /region/ du site mène à une page construite", () => {
    const pages = ["index.html", "france", "region/52", "academie/17", "departement/44", "commune/44109", "etablissement/0440001A"];
    for (const p of pages) {
      for (const a of doc(p).querySelectorAll("a[href^='/region/']")) {
        const href = a.getAttribute("href")!;
        if (href.endsWith(".csv")) expect(existe(href.slice(1))).toBe(true);
        else expect(existe(`${href.slice(1)}index.html`)).toBe(true);
      }
    }
  });

  test("la page France liste les régions de ses données, triées par nom, chacune liée", () => {
    const regions = (JSON.parse(readFileSync(join(import.meta.dir, "..", ".cache", "data-test", "france.json"), "utf8")) as {
      regions: { code: string; libelle: string }[];
    }).regions;
    expect(regions.length).toBeGreaterThan(0);
    const liens = [...doc("france").querySelectorAll("#regions a")];
    expect(liens.map((a) => a.getAttribute("href"))).toEqual(
      [...regions].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")).map((r) => `/region/${r.code}/`),
    );
    expect(liens.map((a) => a.textContent)).toContain("Pays de la Loire");
    for (const r of regions) expect(existe(`region/${r.code}/index.html`)).toBe(true);
  });

  test("l'accueil propose les régions", () => {
    expect(doc("index.html").querySelector("a[href='/region/52/']")!.textContent).toContain("Pays de la Loire");
  });

  test("le sitemap contient /region/52/", () => {
    expect(planDuSite()).toContain("/region/52/</loc>");
    expect(planDuSite()).not.toContain("/region/975/");
  });

  test("la recherche propose « Pays de la Loire »", () => {
    const d = doc("index.html");
    const regions = JSON.parse(d.querySelector("script#regions")!.textContent!) as { r: string; l: string }[];
    expect(regions).toContainEqual({ r: "52", l: "Pays de la Loire" });
    const js = readFileSync(join(import.meta.dir, "..", "site", "public", "js", "recherche.js"), "utf8");
    expect(js).toContain("/region/");
  });
});

describe("contourRegion", () => {
  test("fusionne les contours des départements de la région ; null si aucun n'est connu", async () => {
    process.env.OBS_CONTOURS = join(import.meta.dir, "fixtures", "contours");
    const { contourRegion } = await import("../site/src/lib/contours.ts");
    const pdl = contourRegion("52")!;
    expect(pdl.properties.code).toBe("52");
    expect(pdl.geometry.type).toBe("MultiPolygon"); // merge ; seul le 44 figure dans les contours d'essai
    expect(contourRegion("94")!.properties.code).toBe("94");
    expect(contourRegion("11")).toBeNull();
    expect(contourRegion("00")).toBeNull();
  });
});
