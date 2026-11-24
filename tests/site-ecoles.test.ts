import { beforeAll, describe, expect, test } from "bun:test";
import { mentionMoyennesA4 } from "../site/src/lib/affichage.ts";
import { svgElevesClasses } from "../site/src/lib/plot.ts";
import { doc, octets, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const ECOLES = ["0440104D", "0440105E", "0440106F", "0440107G", "0440108H", "0440109K", "0440110M", "0440201A", "0440202B", "0440203C"];
const fiche = (uai: string) => `etablissement/${uai}`;
const propre = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

describe("fiche école", () => {
  test("école à classe unique : dernière rentrée en évidence, élèves par classe, classe à plusieurs niveaux", () => {
    const t = texte(fiche("0440104D"));
    expect(t).toContain("Rentrée 2025, dernière publiée");
    expect(t).toContain("Élèves par classe");
    expect(t).toContain("Classes à plusieurs niveaux");
    expect(t).toContain("CP-CE1-CE2-CM1-CM2");
  });

  test("maternelle : « IPS non publié pour cette école », aucun 0 dans le bloc de l'IPS", () => {
    const social = doc(fiche("0440201A")).querySelector("#social")!;
    const t = propre(social.textContent);
    expect(t).toContain("IPS non publié pour cette école");
    expect(t).not.toMatch(/(^|[\s(])0([\s,)]|$)/);
    expect(social.querySelector("svg")).toBeNull();
  });

  test("aucune fiche école ne montre les blocs des lots à venir ni les données sans objet", () => {
    for (const uai of ECOLES) {
      const t = texte(fiche(uai)).toLowerCase();
      for (const mot of ["Rattachements", "Autour de l'école", "Budget", "Vie scolaire", "agrégés"]) {
        expect(`${uai} : ${mot} ${t.includes(mot.toLowerCase())}`).toBe(`${uai} : ${mot} false`);
      }
      expect(t).not.toContain("Voisins");
      expect(t).not.toContain("Moyens de la collectivité");
    }
  });

  test("école fermée : « Fermée le 05/07/2016 », au féminin", () => {
    const t = texte(fiche("0440106F"));
    expect(t).toContain("Fermée le 05/07/2016");
    expect(t).not.toContain("Fermé le");
  });

  test("école issue d'une fusion : deux prédécesseurs, « fermée le » au féminin", () => {
    const l = [...doc(fiche("0440108H")).querySelectorAll(".fermeture:not(.m) .predecesseur")].map((e) => propre(e.textContent));
    expect(l).toEqual([
      "Succède à École maternelle des Tilleuls (0440107G), fermée le 04/07/2019",
      "Succède à École élémentaire des Tilleuls (0440109K), fermée le 04/07/2019",
    ]);
    expect(texte(fiche("0440107G"))).toContain("Successeur : École primaire des Tilleuls (0440108H)");
  });

  test("élèves par classe non disponible quand la dernière rentrée n'a pas de classe, jamais 0", () => {
    const d = doc(fiche("0440105E"));
    const cle = new Map([...d.querySelectorAll("#eleves .chiffres > div")].map((x) => [propre(x.querySelector(".k")?.textContent), x]));
    for (const k of ["Élèves par classe", "Classes"]) {
      expect(cle.get(k)!.querySelector(".v")).toBeNull();
      expect(propre(cle.get(k)!.querySelector(".na")?.textContent)).toBe("non disponible");
    }
    expect(propre(cle.get("Élèves")!.querySelector(".v")?.textContent)).toBe("45");
  });

  test("répartition par niveau : « Préélémentaire » ; types de classes « Préélémentaire-CP »", () => {
    const t = texte(fiche("0440203C"));
    expect(t).toContain("Préélémentaire-CP");
    expect(t).toContain("Classes à un niveau");
    expect(t).not.toMatch(/\bPreel\b/);
    expect(texte(fiche("0440202B"))).toContain("ULIS");
  });

  test("IPS d'une école : rentrée de l'école, écart à la moyenne publiée par la DEPP", () => {
    const t = propre(doc(fiche("0440202B")).querySelector("#social")!.textContent);
    expect(t).toContain("2024-2025");
    expect(t).toContain("96,0");
    expect(t).toContain("−3,9 (99,9)");
    expect(t).toContain("moyennes publiées par la DEPP");
  });

  test("une seule courbe : élèves et classes, deux axes", () => {
    const svgs = [...doc(fiche("0440202B")).querySelectorAll("main svg")].filter((s) => !s.closest(".a4") && !s.closest(".brand"));
    expect(svgs.length).toBe(1);
    expect(svgs[0]!.getAttribute("aria-label")).toStartWith("Élèves : 2011 180, 2012 181,");
    expect(svgs[0]!.getAttribute("aria-label")).toEndWith(". Classes : 8 de 2011 à 2025");
  });

  test("poids : la fiche 0440202B fait 25 000 octets au plus", () => {
    expect(octets(fiche("0440202B"))).toBeLessThanOrEqual(25_000);
  });

  test("fiche A4 d'une école : « Fiche pour le conseil d'école »", () => {
    for (const uai of ["0440202B", "0440201A"]) {
      const a4 = propre(doc(fiche(uai)).querySelector(".a4")!.textContent);
      expect(a4).toContain("Fiche pour le conseil d'école");
      expect(a4).toContain("Élèves par classe");
    }
    expect(propre(doc(fiche("0440001A")).querySelector(".a4")!.textContent)).not.toContain("conseil d'école");
    expect(propre(doc(fiche("0440106F")).querySelector(".a4")!.textContent)).toContain("Fermée le 05/07/2016");
  });

  test("les pages des écoles sont dans le sitemap", () => {
    for (const uai of ECOLES) expect(page("sitemap.xml")).toContain(`/etablissement/${uai}/</loc>`);
  });
});

describe("mentions des sources des écoles sur la fiche A4", () => {
  test("IPS des écoles publié par la DEPP ; typologie des classes et éducation prioritaire sans moyenne", () => {
    expect(mentionMoyennesA4("ips_ecoles", false)).toBe(" · moyennes publiées par la DEPP");
    expect(mentionMoyennesA4("ips_ecoles", true)).toBe("");
    expect(mentionMoyennesA4("ips_ecoles_2016", false)).toBe("");
    expect(mentionMoyennesA4("classes_ecoles", false)).toBe("");
    expect(mentionMoyennesA4("ecoles_ep", false)).toBe("");
    expect(mentionMoyennesA4("effectifs_ecoles", false)).toBe(" · moyennes calculées (Σ / Σ)");
  });
});

describe("svgElevesClasses", () => {
  test("deux séries ; une classe absente ou à 0 fait un trou, jamais un zéro", () => {
    const s = svgElevesClasses([[2023, 45, 2], [2024, 45, 2], [2025, 45, 0]]);
    expect(s).toStartWith("<svg");
    expect(s).toContain('aria-label="Élèves : 2023 45, 2024 45, 2025 45. Classes : 2 de 2023 à 2024, non disponible en 2025"');
    expect(svgElevesClasses([[2025, null, null]])).toBe("");
  });
});
