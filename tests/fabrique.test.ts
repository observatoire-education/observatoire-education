import { describe, expect, test } from "bun:test";
import type { DonneesSource } from "@obs/shared/donnees";
import { compterFabrique, libelleCollecte, producteurCourt, SOURCES_HORS_REGISTRE } from "../site/src/lib/fabrique.ts";

const version = (collecteLe: string) => ({ sha256: "x", tag: "t", fichier: "f", url: "u", modified: collecteLe, collecteLe, lignes: 1 });
const source = (id: string, producteur: string, pageUrl: string, collecteLe: string | null = "2026-11-24T02:00:00Z"): DonneesSource =>
  ({ id, titre: id, producteur, pageUrl, actuelle: collecteLe ? version(collecteLe) : null, versions: collecteLe ? [version(collecteLe)] : [] }) as unknown as DonneesSource;

describe("compteurs de la fabrique", () => {
  test("extraits d'un même jeu (même page d'origine) : un seul jeu", () => {
    const f = compterFabrique({
      budget_2024: source("budget_2024", "DGFiP", "https://data.economie.gouv.fr/explore/dataset/b2024/"),
      transport_2024: source("transport_2024", "DGFiP", "https://data.economie.gouv.fr/explore/dataset/b2024/"),
    }, []);
    expect(f.jeux).toBe(1);
    expect(f.portails).toBe(1);
  });

  test("une source sans version actuelle n'est pas comptée", () => {
    const f = compterFabrique({
      annuaire: source("annuaire", "MEN", "https://data.education.gouv.fr/a"),
      bati: source("bati", "Région", "https://data.iledefrance.fr/b", null),
    }, []);
    expect(f.jeux).toBe(1);
    expect(f.producteurs).toEqual(["MEN"]);
    expect(f.portails).toBe(1);
  });

  test("producteurs dans l'ordre fixé, IGN hors registre, portails distincts", () => {
    const f = compterFabrique({
      cog: source("cog", "Insee", "https://www.insee.fr/fr/information/8740222"),
      budget_2024: source("budget_2024", "DGFiP", "https://data.economie.gouv.fr/b"),
      carte: source("carte", "MEN-DGESCO", "https://data.education.gouv.fr/c"),
      ips: source("ips", "MEN-DEPP", "https://data.education.gouv.fr/i"),
      annuaire: source("annuaire", "MEN", "https://data.education.gouv.fr/a", "2026-11-25T02:10:00Z"),
    }, SOURCES_HORS_REGISTRE);
    expect(f.producteurs).toEqual(["MEN", "DEPP", "DGESCO", "DGFiP", "Insee", "IGN"]);
    expect(f.portails).toBe(4); // data.education, data.economie, insee.fr, data.geopf.fr
    expect(f.jeux).toBe(6);
    expect(f.derniereCollecte).toBe("2026-11-25T02:10:00Z");
  });

  test("libellés courts des producteurs", () => {
    expect(producteurCourt("MEN-DEPP")).toBe("DEPP");
    expect(producteurCourt("MEN-DGESCO")).toBe("DGESCO");
    expect(producteurCourt("DGFiP")).toBe("DGFiP");
  });

  test("dernière collecte : toujours la date (le site n'est pas reconstruit chaque nuit)", () => {
    expect(libelleCollecte("2026-11-25T02:10:00Z")).toBe("le 25/11/2026");
  });
});
