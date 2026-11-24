import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DIST_TEST, doc, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const existe = (chemin: string) => existsSync(join(DIST_TEST, chemin));

describe("page France", () => {
  test("titre, carte à trois vues, liste des académies sans établissement", () => {
    const d = doc("france");
    const t = texte("france");
    expect(d.querySelector("h1")!.textContent!.trim()).toBe("France");
    expect(t).toContain("Part des élèves dans le privé sous contrat");
    expect(t).toContain("Écart d'IPS moyen privé − public des collèges");
    expect(d.querySelectorAll("input[name=vue-carte]")).toHaveLength(3);
    const liste = d.querySelector("#liste-territoires")!;
    expect(liste.querySelector("a[href='/academie/17/']")).not.toBeNull();
    expect(liste.querySelector("a[href^='/etablissement/']")).toBeNull();
  });

  test("les vues forment un groupe nommé (fieldset et legend)", () => {
    const fieldset = doc("france").querySelector("fieldset.vues-carte")!;
    expect(fieldset).not.toBeNull();
    expect(fieldset.querySelector("legend")!.textContent!.trim()).not.toBe("");
    expect(fieldset.querySelectorAll("input[name=vue-carte]")).toHaveLength(3);
  });

  test("CSV des académies", () => {
    const lignes = page("france/academies.csv").trim().split("\n");
    expect(lignes[0]).toBe("code;libelle;etablissements_public;etablissements_prive;eleves_public;eleves_prive;part_prive;ecart_ips_colleges");
    expect(lignes.some((l) => l.startsWith("17;Nantes;"))).toBe(true);
  });
});

describe("page académie", () => {
  test("fil d'Ariane, départements, moyennes face à la France", () => {
    const d = doc("academie/17");
    expect(d.querySelector("h1")!.textContent!.trim()).toBe("Académie de Nantes");
    expect(d.querySelector(".crumb a[href='/france/']")).not.toBeNull();
    expect(d.querySelector("a[href='/departement/44/']")).not.toBeNull();
    const entetes = [...d.querySelectorAll("#college table.cmp thead th")].map((th) => th.textContent!.trim());
    expect(entetes.some((e) => e.startsWith("Académie"))).toBe(true);
    expect(entetes.some((e) => e.startsWith("France"))).toBe(true);
    expect(entetes.some((e) => e.startsWith("Dép."))).toBe(false);
  });

  test("CSV des départements", () => {
    const lignes = page("academie/17/departements.csv").trim().split("\n");
    expect(lignes[0]).toBe("code;libelle;etablissements_public;etablissements_prive;eleves_public;eleves_prive;part_prive;ecart_ips_colleges");
    expect(lignes.some((l) => l.startsWith("44;Loire-Atlantique;"))).toBe(true);
  });
});

describe("page commune", () => {
  test("titre, fil d'Ariane, moyenne calculée, liste triée, carte de points", () => {
    const d = doc("commune/44109");
    expect(d.querySelector("title")!.textContent).toContain("Nantes (44)");
    for (const href of ["/france/", "/academie/17/", "/departement/44/"]) {
      expect(d.querySelector(`.crumb a[href='${href}']`)).not.toBeNull();
    }
    const t = texte("commune/44109");
    expect(t).toContain("moyenne calculée par l'observatoire · 1 collège");
    expect(t).toContain("Loire-Atlantique : 106,4"); // moyenne DEPP du département, en repère
    const noms = [...d.querySelectorAll("#liste-college tbody td:first-child")].map((td) => td.textContent!.trim());
    expect(noms.length).toBeGreaterThan(1);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    expect(d.querySelector("#carte-territoire svg[role=img] circle")).not.toBeNull();
  });

  test("secteur sans établissement : l'absence est dite", () => {
    // Le libellé de la famille est celui de FAMILLES, au singulier et en minuscules.
    expect(texte("commune/44109")).toContain("Aucun lycée général et technologique privé dans la commune");
  });

  test("CSV des établissements de la commune", () => {
    const lignes = page("commune/44109/etablissements.csv").trim().split("\n");
    expect(lignes[0]).toBe("uai;nom;famille;secteur;commune;ep;eleves;eleves_par_etp_ens;eleves_par_etp_vs;part_enseignantes;ips;session_brevet;reussite_brevet;va_brevet;session_bac_gt;reussite_bac_gt;va_bac_gt;session_bac_pro;reussite_bac_pro;va_bac_pro");
    expect(lignes.some((l) => l.startsWith("0440001A;"))).toBe(true);
  });

  test("commune sous le seuil : pas de page, nom sans lien dans la fiche", () => {
    expect(existe("commune/2A004/index.html")).toBe(false);
    const crumb = doc("etablissement/6200001F").querySelector(".crumb")!;
    expect(crumb.textContent).toContain("Ajaccio");
    expect(crumb.querySelector("a[href^='/commune/']")).toBeNull();
  });

  test("la fiche lie vers sa commune, son académie et la France", () => {
    const d = doc("etablissement/0440001A");
    expect(d.querySelector(".crumb a[href='/commune/44109/']")).not.toBeNull();
    expect(d.querySelector(".crumb a[href='/academie/17/']")).not.toBeNull();
    expect(d.querySelector(".crumb a[href='/france/']")).not.toBeNull();
  });

  test("Paris : une page pour la ville, aucune par arrondissement", () => {
    expect(existe("commune/75056/index.html")).toBe(true);
    expect(existe("commune/75115/index.html")).toBe(false);
    const crumb = doc("etablissement/0751501A").querySelector(".crumb")!;
    const lien = crumb.querySelector("a[href='/commune/75056/']");
    expect(lien).not.toBeNull();
    expect(lien!.textContent!.trim()).toBe("Paris");
    expect(texte("commune/75056")).toContain("Paris 15e arrondissement");
  });
});

describe("page département : puces des communes", () => {
  test("Paris : une seule puce, par code, comptant les arrondissements", () => {
    const d = doc("departement/75");
    const puces = [...d.querySelectorAll(".chips .chip")];
    expect(puces).toHaveLength(1);
    expect(puces[0]!.getAttribute("href")).toBe("/commune/75056/");
    expect(puces[0]!.textContent!.trim()).toBe("Paris · 3");
  });
});

describe("titre de liste d'une commune", () => {
  test("un seul établissement : forme naturelle, jamais « Les 1 »", () => {
    for (const c of ["commune/44109", "departement/44", "departement/75"]) {
      const t = texte(c);
      expect(t).not.toMatch(/Les 1 /);
    }
    const titres = ["departement/44", "departement/75", "commune/44109"].flatMap((c) => [...doc(c).querySelectorAll("h3.sous-titre")].map((h) => h.textContent!.trim()));
    expect(titres.some((t) => /^Le (collège|lycée)/.test(t))).toBe(true);
    expect(titres.some((t) => /^Les [2-9] /.test(t))).toBe(true);
  });
});

describe("évolution de l'IPS moyen", () => {
  const courbes = (chemin: string) =>
    [...doc(chemin).querySelectorAll(".card")].filter((c) => c.querySelector(".lab")?.textContent?.startsWith("Évolution de l'IPS moyen"));
  const ronds = (carte: Element, couleur: string) => [...carte.querySelectorAll("svg circle")].filter((r) => r.parentElement!.getAttribute("stroke") === couleur || r.parentElement!.getAttribute("fill") === couleur);

  test("page département : courbe de l'IPS moyen par famille, un trou pour une année sans valeur", () => {
    const [college] = courbes("departement/44");
    expect(college!.querySelector(".yr")!.textContent).toBe("2016 → 2025");
    expect(college!.querySelector("svg")!.getAttribute("aria-label")).toContain("privé sous contrat : 2016 non disponible");
    expect(college!.textContent).toContain("moyenne public · privé s. c.");
    expect(college!.textContent).not.toContain("établissement ·");
    // Le privé n'a que 4 valeurs : jamais de point à 0 pour les années manquantes.
    expect(ronds(college!, "var(--pri)")).toHaveLength(4);
    expect(college!.querySelector("svg")!.outerHTML).not.toMatch(/NaN/);
  });

  test("page commune : courbe calculée", () => {
    const [c] = courbes("commune/44109");
    expect(c).toBeDefined();
    expect(c!.textContent).toContain("○ moyenne calculée par l'observatoire");
    expect([...c!.querySelectorAll("svg circle")].some((r) => r.parentElement!.getAttribute("fill") === "var(--surface)")).toBe(true);
  });

  test("moins de deux rentrées : pas de carte", () => {
    // La famille sans historique suffisant n'affiche pas la carte : chaque carte présente au moins deux rentrées.
    for (const c of [...courbes("departement/44"), ...courbes("region/52")]) {
      const [a, b] = c.querySelector(".yr")!.textContent!.split(" → ").map(Number);
      expect(b! - a!).toBeGreaterThanOrEqual(1);
    }
  });
});
