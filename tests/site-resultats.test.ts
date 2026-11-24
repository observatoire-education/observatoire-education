import { beforeAll, describe, expect, test } from "bun:test";
import type { Nuage } from "@obs/shared/donnees";
import { optionsNuage } from "../site/src/lib/plot.ts";
import { celluleReussite, celluleVa, vaSignee } from "../site/src/lib/resultats.ts";
import { doc, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const norm = (s: string) => s.replace(/[   ]/g, " ");
const t = (c: string) => norm(texte(c));
const section = (c: string) => norm(doc(c).querySelector("#resultats")!.textContent!.replace(/\s+/g, " "));

describe("mise en forme", () => {
  test("valeur ajoutée signée", () => {
    expect(vaSignee(3)).toBe("+3");
    expect(vaSignee(-2)).toBe("−2");
    expect(vaSignee(0)).toBe("0");
    expect(vaSignee(0.4)).toBe("+0,4");
  });
  test("un seul chiffre", () => {
    const r = (voie: "bac_gt" | "bac_pro", taux: number | null, va: number | null) => ({ voie, session: 2025, taux, va });
    expect(norm(celluleReussite([{ voie: "brevet_general", session: 2025, taux: 92, va: 3 }], "college"))).toBe("92 %");
    expect(norm(celluleReussite([r("bac_gt", 92, 3), r("bac_pro", 85, -1)], "lpo"))).toBe("GT 92 % · pro 85 %");
    expect(norm(celluleReussite([r("bac_gt", 92, 3)], "lpo"))).toBe("GT 92 %");
    expect(celluleVa([r("bac_gt", 92, 3), r("bac_pro", 85, -1)], "lpo")).toBe("GT +3 · pro −1");
    expect(celluleReussite([], "college")).toBe("non disponible");
  });
});

describe("section Résultats de la fiche", () => {
  test("fiche de collège : section Résultats, deux sous-blocs, session 2025", () => {
    const d = doc("etablissement/0440001A");
    const s = d.querySelector("section#resultats")!;
    expect(s).not.toBeNull();
    expect(s.nextElementSibling?.id).toBe("moyens");
    expect(d.querySelector("nav.toc a[href='#resultats']")).not.toBeNull();
    const x = section("etablissement/0440001A");
    expect(x).toContain("Diplôme national du brevet, série générale");
    expect(x).toContain("Diplôme national du brevet, série professionnelle");
    expect(x).toContain("session 2025");
    expect(x).toContain("Candidats");
    expect(x).toContain("Taux de réussite");
    expect(x).toContain("Note moyenne à l'écrit");
    expect(x).toContain("Taux d'accès de la 6e à la 3e");
    expect(x).toContain("Mentions (assez bien · bien · très bien)25 · 18 · 7");
    expect(x).toContain("Valeur ajoutée");
  });

  test("taux : écart en premier, moyenne entre parenthèses, « moyenne calculée par l'observatoire »", () => {
    const x = section("etablissement/0440001A");
    expect(x).toContain("+3,3 (76,7)");
    expect(x).toContain("moyenne calculée par l'observatoire");
  });

  test("valeur ajoutée signée, sans écart", () => {
    const d = doc("etablissement/0440001A");
    const ligne = [...d.querySelectorAll("#resultats tr")].find((tr) => tr.textContent!.includes("Taux de réussite"))!;
    const cases = [...ligne.querySelectorAll("td")].map((c) => norm(c.textContent!.trim()));
    expect(cases[1]).toBe("80 %");
    expect(cases[2]).toBe("+3");
    expect(t("etablissement/0440005E")).toContain("−0,3");
  });

  test("série professionnelle : « valeur ajoutée non publiée pour la série professionnelle »", () => {
    expect(section("etablissement/0440001A")).toContain("valeur ajoutée non publiée pour la série professionnelle");
    expect(section("etablissement/0440006F")).not.toContain("série professionnelle");
  });

  test("valeur ND : « non publié pour cette session », aucun 0", () => {
    const x = section("etablissement/0440007G");
    expect(x).toContain("non publié pour cette session");
    const ligne = [...doc("etablissement/0440007G").querySelectorAll("#resultats tr")].find((tr) => tr.textContent!.includes("Taux de réussite"))!;
    expect(ligne.textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });

  test("LPO : rupture 2021 signalée sous la courbe", () => {
    const d = doc("etablissement/0440103C");
    const x = section("etablissement/0440103C");
    expect(x).toContain("Baccalauréat, voie générale et technologique");
    expect(x).toContain("Baccalauréat, voie professionnelle");
    expect(x).toContain("Présents");
    expect(x).toContain("Taux d'accès de la seconde au bac");
    expect(x).toContain("Réforme du baccalauréat : les séries changent à partir de la session 2021.");
    expect(d.querySelectorAll("#resultats svg").length).toBe(2);
    // Pas de rupture signalée sur une fiche de collège.
    expect(section("etablissement/0440001A")).not.toContain("Réforme du baccalauréat");
  });

  test("phrase fixe et lien vers /methode/#valeur-ajoutee, identiques sur deux fiches", () => {
    for (const c of ["etablissement/0440001A", "etablissement/0440103C"]) {
      expect(section(c)).toContain("La valeur ajoutée compare le résultat de l'établissement à celui qu'on attendrait compte tenu de ses élèves.");
      const a = [...doc(c).querySelectorAll("#resultats a")].find((x) => x.textContent!.trim() === "Comment la lire")!;
      expect(a.getAttribute("href")).toBe("/methode/#valeur-ajoutee");
    }
  });

  test("fiche sans résultats : « pas de résultats publiés pour cet établissement »", () => {
    expect(section("etablissement/0440003C")).toContain("pas de résultats publiés pour cet établissement");
  });

  test("fiche A4 : dernière session, moyennes seules", () => {
    const a4 = norm(doc("etablissement/0440001A").querySelector(".a4")!.textContent!.replace(/\s+/g, " "));
    expect(a4).toContain("Résultats");
    expect(a4).toContain("Diplôme national du brevet, série générale · session 2025");
    expect(a4).toContain("76,7");
    expect(a4).not.toContain("+3,3 (76,7)");
    const sources = [...doc("etablissement/0440001A").querySelectorAll(".a4 .ft li")].map((l) => l.textContent!);
    const ivac = sources.find((l) => l.includes("valeur ajoutée des collèges"))!;
    expect(ivac).toContain("session 2025");
    expect(ivac).not.toContain("moyennes calculées (Σ / Σ)");
  });
});

describe("voisins et listes", () => {
  test("voisins : colonnes réussite, valeur ajoutée, part d'agrégés ; LPO « GT … · pro … »", () => {
    const en = [...doc("etablissement/0440001A").querySelectorAll("#voisins thead th")].map((th) => th.textContent!.trim());
    expect(en).toEqual(expect.arrayContaining(["IPS", "Réussite", "Valeur ajoutée", "Part d'agrégés"]));
    const v = norm(doc("etablissement/0440001A").querySelector("#voisins")!.textContent!.replace(/\s+/g, " "));
    expect(v).toContain("60 %");
    expect(v).toContain("+1");
    // Un LPO voisin dont seule la voie professionnelle a un résultat : la voie est nommée (« pro 70 % »).
    const l = norm(doc("etablissement/0440003C").querySelector("#voisins")!.textContent!);
    expect(l).toContain("pro 70 %");
    expect(l).toContain("pro −1");
  });

  test("liste du département : colonnes réussite et valeur ajoutée triables, tri par défaut par nom", () => {
    const d = doc("departement/44");
    const th = [...d.querySelectorAll("#liste-college thead th")];
    const noms = th.map((x) => x.textContent!.trim());
    expect(noms).toEqual(expect.arrayContaining(["Réussite", "Valeur ajoutée"]));
    for (const n of ["Réussite", "Valeur ajoutée"]) {
      const c = th.find((x) => x.textContent!.trim() === n)!;
      expect(c.getAttribute("data-tri")).toBe("nombre");
    }
    expect(th[0]!.getAttribute("aria-sort")).toBe("ascending");
    const i = noms.indexOf("Réussite");
    const ligne = [...d.querySelectorAll("#liste-college tbody tr")].find((tr) => tr.textContent!.includes("Jules-Verne"))!;
    const cases = ligne.querySelectorAll("td");
    expect(cases[i]!.getAttribute("data-v")).toBe("80");
    expect(cases[i + 1]!.getAttribute("data-v")).toBe("3");
    expect(norm(cases[i]!.textContent!)).toBe("80 %");
    expect(cases[i + 1]!.textContent!.trim()).toBe("+3");
    const nomsEtab = [...d.querySelectorAll("#liste-college tbody td:first-child")].map((x) => x.textContent!.trim());
    expect(nomsEtab).toEqual([...nomsEtab].sort((a, b) => a.localeCompare(b, "fr")));
  });

  test("le tri numérique de liste.js range les absences en fin", async () => {
    const js = await Bun.file("site/public/js/liste.js").text();
    expect(js).toContain('dataset.tri === "nombre"');
    expect(js).toContain("absences toujours en fin");
  });

  test("aucun mot de palmarès dans les pages touchées", () => {
    for (const c of ["etablissement/0440001A", "etablissement/0440103C", "etablissement/0440003C", "departement/44"]) {
      expect(t(c)).not.toMatch(/\b(rang|classement|top|meilleur(e)?s?|pire)s?\b/i);
    }
  });
});

describe("nuages IPS × réussite", () => {
  const sec = (c: string, voie: string) => doc(c).querySelector(`#nuages .nuage[data-voie='${voie}']`);

  test("page département : nuage, formes pleines et contour, <title> par point, aucun nom écrit hors <title>", () => {
    const n = sec("departement/35", "brevet_general")!;
    expect(n).not.toBeNull();
    expect(norm(n.querySelector(".lab")!.textContent!)).toContain("Collèges : IPS et réussite au brevet (série générale)");
    const pts = [...n.querySelectorAll("svg circle")];
    expect(pts).toHaveLength(5);
    // Plot porte fill et stroke sur le groupe de points
    const g = (c: Element, a: string) => c.parentElement!.getAttribute(a);
    expect(pts.filter((c) => g(c, "fill") === "var(--pub)")).toHaveLength(3);
    const prives = pts.filter((c) => g(c, "fill") === "var(--surface)");
    expect(prives).toHaveLength(2);
    expect(prives.every((c) => g(c, "stroke") === "var(--pri)")).toBe(true);
    expect(new Set(pts.map((c) => c.getAttribute("r")))).toEqual(new Set(["3"]));
    const titres = pts.map((c) => norm(c.querySelector("title")!.textContent!));
    expect(titres).toContain("Collège Les Ajoncs (Rennes) · Public · IPS 98,0 · réussite 80 % · valeur ajoutée +1 · 100 candidats");
    expect(titres).toContain("Collège Saint-Joseph (Vitré) · Privé sous contrat · IPS 118,0 · réussite 93 % · valeur ajoutée −1 · 80 candidats");
    expect(titres).toContain("Collège Les Chênes (Vitré) · Public · IPS 92,0 · réussite 90 % · valeur ajoutée non publiée · 40 candidats");
    const svg = n.querySelector("svg")!;
    expect(svg.querySelectorAll("circle text").length).toBe(0);
    for (const x of svg.querySelectorAll("title")) x.remove();
    expect(svg.outerHTML).not.toMatch(/Ajoncs|Bruyères|Chênes|Sainte-Anne|Saint-Joseph/);
  });

  test("page académie : nuage des collèges et des lycées GT", () => {
    expect(sec("academie/14", "brevet_general")).not.toBeNull();
    expect(sec("academie/14", "bac_gt")).not.toBeNull();
    expect(sec("academie/14", "bac_pro")).toBeNull();
    expect(norm(sec("academie/14", "bac_gt")!.querySelector(".lab")!.textContent!)).toContain("Lycées : IPS de la voie générale et technologique et réussite au bac");
  });

  test("note sous le nuage", () => {
    const x = norm(sec("departement/35", "brevet_general")!.textContent!.replace(/\s+/g, " "));
    expect(x).toContain("Chaque point est un établissement. Lignes : moyennes du territoire. Survolez un point pour son nom et ses valeurs ; le tableau des établissements donne les mêmes chiffres.");
    expect(x).not.toContain("IPS de l'ensemble de l'établissement");
  });

  test("aucune droite de régression (une seule ligne par axe)", () => {
    const svg = sec("departement/35", "bac_gt")!.querySelector("svg")!;
    expect(svg.querySelectorAll("[class~='moyenne-ips']").length).toBe(1);
    expect(svg.querySelectorAll("[class~='moyenne-taux']").length).toBe(1);
  });

  test("optionsNuage : fonction pure, une règle par axe", () => {
    const n: Nuage = {
      voie: "bac_gt", session: 2025, rentreeIps: 2024, ipsEnsemble: false, moyennes: { ips: 100, taux: 90 }, sources: { resultats: "ival_gt", ips: [] },
      points: [{ uai: "A", nom: "A", commune: "X", secteur: "public", ips: 100, taux: 90, va: null, effectif: null }],
    };
    const o = optionsNuage(n);
    expect(JSON.stringify(optionsNuage(n))).toBe(JSON.stringify(o));
    expect(o.marks).toHaveLength(4);
    expect(optionsNuage({ ...n, moyennes: { ips: null, taux: null } }).marks).toHaveLength(2);
  });

  test("page France, commune et département sous 5 points : pas de nuage", () => {
    expect(doc("france").querySelector("#nuages")).toBeNull();
    expect(doc("departement/44").querySelector("#nuages")).toBeNull();
    expect(doc("commune/44109").querySelector("#nuages")).toBeNull();
  });

  test("aucun mot de palmarès dans les pages à nuages", () => {
    for (const c of ["departement/35", "academie/14"]) expect(t(c)).not.toMatch(/\b(rang|classement|top|meilleur(e)?s?|pire)s?\b/i);
  });

  test("sources sous chaque nuage : résultats (session, collecte, donnée brute) et IPS de la rentrée", () => {
    const l = (voie: string) => [...sec("departement/35", voie)!.querySelectorAll(".src li")].map((x) => norm(x.textContent!.replace(/\s+/g, " ").trim()));
    const b = l("brevet_general");
    expect(b).toHaveLength(2);
    expect(b[0]).toMatch(/^.+, .+ · session 2025 · collecté le \d{2}\/\d{2}\/\d{4}/);
    expect(b[0]).toContain("Indicateurs de valeur ajoutée des collèges");
    expect(b[1]).toMatch(/rentrée 2024-2025 · collecté le \d{2}\/\d{2}\/\d{4}/);
    const liens = [...sec("departement/35", "brevet_general")!.querySelectorAll(".src li a")].map((a) => a.getAttribute("href"));
    expect(liens).toHaveLength(4); // page du jeu et donnée brute, deux fois
    expect(l("bac_gt")[0]).toContain("session 2025");
  });

  test("page région : pas de nuage", () => {
    expect(doc("region/53").querySelector("#nuages")).toBeNull();
  });
});
