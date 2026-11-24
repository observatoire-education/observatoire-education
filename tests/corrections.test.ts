import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manifest } from "../pipeline/src/archive.ts";
import { collecter, type ClientSources } from "../pipeline/src/collect.ts";
import { ajouterCorrections, comparerVersions, type EntreeCorrection, lireCorrections, rattraperCorrections } from "../pipeline/src/corrections.ts";
import { DepotLocal } from "../pipeline/src/depot.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { SOURCES, type Source, sourceBudget } from "../pipeline/src/sources.ts";

type Ligne = Record<string, string | null>;

const duck = await connexion();
let racine: string;
let n = 0;
beforeAll(async () => {
  racine = await mkdtemp(join(tmpdir(), "obs-corrections-"));
});
afterAll(async () => {
  await rm(racine, { recursive: true, force: true });
});

/** Parquet de texte : toutes les colonnes requises, valeurs par défaut « x », surchargées par `l`. */
async function parquet(s: Source, rows: Ligne[], dest = join(racine, `v${n++}.parquet`)): Promise<string> {
  const vide = Object.fromEntries(s.colonnesRequises.map((c) => [c, "x"]));
  const lignes = rows.map((r) => ({ ...vide, ...r }));
  const val = (v: string | null | undefined) => (v === null || v === undefined ? "null::varchar" : `${litteral(v)}::varchar`);
  const sel = lignes
    .map((l) => `select ${s.colonnesRequises.map((c) => `${val(l[c])} as "${c}"`).join(", ")}`)
    .join(" union all ");
  await executer(duck, `copy (${sel}) to ${litteral(dest)} (format parquet)`);
  return dest;
}

const ips = SOURCES.ips_colleges;
const l = (uai: string, rentree: string, ips_ = "100", extra: Ligne = {}): Ligne => ({ uai, rentree_scolaire: rentree, ips: ips_, ...extra });

describe("comparerVersions", () => {
  test("une valeur changée dans un millésime ancien : correction de ce millésime, clé citée", async () => {
    const a = await parquet(ips, [l("A", "2023-2024"), l("B", "2023-2024"), l("A", "2024-2025")]);
    const b = await parquet(ips, [l("A", "2023-2024"), l("B", "2023-2024", "101"), l("A", "2024-2025")]);
    expect(await comparerVersions(duck, ips, a, b)).toEqual([{ millesime: 2023, cles: ["B"] }]);
  });

  test("un millésime nouveau ajouté : aucune correction", async () => {
    const a = await parquet(ips, [l("A", "2023-2024")]);
    const b = await parquet(ips, [l("A", "2023-2024"), l("A", "2024-2025"), l("B", "2024-2025")]);
    expect(await comparerVersions(duck, ips, a, b)).toEqual([]);
  });

  test("lignes réordonnées : aucune correction", async () => {
    const rows = [l("A", "2023-2024"), l("B", "2023-2024"), l("B", "2023-2024"), l("C", "2022-2023")];
    const a = await parquet(ips, rows);
    const b = await parquet(ips, [...rows].reverse());
    expect(await comparerVersions(duck, ips, a, b)).toEqual([]);
  });

  test("ligne supprimée d'un millésime ancien : correction", async () => {
    const a = await parquet(ips, [l("A", "2023-2024"), l("B", "2023-2024")]);
    const b = await parquet(ips, [l("A", "2023-2024")]);
    expect(await comparerVersions(duck, ips, a, b)).toEqual([{ millesime: 2023, cles: ["B"] }]);
  });

  test("ligne dupliquée en moins : correction (multiensemble)", async () => {
    const a = await parquet(ips, [l("A", "2023-2024"), l("A", "2023-2024")]);
    const b = await parquet(ips, [l("A", "2023-2024")]);
    expect(await comparerVersions(duck, ips, a, b)).toEqual([{ millesime: 2023, cles: ["A"] }]);
  });

  test("NULL et chaîne vide égaux, espaces ignorés", async () => {
    const a = await parquet(ips, [l("A", "2023-2024", "100", { ecart_type_de_l_ips: null })]);
    const b = await parquet(ips, [l("A", "2023-2024", " 100 ", { ecart_type_de_l_ips: "" })]);
    expect(await comparerVersions(duck, ips, a, b)).toEqual([]);
  });

  test("colonne non requise changée : aucune correction", async () => {
    const a = await parquet(ips, [l("A", "2023-2024")]);
    const b = join(racine, `v${n++}.parquet`);
    await executer(duck, `copy (select *, 'autre' as bruit from read_parquet(${litteral(a)})) to ${litteral(b)} (format parquet)`);
    expect(await comparerVersions(duck, ips, a, b)).toEqual([]);
  });

  test("clé à plusieurs colonnes (budget) : clé jointe par |", async () => {
    const s = sourceBudget(2024, "jeu");
    const ligneB = (exer: string, nom: string, v: string): Ligne => ({
      exer, categ: "DEPT", ndept: "044", cregi: "52", lbudg: nom, obnetdeb: v,
    });
    const a = await parquet(s, [ligneB("2023", "CD44", "1"), ligneB("2024", "CD44", "1")]);
    const b = await parquet(s, [ligneB("2023", "CD44", "2"), ligneB("2024", "CD44", "1")]);
    expect(await comparerVersions(duck, s, a, b)).toEqual([{ millesime: 2023, cles: ["DEPT|044|52|CD44"] }]);
  });
});

describe("corrections.json", () => {
  const e = (extra: Partial<EntreeCorrection> = {}): EntreeCorrection => ({
    source: "ips_colleges", millesime: 2023, cles: ["A"], precedente: "p", corrigee: "c1", le: "2026-11-23T02:17:00.000Z", ...extra,
  });

  test("ajouterCorrections est idempotent, dédoublonné et trié", () => {
    const f = join(racine, "c.json");
    expect(lireCorrections(f)).toEqual([]);
    ajouterCorrections(f, [e({ millesime: 2024 }), e()]);
    ajouterCorrections(f, [e(), e({ millesime: 2024 }), e({ source: "effectifs_colleges", corrigee: "c2" })]);
    const lues = lireCorrections(f);
    expect(lues.map((x) => `${x.source}|${x.millesime}|${x.corrigee}`)).toEqual([
      "effectifs_colleges|2023|c2", "ips_colleges|2023|c1", "ips_colleges|2024|c1",
    ]);
  });
});

describe("collecter et corrections", () => {
  /** Faux client : ips_colleges sert `contenu`, les autres sources un Parquet minimal valide. */
  function client(contenu: { rows: Ligne[]; modified: string }): ClientSources {
    return {
      async metadata(s) {
        return { modified: s.id === "ips_colleges" ? contenu.modified : "M1", recordsCount: 10 };
      },
      async telechargerParquet(s, dest) {
        const rows = s.id === "ips_colleges" ? contenu.rows : Array.from({ length: 10 }, (_, i) => ({ uai: `U${i}`, identifiant_de_l_etablissement: `U${i}`, type_etablissement: "Collège", fonction: "221" }));
        await parquet(s, rows as Ligne[], dest);
        return { chemin: dest, url: `${s.api}/${s.datasetId}/exports/parquet` };
      },
      async chercherJeu() {
        return [];
      },
    };
  }

  test("nouvelle version d'ips_colleges qui corrige 2024 → entrée dans corrections.json", async () => {
    const dossier = await mkdtemp(join(racine, "collect-"));
    const manifest = Manifest.lire(join(dossier, "manifest.json"));
    const depot = new DepotLocal(join(dossier, "depot"));
    const corrections = join(dossier, "corrections.json");
    const contenu = { modified: "M1", rows: [l("A", "2024-2025"), l("B", "2024-2025")] };
    const o = (jour: string) => ({ manifest, client: client(contenu), depot, maintenant: new Date(jour), tmp: join(dossier, "tmp"), corrections });

    await collecter(o("2026-11-22T02:00:00Z")); // première version : rien à comparer
    expect(lireCorrections(corrections)).toEqual([]);

    contenu.modified = "M2";
    contenu.rows = [l("A", "2024-2025"), l("B", "2024-2025", "99"), l("B", "2025-2026")];
    const j = await collecter(o("2026-11-23T02:00:00Z"));
    expect(j.filter((x) => x.source === "ips_colleges").map((x) => x.action)).toEqual(["telecharge"]);
    const [v1, v2] = manifest.versions("ips_colleges");
    expect(lireCorrections(corrections)).toEqual([
      { source: "ips_colleges", millesime: 2024, cles: ["B"], precedente: v1!.sha256, corrigee: v2!.sha256, le: "2026-11-23T02:00:00.000Z" },
    ]);
    // les fichiers temporaires de comparaison sont supprimés
    expect((await readdir(join(dossier, "tmp"))).filter((f) => f.includes("precedente") || f.includes("corrigee"))).toEqual([]);
  });

  test("filtre changé : la nouvelle version n'est pas comparée à l'ancienne (périmètre différent)", async () => {
    const dossier = await mkdtemp(join(racine, "collect-"));
    const manifest = Manifest.lire(join(dossier, "manifest.json"));
    const depot = new DepotLocal(join(dossier, "depot"));
    const corrections = join(dossier, "corrections.json");
    const budget = { v: "1" };
    const base = client({ modified: "M1", rows: [l("A", "2024-2025")] });
    const c: ClientSources = {
      ...base,
      async telechargerParquet(s, dest) {
        if (s.id !== "budget_2024") return base.telechargerParquet(s, dest);
        const ligneB = (i: number): Ligne => ({ exer: "2024", categ: "DEPT", ndept: "044", cregi: "52", lbudg: `CD${i}`, fonction: "221", obnetdeb: budget.v });
        await parquet(s, Array.from({ length: 10 }, (_, i) => ligneB(i)), dest);
        return { chemin: dest, url: `${s.api}/${s.datasetId}/exports/parquet?where=nouveau` };
      },
    };
    const o = (jour: string) => ({ manifest, client: c, depot, maintenant: new Date(jour), tmp: join(dossier, "tmp"), corrections });
    await collecter(o("2026-11-22T02:00:00Z"));
    expect(manifest.versions("budget_2024")).toHaveLength(1);
    manifest.derniere("budget_2024")!.requete = "https://exemple.test/ancien-filtre";
    budget.v = "2";
    const j = await collecter(o("2026-11-23T02:00:00Z"));
    expect(j.filter((x) => x.source === "budget_2024").map((x) => x.action)).toEqual(["telecharge"]);
    expect(manifest.versions("budget_2024")).toHaveLength(2);
    expect(lireCorrections(corrections).filter((e) => e.source === "budget_2024")).toEqual([]);
  });

  test("sans option corrections : aucune comparaison", async () => {
    const dossier = await mkdtemp(join(racine, "collect-"));
    const manifest = Manifest.lire(join(dossier, "manifest.json"));
    const depot = new DepotLocal(join(dossier, "depot"));
    const contenu = { modified: "M1", rows: [l("A", "2024-2025")] };
    const o = (jour: string) => ({ manifest, client: client(contenu), depot, maintenant: new Date(jour), tmp: join(dossier, "tmp") });
    await collecter(o("2026-11-22T02:00:00Z"));
    contenu.modified = "M2";
    contenu.rows = [l("A", "2024-2025", "99")];
    const j = await collecter(o("2026-11-23T02:00:00Z"));
    expect(j.filter((x) => x.source === "ips_colleges").map((x) => x.action)).toEqual(["telecharge"]);
  });

  test("erreur de comparaison : ligne erreur au journal, version archivée", async () => {
    const dossier = await mkdtemp(join(racine, "collect-"));
    const manifest = Manifest.lire(join(dossier, "manifest.json"));
    const depot = new DepotLocal(join(dossier, "depot"));
    const contenu = { modified: "M1", rows: [l("A", "2024-2025")] };
    const o = (jour: string) => ({ manifest, client: client(contenu), depot, maintenant: new Date(jour), tmp: join(dossier, "tmp"), corrections: join(dossier, "c.json") });
    await collecter(o("2026-11-22T02:00:00Z"));
    await rm(join(dossier, "depot"), { recursive: true }); // la version précédente n'est plus récupérable
    contenu.modified = "M2";
    contenu.rows = [l("A", "2024-2025", "99")];
    const j = await collecter({ ...o("2026-11-23T02:00:00Z"), depot: { publier: (t, f) => depot.publier(t, f), recuperer: () => Promise.reject(new Error("introuvable")) } });
    expect(j.filter((x) => x.source === "ips_colleges").map((x) => [x.action, x.motif])).toEqual([
      ["telecharge", undefined],
      ["erreur", "comparaison des versions : introuvable"],
    ]);
    expect(manifest.versions("ips_colleges")).toHaveLength(2);
  });
});

describe("rattrapage des corrections", () => {
  const version = (id: string, sha: string, fichier: string, jour: string, requete?: string) => ({
    sha256: sha, tag: `archives-${id}`, fichier, url: `https://exemple.test/${fichier}`, modified: jour,
    collecteLe: `${jour}T02:00:00.000Z`, lignes: 2, ...(requete ? { requete } : {}),
  });

  test("deux versions locales → une entrée ; une paire en échec n'empêche pas les autres ; requêtes différentes sautées", async () => {
    const dossier = await mkdtemp(join(racine, "rattrapage-"));
    const manifest = Manifest.lire(join(dossier, "manifest.json"));
    // ips_colleges : v1 → v2 corrige B en 2024.
    const v1 = await parquet(ips, [l("A", "2024-2025"), l("B", "2024-2025")], join(dossier, "ips1.parquet"));
    const v2 = await parquet(ips, [l("A", "2024-2025"), l("B", "2024-2025", "99")], join(dossier, "ips2.parquet"));
    manifest.ajouter("ips_colleges", version("ips_colleges", "1".repeat(64), v1, "2026-11-20"));
    manifest.ajouter("ips_colleges", version("ips_colleges", "2".repeat(64), v2, "2026-11-21"));
    // effectifs_colleges : la version précédente est introuvable → échec journalisé, on continue.
    const eff = SOURCES.effectifs_colleges;
    const e2 = await parquet(eff, [{ rentree_scolaire: "2024" }], join(dossier, "eff2.parquet"));
    manifest.ajouter("effectifs_colleges", version("effectifs_colleges", "3".repeat(64), join(dossier, "absent.parquet"), "2026-11-20"));
    manifest.ajouter("effectifs_colleges", version("effectifs_colleges", "4".repeat(64), e2, "2026-11-21"));
    // budget_2024 : filtre changé entre les deux versions → paire sautée, même si les valeurs diffèrent.
    const bud = sourceBudget(2024, "jeu");
    const ligneB = (v: string): Ligne => ({ exer: "2024", categ: "DEPT", ndept: "044", cregi: "52", lbudg: "CD44", obnetdeb: v });
    const b1 = await parquet(bud, [ligneB("1")], join(dossier, "b1.parquet"));
    const b2 = await parquet(bud, [ligneB("2")], join(dossier, "b2.parquet"));
    manifest.ajouter("budget_2024", version("budget_2024", "5".repeat(64), b1, "2026-11-20", "https://exemple.test/ancien"));
    manifest.ajouter("budget_2024", version("budget_2024", "6".repeat(64), b2, "2026-11-21", "https://exemple.test/nouveau"));
    // Dépôt local : la « version » est le chemin du fichier.
    const depot = {
      publier: () => Promise.reject(new Error("lecture seule")),
      recuperer: async (v: { fichier: string }, dest: string) => {
        if (!(await Bun.file(v.fichier).exists())) throw new Error(`introuvable : ${v.fichier}`);
        await Bun.write(dest, Bun.file(v.fichier));
      },
    };
    const corrections = join(dossier, "corrections.json");
    const sortie: string[] = [];
    const r = await rattraperCorrections({ manifest, depot, duck, tmp: join(dossier, "tmp"), corrections, journal: (x) => sortie.push(x) });
    expect(lireCorrections(corrections)).toEqual([
      { source: "ips_colleges", millesime: 2024, cles: ["B"], precedente: "1".repeat(64), corrigee: "2".repeat(64), le: "2026-11-21T02:00:00.000Z" },
    ]);
    expect(r.echecs).toBe(1);
    expect(sortie.some((x) => x.includes("effectifs_colleges") && x.includes("introuvable"))).toBe(true);
    expect(sortie.some((x) => x.includes("budget_2024") && x.includes("requête"))).toBe(true);
  });
});
