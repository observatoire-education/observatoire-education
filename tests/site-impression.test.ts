import { beforeAll, describe, expect, test } from "bun:test";
import { mentionMoyennesA4 } from "../site/src/lib/affichage.ts";
import { doc, siteTest } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const a4 = (uai: string) => doc(`etablissement/${uai}`).querySelector(".a4")!;
const texteA4 = (uai: string) => (a4(uai).textContent ?? "").replace(/\s+/g, " ");

describe("fiche imprimable A4", () => {
  test("sources de l'A4 : « publiées par la DEPP » seulement pour les jeux actuels d'IPS", () => {
    const sources = [...a4("0440001A").querySelectorAll(".ft ol li")].map((li) => (li.textContent ?? "").replace(/\s+/g, " "));
    const ips = (mot: string) => sources.find((s) => s.includes(mot))!;
    expect(ips("(2016-2021)")).not.toContain("moyennes publiées par la DEPP");
    expect(ips("(2022)")).not.toContain("moyennes publiées par la DEPP");
    expect(sources.filter((s) => s.includes("moyennes publiées par la DEPP")).length).toBe(1);
  });

  test("sources de l'A4 : pas de « publiées par la DEPP » quand les comparaisons d'IPS de la fiche sont calculées", () => {
    expect(mentionMoyennesA4("ips_colleges", false)).toBe(" · moyennes publiées par la DEPP");
    expect(mentionMoyennesA4("ips_lycees", false)).toBe(" · moyennes publiées par la DEPP");
    expect(mentionMoyennesA4("ips_colleges", true)).toBe("");
    expect(mentionMoyennesA4("ips_lycees", true)).toBe("");
    expect(mentionMoyennesA4("ips_erea", true)).toBe("");
    expect(mentionMoyennesA4("ips_colleges_2016", false)).toBe("");
    expect(mentionMoyennesA4("ivac", false)).toBe("");
    // La liste des établissements fermés ne porte aucune moyenne.
    expect(mentionMoyennesA4("fermes", false)).toBe("");
    expect(mentionMoyennesA4("effectifs_colleges", true)).toBe(" · moyennes calculées (Σ / Σ)");
  });

  test("bloc A4 : moyennes seules, sources numérotées, QR", () => {
    const t = texteA4("0440001A");
    expect(t).toContain("106,4");
    expect(t).not.toContain("(106,4)");
    expect(t).toMatch(/\[\d\]/);
    expect(a4("0440001A").querySelectorAll("svg").length).toBe(1); // le QR seul
    expect(t).toContain("Ce document ne contient aucun commentaire");
  });

  test("en-tête : identité, date d'édition, lien permanent", () => {
    const t = texteA4("0440001A");
    expect(t).toContain("Collège Jules-Verne");
    expect(t).toContain("UAI 0440001A");
    expect(t).toContain("Académie de Nantes");
    // la date d'édition est ajoutée par /js/fiche.js à l'ouverture, jamais au build (pages stables d'un build à l'autre)
    expect(t).toContain("Fiche éditée le");
    expect(t).not.toMatch(/Fiche éditée le \d/);
    expect(t).toContain("/etablissement/0440001A/");
  });

  test("chaque ligne du tableau central renvoie à une source listée", () => {
    const sources = [...a4("0440001A").querySelectorAll(".ft ol li")];
    expect(sources.length).toBe(9); // quatre sources de la fiche, l'IVAC (résultats), deux anciens jeux d'IPS, plus les balances de la DGFiP (exercices 2023, corrigé, et 2024)
    const renvois = [...a4("0440001A").querySelectorAll(".centre tbody sup")].map((s) => Number(s.textContent!.replace(/\D/g, "")));
    expect(renvois.length).toBeGreaterThan(5);
    for (const n of renvois) expect(n).toBeGreaterThanOrEqual(1), expect(n).toBeLessThanOrEqual(sources.length);
  });

  test("privé : vie scolaire « non publié », jamais 0", () => {
    const t = texteA4("0440002B");
    expect(t).toContain("non publié");
    const ligne = [...a4("0440002B").querySelectorAll(".centre tbody tr")].find((tr) => tr.textContent!.includes("vie scolaire"))!;
    for (const td of [...ligne.querySelectorAll("td")].slice(1)) expect(td.textContent!.trim()).not.toMatch(/^0(,0)?$/);
  });

  test("voisins avec leur UAI", () => {
    const t = texteA4("0440001A");
    expect(t).toContain("Collège Saint-Exemple");
    expect(t).toContain("0440002B");
  });

  test("masqué à l'écran, seul affiché à l'impression", async () => {
    const css = await Bun.file(
      [...doc("etablissement/0440001A").querySelectorAll('link[rel="stylesheet"]')]
        .map((l) => `.cache/dist-test${l.getAttribute("href")}`)[0]!,
    ).text();
    expect(css).toMatch(/\.a4\s*\{[^}]*display:\s*none/);
    expect(css).toContain("@page");
    expect(css).toMatch(/size:\s*A4/);
  });
});
