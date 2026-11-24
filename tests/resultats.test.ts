import { describe, expect, test } from "bun:test";
import { dbTest } from "./aide.ts";

const un = async (q: string) => (await (await dbTest()).sql(q))[0] as Record<string, unknown>;

describe("normalisation des résultats", () => {
  test("IVAC 2021 ignoré", async () => {
    const db = await dbTest();
    expect(await db.sql("select min(session)::int as s from resultats where source = 'ivac'")).toEqual([{ s: 2022 }]);
    expect(await db.sql("select count(*)::int as n from resultats where uai = '0440001A' and session = 2021")).toEqual([{ n: 0 }]);
  });

  test("valeur vide ou ND : null, jamais 0", async () => {
    const r = await un("select * from resultats where uai = '0440007G' and voie = 'brevet_general' and session = 2025");
    expect(r).toMatchObject({ effectif: 40, taux_reussite: null, va_reussite: null, note_ecrit: null, taux_acces: null });
    expect(await (await dbTest()).sql("select count(*)::int as n from resultats where uai = '0440007G' and voie = 'brevet_pro'")).toEqual([{ n: 0 }]);
  });

  test("brevet_pro sans valeur ajoutée", async () => {
    const r = await un("select * from resultats where uai = '0440001A' and voie = 'brevet_pro' and session = 2025");
    expect(r).toMatchObject({
      effectif: 10, taux_reussite: 60, note_ecrit: 9.5, va_reussite: null, va_note: null, taux_acces: null,
      taux_mentions: null, mentions_ab: null,
    });
    const g = await un("select * from resultats where uai = '0440001A' and voie = 'brevet_general' and session = 2025");
    expect(g).toMatchObject({
      effectif: 100, taux_reussite: 80, va_reussite: 3, note_ecrit: 12.3, va_note: 0.4, taux_acces: 98,
      taux_mentions: null, mentions_ab: 25, mentions_b: 18, mentions_tb: 7, source: "ivac",
    });
  });

  test("LPO : deux voies", async () => {
    const db = await dbTest();
    expect(await db.sql("select voie, count(*)::int as n from resultats where uai = '0440103C' group by voie order by voie")).toEqual([
      { voie: "bac_gt", n: 7 }, { voie: "bac_pro", n: 7 },
    ]);
    expect(await un("select * from resultats where uai = '0440103C' and voie = 'bac_gt' and session = 2025")).toMatchObject({
      effectif: 72, taux_reussite: 92, va_reussite: 3, taux_acces: 88, va_acces: 1, taux_mentions: 62, va_mentions: 2, source: "ival_gt",
    });
    // LP dans ival_pro seul
    expect(await db.sql("select voie from resultats where uai = '0440006F'")).toEqual([{ voie: "bac_pro" }]);
  });

  test("résultats d'une UAI inconnue : ignorés et comptés", async () => {
    const db = await dbTest();
    expect(await db.sql("select count(*)::int as n from resultats where uai = '0449999X'")).toEqual([{ n: 0 }]);
    expect(await db.sql("select * from resultats_ignores order by source")).toEqual([
      { source: "ivac", n: 1 }, { source: "ival_gt", n: 1 }, { source: "ival_pro", n: 1 },
    ]);
  });

  test("moyenne départementale du taux de réussite pondérée par les candidats", async () => {
    const q = (niveau: string, t: string, s: string) =>
      `select valeur, n from moyennes_resultats where voie = 'brevet_general' and code = 'taux_reussite' and niveau = '${niveau}' and territoire = '${t}' and secteur = '${s}' and session = 2025`;
    const db = await dbTest();
    const [pub] = (await db.sql<{ valeur: number; n: number }>(q("departement", "44", "public")));
    expect(pub!.valeur).toBeCloseTo((80 * 100 + 70 * 50) / 150, 10);
    expect(pub!.n).toBe(2);
    expect(await db.sql(q("academie", "17", "public"))).toEqual([{ valeur: pub!.valeur, n: 2 }]);
    expect(await db.sql(q("france", "FR", "public"))).toEqual([{ valeur: pub!.valeur, n: 2 }]);
  });

  test("un établissement sans taux n'entre pas dans la moyenne", async () => {
    const db = await dbTest();
    // 0440007G (privé, 40 candidats, taux vide) est exclu : le privé se réduit à 0440002B
    expect(await db.sql(
      `select valeur, n from moyennes_resultats where voie = 'brevet_general' and code = 'taux_reussite'
       and niveau = 'departement' and territoire = '44' and secteur = 'prive_sous_contrat' and session = 2025`,
    )).toEqual([{ valeur: 60, n: 1 }]);
    // brevet : pas de taux de mentions, donc pas de moyenne
    expect(await db.sql("select count(*)::int as n from moyennes_resultats where voie like 'brevet%' and code = 'taux_mentions'")).toEqual([{ n: 0 }]);
    expect(await db.sql("select valeur, n from moyennes_resultats where voie = 'bac_gt' and code = 'taux_mentions' and niveau = 'departement' and territoire = '44' and secteur = 'public' and session = 2025")).toEqual([{ valeur: 62, n: 1 }]);
  });
});
