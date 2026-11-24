// Bloc « Moyens de la collectivité » : fiches, fiche A4 et pages de territoire du site d'essai.
// Les fixtures de budget (Loire-Atlantique, région des Pays de la Loire, Paris) et les élèves aux rentrées
// 2022 et 2023 ajoutés par tests/site.ts font le contenu des pages ; les montants attendus en découlent.
import { beforeAll, describe, expect, test } from "bun:test";
import { LIBELLES_BUDGET as L } from "../shared/src/libelles.ts";
import { ecart, entier } from "../shared/src/format.ts";
import { absenceBudget, comparaisonBudget, montantBudget, millions, motifAbsenceTerritoire } from "../site/src/lib/budget.ts";
import { posteEvolutionAvecPersonnel, svgEvolutionBudget } from "../site/src/lib/plot.ts";
import type { ExerciceBudget } from "../shared/src/donnees.ts";
import { doc, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

/** Texte de la section « Moyens » d'une fiche. */
function moyens(uai: string): string {
  const s = doc(`etablissement/${uai}`).querySelector("section#moyens");
  if (!s) throw new Error(`pas de section #moyens sur ${uai}`);
  return (s.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
}

describe("fiche : bloc Moyens de la collectivité", () => {
  test("entrée « Moyens » au sommaire, section après « Résultats »", () => {
    const d = doc("etablissement/0440001A");
    const liens = [...d.querySelectorAll("nav.toc a")].map((a) => a.textContent);
    expect(liens).toEqual(["Élèves", "Composition sociale", "Enseignants", "Vie scolaire", "Résultats", "Moyens", "Voisins", "Sources"]);
    const ids = [...d.querySelectorAll("main section[id]")].map((s) => s.id);
    expect(ids.indexOf("moyens")).toBe(ids.indexOf("resultats") + 1);
  });

  test("collège public : les trois postes, la contribution au privé, la source", () => {
    const t = moyens("0440001A");
    expect(t).toContain(L.titre);
    for (const p of [L.postes.horsPersonnel, L.postes.avecPersonnel, L.postes.investissement, L.postes.contributionColleges]) {
      expect(t).toContain(p);
    }
    expect(t).toContain("10 440"); // fonctionnement hors personnel, € par élève
    expect(t).toContain("12 637"); // personnel compris
    expect(t).toContain("30 769"); // contribution au privé, € par élève du privé
    expect(t).toContain(L.unites.parEleve);
    expect(t).toContain(L.unites.parElevePrive);
    expect(t).toContain("DGFiP, balances comptables, exercice 2024 · élèves à la rentrée 2023 (DEPP)");
    expect(t).toContain(L.moyenne.calculee);
  });

  test("écart puis moyenne entre parenthèses sur le web, avec le nombre de collectivités", () => {
    const t = moyens("0440001A");
    expect(t).toContain(ecart(10439.56, 8011.05, 0)); // +2 429 (8 011)
    expect(t).toContain(L.moyenne.de(2));
    expect(t).toContain(L.moyenne.de(1));
  });

  test("cités scolaires : montant hors des montants par élève", () => {
    expect(moyens("0440001A")).toContain(L.citesScolairesHorsMontants("0,5 M€"));
  });

  test("personnel non rattaché : libellé exact, aucun « 0 € »", () => {
    const t = moyens("0751501A");
    expect(t).toContain(L.absences.personnelNonRattacheColleges);
    expect(t).not.toMatch(/(^|[^\d,])0\s*€/);
    expect(t).not.toMatch(/\b0 par élève/);
    // les postes présents restent affichés
    expect(t).toContain("5 556");
  });

  test("la ligne du privé n'a pas d'écart calculé quand le personnel compris est absent", () => {
    const t = moyens("0751501A");
    expect(t).toContain(L.postes.contributionColleges);
    expect(t).toContain("6 667");
    expect(t).not.toContain("Écart avec le public");
    // avec le personnel compris : mise en regard et écart au public
    const avec = moyens("0440001A");
    expect(avec).toContain("Écart avec le public");
    expect(avec).toContain("+18 132");
  });

  test("fiche privée : « Contribution aux collèges privés » avant les montants du public", () => {
    const t = moyens("0440002B");
    expect(t.indexOf(L.postes.contributionColleges)).toBeGreaterThan(-1);
    expect(t.indexOf(L.postes.contributionColleges)).toBeLessThan(t.indexOf(L.postes.horsPersonnel));
    // et en fiche publique, l'inverse
    const pub = moyens("0440001A");
    expect(pub.indexOf(L.postes.horsPersonnel)).toBeLessThan(pub.indexOf(L.postes.contributionColleges));
  });

  test("fiche lycée : mention agricole exacte, absences de l'exercice sans donnée", () => {
    const t = moyens("0440003C");
    expect(t).toContain(L.mentionAgricole);
    expect(t).toContain(L.postes.contributionLycees);
    expect(t).not.toContain(L.postes.contributionColleges);
    expect(t).toContain("non disponible");
  });

  test("collectivité non identifiée (Saint-Martin) : libellé exact", () => {
    expect(moyens("9770001G")).toContain(L.absences.collectiviteNonIdentifiee);
    expect(moyens("9770001G")).not.toContain(L.postes.horsPersonnel);
  });

  test("investissement du privé : ligne propre, sans écart avec le public ; absent si non ok", () => {
    const t = moyens("0440001A");
    expect(t).toContain("1\u202f346");
    expect(t.match(/Investissement/g)).toHaveLength(2); // public et privé
    expect(moyens("0751501A")).not.toMatch(/Investissement[^D]*non disponible[^D]*Investissement/);
    expect((moyens("0751501A").match(/Investissement/g) ?? []).length).toBe(1);
  });

  test("source du bloc liée à la donnée brute, et listée dans « Sources de cette page »", () => {
    const d = doc("etablissement/0440001A");
    const lien = d.querySelector("section#moyens .src a");
    expect(lien?.getAttribute("href")).toContain("budget_2024");
    const sources = (d.querySelector("section#sources")!.textContent ?? "");
    expect(sources).toContain("DGFiP");
    expect(sources).toContain("Balances comptables des collectivités");
    const liens = [...d.querySelectorAll("section#sources a")].map((a) => a.getAttribute("href") ?? "");
    expect(liens.some((h) => h.includes("budget_2024"))).toBe(true);
  });

  test("singulier : « moyenne de 1 collectivité »", () => {
    expect(L.moyenne.de(1)).toBe("moyenne de 1 collectivité");
    expect(L.moyenne.de(2)).toBe("moyenne de 2 collectivités");
  });

  test("source en ligne de source, collectivité nommée", () => {
    const t = moyens("0440001A");
    expect(t).toContain("Département de Loire-Atlantique");
  });
});

describe("fiche A4 : moyennes seules, pas d'écart", () => {
  const a4 = (uai: string) => {
    const el = doc(`etablissement/${uai}`).querySelector(".a4")!;
    return (el.textContent ?? "").replace(/[ \t\r\n]+/g, " ");
  };

  test("trois lignes dans le tableau central, moyenne France, source numérotée", () => {
    const d = doc("etablissement/0440001A").querySelector(".a4")!;
    const lignes = [...d.querySelectorAll(".centre tbody tr")].map((tr) => (tr.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim());
    const budget = lignes.filter((l) => /Fonctionnement|Contribution/.test(l));
    expect(budget).toHaveLength(3);
    expect(budget[0]).toContain(L.postes.horsPersonnel);
    expect(budget[0]).toContain("10 440");
    expect(budget[0]).toContain("8 011"); // moyenne France
    expect(budget[1]).toContain(L.postes.avecPersonnel);
    expect(budget[2]).toContain(L.postes.contributionColleges);
    expect(budget[2]).toContain("30 769");
    expect(budget[2]).toContain("21 951");
    // le numéro de source de la ligne figure au pied de la fiche
    expect(a4("0440001A")).toContain("DGFiP, Balances comptables des collectivités, présentation croisée nature-fonction 2024");
    expect(budget[0]).toMatch(/\[\d+\]/);
  });

  test("aucun écart calculé sur l'A4", () => {
    const d = doc("etablissement/0440001A").querySelector(".a4")!;
    const budget = [...d.querySelectorAll(".centre tbody tr")]
      .map((tr) => (tr.textContent ?? ""))
      .filter((l) => /Fonctionnement|Contribution/.test(l))
      .join(" ");
    expect(budget).not.toContain("+2 429");
    expect(budget).not.toMatch(/\(\d/);
  });

  test("absence en toutes lettres sur l'A4", () => {
    expect(a4("0751501A")).toContain(L.absences.personnelNonRattacheColleges);
  });
});

describe("pages de territoire", () => {
  /** Texte de l'onglet d'une famille (section#college, section#legt…), limité au bloc des moyens. */
  const bloc = (chemin: string, famille: string): string => {
    const s = doc(chemin).querySelector(`section#${famille} .moyens`);
    if (!s) throw new Error(`pas de bloc des moyens dans ${chemin}#${famille}`);
    return (s.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
  };

  test("département : collectivité des collèges avec évolution, région dans l'onglet des lycées", () => {
    const t = bloc("departement/44", "college");
    expect(doc("departement/44").querySelector("section#college .moyens-territoire h3")?.textContent).toBe(L.titre);
    expect(t).toContain("Département de Loire-Atlantique");
    expect(t).toContain("10 440");
    const svg = doc("departement/44").querySelector("section#college .moyens svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("role")).toBe("img");
    const carte = doc("departement/44").querySelector("section#college .moyens svg")!.parentElement!;
    const txt = (carte.textContent ?? "").replace(/\s+/g, " ");
    expect(txt).toContain(`${L.interface.public} : ${L.postes.avecPersonnel}`);
    expect(txt).toMatch(/Exercices 20\d\d à 20\d\d · Source : DGFiP, balances comptables/);
    expect(carte.querySelector('a[href="/sources/"]')).not.toBeNull();
    const lycees = bloc("departement/44", "legt");
    expect(lycees).toContain("Région Pays de la Loire");
    expect(lycees).toContain(L.mentionAgricole);
  });

  test("le bloc des lycées n'apparaît qu'une fois par page, sur le premier onglet de lycée", () => {
    const d = doc("departement/44");
    expect(d.querySelectorAll("section .moyens")).toHaveLength(2);
    expect(d.querySelector("section#lpo .moyens")).toBeNull();
  });

  test("le graphique d'évolution a un trou, pas un zéro, pour l'exercice sans donnée", () => {
    const h = page("departement/44");
    const svg = doc("departement/44").querySelector("section#legt .moyens svg")!;
    expect(svg).not.toBeNull();
    expect(h).not.toContain("NaN");
    // une seule valeur publiée (2023) : un point, pas de courbe tracée jusqu'à zéro
    expect(svg.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1);
  });

  test("académie et région : tableau des collectivités des collèges, trié par nom", () => {
    for (const chemin of ["academie/17", "region/52"]) {
      const lignes = [...doc(chemin).querySelectorAll("section#college .moyens table tbody tr")];
      expect(lignes.length).toBeGreaterThan(0);
      const noms = lignes.map((tr) => tr.querySelector("th, td")!.textContent!.trim());
      expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
      expect(noms).toContain("Département de Loire-Atlantique");
    }
  });

  test("France : tableau des collectivités", () => {
    const lignes = [...doc("france").querySelectorAll("section#college .moyens table tbody tr")];
    expect(lignes.length).toBeGreaterThan(1);
    expect(texte("france")).toContain(L.titre);
  });

  test("tableau des collectivités : colonne d'investissement du privé et lien vers la donnée brute", () => {
    const d = doc("academie/17");
    const entetes = [...d.querySelectorAll("section#college .moyens table thead th")].map((t) => t.textContent);
    expect(entetes).toContain(L.interface.investissementPrive);
    expect(d.querySelector("section#college .moyens .src a")?.getAttribute("href")).toContain("budget_2024");
  });

  test("commune : aucun bloc", () => {
    expect(doc("commune/44109").querySelector(".moyens")).toBeNull();
  });
});

describe("contrôles du bloc", () => {
  test("aucun « NaN », « Infinity » ni « undefined » dans les pages du budget", () => {
    for (const chemin of ["etablissement/0440001A", "etablissement/0440003C", "etablissement/0751501A", "departement/44", "academie/17", "region/52", "france"]) {
      const h = page(chemin);
      expect(h).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  test("anti-palmarès : aucun mot interdit dans le bloc", () => {
    for (const chemin of ["etablissement/0440001A", "departement/44", "region/52", "france"]) {
      expect(texte(chemin)).not.toMatch(/\b(rang|classement|top|meilleure?s?|pires?)\b/i);
    }
  });
});

describe("aides d'affichage", () => {
  const ok = { total: 100, parEleve: 10, statut: "ok" as const };
  test("absence : libellé par statut et par niveau", () => {
    expect(absenceBudget("personnel_non_rattache", "lycees")).toBe(L.absences.personnelNonRattacheLycees);
    expect(absenceBudget("fonction_non_detaillee", "colleges")).toBe(L.absences.fonctionNonDetailleeColleges);
    expect(absenceBudget("aucun_eleve_prive", "colleges")).toBe(L.absences.aucunElevePrive);
    expect(absenceBudget("aucune_contribution_identifiee", "colleges")).toBe(L.absences.aucuneContributionIdentifiee);
    expect(absenceBudget("aucune_collectivite", "colleges")).toBe(L.absences.aucuneCollectivite);
    expect(absenceBudget("non_disponible", "colleges")).toBe("non disponible");
  });

  test("montant : valeur ou absence, jamais zéro pour une absence", () => {
    expect(montantBudget({ ...ok, parEleve: 1234.4 }, "colleges")).toEqual({ texte: entier(1234.4), absent: false });
    const a = montantBudget({ total: null, parEleve: null, statut: "personnel_non_rattache" }, "colleges");
    expect(a).toEqual({ texte: L.absences.personnelNonRattacheColleges, absent: true });
    // statut « ok » sans valeur : traité comme non disponible
    expect(montantBudget({ total: null, parEleve: null, statut: "ok" }, "colleges").absent).toBe(true);
  });

  test("comparaison : écart (moyenne) ; rien si le montant est absent", () => {
    expect(comparaisonBudget(ok, { valeur: 4, n: 3 })).toEqual({ texte: ecart(10, 4, 0), n: 3 });
    expect(comparaisonBudget({ total: null, parEleve: null, statut: "personnel_non_rattache" }, { valeur: 4, n: 3 })).toBeNull();
    expect(comparaisonBudget(ok, undefined)?.texte).toBe("moyenne non disponible");
    expect(comparaisonBudget(ok, { valeur: null, n: 0 })?.texte).toBe("moyenne non disponible");
  });

  test("mention des cités scolaires : exercice de mesure", () => {
    expect(L.mentionCitesScolaires("9,1", 2024)).toBe(
      "Les comptes de la collectivité incluent des reversements entre collectivités pour des cités scolaires (environ 9,1 % des dépenses retenues, mesurée sur l'exercice 2024).",
    );
  });

  test("millions d'euros", () => {
    expect(millions(97_300_000)).toBe("97,3 M€");
    expect(millions(500_000)).toBe("0,5 M€");
  });
});

describe("svgEvolutionBudget", () => {
  const exercice = (e: number, avec: number | null, prive: number | null): ExerciceBudget => {
    const m = (v: number | null) => ({ total: v, parEleve: v, statut: v === null ? ("non_disponible" as const) : ("ok" as const) });
    return {
      exercice: e, rentree: e - 1, source: `budget_${e}`, eleves: { public: 1, prive: 1 },
      public: { horsPersonnel: m(avec === null ? null : avec - 100), avecPersonnel: m(avec), investissement: m(null) },
      prive: { fonctionnement: m(prive), investissement: m(null) }, citesScolaires: null,
    };
  };

  test("deux courbes ; un exercice absent fait un trou, pas un zéro", () => {
    const s = svgEvolutionBudget([exercice(2022, 1000, 2000), exercice(2023, null, null), exercice(2024, 1200, 2200)]);
    expect(s).toContain("<svg");
    expect(s).not.toMatch(/NaN|Infinity|undefined/);
    // aucun tracé ne relie 2022 à 2024 : les groupes de courbes ne contiennent aucun segment « L »
    const courbes = [...s.matchAll(/<g [^>]*stroke="var\(--pr?[ui][b]?\)"[^>]*fill="none"[^>]*>(.*?)<\/g>/g)].map((m) => m[1]!);
    expect(courbes.length).toBe(2);
    for (const c of courbes) expect(c).not.toContain("L");
    expect(s.match(/<circle/g)).toHaveLength(4);
  });

  test("sans aucune valeur : chaîne vide", () => {
    expect(svgEvolutionBudget([exercice(2024, null, null)])).toBe("");
  });

  test("hors personnel à défaut du personnel compris", () => {
    const sans = (e: number) => ({ ...exercice(e, 1000, null), public: { ...exercice(e, 1000, null).public, avecPersonnel: { total: null, parEleve: null, statut: "personnel_non_rattache" as const } } });
    const s = svgEvolutionBudget([sans(2023), sans(2024)]);
    expect(s).toContain(L.postes.horsPersonnel.toLowerCase());
  });

  test("sans personnel rattaché : aucune ligne privée, même si la contribution est connue", () => {
    const sans = (e: number) => ({ ...exercice(e, 1000, 2000), public: { ...exercice(e, 1000, 2000).public, avecPersonnel: { total: null, parEleve: null, statut: "personnel_non_rattache" as const } } });
    const s = svgEvolutionBudget([sans(2023), sans(2024)]);
    expect(s).not.toContain("var(--pri)");
    expect(s).not.toContain("Privé sous contrat");
    expect(posteEvolutionAvecPersonnel([sans(2023)])).toBe(false);
  });

  test("avec personnel rattaché au moins un exercice : deux lignes", () => {
    const s = svgEvolutionBudget([exercice(2023, 1000, 2000), exercice(2024, null, null)]);
    expect(s).toContain("var(--pri)");
    expect(posteEvolutionAvecPersonnel([exercice(2023, 1000, 2000)])).toBe(true);
  });
});

describe("territoire sans collectivité", () => {
  test("le motif est dérivé d'un département du territoire", () => {
    expect(motifAbsenceTerritoire({ niveau: "departement", code: "976" }, [])).toBe("aucune_collectivite");
    expect(motifAbsenceTerritoire({ niveau: "region", code: "06" }, [])).toBe("aucune_collectivite");
    expect(motifAbsenceTerritoire({ niveau: "academie", code: "28" }, [{ ref: { code: "976" } }])).toBe("aucune_collectivite");
    expect(motifAbsenceTerritoire({ niveau: "academie", code: "28" }, [{ ref: { code: "975" } }])).toBe("collectivite_non_identifiee");
    expect(motifAbsenceTerritoire({ niveau: "academie", code: "28" }, [])).toBeNull();
  });
});

describe("page France : carte et CSV du budget", () => {
  const ENTETE = "collectivite;libelle;exercice;rentree;eleves_public;eleves_prive;fonct_hors_personnel_par_eleve;fonct_avec_personnel_par_eleve;invest_public_par_eleve;contribution_prive_par_eleve;invest_prive_par_eleve;statut_personnel";

  test("les deux CSV existent, une ligne d'en-tête exacte, aucune cellule « 0 » pour une absence (cellule vide et statut)", () => {
    for (const n of ["colleges", "lycees"]) {
      const lignes = page(`france/budget-${n}.csv`).trim().split("\n");
      expect(lignes[0]).toBe(ENTETE);
      expect(lignes.length).toBeGreaterThan(1);
      for (const l of lignes.slice(1)) {
        const c = l.split(";");
        expect(c).toHaveLength(12);
        // un montant absent est vide, jamais « 0 » ; le statut de la ligne dit pourquoi
        for (const i of [4, 5, 6, 7, 8, 9, 10]) expect(c[i]).not.toBe("0");
        if (c[7] === "") expect(c[11]).not.toBe("ok");
      }
    }
    const paris = page("france/budget-colleges.csv").split("\n").filter((l) => l.startsWith("paris;"));
    expect(paris.length).toBeGreaterThan(0);
  });

  test("tri par libellé puis exercice", () => {
    const l = page("france/budget-colleges.csv").trim().split("\n").slice(1).map((x) => x.split(";"));
    const cle = l.map((c) => `${c[1]}|${c[2]}`);
    expect(cle).toEqual([...cle].sort((a, b) => { const [la, ea] = a.split("|"); const [lb, eb] = b.split("|"); return la!.localeCompare(lb!, "fr") || Number(ea) - Number(eb); }));
  });

  test("la page France lie les CSV et porte la vue « budget » de la carte", () => {
    const d = doc("france");
    expect(d.querySelector("a[href='/france/budget-colleges.csv']")).not.toBeNull();
    expect(d.querySelector("a[href='/france/budget-lycees.csv']")).not.toBeNull();
    expect(d.querySelector("input#vue-carte-budget")).not.toBeNull();
    expect(d.querySelector("figure.vue-carte-budget")?.textContent).toContain("non disponible");
  });
});
