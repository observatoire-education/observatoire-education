import { describe, expect, test } from "bun:test";
import { calculerIpsHistorique } from "../pipeline/src/ips-historique.ts";
import { dbTest, indic } from "./aide.ts";

const rentrees = (points: { rentree: number }[]) => points.map((p) => p.rentree);

describe("IPS de 2016 à aujourd'hui", () => {
  test("historique d'un collège : rentrées 2016 à 2025 sans trou", async () => {
    const i = await indic("0440001A", "ips");
    expect(i.historique.map(([r]) => r)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(i.historique[0]).toEqual([2016, 94]);
    expect(i.mesure).toMatchObject({ valeur: 92.4, rentree: 2025, source: "ips_colleges" });
  });

  test("2022-2023 vient du jeu ap2022", async () => {
    const db = await dbTest();
    expect(await db.sql("select source, ips from ips where uai = '0440001A' and rentree = 2022")).toEqual([
      { source: "ips_colleges_2022", ips: 91.5 },
    ]);
    expect(await db.sql("select source from ips where uai = '0440001A' and rentree = 2021")).toEqual([{ source: "ips_colleges_2016" }]);
  });

  test("doublon : le jeu le plus récent l'emporte", async () => {
    const db = await dbTest();
    // l'ancien jeu dit 90 pour 2022-2023, ap2022 dit 91,5 ; la ligne est unique
    expect(await db.sql("select count(*)::int as n from ips where uai = '0440001A' and rentree = 2022")).toEqual([{ n: 1 }]);
    expect((await indic("0440001A", "ips")).historique.find(([r]) => r === 2022)).toEqual([2022, 91.5]);
  });

  test("EREA : un IPS et des comparaisons publiées dès 2022", async () => {
    const i = await indic("0440200E", "ips");
    expect(i.historique).toEqual([[2021, 80], [2022, 82], [2025, 83]]);
    expect(i.mesure).toMatchObject({ valeur: 83, rentree: 2025, source: "ips_erea" });
    expect(i.comparaisons[0]).toMatchObject({ niveau: "departement", calculee: false, public: { valeur: 101 } });
    const h = await calculerIpsHistorique(await dbTest());
    expect(h.serie("departement", "erea", "44").find((p) => p.rentree === 2022)).toEqual({
      rentree: 2022, public: 100.5, prive: null, calculee: false,
    });
  });

  test("rentrée 2018 : moyenne départementale calculée, pondérée par les élèves de 2019, calculee = true", async () => {
    const h = await calculerIpsHistorique(await dbTest());
    // 0440001A : 95 × 500 ; 0440005E : 86 × 300 ; 0440020P (fermé en 2019) : pas d'élèves en 2019, hors moyenne
    // (95 × 500 + 86 × 300) / 800 = 91,625 → 91,6 ; privé : 0440002B, 120
    const p = h.serie("departement", "college", "44").find((x) => x.rentree === 2018);
    expect(p).toEqual({ rentree: 2018, public: 91.6, prive: 120, calculee: true });
    // 2016 à 2018 : élèves de 2019 ; 2020 à 2022 : pas d'élèves de la rentrée, donc pas de moyenne calculée
    expect(rentrees(h.serie("departement", "college", "44"))).toEqual([2016, 2017, 2018, 2019, 2023, 2024, 2025]);
    expect(h.serie("departement", "college", "44")[0]).toEqual({ rentree: 2016, public: 94, prive: null, calculee: true });
    // l'académie, la région, la commune et la France se calculent de la même façon
    expect(h.serie("academie", "college", "17").find((x) => x.rentree === 2018)).toMatchObject({ public: 91.6, calculee: true });
    expect(h.serie("region", "college", "52").find((x) => x.rentree === 2018)).toMatchObject({ public: 91.6, calculee: true });
    expect(h.serie("commune", "college", "44109").find((x) => x.rentree === 2018)).toMatchObject({ public: 91.6, calculee: true });
    expect(h.serie("france", "college", "FR").find((x) => x.rentree === 2018)).toMatchObject({ calculee: true });
  });

  test("rentrée 2024 : moyenne publiée, calculee = false", async () => {
    const h = await calculerIpsHistorique(await dbTest());
    expect(h.serie("departement", "college", "44").find((x) => x.rentree === 2024)).toEqual({
      rentree: 2024, public: 106, prive: 121, calculee: false,
    });
    expect(h.serie("france", "college", "FR").find((x) => x.rentree === 2024)).toMatchObject({ public: 100, prive: 118, calculee: false });
    // la commune est toujours calculée, même quand la DEPP publie le département
    expect(h.serie("commune", "college", "44109").every((x) => x.calculee)).toBe(true);
  });

  test("série croissante, un point par rentrée avec au moins une valeur", async () => {
    const h = await calculerIpsHistorique(await dbTest());
    const s = rentrees(h.serie("departement", "college", "44"));
    expect(s).toEqual([...s].sort((a, b) => a - b));
    expect(new Set(s).size).toBe(s.length);
    expect(h.serie("departement", "college", "99")).toEqual([]);
  });

  test("l'IPS de l'indicateur compare à la série du département ; calculée sans moyenne publiée", async () => {
    const i = await indic("0440001A", "ips");
    expect(i.referencesHistoriques!.find((p) => p.rentree === 2018)).toEqual({ rentree: 2018, public: 91.6, prive: 120, calculee: true });
    expect(i.referencesHistoriques!.at(-1)).toMatchObject({ rentree: 2025, public: 106.4, calculee: false });
    // 0440020P : dernier IPS en 2018, aucune moyenne publiée
    const ferme = await indic("0440020P", "ips");
    expect(ferme.mesure).toMatchObject({ valeur: 99, rentree: 2018 });
    expect(ferme.comparaisons[0]).toMatchObject({ niveau: "departement", calculee: true, public: { valeur: 91.6, statut: "ok" } });
    expect(ferme.comparaisons.map((c) => c.niveau)).toEqual(["departement", "academie", "france"]);
    expect(ferme.comparaisons.every((c) => c.calculee)).toBe(true);
  });

  test("source par rentrée de l'historique quand elle change", async () => {
    const i = await indic("0440001A", "ips");
    expect(i.sourcesHistorique!.slice(0, 6).every((s) => s === "ips_colleges_2016")).toBe(true);
    expect(i.sourcesHistorique![6]).toBe("ips_colleges_2022");
    expect(i.sourcesHistorique!.at(-1)).toBe("ips_colleges");
    expect((await indic("0440002B", "eleves")).sourcesHistorique).toBeUndefined();
  });

  test("LPO : ips_gt et ips_pro gardés", async () => {
    const db = await dbTest();
    expect(await db.sql("select ips, ips_gt, ips_pro from ips where uai = '0440006F'")).toEqual([
      { ips: null, ips_gt: 100.5, ips_pro: 90.5 },
    ]);
    // anciens jeux : ips = IPS de l'ensemble, ecart_type null
    expect(await db.sql("select rentree, source, ips, ips_gt, ips_pro, ecart_type from ips where uai = '0440003C' order by rentree")).toEqual([
      { rentree: 2021, source: "ips_lycees_2016", ips: 120, ips_gt: 120, ips_pro: null, ecart_type: null },
      { rentree: 2022, source: "ips_lycees_2022", ips: 119, ips_gt: null, ips_pro: null, ecart_type: null },
      { rentree: 2025, source: "ips_lycees", ips: 118.2, ips_gt: 118.2, ips_pro: null, ecart_type: 30 },
    ]);
  });
});
