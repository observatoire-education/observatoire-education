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
    expect(lignes[0]).toBe("uai;nom;famille;secteur;commune;ep;eleves;eleves_par_etp_ens;eleves_par_etp_vs;part_enseignantes;ips;session_brevet;reussite_brevet;va_brevet;session_bac_gt;reussite_bac_gt;va_bac_gt;session_bac_pro;reussite_bac_pro;va_bac_pro;rentree_eleves;rentree_ips");
    expect(lignes.some((l) => l.startsWith("0440001A;"))).toBe(true);
    expect(lignes.find((l) => l.startsWith("0440201A;"))!.split(";").slice(-2)).toEqual(["2025", ""]); // maternelle : IPS non publié
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

describe("premier degré sur les territoires", () => {
  const ECOLES_OUVERTES = ["0440201A", "0440202B", "0440203C", "0440104D", "0440105E", "0440108H"];
  const bloc = (chemin: string) => doc(chemin).querySelector("#premier-degre");

  test("département : écoles, élèves, élèves par classe, IPS des écoles, hors contrat en nombre", () => {
    const b = bloc("departement/44")!;
    expect(b).not.toBeNull();
    expect(b.querySelector("h2")!.textContent!.trim()).toBe("Écoles");
    const t = b.textContent!.replace(/\s+/g, " ");
    expect(t).toContain("5 publiques");
    expect(t).toContain("1 privée s. c.");
    expect(t).toContain("Élèves par classe");
    expect(t).toContain("23,8"); // 524 élèves ÷ 22 classes
    expect(t).toContain("99,9"); // moyenne DEPP des écoles publiques du département
    expect(t).toContain("1 école");
    expect(t).toContain("non couvert par les statistiques publiques");
    expect(doc("departement/44").querySelector("nav.onglets a[href='#o-ecoles']")).not.toBeNull();
    expect(doc("departement/44").querySelector("#o-ecoles #premier-degre")).not.toBeNull();
  });

  test("département : aucune liste nominative d'écoles, renvoi au CSV du département", () => {
    const d = doc("departement/44");
    for (const uai of ECOLES_OUVERTES) expect(d.querySelector(`a[href='/etablissement/${uai}/']`)).toBeNull();
    expect(texte("departement/44")).not.toContain("École maternelle Les Lilas");
    expect(bloc("departement/44")!.querySelector("a[href='/departement/44/etablissements.csv']")).not.toBeNull();
  });

  test("évolution des écoles et des classes, fermetures par année", () => {
    const b = bloc("departement/44")!;
    const arias = [...b.querySelectorAll("svg[role=img]")].map((s) => s.getAttribute("aria-label")!);
    expect(arias.some((a) => a.startsWith("Écoles : 2014 3"))).toBe(true);
    expect(arias.some((a) => a.includes("2019 2"))).toBe(true); // fusion des Tilleuls : deux écoles fermées
    expect(arias.some((a) => a.includes("29 en 2025"))).toBe(true); // 0440105E (0 classe) hors du total
    expect(b.outerHTML).not.toMatch(/NaN/);
    const t = b.textContent!.replace(/\s+/g, " ");
    expect(t).toContain("1 école sans nombre de classes publié, non comptée");
    expect(t).toContain("la fusion de deux écoles en une compte pour deux fermetures");
  });

  test("département : communes qui ont ou ont eu une école, par lettre, noms seuls", () => {
    const liste = doc("departement/44").querySelector("#communes-ecoles")!;
    expect(liste).not.toBeNull();
    const liens = [...liste.querySelectorAll("a")];
    expect(liens.map((a) => a.getAttribute("href"))).toEqual(["/commune/44888/", "/commune/44109/", "/commune/44150/", "/commune/44903/"]);
    expect(liens.map((a) => a.textContent!.trim())).toEqual(["Les Sables", "Nantes", "Saint-Aubin", "Val-de-l'Erdre"]);
    expect([...liste.querySelectorAll("dt")].map((x) => x.textContent!.trim())).toEqual(["L", "N", "S", "V"]);
  });

  test("académie, région, France : synthèse sans liste de communes", () => {
    for (const chemin of ["academie/17", "region/52", "france"]) {
      const b = bloc(chemin)!;
      expect(b).not.toBeNull();
      expect(b.textContent).toContain("Élèves par classe");
      expect(doc(chemin).querySelector("#communes-ecoles")).toBeNull();
    }
    expect(bloc("region/52")!.textContent).toContain("moyenne calculée par l'observatoire");
  });

  test("département sans école : pas de bloc", () => {
    expect(bloc("departement/75")).toBeNull();
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

describe("territoires en onglets", () => {
  const hrefs = (chemin: string) => [...doc(chemin).querySelectorAll("nav.onglets a")].map((a) => a.getAttribute("href"));
  /** Nombre écrit avec des espaces de groupement (« 3 690 ») ; null pour « — ». */
  const nombreDe = (t: string) => (/\d/.test(t) ? Number(t.replace(/[^\d]/g, "")) : null);

  test("département : onglets des blocs présents (fixtures : ni Résultats ni Moyens de la commune)", () => {
    expect(hrefs("departement/44")).toEqual(["#o-synthese", "#o-colleges", "#o-lycees", "#o-ecoles", "#o-transport", "#o-travaux", "#o-territoires", "#o-sources"]);
    const d = doc("departement/44");
    // chaque onglet a son panneau, la Synthèse est le panneau par défaut
    for (const h of hrefs("departement/44")) expect(d.querySelector(`${h}[data-onglet][role=tabpanel]`)).not.toBeNull();
    expect(d.querySelector("#o-synthese")!.hasAttribute("data-defaut")).toBe(true);
    // anciennes ancres : dans le panneau de leur famille ou de leur thème
    expect(d.querySelector("#o-colleges #college")).not.toBeNull();
    for (const f of ["legt", "lpo", "erea"]) expect(d.querySelector(`#o-lycees #${f}`)).not.toBeNull();
    expect(d.querySelector("#o-ecoles #premier-degre")).not.toBeNull();
    expect(d.querySelector("#o-transport #transport")).not.toBeNull();
    expect(d.querySelector("#o-travaux #travaux")).not.toBeNull();
    expect(d.querySelector("#o-territoires #communes")).not.toBeNull();
    expect(d.querySelector("#o-sources #sources")).not.toBeNull();
    // ni l'ancienne barre ni de carte hors de la Synthèse
    expect(d.querySelector(".tabs")).toBeNull();
    expect(d.querySelector("#o-synthese #carte-territoire")).not.toBeNull();
    // les chiffres forts passent avant la carte
    const kpis = d.querySelector("#o-synthese .kpis")!, carte = d.querySelector("#o-synthese #carte-territoire")!;
    expect(kpis.compareDocumentPosition(carte) & 4).toBe(4);
    expect(d.querySelector("script[src='/js/onglets.js']")).not.toBeNull();
  });

  test("département : élèves en collège et lycée = somme des cases « Élèves » des familles, familles non publiées dites", () => {
    const d = doc("departement/44");
    const familles = [...d.querySelectorAll("#o-colleges > section[id], #o-lycees > section[id]")];
    const eleves = familles.map((s) => nombreDe(s.querySelector(".kpis > div .v")!.textContent!));
    const somme = eleves.reduce<number>((a, n) => a + (n ?? 0), 0);
    const cas = d.querySelector("#o-synthese .eleves-second-degre")!;
    expect(cas.querySelector(".k")!.textContent).toContain("Élèves en collège et lycée");
    expect(nombreDe(cas.querySelector(".v")!.textContent!)).toBe(somme);
    expect(cas.textContent).toContain("somme des familles d'établissements");
    // l'EREA des fixtures n'a pas d'effectif publié : le total le dit
    expect(eleves[familles.findIndex((s) => s.id === "erea")]).toBeNull();
    expect(cas.textContent).toContain("hors EREA (effectif non publié)");
    expect(d.querySelector("#o-synthese")!.textContent).toContain("Part du privé sous contrat");
  });

  test("département : la case IPS des collèges reprend celle de l'onglet Collèges", () => {
    const d = doc("departement/44");
    const v = (sel: string) => d.querySelector(sel)!.textContent!.replace(/\s+/g, " ").trim();
    expect(v("#o-synthese .kpis .v[style*='font-size:20px']")).toBe(v("#college .kpis .v[style*='font-size:20px']"));
  });

  test("département : la case Moyens affiche le montant du bloc Moyens des collèges", () => {
    const d = doc("departement/44");
    const montant = d.querySelector("#o-synthese .moyens-synthese .v")!.textContent!.trim();
    expect(montant).toMatch(/\d/);
    const ligne = [...d.querySelectorAll("#college .moyens-territoire tr")].find((tr) => tr.textContent!.includes("Fonctionnement hors personnel"))!;
    expect(ligne.textContent).toContain(montant);
  });

  test("académie : pas de case Moyens dans la Synthèse", () => {
    const d = doc("academie/17");
    expect(d.querySelector("#o-synthese")).not.toBeNull();
    expect(d.querySelector("#o-synthese .moyens-synthese")).toBeNull();
    expect(d.querySelector("#o-colleges #college .moyens-territoire")).not.toBeNull();
  });

  test("France : régions et académies dans l'onglet Territoires", () => {
    const d = doc("france");
    expect(d.querySelector("#o-territoires #regions")).not.toBeNull();
    expect(d.querySelector("#o-territoires #territoires")).not.toBeNull();
    expect(d.querySelector("#o-synthese .moyens-synthese")).not.toBeNull();
  });

  test("département à nuages : Résultats dans son onglet", () => {
    expect(hrefs("departement/35")).toContain("#o-resultats");
    expect(doc("departement/35").querySelector("#o-resultats #nuages")).not.toBeNull();
  });

  test("commune : moyens de la commune dans leur onglet, avant Sources ; écoles et dépense dans la Synthèse", () => {
    const d = doc("commune/44109");
    expect(d.querySelector("#moyens-commune")).not.toBeNull();
    expect(d.querySelector("#o-moyens-commune #moyens-commune")).not.toBeNull();
    expect(hrefs("commune/44109").slice(-2)).toEqual(["#o-moyens-commune", "#o-sources"]);
    expect(d.querySelector("#o-ecoles #ecoles")).not.toBeNull();
    const s = d.querySelector("#o-synthese")!;
    expect(s.querySelector(".ecoles-commune")).not.toBeNull();
    expect(s.querySelector(".moyens-synthese")).not.toBeNull();
    expect(s.querySelector(".ips-calcule")).not.toBeNull();
  });

  test("commune sans second degré : barre seulement à partir de trois onglets, aucun bloc perdu", () => {
    for (const c of ["44150", "44903", "44888"]) {
      const d = doc(`commune/${c}`);
      const n = hrefs(`commune/${c}`).length;
      const panneaux = d.querySelectorAll("[data-onglet]").length;
      // Fixtures : Synthèse (écoles de la commune), Écoles, Sources au moins ; la règle des trois onglets s'applique.
      expect(n >= 3 ? panneaux : 0).toBe(n);
      if (n < 3) expect(d.querySelector("nav.onglets")).toBeNull();
      expect(d.querySelector("#ecoles")).not.toBeNull();
      expect(d.querySelector("#o-synthese #carte-territoire")).toBeNull();
      expect(d.querySelector("#o-synthese .eleves-second-degre")).toBeNull();
    }
  });
});
