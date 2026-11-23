import { describe, expect, test } from "bun:test";
import { absence, date, ecart, entier, ligneSource, nombre, part } from "@obs/shared/format";
import { CODES_INDICATEURS, CODES_REPARTITIONS, LIBELLES } from "@obs/shared/libelles";

const FINE = " "; // espace fine insécable
const MOINS = "−"; // signe moins

describe("nombres à la française", () => {
  test("décimales, milliers, absence", () => {
    expect(nombre(1234.56)).toBe(`1${FINE}234,6`);
    expect(nombre(null)).toBe("—");
    expect(nombre(14.75, 2)).toBe("14,75");
    expect(entier(84100)).toBe(`84${FINE}100`);
    expect(entier(590)).toBe("590");
    expect(part(10)).toBe(`10,0${FINE}%`);
    expect(part(null)).toBe("—");
  });

  test("aucune espace insécable classique ni tiret pour les négatifs", () => {
    expect(nombre(-1234.5)).toBe(`${MOINS}1${FINE}234,5`);
    expect(nombre(1234567)).not.toContain(" ");
  });
});

describe("écart à une moyenne", () => {
  test("forme {écart} ({moyenne})", () => {
    expect(ecart(92.4, 106.4)).toBe(`${MOINS}14,0 (106,4)`);
    expect(ecart(123, 121.4)).toBe("+1,6 (121,4)");
  });
  test("écart négligeable : 0,0 sans signe", () => {
    expect(ecart(100.02, 100)).toBe("0,0 (100,0)");
    expect(ecart(99.97, 100)).toBe("0,0 (100,0)");
  });
});

describe("dates et sources", () => {
  test("date jj/mm/aaaa à l'heure de Paris", () => {
    expect(date("2026-11-22T02:17:00Z")).toBe("22/11/2026");
    expect(date("2026-10-01")).toBe("01/10/2026");
    expect(date("2026-11-22T23:30:00Z")).toBe("23/11/2026");
  });

  test("ligne de source", () => {
    expect(
      ligneSource({
        id: "ips_colleges", producteur: "MEN-DEPP", titre: "Indices de position sociale des collèges",
        pageUrl: "", rentree: 2025, collecteLe: "2026-11-22T02:17:00Z", brutUrl: "",
      }),
    ).toBe("Source : MEN-DEPP, Indices de position sociale des collèges · rentrée 2025-2026 · collecté le 22/11/2026");
  });

  test("ligne de source sans millésime (annuaire)", () => {
    expect(
      ligneSource({
        id: "annuaire", producteur: "MEN", titre: "Annuaire de l'éducation",
        pageUrl: "", rentree: null, collecteLe: "2026-11-22T02:17:00Z", brutUrl: "",
      }),
    ).toBe("Source : MEN, Annuaire de l'éducation · collecté le 22/11/2026");
  });
});

describe("absences et libellés", () => {
  test("libellés exacts", () => {
    expect(absence("non_publie_prive")).toBe("non publié pour le privé");
    expect(absence("non_disponible")).toBe("non disponible");
    expect(LIBELLES.nonCouvert).toBe("non couvert par les statistiques publiques");
    expect(LIBELLES.pasDeSegpa).toBe("pas de SEGPA");
    expect(LIBELLES.voisinsNonCalculables).toBe("Voisins non calculables (coordonnées absentes)");
    expect(LIBELLES.disparu("2026-10-01")).toBe(
      "Cet établissement n'apparaît plus dans l'Annuaire de l'éducation depuis le 01/10/2026.",
    );
  });

  test("une mesure présente n'a pas de libellé d'absence", () => {
    expect(() => absence("ok")).toThrow();
  });

  test("codes des indicateurs et répartitions", () => {
    expect(CODES_INDICATEURS).toHaveLength(16);
    expect(CODES_INDICATEURS).toContain("eleves_par_etp_vs");
    expect(CODES_REPARTITIONS).toEqual(["sexe_enseignants", "statuts", "ages", "anciennete", "sexe_eleves", "lv1", "lv2"]);
  });
});
