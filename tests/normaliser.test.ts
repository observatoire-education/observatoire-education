import { describe, expect, test } from "bun:test";
import { depCanonique, famille, libelleTerritoire, nombre, rentree, secteur } from "../pipeline/src/normalise.ts";
import { dbTest } from "./aide.ts";

const db = await dbTest();

/** Applique une macro SQL à une liste de valeurs (texte ou NULL), dans l'ordre. */
async function enSql(appel: (x: string) => string, valeurs: (string | null)[]): Promise<unknown[]> {
  const lits = valeurs.map((v) => (v === null ? "null::varchar" : `'${v.replaceAll("'", "''")}'`));
  const r = await db.sql<{ v: unknown }>(
    `select ${appel("x")} as v from (select unnest([${lits.join(", ")}]) as x, generate_subscripts([${lits.join(", ")}], 1) as i) order by i`,
  );
  return r.map((l) => l.v);
}

describe("fonctions de normalisation (TypeScript et SQL identiques)", () => {
  test("codes département", async () => {
    const cas = ["001", "01", "1", "02A", "2A", "02B", "044", "971", "976", " 044 "];
    const attendu = ["01", "01", "01", "2A", "2A", "2B", "44", "971", "976", "44"];
    expect(cas.map(depCanonique)).toEqual(attendu);
    expect(await enSql((x) => `dep_canonique(${x})`, cas)).toEqual(attendu);
  });

  test("libellés de territoire : Saint-Pierre-et-Miquelon écrit à la française", async () => {
    const cas = ["St-Pierre-et-Miquelon", "Saint Pierre et Miquelon", " Saint-Pierre-et-Miquelon ", "Loire-Atlantique", "Nantes"];
    const attendu = ["Saint-Pierre-et-Miquelon", "Saint-Pierre-et-Miquelon", "Saint-Pierre-et-Miquelon", "Loire-Atlantique", "Nantes"];
    expect(cas.map(libelleTerritoire)).toEqual(attendu);
    expect(await enSql((x) => `libelle_territoire(${x})`, cas)).toEqual(attendu);
    expect(await enSql((x) => `libelle_territoire(${x})`, [null])).toEqual([null]);
    // La table normalisée applique la macro aux libellés de département et d'académie.
    const sql = await Bun.file(new URL("../pipeline/sql/01_normaliser.sql", import.meta.url)).text();
    expect(sql).toContain("libelle_territoire(libelle_departement)");
    expect(sql).toContain("libelle_territoire(libelle_academie)");
  });

  test("rentrées", async () => {
    const cas = ["2025-2026", "2025", "2025-01-01", "", null];
    const attendu = [2025, 2025, 2025, null, null];
    expect(cas.map(rentree)).toEqual(attendu);
    expect(await enSql((x) => `rentree(${x})`, cas)).toEqual(attendu);
  });

  test("nombre NA", async () => {
    const cas = ["NA", "", null, "98,2", "98.2", " 12 ", "abc", "nan", "inf", "-3.5"];
    const attendu = [null, null, null, 98.2, 98.2, 12, null, null, null, -3.5];
    expect(cas.map(nombre)).toEqual(attendu);
    expect(await enSql((x) => `nombre(${x})`, cas)).toEqual(attendu);
    expect([nombre(4), nombre(Number.NaN), nombre(12n)]).toEqual([4, null, 12]);
  });

  test("famille", async () => {
    const cas: [string, string | null, ReturnType<typeof famille>][] = [
      ["LYCEE PROFESSIONNEL", "LPO", "lpo"],
      ["LYCEE PROFESSIONNEL", null, "lp"],
      ["SECTION D ENSEIGNEMENT PROFESSIONNEL", null, null],
      ["SECTION ENSEIGNT GEN. ET PROF. ADAPTE", null, null],
      ["COLLEGE", null, "college"],
      ["LYCEE ENS GENERAL TECHNO PROF AGRICOLE", null, "lpo"],
      ["ETAB REGIONAL/LYCEE ENSEIGNEMENT ADAPTE", null, "erea"],
      ["LYCEE D ENSEIGNEMENT GENERAL", "XYZ", "legt"],
    ];
    expect(cas.map(([n, t]) => famille(n, t))).toEqual(cas.map((c) => c[2]));
    for (const [n, t, f] of cas) {
      const [r] = await db.sql<{ v: string | null }>(
        `select famille(${`'${n}'`}, ${t === null ? "null::varchar" : `'${t}'`}) as v`,
      );
      expect(r!.v).toBe(f);
    }
  });

  test("secteur : libellés exacts, zéro dans « C0NTRAT » compris", async () => {
    const cas: [string | null, string | null, ReturnType<typeof secteur>][] = [
      ["Public", "SANS OBJET", "public"],
      ["Privé", "CONTRAT D'ASSOCIATION TOUTES CLASSES", "prive_sous_contrat"],
      ["Privé", "C0NTRAT SIMPLE POUR PARTIE DES CLASSES", "prive_sous_contrat"],
      ["Privé", "SOUS CONTRAT ETABLISSEMENT AGRICOLE", "prive_sous_contrat"],
      ["Privé", "HORS CONTRAT", "prive_hors_contrat"],
      ["Privé", "INCONNU DU GESTIONNAIRE", null],
      ["Privé", "SANS OBJET", null],
      ["Privé", "CONTRAT SIMPLE POUR PARTIE DES CLASSES", null], // avec un O : jamais vu, pas d'approximation
      [null, "SANS OBJET", null],
    ];
    expect(cas.map(([s, c]) => secteur(s, c))).toEqual(cas.map((c) => c[2]));
    for (const [s, c, attendu] of cas) {
      const lit = (v: string | null) => (v === null ? "null::varchar" : `'${v.replaceAll("'", "''")}'`);
      const [r] = await db.sql<{ v: string | null }>(`select secteur(${lit(s)}, ${lit(c)}) as v`);
      expect(r!.v).toBe(attendu);
    }
  });
});

describe("tables canoniques", () => {
  test("contrat avec zéro et inconnu", async () => {
    expect(await db.sql("select secteur from etablissements where uai = '0440007G'")).toEqual([
      { secteur: "prive_sous_contrat" },
    ]);
    const motifs = Object.fromEntries(
      (await db.sql<{ uai: string; motif: string }>("select uai, motif from exclus")).map((r) => [r.uai, r.motif]),
    );
    expect(motifs).toEqual({
      "0440004D": "prive_hors_contrat",
      "0440008H": "secteur_inconnu",
      "0440009J": "famille_inconnue",
      "9870001A": "hors_perimetre_geographique",
      "../X/0440010K": "uai_invalide", // l'UAI sert à nommer des fichiers et des URL : format strict
    });
  });

  test("périmètre et Corse", async () => {
    const r = await db.sql<{ uai: string; dep: string }>("select uai, dep from etablissements order by uai");
    expect(r.map((x) => x.uai)).toEqual([
      "0440001A", "0440002B", "0440003C", "0440005E", "0440006F", "0440007G", "0750701C", "0751501A", "0751502B",
      "6200001F", "9711023K", "9750001C", "9770001G",
    ]);
    expect(r.find((x) => x.uai === "6200001F")!.dep).toBe("2A");
  });

  test("Saint-Barthélemy et Saint-Martin avec la Guadeloupe, Saint-Pierre-et-Miquelon à part", async () => {
    const lignes = await db.sql(
      "select uai, dep, dep_libelle, aca, code_commune from etablissements where uai in ('9770001G', '9711023K', '9750001C') order by uai",
    );
    expect(lignes).toEqual([
      { uai: "9711023K", dep: "971", dep_libelle: "Guadeloupe", aca: "32", code_commune: "97801" },
      { uai: "9750001C", dep: "975", dep_libelle: "Saint-Pierre-et-Miquelon", aca: "44", code_commune: "97502" },
      { uai: "9770001G", dep: "971", dep_libelle: "Guadeloupe", aca: "32", code_commune: "97701" },
    ]);
  });

  test("identité d'un collège public", async () => {
    const [e] = await db.sql("select * from etablissements where uai = '0440001A'");
    expect(e).toMatchObject({
      nom: "Collège Jules-Verne", famille: "college", secteur: "public", contrat: null,
      dep: "44", aca: "17", ep: "REP", segpa: true, ulis: true, internat: false, lat: 47.218, lon: -1.553,
    });
    const [p] = await db.sql("select contrat, internat from etablissements where uai = '0440002B'");
    expect(p).toEqual({ contrat: "CONTRAT D'ASSOCIATION TOUTES CLASSES", internat: true });
  });

  test("sans coordonnées : null, pas 0", async () => {
    expect(await db.sql("select lat, lon from etablissements where uai = '0440005E'")).toEqual([{ lat: null, lon: null }]);
  });

  test("UAI multi-sites : un site principal, les autres listés", async () => {
    const [e] = await db.sql("select nom, adresse, lat from etablissements where uai = '0440003C'");
    expect(e).toEqual({ nom: "Lycée Guist'hau", adresse: "3 rue du Lycée", lat: 47.22 });
    const s = await db.sql("select rang, nom, principal from sites where uai = '0440003C' order by rang");
    // « Guist'hau sup » a le nom le plus court, mais un site d'enseignement supérieur passe après
    expect(s).toEqual([
      { rang: 1, nom: "Lycée Guist'hau", principal: true },
      { rang: 2, nom: "Guist'hau sup", principal: false },
      { rang: 3, nom: "Annexe du lycée Guist'hau", principal: false },
    ]);
    expect(await db.sql("select count(*)::int as n from sites where uai <> '0440003C'")).toEqual([{ n: 0 }]);
  });

  test("famille : le type de lycée de l'IPS l'emporte sur l'annuaire", async () => {
    // l'annuaire classe 0440006F « LYCEE PROFESSIONNEL », l'IPS le dit LPO
    expect(await db.sql("select famille from etablissements where uai = '0440006F'")).toEqual([{ famille: "lpo" }]);
    expect(await db.sql("select famille from etablissements where uai = '0440003C'")).toEqual([{ famille: "legt" }]);
  });

  test("IPS lycée : moyennes de la famille, NA absent", async () => {
    expect(await db.sql("select ips, dep_public, dep_prive, nat_prive from ips where uai = '0440003C'")).toEqual([
      { ips: 118.2, dep_public: 112, dep_prive: 125, nat_prive: 123 },
    ]);
    expect(await db.sql("select ips, ecart_type, dep_public from ips where uai = '0440006F'")).toEqual([
      { ips: null, ecart_type: null, dep_public: 105 },
    ]);
  });

  test("IPS collège : historique et moyenne privée absente en Corse", async () => {
    expect(await db.sql("select rentree, ips from ips where uai = '0440001A' order by rentree")).toEqual([
      { rentree: 2024, ips: 93 },
      { rentree: 2025, ips: 92.4 },
    ]);
    expect(await db.sql("select dep_public, dep_prive from ips where uai = '6200001F'")).toEqual([
      { dep_public: 101, dep_prive: null },
    ]);
  });

  test("personnels vides restent null", async () => {
    const [p] = await db.sql("select rentree, etp_vs, etp_ens, etp_non_tit, etp_agreges from personnels where uai = '0440002B'");
    expect(p).toEqual({ rentree: 2025, etp_vs: null, etp_ens: 30, etp_non_tit: 3, etp_agreges: null });
    const [z] = await db.sql("select etp_vs, etp_ens from personnels where uai = '0440005E'");
    expect(z).toEqual({ etp_vs: 0, etp_ens: null });
    const [c] = await db.sql("select etp_anc_8_plus, etp_35_49 from personnels where uai = '0440001A'");
    expect(c).toEqual({ etp_anc_8_plus: 11.2, etp_35_49: 18.4 });
  });

  test("hors périmètre absent des tables statistiques", async () => {
    expect(await db.sql("select count(*)::int as n from ips where uai not in (select uai from etablissements)")).toEqual([{ n: 0 }]);
  });
});
