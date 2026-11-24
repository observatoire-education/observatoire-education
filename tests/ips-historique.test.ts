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
    expect(ferme.comparaisons[0]!.public.source).toBeNull(); // moyenne calculée : pas la source de l'établissement
    expect((await indic("0440001A", "ips")).comparaisons[0]!.public.source).toBe("ips_colleges"); // publiée
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

describe("IPS des écoles", () => {
  test("historique 2016 → 2024 : jeu 2016-2021, puis jeu à partir de 2022", async () => {
    const i = await indic("0440202B", "ips");
    expect(i.mesure).toEqual({ valeur: 96, statut: "ok", source: "ips_ecoles", rentree: 2024 });
    expect(i.historique).toEqual([
      [2016, 92], [2017, 92.5], [2018, 93], [2019, 93.5], [2020, 94], [2021, 94.5], [2022, 95], [2023, 95.5], [2024, 96],
    ]);
    expect(i.sourcesHistorique).toEqual([...Array(6).fill("ips_ecoles_2016"), "ips_ecoles", "ips_ecoles", "ips_ecoles"]);
  });

  test("maternelle sans IPS : non disponible", async () => {
    expect((await indic("0440201A", "ips")).mesure).toMatchObject({ valeur: null, statut: "non_disponible" });
  });

  test("comparaisons : moyennes publiées par le jeu à partir de 2022", async () => {
    const i = await indic("0440202B", "ips");
    const publiee = (valeur: number) => ({ valeur, statut: "ok" as const, source: "ips_ecoles" as const, rentree: 2024 });
    expect(i.comparaisons).toEqual([
      { niveau: "departement", calculee: false, public: publiee(99.9), prive: publiee(106.5) },
      { niveau: "academie", calculee: false, public: publiee(104.5), prive: publiee(112) },
      { niveau: "france", calculee: false, public: publiee(102.9), prive: publiee(119.3) },
    ]);
  });

  test("avant 2022 : moyennes calculées parmi les écoles seulement, toutes familles d'écoles ensemble", async () => {
    const h = await calculerIpsHistorique(await dbTest());
    // 2018 : public 0440202B (élémentaire, 93), privé 0440203C (primaire, 119), pondérés par les élèves de 2019 ;
    // aucun collège n'y entre (les collèges publics de Loire-Atlantique donnent 91,6 en 2018)
    const p = h.serie("departement", "elementaire", "44").find((x) => x.rentree === 2018);
    expect(p).toEqual({ rentree: 2018, public: 93, prive: 119, calculee: true });
    for (const f of ["maternelle", "primaire"] as const) {
      expect(h.serie("departement", f, "44")).toEqual(h.serie("departement", "elementaire", "44"));
    }
    expect(h.serie("commune", "primaire", "44109").find((x) => x.rentree === 2021)).toEqual({
      rentree: 2021, public: 94.5, prive: 120.5, calculee: true,
    });
    expect(rentrees(h.serie("departement", "elementaire", "44"))).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]);
    expect(h.serie("departement", "elementaire", "44").at(-1)).toEqual({ rentree: 2024, public: 99.9, prive: 106.5, calculee: false });
    // une école n'entre jamais dans une moyenne de collèges
    expect(h.serie("departement", "college", "44").find((x) => x.rentree === 2018)).toEqual({
      rentree: 2018, public: 91.6, prive: 120, calculee: true,
    });
    expect(h.serie("commune", "college", "44109").find((x) => x.rentree === 2021)).toBeUndefined();
  });

  test("référence historique d'une école : série des écoles du département", async () => {
    const i = await indic("0440203C", "ips");
    expect(i.referencesHistoriques!.find((p) => p.rentree === 2018)).toEqual({ rentree: 2018, public: 93, prive: 119, calculee: true });
    expect(i.comparaisons[0]).toMatchObject({ niveau: "departement", calculee: false, prive: { valeur: 106.5 } });
  });
});
