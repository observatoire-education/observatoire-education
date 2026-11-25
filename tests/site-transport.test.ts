import { beforeAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { doc, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

/** Texte de la section transport d'une page, espaces normalisés. */
const bloc = (chemin: string): string => {
  const s = doc(chemin).querySelector("#transport");
  if (!s) throw new Error(`section #transport absente : ${chemin}`);
  const espace = parseHTML(`<!doctype html><html><body>${s.innerHTML.replace(/</g, " <")}</body></html>`).document;
  return (espace.body?.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("transport scolaire sur les pages", () => {
  test("région : montants du dernier exercice en M€, note, jamais par élève", () => {
    const t = bloc("region/52");
    expect(t).toContain("Transport scolaire");
    expect(t).toContain("Région Pays de la Loire");
    expect(t).toMatch(/Dépenses de fonctionnement 156,0\sM€/);
    expect(t).toMatch(/Dépenses d'investissement 1,0\sM€/);
    expect(t).toMatch(/Produits des services \(dont participations des familles\) 20,0\sM€/);
    expect(t).toContain("Ces montants ne sont pas rapportés au nombre d'élèves");
    expect(t).not.toContain("par élève :");
    expect(doc("region/52").querySelector("#transport svg")).not.toBeNull();
    expect(doc("region/52").querySelector("#transport a[href='/methode/#transport-financement']")).not.toBeNull();
  });

  test("Île-de-France : absence et contexte d'Île-de-France Mobilités, aucun graphique", () => {
    expect(bloc("region/11")).toContain("Le transport scolaire n'apparaît pas dans les comptes de la Région.");
    expect(bloc("region/11")).toContain("En Île-de-France, le transport scolaire est organisé par Île-de-France Mobilités");
    expect(doc("region/11").querySelector("#transport svg")).toBeNull();
  });

  test("région en M71 : l'exercice est dit non isolé, pas sans dépense", () => {
    const t = bloc("region/53");
    expect(t).toContain("2023 : comptes tenus selon la nomenclature M71, qui n'isole pas le transport scolaire");
    expect(t).not.toContain("Aucune dépense de transport scolaire n'apparaît");
  });

  test("département : le Département, puis les groupements dans une liste dépliable", () => {
    const t = bloc("departement/44");
    expect(t).toContain("Département de Loire-Atlantique");
    expect(t).toContain("Intercommunalités et syndicats ayant leur siège dans le département");
    const items = doc("departement/44").querySelectorAll("#transport details li");
    expect(items).toHaveLength(4);
    expect(items[0]!.textContent).toContain("CA PORNIC AGGLO PAYS DE RETZ");
    // montants en euros sous le million, jamais « 0,0 M€ » ; chacun avec son propre dernier exercice
    const ligne = (i: number) => items[i]!.textContent!.replace(/\s+/g, " ");
    expect(ligne(0)).toMatch(/CA PORNIC AGGLO PAYS DE RETZ : 2,0\sM€/);
    expect(ligne(1)).toMatch(/CC DE GRAND LIEU : −50\s000\s€/);
    expect(ligne(3)).toMatch(/SYNDICAT TRANSPORTS SCOLAIRES DU PAYS DE RETZ : 800\s000\s€/);
    expect(t).not.toContain("0,0 M€");
    expect(t).toContain("loi NOTRe");
  });

  test("Corse-du-Sud : la Collectivité de Corse sur la page du département", () => {
    expect(bloc("departement/2A")).toContain("Collectivité de Corse");
  });

  test("Paris : la Ville de Paris sur la page du département", () => {
    expect(bloc("departement/75")).toContain("Ville de Paris");
  });

  test("France : tableau des régions et CSV", () => {
    const t = bloc("france");
    expect(t).toContain("Région Pays de la Loire");
    expect(t).toContain("Collectivité de Corse");
    expect(doc("france").querySelector("#transport a[href='/france/transport-scolaire.csv']")).not.toBeNull();
    const lignes = page("france/transport-scolaire.csv").trim().split("\n");
    expect(lignes[0]).toBe("collectivite;libelle;exercice;fonctionnement;investissement;produits_services;nomenclature_m71");
    expect(lignes).toContain("reg-52;Région Pays de la Loire;2023;140000000;;;");
    expect(lignes).toContain("reg-52;Région Pays de la Loire;2024;156000000;1000000;20000000;");
    expect(lignes).toContain("reg-53;Région Bretagne;2023;;;;oui");
  });

  test("méthode et sources", () => {
    const m = doc("methode").querySelector("#transport-financement");
    expect(m).not.toBeNull();
    const t = texte("methode");
    expect(t).toContain("9381");
    expect(t).toContain("nomenclature M71");
    expect(t).toContain("ordures ménagères");
    const sources = texte("sources");
    expect(sources).toContain("Balances comptables des collectivités, transport scolaire 2024");
    expect(page("sources")).toMatch(/requete|where/);
    expect(doc("sources").querySelectorAll("p.requete").length).toBeGreaterThanOrEqual(4);
  });

  test("académie et commune : pas de section transport", () => {
    expect(doc("academie/17").querySelector("#transport")).toBeNull();
  });
});
