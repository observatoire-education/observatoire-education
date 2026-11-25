import { beforeAll, describe, expect, test } from "bun:test";
import type { EntreeIndex } from "@obs/shared/donnees";
import { estEcole, LIBELLES_ABSENCES, LIBELLES_BUDGET, LIBELLES_ONGLETS, LIBELLES_RESULTATS } from "@obs/shared/libelles";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compterFabrique } from "../site/src/lib/fabrique.ts";
import { DIST_TEST, DONNEES_TEST, doc, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

describe("page département", () => {
  test("tri par nom, onglets par famille, hors contrat", () => {
    const d = doc("departement/44");
    const noms = [...d.querySelectorAll("#liste-college tbody td:first-child")].map((td) => td.textContent!.trim());
    expect(noms).toEqual(["Collège Jules-Verne", "Collège Saint-Exemple", "Collège Sans GPS", "Collège Simple"]);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
    // familles du second degré (collèges, puis lycées et EREA), puis le bloc du premier degré, chacun dans son onglet
    expect([...d.querySelectorAll("nav.onglets a")].map((a) => a.getAttribute("href")).slice(1, 4)).toEqual(["#o-colleges", "#o-lycees", "#o-ecoles"]);
    expect([...d.querySelectorAll("#o-colleges > section[id], #o-lycees > section[id]")].map((s) => `#${s.id}`)).toEqual(["#college", "#legt", "#lpo", "#erea"]);
    expect(d.querySelector("#o-ecoles #premier-degre")).not.toBeNull();
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
    expect(lignes[0]).toBe("uai;nom;famille;secteur;commune;ep;eleves;eleves_par_etp_ens;eleves_par_etp_vs;part_enseignantes;ips;session_brevet;reussite_brevet;va_brevet;session_bac_gt;reussite_bac_gt;va_bac_gt;session_bac_pro;reussite_bac_pro;va_bac_pro;rentree_eleves;rentree_ips");
    expect(lignes.find((l) => l.startsWith("0440002B"))).toContain(";non_publie_prive;");
    // Résultats du collège Saint-Exemple : brevet, session 2025, 60 % et +1 ; colonnes du bac vides.
    expect(lignes.find((l) => l.startsWith("0440002B"))!.split(";").slice(-11, -2)).toEqual(["2025", "60", "1", "", "", "", "", "", ""]);
    // rentrées des élèves et de l'IPS de chaque ligne, en dernières colonnes (écoles : 2025 et 2024)
    expect(lignes.find((l) => l.startsWith("0440202B"))!.split(";").slice(-2)).toEqual(["2025", "2024"]);
    expect(lignes).toHaveLength(1 + 8 + 6); // 8 établissements actifs du second degré dans le 44, puis 6 écoles ouvertes
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
    expect(d.querySelector("title")!.textContent).toBe("Observatoire citoyen de l'éducation en France");
    expect(d.querySelector("a[href='/departement/44/']")).not.toBeNull();
    const t = texte("index.html");
    expect(t).toContain("Toutes les données publiques sur l'école, rassemblées établissement par établissement.");
    expect(t).toContain("Nantes");
    expect(d.querySelector("a[href='/france/']")).not.toBeNull();
    expect(d.querySelector(".reg .aca-nom[href='/academie/17/']")!.textContent).toContain("Nantes");
    expect(t).toContain("Sans palmarès");
    expect(t).toContain("non couvert par les statistiques publiques");
  });

  test("accueil : fabrique, vitrine et comparatif", () => {
    const d = doc("index.html");
    const fabrique = compterFabrique(JSON.parse(readFileSync(join(DONNEES_TEST, "sources.json"), "utf8")));
    expect(d.querySelector(".fabrique")!.textContent!.replace(/\s+/g, " ")).toContain(`${fabrique.jeux} jeux de données publiques`);
    expect(d.querySelector(".vitrine a[href='/etablissement/0440001A/']")).not.toBeNull();
    expect(d.querySelector("a[href='/sources/#fiche']")).not.toBeNull();
    const titres = [...d.querySelectorAll(".compare h3")].map((h) => h.textContent);
    expect(titres).toEqual(["Les portails officiels", "Les sites commerciaux", "L'observatoire"]);
    // Ordre : chiffres, puis recherche, puis bandeau de la fabrique.
    const html = page("index.html");
    const [kpis, q, fab] = [html.indexOf('class="kpis"'), html.indexOf('id="q"'), html.indexOf('class="fabrique"')];
    expect(kpis).toBeGreaterThan(-1);
    expect(kpis).toBeLessThan(q);
    expect(q).toBeLessThan(fab);
  });

  test("accueil : départements intégrés pour la recherche, script chargé", () => {
    const d = doc("index.html");
    const deps = JSON.parse(d.querySelector("script#departements")!.textContent!) as { d: string; l: string }[];
    expect(deps).toContainEqual(expect.objectContaining({ d: "44", l: "Loire-Atlantique" }));
    expect([...d.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"))).toContain("/js/recherche.js");
  });

  test("recherche-communes.json : toutes les communes qui ont une page (second degré ou écoles), et elles seules", () => {
    const json = page("recherche-communes.json");
    const communes = JSON.parse(json) as { i: string; l: string; d: string }[];
    expect(communes).toContainEqual({ i: "44109", l: "Nantes", d: "44" });
    // communes des écoles seulement : une école ouverte (Saint-Aubin), des écoles fermées (Les Sables, Val-de-l'Erdre)
    expect(communes).toContainEqual({ i: "44150", l: "Saint-Aubin", d: "44" });
    expect(communes).toContainEqual(expect.objectContaining({ i: "44888", d: "44" }));
    expect(communes).toContainEqual({ i: "44903", l: "Val-de-l'Erdre", d: "44" });
    expect(communes.map((c) => c.i).sort()).toEqual(readdirSync(join(DIST_TEST, "commune")).sort());
    expect(json).not.toContain("2A004");
  });

  test("accueil : la liste des communes n'est plus intégrée à la page (chargée avec l'index)", () => {
    expect(doc("index.html").querySelector("script#communes")).toBeNull();
  });

  test("recherche.json : clés courtes", () => {
    const idx = JSON.parse(page("recherche.json")) as EntreeIndex[];
    expect(idx.length).toBe(43); // 24 actifs + 2 pages du registre + 5 fiches historiques, et 11 écoles (dont 4 fermées)
    expect(Object.keys(idx.find((e) => e.u === "0440001A")!).sort()).toEqual(["c", "d", "f", "n", "s", "u"]);
    expect(idx.find((e) => e.u === "0440004D")).toBeUndefined();
  });

  test("écoles : dans la recherche, avec leur page et dans le plan du site", () => {
    const idx = JSON.parse(page("recherche.json")) as EntreeIndex[];
    expect(idx.filter((e) => estEcole(e.f)).length).toBe(11);
    expect(idx.find((e) => e.u === "0440202B")).toEqual({ u: "0440202B", n: "École élémentaire Jules-Ferry", c: "Nantes", d: "44", f: "elementaire", s: "public" });
    expect(page("etablissement/0440201A")).toContain("<h1>École maternelle Les Lilas</h1>");
    expect(page("sitemap.xml")).toContain("/etablissement/0440201A/");
  });

  test("accueil : le nombre d'établissements compte les écoles ouvertes", () => {
    // Écoles + collèges + lycées + EREA de la rangée de chiffres : les 32 établissements ouverts des fixtures.
    const v = [...doc("index.html").querySelectorAll(".kpis > div")].slice(0, 4).map((x) => Number(x.querySelector(".v")!.textContent!.replace(/\s/g, "")));
    expect(v.reduce((a, b) => a + b, 0)).toBe(32);
  });
});

describe("sources, méthode, 404, sitemap", () => {
  test("sources : démonstration en tête", () => {
    const d = doc("sources");
    expect(d.querySelector("h1")!.textContent).toBe("D'où viennent les chiffres");
    expect(d.querySelector("title")!.textContent).toContain("Sources");
    expect(d.querySelector(".fabrique")).not.toBeNull();
    const fiche = JSON.parse(readFileSync(join(DONNEES_TEST, "fiches", "0440001A.json"), "utf8")) as { sources: { pageUrl: string }[] };
    const items = [...d.querySelectorAll("#fiche ol li")];
    expect(items.length).toBe(new Set(fiche.sources.map((x) => x.pageUrl)).size);
    for (const a of d.querySelectorAll("#fiche ol li a[href^='/sources/#']")) {
      const id = a.getAttribute("href")!.slice("/sources/#".length);
      expect(d.querySelector(`section[id='${id}']`) ? id : `${id} sans section`).toBe(id);
    }
    expect(doc("methode").querySelector("a[href='/sources/#fiche']")).not.toBeNull();
  });

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

  test("sources : données absentes, évaluations nationales par école et cartes scolaires non publiées", () => {
    const a = doc("sources").getElementById("absences")!;
    const t = a.textContent!.replace(/\s+/g, " ");
    expect(t).toContain(LIBELLES_ABSENCES.evaluations);
    // les deux départements des écoles du site d'essai (35, 44) ont leur carte scolaire
    expect(t).toContain(LIBELLES_ABSENCES.cartesToutes);
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
    expect(t).toContain("Les établissements fermés qui ont une page sont comptés pour les rentrées où ils avaient des élèves");
    expect(t).not.toContain("fermés avant la mise en ligne de l'observatoire (fin 2026)");
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

  test("sources : les six jeux des écoles et l'absence de données sur les RASED", () => {
    const d = doc("sources");
    for (const id of ["effectifs_ecoles", "ips_ecoles_2016", "ips_ecoles", "personnels_ecoles", "classes_ecoles", "ecoles_ep"]) {
      expect(d.getElementById(id)).not.toBeNull();
    }
    expect(texte("sources")).toContain("RASED : aucune donnée ouverte");
  });

  test("méthode : IPS des écoles et écoles fermées", () => {
    const d = doc("methode");
    const t = texte("methode");
    expect(d.getElementById("ecoles-sans-ips")).not.toBeNull();
    expect(d.getElementById("successeurs-ecoles")).not.toBeNull();
    expect(t).toContain("IPS non publié pour cette école");
    expect(t).toContain("maternelle → maternelle ou primaire");
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

describe("boutons d'impression de la fiche", () => {
  test("Fiche A4 et Tout imprimer", () => {
    const d = doc("etablissement/0440001A");
    expect(d.getElementById("imprimer")!.textContent).toBe(LIBELLES_ONGLETS.ficheA4);
    expect(d.getElementById("imprimer-tout")).not.toBeNull();
  });
});

describe("corrections de millésime", () => {
  test("bloc Sources : « Millésime 2024-2025 corrigé par le producteur le … », deux liens", () => {
    const d = doc("etablissement/0440001A");
    const li = [...d.querySelectorAll("#sources li div")].find((x) => x.textContent!.includes("Millésime 2024-2025 corrigé"))!;
    expect(li).toBeDefined();
    expect(li.textContent).toContain("corrigé par le producteur le 22/11/2026");
    expect(li.textContent).toContain("version précédente");
    expect(li.textContent).toContain("version corrigée");
    expect(li.querySelectorAll("a[href*='/releases/download/']")).toHaveLength(2);
    expect(texte("etablissement/0440002B")).not.toContain("Millésime 2024-2025 corrigé"); // l'IPS d'une autre fiche
  });

  test("fiche : exercice de budget antérieur corrigé, sur sa propre ligne de source", () => {
    const d = doc("etablissement/0440001A");
    const div = [...d.querySelectorAll("#sources li div")].find((x) => x.textContent!.includes("Millésime 2023 corrigé"))!;
    expect(div).toBeDefined();
    expect(div.querySelectorAll("a[href*='/releases/download/']")).toHaveLength(2);
  });

  test("page département : section Sources, mention du budget corrigé et deux liens", () => {
    const li = [...doc("departement/44").querySelectorAll("section li")].find((x) => x.textContent!.includes("Millésime 2023 corrigé"))!;
    expect(li).toBeDefined();
    expect(li.textContent).toContain("Millésime 2023 corrigé par le producteur le 22/11/2026");
    expect(li.textContent).toContain("version précédente");
    expect(li.textContent).toContain("version corrigée");
    expect(li.querySelectorAll("a[href*='/releases/download/']")).toHaveLength(2);
    expect(texte("departement/75")).not.toContain("corrigé par le producteur");
  });
});

describe("fiche en onglets", () => {
  const propre = (t: string | null | undefined) => (t ?? "").replace(/[ \t\r\n\u00a0\u202f]+/g, " ").trim();
  const FICHES = ["0440001A", "0440003C"];

  test("barre d'onglets : huit onglets dans l'ordre, panneau Synthèse affiché d'emblée", () => {
    for (const uai of FICHES) {
      const d = doc(`etablissement/${uai}`);
      expect([...d.querySelectorAll("nav.onglets a")].map((a) => a.getAttribute("href"))).toEqual(
        ["#o-synthese", "#o-eleves", "#o-social", "#o-enseignants", "#o-resultats", "#o-moyens", "#o-alentours", "#o-sources"],
      );
      expect(d.querySelector("nav.toc")).toBeNull();
      expect(d.querySelector("#o-synthese")!.hasAttribute("data-defaut")).toBe(true);
      expect(d.querySelectorAll("[data-defaut]")).toHaveLength(1);
    }
  });

  test("Synthèse : case Résultats, même session, même taux et même valeur ajoutée que l'onglet Résultats", () => {
    for (const uai of FICHES) {
      const d = doc(`etablissement/${uai}`);
      const cases = [...d.querySelectorAll("#o-synthese .kpis > div")];
      const caseRes = cases.find((c) => propre(c.querySelector(".k")?.textContent).startsWith("Résultats"))!;
      expect(caseRes).toBeDefined();
      const lignes = [...caseRes.querySelectorAll(".c")].map((l) => propre(l.textContent));
      const cartes = [...d.querySelectorAll("#resultats .card.wide")];
      if (cartes.length === 0) {
        // sans résultat publié, l'absence est dite dans la case comme dans l'onglet
        expect(propre(caseRes.textContent)).toContain(LIBELLES_RESULTATS.aucun);
        expect(propre(d.querySelector("#resultats")!.textContent)).toContain(LIBELLES_RESULTATS.aucun);
        continue;
      }
      expect(lignes).toHaveLength(cartes.length);
      cartes.forEach((carte, i) => {
        const session = propre(carte.querySelector(".lab .yr")?.textContent);
        const ligne = [...carte.querySelectorAll("tbody tr")].find((tr) => propre(tr.querySelector("td")?.textContent) === LIBELLES_RESULTATS.lignes.taux_reussite)!;
        const cellules = [...ligne.querySelectorAll("td")];
        const taux = propre(cellules[1]!.textContent);
        const va = propre(cellules[2]!.textContent);
        expect(lignes[i]).toContain(session);
        expect(lignes[i]).toContain(taux);
        if (va !== "" && !va.includes(LIBELLES_RESULTATS.nonPublie)) expect(lignes[i]).toContain(va);
      });
      // aucun jugement : ni classe de couleur, ni rang
      expect(caseRes.querySelector(".bon, .mauvais, .rang")).toBeNull();
      expect(propre(caseRes.textContent)).not.toMatch(/rang|classement|meilleur/i);
    }
  });

  test("Synthèse : deux courbes, case Moyens égale à la ligne hors personnel de l'onglet Moyens", () => {
    for (const uai of FICHES) {
      const d = doc(`etablissement/${uai}`);
      expect(d.querySelectorAll("#o-synthese svg[role=img]")).toHaveLength(2);
      const caseMoyens = [...d.querySelectorAll("#o-synthese .kpis > div")].find((c) => propre(c.querySelector(".k")?.textContent).startsWith("Fonctionnement par élève"))!;
      expect(caseMoyens).toBeDefined();
      const ligne = [...d.querySelectorAll("#moyens tbody tr")].find((tr) => propre(tr.querySelector("td")?.textContent) === LIBELLES_BUDGET.postes.horsPersonnel)!;
      const montant = propre(ligne.querySelectorAll("td")[1]!.textContent);
      expect(propre(caseMoyens.querySelector(".v, .na")?.textContent)).toBe(montant);
    }
  });

  test("ancres historiques conservées dans leur onglet", () => {
    const d = doc("etablissement/0440001A");
    expect(d.querySelector("#o-alentours #pial")).not.toBeNull();
    expect(d.querySelector("#o-alentours #voisins")).not.toBeNull();
    expect(d.querySelector("#o-alentours #ecoles-secteur")).not.toBeNull();
    expect(d.querySelector("#o-enseignants #vs")).not.toBeNull();
    expect(d.querySelector("#o-enseignants #ens")).not.toBeNull();
    expect(d.querySelector("#o-eleves #eleves")).not.toBeNull();
    expect(d.querySelector("#o-social #social")).not.toBeNull();
    expect(d.querySelector("#o-resultats #resultats")).not.toBeNull();
    expect(d.querySelector("#o-moyens #moyens")).not.toBeNull();
    expect(d.querySelector("#o-sources #sources")).not.toBeNull();
    expect(d.querySelector("#o-synthese .kpis")).not.toBeNull();
    // la fiche A4 reste hors des panneaux
    expect(d.querySelector("[data-onglet] .a4, [data-onglet] #fiche-a4")).toBeNull();
    expect(d.querySelector("script[src='/js/onglets.js']")).not.toBeNull();
  });
});

describe("cases de la Synthèse cliquables", () => {
  /** Cibles des liens de la Synthèse ; chacune est un onglet de la page. */
  const cibles = (chemin: string) => {
    const d = doc(chemin);
    const panneaux = new Set([...d.querySelectorAll("[data-onglet]")].map((p) => `#${p.id}`));
    const liens = [...d.querySelectorAll("#o-synthese a.vers")].map((a) => a.getAttribute("href")!);
    for (const h of liens) expect(panneaux.has(h)).toBe(true);
    return new Set(liens);
  };

  test("fiche de collège : chaque case mène à son onglet", () => {
    const c = cibles("etablissement/0440001A");
    for (const h of ["#o-eleves", "#o-enseignants", "#o-social", "#o-resultats", "#o-moyens"]) expect(c.has(h)).toBe(true);
  });

  test("fiche d'école : élèves, composition sociale, moyens", () => {
    const c = cibles("etablissement/0440202B");
    for (const h of ["#o-eleves", "#o-social", "#o-moyens"]) expect(c.has(h)).toBe(true);
  });

  test("territoires : familles, IPS et moyens vers leur onglet", () => {
    const dep = cibles("departement/44");
    for (const h of ["#o-colleges", "#o-lycees"]) expect(dep.has(h)).toBe(true);
    expect(cibles("region/52").has("#o-lycees")).toBe(true);
    expect(cibles("france").has("#o-colleges")).toBe(true);
    expect(cibles("commune/44109").size).toBeGreaterThan(0);
  });

  test("le lien couvre toute la case, sans masquer les liens qu'elle contient", () => {
    const css = readFileSync(join(import.meta.dir, "../site/src/styles/obs.css"), "utf8");
    expect(css).toMatch(/a\.vers::after\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
    expect(css).toMatch(/:has\(a\.vers\)[^{]*\{[^}]*position:\s*relative/);
  });
});
