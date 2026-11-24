import { beforeAll, describe, expect, test } from "bun:test";
import type { EntreeIndex } from "@obs/shared/donnees";
import { LIBELLES_BUDGET } from "@obs/shared/libelles";
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

  test("fil d'Ariane, carte des établissements, puces des communes", () => {
    const d = doc("departement/44");
    expect(d.querySelector(".crumb a[href='/france/']")).not.toBeNull();
    expect(d.querySelector(".crumb a[href='/academie/17/']")).not.toBeNull();
    expect(d.querySelector("#carte-territoire svg[role=img]")).not.toBeNull();
    const nantes = d.querySelector(".chips a[href='/commune/44109/']");
    expect(nantes).not.toBeNull();
    expect(nantes!.textContent).toContain("Nantes");
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
    expect(d.querySelector("a[href='/france/']")).not.toBeNull();
    expect(d.querySelector(".acad b a[href='/academie/17/']")!.textContent).toContain("Nantes");
    expect(t).toContain("Sans palmarès");
    expect(t).toContain("non couvert par les statistiques publiques");
  });

  test("accueil : départements intégrés pour la recherche, script chargé", () => {
    const d = doc("index.html");
    const deps = JSON.parse(d.querySelector("script#departements")!.textContent!) as { d: string; l: string }[];
    expect(deps).toContainEqual(expect.objectContaining({ d: "44", l: "Loire-Atlantique" }));
    expect([...d.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"))).toContain("/js/recherche.js");
  });

  test("accueil : communes avec page intégrées pour la recherche", () => {
    const d = doc("index.html");
    const json = d.querySelector("script#communes")!.textContent!;
    const communes = JSON.parse(json) as { i: string; l: string; d: string }[];
    expect(communes).toContainEqual({ i: "44109", l: "Nantes", d: "44" });
    expect(json).not.toContain("2A004");
  });

  test("recherche.json : clés courtes", () => {
    const idx = JSON.parse(page("recherche.json")) as EntreeIndex[];
    expect(idx.length).toBe(16); // 13 actifs + 1 page du registre + 2 fiches historiques
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
    expect(t).toContain("ADMIN EXPRESS");
    expect(t).toContain("dernière édition disponible au 24 novembre 2026");
    expect(t).toContain("Licence Ouverte 2.0");
  });

  test("sources : les six exercices des balances DGFiP, chacun avec sa requête archivée", () => {
    const t = texte("sources");
    expect(t).toContain("DGFiP");
    for (const e of [2020, 2021, 2022, 2023, 2024, 2025]) {
      expect(t).toContain(`présentation croisée nature-fonction ${e}`);
    }
    const d = doc("sources");
    expect(d.querySelectorAll("section[id^='budget_'] .requete").length).toBe(6);
    expect(texte("sources")).toContain(LIBELLES_BUDGET.interface.requeteRejouee);
    expect(d.querySelector("section#budget_2025 .requete")!.textContent).toContain("where=budget_2025");
    expect(t).toContain("data.economie.gouv.fr");
  });

  test("méthode : budget des collectivités", () => {
    const d = doc("methode");
    const t = texte("methode");
    expect(d.getElementById("budget")).not.toBeNull();
    expect(t).toContain("Budget des collectivités");
    expect(t).toContain("(obnetdeb − oobdeb) − (obnetcre − oobcre)");
    for (const c of ["65511", "655111", "65512", "655112", "655122", "2042"]) expect(t).toContain(c);
    expect(t).toContain("comptes commençant par 64");
    expect(t).toContain("50 € par élève");
    expect(t).toContain("rentrée de septembre N−1");
    expect(t).toContain("enseignement agricole");
    expect(t).toContain("surestimé");
    expect(t).toContain("cités scolaires");
    expect(t).toContain("Creuse");
    expect(t).toContain("Meurthe-et-Moselle");
    expect(t).toContain("Lot-et-Garonne");
    expect(t).toContain("fonction 24");
    expect(t).toContain("Les établissements fermés dont la page est conservée sont comptés");
    expect(t).toContain("fermés avant la mise en ligne de l'observatoire (fin 2026)");
    expect(t).toContain("0,35 %");
    expect(t).toContain("EREA");
    expect(t).toContain("BTS, CPGE");
    expect(t).not.toContain("fermé depuis ne sont pas comptés");
    expect(t).toContain("aucune collectivité ne finance ces établissements dans les balances de la DGFiP");
    expect(t).toContain("collectivité non identifiée dans les balances de la DGFiP");
    expect(t).toContain("aucune contribution au privé identifiée");
    expect(t).toContain("euros courants");
    expect(t).toContain("depuis 2020");
    expect(t).toContain("fonction collèges non détaillée dans les comptes de la collectivité");
    expect(t).toContain("classé en fonctionnement hors personnel");
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

  test("méthode : cartes, moyennes calculées, communes", () => {
    const d = doc("methode");
    const t = texte("methode");
    for (const id of ["cartes", "moyennes-calculees", "communes"]) expect(d.getElementById(id)).not.toBeNull();
    expect(t).toContain("France et des académies portent une carte des départements à deux vues");
    expect(t).toContain("un point par établissement");
    // Vue A : élèves connus seulement, sans zéro.
    expect(t).toContain("Σ élèves privés / Σ élèves (public + privé)");
    expect(t).toContain("établissements sans élèves publiés ne sont pas comptés");
    // Vue B.
    expect(t).toContain("dep_prive − dep_public");
    expect(t).toContain("aca_prive − aca_public");
    // Moyennes calculées et contrôle.
    expect(t).toContain("moyenne calculée par l'observatoire");
    expect(t).toContain("pondérée par les élèves");
    expect(t).toContain("0,2");
    expect(t).toContain("746");
    // Communes.
    expect(t).toContain("3 établissements");
    expect(t).toContain("75056");
    expect(t).toContain("69123");
    expect(t).toContain("13055");
  });

  test("méthode : le périmètre cite Saint-Pierre-et-Miquelon dès l'introduction du paragraphe", () => {
    const t = texte("methode");
    const intro = t.slice(t.indexOf("Périmètre"), t.indexOf("Le privé hors contrat"));
    expect(intro).toContain("Saint-Pierre-et-Miquelon");
    expect(intro).toContain("Saint-Barthélemy");
    expect(intro).toContain("Saint-Martin");
    expect(intro).not.toContain("métropole et dans les départements d'outre-mer, tels");
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
    expect(s).toContain("/france/");
    expect(s).toContain("/academie/17/");
    expect(s).toContain("/commune/44109/");
    expect(s).not.toContain("/commune/2A004/");
    expect(s).toContain("<lastmod>2026-11-22</lastmod>");
  });
});
