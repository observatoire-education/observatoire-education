import { describe, expect, test } from "bun:test";
import { dbTest } from "./aide.ts";
import type { Famille, Fiche, ResultatsVoie, Secteur } from "@obs/shared/types";
import { calculerResultats, dernieresSessions, type IpsRentree, nuages, resume } from "../pipeline/src/resultats.ts";

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
    // France : les trois collèges publics d'Ille-et-Vilaine (fixtures des nuages) s'ajoutent aux deux de Loire-Atlantique
    const [fr] = await db.sql<{ valeur: number; n: number }>(q("france", "FR", "public"));
    expect(fr!.valeur).toBeCloseTo((80 * 100 + 70 * 50 + 80 * 100 + 85 * 60 + 90 * 40) / 350, 10);
    expect(fr!.n).toBe(5);
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

const S = await dernieresSessions(await dbTest());

describe("résultats sur les fiches", () => {
  const fiche = async (uai: string) => (await import("./aide.ts")).dbTest().then(async (db) => (await calculerResultats(db)).get(uai));

  test("collège : brevet général et pro, dernière session 2025, historique 2022-2025", async () => {
    const r = (await fiche("0440001A"))!;
    expect(r.map((v) => v.voie)).toEqual(["brevet_general", "brevet_pro"]);
    const g = r[0]!;
    expect(g).toMatchObject({ source: "ivac", session: 2025, effectif: 100, rupture: null, mentions: { ab: 25, b: 18, tb: 7 } });
    expect(g.historique).toEqual([[2022, 84], [2023, 86], [2024, 88], [2025, 80]]);
    expect(g.valeurs.map((v) => v.code)).toEqual(["taux_reussite", "note_ecrit", "taux_acces"]);
    expect(g.valeurs[0]).toMatchObject({ valeur: 80, statut: "ok", va: 3, statutVa: "ok" });
    expect(g.valeurs[1]).toMatchObject({ valeur: 12.3, va: 0.4, comparaisons: [] });
    expect(g.valeurs[2]).toMatchObject({ valeur: 98, va: null, statutVa: "sans_objet" });
    const p = r[1]!;
    expect(p.valeurs.map((v) => v.code)).toEqual(["taux_reussite", "note_ecrit"]);
    expect(p.valeurs.every((v) => v.statutVa === "sans_objet" && v.va === null)).toBe(true);
    expect(p.mentions).toBeNull();
  });

  test("comparaisons du taux : département, académie, France, public et privé", async () => {
    const c = (await fiche("0440001A"))![0]!.valeurs[0]!.comparaisons;
    expect(c.map((x) => x.niveau)).toEqual(["departement", "academie", "france"]);
    for (const x of c.slice(0, 2)) {
      expect(x.public).toBeCloseTo((80 * 100 + 70 * 50) / 150, 10);
      expect(x.prive).toBe(60);
      expect(x.n).toEqual({ public: 2, prive: 1 });
    }
    // France : s'ajoutent trois collèges publics et deux privés d'Ille-et-Vilaine (fixtures des nuages)
    expect(c[2]!.public).toBeCloseTo((80 * 100 + 70 * 50 + 80 * 100 + 85 * 60 + 90 * 40) / 350, 10);
    expect(c[2]!.prive).toBeCloseTo((60 * 20 + 95 * 120 + 93 * 80) / 220, 10);
    expect(c[2]!.n).toEqual({ public: 5, prive: 3 });
    // le taux d'accès a ses propres moyennes
    expect((await fiche("0440001A"))![0]!.valeurs[2]!.comparaisons[0]).toMatchObject({ public: 97, prive: 99, n: { public: 2, prive: 1 } });
    // moyenne absente pour une session : null avec n 0 (le bac pro 2025 n'a pas de moyenne de mentions privée)
    expect((await fiche("0440103C"))![0]!.valeurs[2]!.comparaisons[0]).toMatchObject({ public: 62, prive: null, n: { public: 1, prive: 0 } });
  });

  test("valeur non publiée : statut non_publie, jamais 0", async () => {
    const g = (await fiche("0440007G"))![0]!;
    expect(g.valeurs.every((v) => v.valeur === null && v.statut === "non_publie")).toBe(true);
    expect(g.historique).toEqual([]);
  });

  test("LPO : bac_gt et bac_pro, rupture 2021", async () => {
    const r = (await fiche("0440103C"))!;
    expect(r.map((v) => v.voie)).toEqual(["bac_gt", "bac_pro"]);
    expect(r[0]).toMatchObject({ source: "ival_gt", session: 2025, rupture: 2021, mentions: null });
    expect(r[0]!.valeurs.map((v) => v.code)).toEqual(["taux_reussite", "taux_acces", "taux_mentions"]);
    expect(r[0]!.valeurs[2]).toMatchObject({ valeur: 62, va: 2, statutVa: "ok" });
    expect(r[0]!.historique[0]).toEqual([2019, 88]);
    expect(r[1]!.source).toBe("ival_pro");
    // historique entièrement avant 2021 : pas de rupture
    expect((await fiche("0440099Z"))![0]!.rupture).toBeNull();
  });

  test("resume d'un LPO présent dans ival_pro seul : une entrée", async () => {
    const r = (await fiche("0440006F"))!;
    expect(resume({ famille: "lpo", resultats: r }, S)).toEqual([{ voie: "bac_pro", session: 2025, taux: 70, va: -1 }]);
    const lpo = (await fiche("0440103C"))!;
    expect(resume({ famille: "lpo", resultats: lpo }, S).map((x) => x.voie)).toEqual(["bac_gt", "bac_pro"]);
    expect(resume({ famille: "college", resultats: (await fiche("0440001A"))! }, S).map((x) => x.voie)).toEqual(["brevet_general"]);
    expect(resume({ famille: "erea", resultats: [] }, S)).toEqual([]);
  });

  test("fiche sans résultats : []", async () => {
    expect((await fiche("0440200E")) ?? []).toEqual([]);
  });

  test("dernières sessions par source", () => {
    expect(S).toEqual({ ivac: 2025, ival_gt: 2025, ival_pro: 2025 });
  });

  test("LPO sans ligne GT pour la dernière session : seule la voie pro", async () => {
    const r = (await fiche("0440103C"))!.filter((v) => v.voie !== "bac_gt" || v.session === 2025).map((v) => v.voie === "bac_gt" ? { ...v, session: 2020 } : v);
    expect(resume({ famille: "lpo", resultats: r }, S).map((x) => x.voie)).toEqual(["bac_pro"]);
  });

  test("collège dont la dernière ligne est ancienne : absent des listes et des voisins", async () => {
    // 0440023T : brevet général 2022 seulement
    const r = (await fiche("0440023T"))!;
    expect(r[0]!.session).toBe(2022);
    expect(resume({ famille: "college", resultats: r }, S)).toEqual([]);
  });
});

describe("nuages IPS × réussite", () => {
  const R = 2025; // rentrée d'IPS = session 2026 − 1
  const SESS = { ivac: 2026, ival_gt: 2026, ival_pro: 2026 };
  type Ips = Map<string, IpsRentree>;
  const res = (voie: ResultatsVoie["voie"], taux: number | null, va: number | null = 1, session = 2026, effectif: number | null = 10): ResultatsVoie => ({
    voie, source: voie === "bac_gt" ? "ival_gt" : voie === "bac_pro" ? "ival_pro" : "ivac", session, effectif,
    valeurs: [{ code: "taux_reussite", valeur: taux, statut: taux === null ? "non_publie" : "ok", va, statutVa: "ok", comparaisons: [] }],
    mentions: null, historique: [], rupture: null,
  });
  const fiche = (uai: string, resultats: ResultatsVoie[], famille: Famille = resultats[0]?.voie === "brevet_general" ? "college" : "lpo", secteur: Secteur = "public"): Fiche =>
    ({ uai, nom: `Étab ${uai}`, commune: "Nantes", secteur, famille, resultats, indicateurs: [] } as unknown as Fiche);
  const colleges = (n: number) => Array.from({ length: n }, (_, i) => fiche(`C${i}`, [res("brevet_general", 70 + i, i)]));
  const ipsColleges = (n: number): Ips => new Map(Array.from({ length: n }, (_, i) => [`C${i}`, { gt: null, pro: null, ips: 90 + 5 * i }]));

  test("nuage des collèges d'un département : un point par collège avec IPS et taux", () => {
    const [n] = nuages(colleges(5), ipsColleges(5), R, SESS);
    expect(n).toMatchObject({ voie: "brevet_general", session: 2026, rentreeIps: R, ipsEnsemble: false });
    expect(n!.points).toHaveLength(5);
    expect(n!.points[0]).toEqual({ uai: "C0", nom: "Étab C0", commune: "Nantes", secteur: "public", ips: 90, taux: 70, va: 0, effectif: 10 });
    expect(n!.moyennes).toEqual({ ips: 100, taux: 72 });
    const f = colleges(5);
    f[0]!.resultats[0]!.effectif = 30;
    expect(nuages(f, ipsColleges(5), R, SESS)[0]!.moyennes.ips).toBeCloseTo((90 * 30 + 95 * 10 + 100 * 10 + 105 * 10 + 110 * 10) / 70, 10);
    f.forEach((x) => (x.resultats[0]!.effectif = 0));
    expect(nuages(f, ipsColleges(5), R, SESS)[0]!.moyennes).toEqual({ ips: null, taux: null });
  });

  test("point sans taux : exclu", () => {
    const ips = ipsColleges(5);
    ips.set("X", { gt: null, pro: null, ips: 100 }).set("Z", { gt: null, pro: null, ips: 100 });
    const f = [...colleges(5), fiche("X", [res("brevet_general", null)]), fiche("Z", [res("brevet_general", 80)]), fiche("Y", [res("brevet_general", 80)])];
    // X : taux absent ; Y : IPS absent de la rentrée
    expect(nuages(f, ips, R, SESS)[0]!.points.map((p) => p.uai)).toEqual(["C0", "C1", "C2", "C3", "C4", "Z"]);
    // session plus ancienne que la dernière de la source : exclu
    const g = [...colleges(5), fiche("Z", [res("brevet_general", 80, 1, 2025)])];
    expect(nuages(g, ips, R, SESS)[0]!.points).toHaveLength(5);
  });

  test("LPO dans les deux nuages de lycées", () => {
    const ips: Ips = new Map();
    const f = Array.from({ length: 5 }, (_, i) => {
      ips.set(`L${i}`, { gt: 100 + i, pro: 90 + i, ips: 99 });
      return fiche(`L${i}`, [res("bac_gt", 90 + i), res("bac_pro", 80 + i)]);
    });
    const n = nuages(f, ips, R, SESS);
    expect(n.map((x) => x.voie)).toEqual(["bac_gt", "bac_pro"]);
    expect(n[0]!.points.map((p) => p.ips)).toEqual([100, 101, 102, 103, 104]);
    expect(n[1]!.points.map((p) => p.ips)).toEqual([90, 91, 92, 93, 94]);
    expect(n.every((x) => !x.ipsEnsemble)).toBe(true);
    // un lycée sans IPS par voie : pas de repli par point, il est exclu (4 points restent : pas de nuage)
    ips.set("L0", { gt: null, pro: null, ips: 99 });
    expect(nuages(f, ips, R, SESS)).toEqual([]);
  });

  test("moins de 5 points : pas de nuage", () => {
    expect(nuages(colleges(4), ipsColleges(4), R, SESS)).toEqual([]);
  });

  test("IPS par voie absent : ipsEnsemble = true", () => {
    const f = Array.from({ length: 5 }, (_, i) => fiche(`L${i}`, [res("bac_gt", 90 + i)]));
    const n = nuages(f, new Map(f.map((x, i) => [x.uai, { gt: null, pro: null, ips: 110 + i }])), R, SESS);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ voie: "bac_gt", ipsEnsemble: true });
    expect(n[0]!.points.map((p) => p.ips)).toEqual([110, 111, 112, 113, 114]);
  });

  test("rentrée d'IPS différente de session − 1 : aucun point", () => {
    expect(nuages(colleges(5), ipsColleges(5), 2024, SESS)).toEqual([]);
  });

  test("un établissement n'entre que dans les nuages de sa famille (comme les listes)", () => {
    // 5 lycées professionnels : une ligne bac_gt parasite ne fait pas de nuage GT ; 5 LEGT ne font pas de nuage pro
    const lp = Array.from({ length: 5 }, (_, i) => fiche(`P${i}`, [res("bac_gt", 90), res("bac_pro", 70 + i)], "lp"));
    const ips: Ips = new Map(lp.map((x, i) => [x.uai, { gt: 100, pro: 90 + i, ips: 95 }]));
    expect(nuages(lp, ips, R, SESS).map((n) => n.voie)).toEqual(["bac_pro"]);
    const col = Array.from({ length: 5 }, (_, i) => fiche(`G${i}`, [res("brevet_general", 80)], "legt"));
    expect(nuages(col, new Map(col.map((x) => [x.uai, { gt: 1, pro: 1, ips: 100 }])), R, SESS)).toEqual([]);
  });

  test("nuages dans l'ordre brevet, GT, pro et sources résolues", () => {
    const f = Array.from({ length: 5 }, (_, i) => fiche(`L${i}`, [res("bac_pro", 80), res("bac_gt", 90)], "lpo"));
    const ips: Ips = new Map(f.map((x, i) => [x.uai, { gt: 100, pro: 90, ips: 99, source: i % 2 ? "ips_lycees_2022" : "ips_lycees" } as IpsRentree]));
    const n = nuages(f, ips, R, SESS);
    expect(n.map((x) => x.voie)).toEqual(["bac_gt", "bac_pro"]);
    expect(n[0]!.sources).toEqual({ resultats: "ival_gt", ips: ["ips_lycees", "ips_lycees_2022"] });
    expect(n[1]!.sources.resultats).toBe("ival_pro");
  });
});
