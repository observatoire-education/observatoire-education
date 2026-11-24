import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OdsClient, USER_AGENT } from "../pipeline/src/ods.ts";
import { API_ECO, developper, EXERCICES_BUDGET, FILTRE_BUDGET, SOURCES, sourceBudget } from "../pipeline/src/sources.ts";

type Appel = { url: string; headers: Headers };

/** Faux fetch : rejoue une liste de réponses (ou d'erreurs) et note chaque appel. */
function fauxFetch(reponses: (Response | Error)[]) {
  const appels: Appel[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ url: String(input), headers: new Headers(init?.headers) });
    const r = reponses.shift();
    if (!r) throw new Error("plus de réponse prévue");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { f, appels };
}

const sansAttente = { attendre: async () => {} };
const parquet = (corps = "contenu") => new Response(`PAR1${corps}PAR1`, { status: 200 });

let dossier: string;
beforeAll(async () => {
  dossier = await mkdtemp(join(tmpdir(), "obs-ods-"));
});
afterAll(async () => {
  await rm(dossier, { recursive: true, force: true });
});

describe("registre des sources", () => {
  test("dix-huit sources, l'annuaire est le référentiel", () => {
    expect(Object.keys(SOURCES)).toHaveLength(18);
    expect(SOURCES.annuaire.referentiel).toBe(true);
    expect(Object.values(SOURCES).filter((s) => s.referentiel)).toHaveLength(1);
  });

  test("producteurs et pages", () => {
    expect(SOURCES.annuaire.producteur).toBe("MEN");
    expect(SOURCES.personnels.producteur).toBe("MEN-DEPP");
    expect(SOURCES.ips_colleges.pageUrl).toBe(
      "https://data.education.gouv.fr/explore/dataset/fr-en-ips-colleges-ap2023/information/",
    );
  });

  test("motifs développés en noms complets", () => {
    expect(developper("ips_{departemental,national}_{public,prive}")).toEqual([
      "ips_departemental_public",
      "ips_departemental_prive",
      "ips_national_public",
      "ips_national_prive",
    ]);
    for (const s of Object.values(SOURCES)) {
      for (const c of s.colonnesRequises) expect(c).not.toMatch(/[{}]/);
    }
    expect(SOURCES.ips_lycees.colonnesRequises).toContain("ips_academique_lpo_prive");
    expect(SOURCES.effectifs_colleges.colonnesRequises).toContain("nombre_de_3emes_lv2_italien");
  });
});

describe("client Opendatasoft", () => {
  test("métadonnées", async () => {
    const { f, appels } = fauxFetch([
      Response.json({ metas: { default: { modified: "2026-09-01T09:31:02+00:00", records_count: 21061 } } }),
    ]);
    const client = new OdsClient(f, USER_AGENT, sansAttente);
    expect(await client.metadata(SOURCES.ips_colleges)).toEqual({
      modified: "2026-09-01T09:31:02+00:00",
      recordsCount: 21061,
    });
    expect(appels[0]!.url).toBe(
      "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-ips-colleges-ap2023",
    );
  });

  test("métadonnées incomplètes : erreur explicite", async () => {
    const { f } = fauxFetch([Response.json({ metas: { default: {} } })]);
    const client = new OdsClient(f, USER_AGENT, sansAttente);
    await expect(client.metadata(SOURCES.ips_colleges)).rejects.toThrow(/modified/);
  });

  test("téléchargement parquet", async () => {
    const { f, appels } = fauxFetch([parquet()]);
    const dest = join(dossier, "ips.parquet");
    const client = new OdsClient(f, USER_AGENT, sansAttente);
    const url = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-ips-colleges-ap2023/exports/parquet";
    expect(await client.telechargerParquet(SOURCES.ips_colleges, dest)).toEqual({ chemin: dest, url });
    expect(await Bun.file(dest).text()).toBe("PAR1contenuPAR1");
    expect(appels[0]!.url).toBe(url); // sans filtre : URL inchangée
  });

  test("filtre budget : fonctions 221, 222, 223, 22 et 24, seules ou préfixées", () => {
    for (const f of ["221", "93222", "90223", "9322", "24", "9024", "9124", "9224", "9324", "9424"]) {
      expect(FILTRE_BUDGET).toContain(`"${f}"`);
    }
    expect(FILTRE_BUDGET).not.toContain('"924"');
  });

  test("téléchargement d'une source budget : filtre encodé, URL renvoyée", async () => {
    const { f, appels } = fauxFetch([parquet()]);
    const s = sourceBudget(2024, EXERCICES_BUDGET[2024]!);
    const dest = join(dossier, "b.parquet");
    const attendue = `${API_ECO}/${s.datasetId}/exports/parquet?where=${encodeURIComponent(FILTRE_BUDGET)}`;
    const r = await new OdsClient(f, USER_AGENT, sansAttente).telechargerParquet(s, dest);
    expect(r).toEqual({ chemin: dest, url: attendue });
    expect(appels[0]!.url).toBe(attendue);
  });

  test("téléchargement de fermes : filtre des établissements fermés encodé", async () => {
    const { f, appels } = fauxFetch([parquet()]);
    const s = SOURCES.fermes;
    await new OdsClient(f, USER_AGENT, sansAttente).telechargerParquet(s, join(dossier, "f.parquet"));
    expect(appels[0]!.url).toBe(
      `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-etablissements-fermes/exports/parquet?where=${encodeURIComponent(s.filtre!)}`,
    );
    expect(s.filtre).toBe(
      `date_fermeture >= date'2012-01-01' and (nature_uai_libe like "COLLEGE%" or nature_uai_libe like "LYCEE%" or nature_uai_libe like "ETAB REGIONAL%")`,
    );
  });

  test("métadonnées d'une source budget : API data.economie.gouv.fr", async () => {
    const { f, appels } = fauxFetch([Response.json({ metas: { default: { modified: "M", records_count: 3 } } })]);
    await new OdsClient(f, USER_AGENT, sansAttente).metadata(sourceBudget(2024, "abc"));
    expect(appels[0]!.url).toBe(`${API_ECO}/abc`);
  });

  test("parquet tronqué rejeté", async () => {
    const { f } = fauxFetch([new Response("PAR1début sans fin", { status: 200 })]);
    const client = new OdsClient(f, USER_AGENT, sansAttente);
    await expect(client.telechargerParquet(SOURCES.ips_colleges, join(dossier, "t.parquet"))).rejects.toThrow(/tronqué/);
  });

  test("retries et user-agent", async () => {
    const attentes: number[] = [];
    const { f, appels } = fauxFetch([new Response("", { status: 503 }), new Error("ECONNRESET"), parquet()]);
    const client = new OdsClient(f, USER_AGENT, { attendre: async (ms) => void attentes.push(ms) });
    await client.telechargerParquet(SOURCES.annuaire, join(dossier, "a.parquet"));
    expect(appels).toHaveLength(3);
    expect(attentes).toEqual([2000, 4000]);
    expect(appels[0]!.headers.get("user-agent")).toStartWith("observatoireeducation/");
    expect(appels[0]!.headers.get("accept-encoding")).toBe("gzip");
  });

  test("abandon après trois échecs", async () => {
    const { f, appels } = fauxFetch([503, 502, 500].map((s) => new Response("", { status: s })));
    const client = new OdsClient(f, USER_AGENT, sansAttente);
    await expect(client.metadata(SOURCES.annuaire)).rejects.toThrow(/500/);
    expect(appels).toHaveLength(3);
  });

  test("erreur 4xx : pas de nouvel essai", async () => {
    const { f, appels } = fauxFetch([new Response("", { status: 404 }), parquet()]);
    const client = new OdsClient(f, USER_AGENT, sansAttente);
    await expect(client.metadata(SOURCES.annuaire)).rejects.toThrow(/404/);
    expect(appels).toHaveLength(1);
  });
});

describe("recherche d'un jeu au catalogue", () => {
  const titre = "nature-fonction 2025";
  const catalogue = (...titres: string[]) =>
    Response.json({ results: titres.map((t, i) => ({ dataset_id: `jeu-${i}`, title: t })) });

  test("aucun, un ou deux jeux selon le catalogue", async () => {
    const cas: [string[], string[]][] = [
      [[], []],
      [[`Balances avec la présentation croisée ${titre}`], ["jeu-0"]],
      [[`Balances ${titre}`, `Balances provisoires ${titre}`], ["jeu-0", "jeu-1"]],
    ];
    for (const [titres, attendu] of cas) {
      const { f, appels } = fauxFetch([catalogue(...titres)]);
      expect(await new OdsClient(f, USER_AGENT, sansAttente).chercherJeu(API_ECO, titre)).toEqual(attendu);
      expect(appels[0]!.url).toStartWith(`${API_ECO}?`);
      expect(decodeURIComponent(appels[0]!.url)).toContain(`where=search("${titre}")`);
    }
  });

  test("un titre plus long n'est pas accepté : « 20250 » n'est pas « 2025 »", async () => {
    const { f } = fauxFetch([catalogue("Balances nature-fonction 20250", "Balances nature-fonction 2025")]);
    expect(await new OdsClient(f, USER_AGENT, sansAttente).chercherJeu(API_ECO, titre)).toEqual(["jeu-1"]);
  });
});
