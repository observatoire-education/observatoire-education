import { beforeAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { doc, siteTest } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

/** Texte d'une section d'une page, espaces normalisés. */
const bloc = (chemin: string, id: string): string => {
  const s = doc(chemin).querySelector(`#${id}`);
  if (!s) throw new Error(`section #${id} absente : ${chemin}`);
  const espace = parseHTML(`<!doctype html><html><body>${s.innerHTML.replace(/</g, " <")}</body></html>`).document;
  return (espace.body?.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("bâtiment et travaux sur la fiche d'un lycée", () => {
  test("année, opérations votées (montant cumulé, désaffectation retranchée) et PPI", () => {
    const t = bloc("etablissement/0440003C", "batiment");
    expect(t).toContain("Année de construction 1965");
    expect(t).toContain("Opérations votées depuis 2021");
    expect(t).toMatch(/44 NANTES GUISTHAU RESTRUCT GLOBALE · 3 décisions 2021–2023 42,0\sM€/);
    expect(t).toMatch(/44 NANTES GUISTHAU REMPLACEMENT RESEAUX CHAUFFAGE 2023 720\s000\s€/);
    expect(t).toContain("autorisations de dépense, pas des sommes dépensées");
    expect(t).toMatch(/Réhabilitation - gros entretien 2001\/2006 Opération livrée 2009 33,7 M€/);
    expect(t).toContain("Région Île-de-France");
  });

  test("année non publiée : dite, pas de case vide ; aucune opération votée : dite", () => {
    const t = bloc("etablissement/0440006F", "batiment");
    expect(t).toContain("année non publiée par la région");
    expect(t).toContain("aucune opération votée rattachée à cet établissement depuis 2021");
  });

  test("lycée absent des jeux de la région ou privé : pas d'onglet", () => {
    expect(doc("etablissement/0350011L").querySelector("#o-batiment")).toBeNull();
    expect(doc("etablissement/0350014P").querySelector("#o-batiment")).toBeNull();
  });
});

describe("travaux des lycées sur les pages de territoire", () => {
  test("département : chiffres clés, décennies et liste qui renvoie à l'onglet de la fiche", () => {
    const t = bloc("departement/44", "travaux");
    expect(t).toContain("Bâtiments et travaux des lycées publics");
    expect(t).toContain("1960–1969 1");
    expect(t).toMatch(/42,7\sM€ votés pour 1 lycée\b/);
    expect(doc("departement/44").querySelector("#travaux a[href='/etablissement/0440003C/#o-batiment']")).not.toBeNull();
  });

  test("territoire sans données régionales : pas d'onglet", () => {
    expect(doc("departement/35").querySelector("#o-travaux")).toBeNull();
  });
});

describe("investissement par élève sur les pages de territoire", () => {
  test("région : seconde courbe, avec la moyenne de France et la note de lecture", () => {
    const c = doc("region/52").querySelector(".evolution-investissement");
    expect(c).not.toBeNull();
    expect(c!.textContent).toContain("Investissement public");
    expect(c!.textContent).toContain("une année haute ou basse ne dit rien à elle seule");
    expect(c!.querySelector("svg")).not.toBeNull();
  });

  test("fiche : pas de courbe d'investissement", () => {
    expect(doc("etablissement/0440003C").querySelector(".evolution-investissement")).toBeNull();
  });
});
