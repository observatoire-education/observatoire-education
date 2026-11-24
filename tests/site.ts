// Site d'essai construit une fois par session de tests : données des fixtures, puis `astro build`.
// Les tests lisent le HTML produit ; ils ne dépendent pas du générateur.
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseHTML } from "linkedom";
import { calculerBudgets } from "../pipeline/src/budget-eleves.ts";
import { assemblerFiches, attacherBudgets, exporter } from "../pipeline/src/fiches.ts";
import type { EntreeCorrection } from "../pipeline/src/corrections.ts";
import type { Registre } from "../pipeline/src/registre.ts";
import { sourceBudget } from "../pipeline/src/sources.ts";
import { dbAvecRegistre, identiteTest, manifestTest, requeteTest } from "./aide.ts";

const RACINE = resolve(import.meta.dir, "..");
export const DIST_TEST = join(RACINE, ".cache", "dist-test");
const DONNEES_TEST = join(RACINE, ".cache", "data-test");
/** Configuration du site d'essai, indépendante de celle de production (noindex, Umami fictif). */
const CONFIG_TEST = join(RACINE, "tests", "fixtures", "observatoire.config.json");
/** Contours de test (carrés), à la place des contours IGN. */
const CONTOURS_TEST = join(RACINE, "tests", "fixtures", "contours");
export const UMAMI_TEST = JSON.parse(readFileSync(CONFIG_TEST, "utf8")).UMAMI as { SCRIPT: string; ID: string };

/** Une page disparue figure dans le site d'essai. */
export const REGISTRE_TEST: Registre = {
  "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" },
  "0440098Y": { premiere: "2026-01-01", identite: identiteTest("Collège Évanoui") },
};

/** Élèves aux rentrées 2022 et 2023 (les fixtures n'ont que 2024 et 2025) : dénominateurs des exercices 2023 et 2024. */
const ELEVES_HISTORIQUES: Record<string, [number, number][]> = {
  "0440001A": [[2022, 580], [2023, 600]],
  "0440002B": [[2022, 500], [2023, 520]],
  "0440005E": [[2022, 300], [2023, 310]],
  "6200001F": [[2023, 200]],
  "0440003C": [[2022, 1100], [2023, 1150]],
  "0440006F": [[2023, 700]],
  "0751501A": [[2023, 500]],
  "0751502B": [[2023, 400]],
  "0750701C": [[2023, 300]],
};

let construction: Promise<string> | undefined;

export function siteTest(): Promise<string> {
  construction ??= (async () => {
    await rm(DIST_TEST, { recursive: true, force: true });
    await mkdir(join(RACINE, ".cache"), { recursive: true });
    const db = await dbAvecRegistre(REGISTRE_TEST);
    const manifest = manifestTest(await mkdir(join(RACINE, ".cache", "manifest-test"), { recursive: true }).then(() => join(RACINE, ".cache", "manifest-test")));
    // Une version antérieure de l'IPS des collèges, corrigée depuis : le millésime 2024 de la fiche 0440001A.
    manifest.ajouter("ips_colleges", {
      sha256: "a".repeat(64), tag: "archives-ips_colleges-2025", fichier: "ips_colleges-avant.parquet",
      url: "https://github.com/org/depot/releases/download/archives-ips_colleges-2025/ips_colleges-avant.parquet",
      modified: "2025-11-01T00:00:00Z", collecteLe: "2025-11-22T02:17:00Z", lignes: 10,
    });
    manifest.rendreActuelle("ips_colleges", "ips_colleges".padEnd(64, "0"));
    manifest.ajouter("budget_2023", {
      sha256: "c".repeat(64), tag: "archives-budget_2023-2025", fichier: "budget_2023-avant.parquet",
      url: "https://github.com/org/depot/releases/download/archives-budget_2023-2025/budget_2023-avant.parquet",
      modified: "2025-11-01T00:00:00Z", collecteLe: "2025-11-22T02:17:00Z", lignes: 10,
    });
    manifest.rendreActuelle("budget_2023", "budget_2023".padEnd(64, "0"));
    const corrections: EntreeCorrection[] = [{
      source: "budget_2023", millesime: 2023, cles: ["DEPT|044|052|DEP LOIRE-ATLANTIQUE"], precedente: "c".repeat(64),
      corrigee: "budget_2023".padEnd(64, "0"), le: "2026-11-22T02:17:00Z",
    }, {
      source: "ips_colleges", millesime: 2024, cles: ["0440001A"], precedente: "a".repeat(64),
      corrigee: "ips_colleges".padEnd(64, "0"), le: "2026-11-22T02:17:00Z",
    }];
    const fiches = await assemblerFiches(db, manifest, REGISTRE_TEST, new Date("2026-11-23T02:17:00Z"), { corrections });
    for (const f of fiches) {
      const h = ELEVES_HISTORIQUES[f.uai];
      const i = f.indicateurs.find((x) => x.code === "eleves");
      if (h && i) i.historique = [...h, ...i.historique.filter(([a]) => !h.some(([b]) => a === b))].sort((a, b) => a[0] - b[0]);
    }
    const budgets = await calculerBudgets(db, fiches);
    attacherBudgets(fiches, budgets, manifest, corrections);
    // Exercices sans fixture de données : présents seulement dans les sources, pour la page /sources/.
    for (const e of [2020, 2021, 2022, 2025]) {
      const s = sourceBudget(e, `jeu-${e}`);
      manifest.ajouter(s.id, {
        sha256: s.id.padEnd(64, "0"), tag: `archives-${s.id}-2026`, fichier: `${s.id}.parquet`,
        url: `https://github.com/org/depot/releases/download/archives-${s.id}-2026/${s.id}.parquet`,
        modified: "2026-11-01T00:00:00Z", collecteLe: "2026-11-22T02:17:00Z", lignes: 10, requete: requeteTest(s.id, s.datasetId),
      });
    }
    await exporter(fiches, db, manifest, DONNEES_TEST, corrections);
    const p = Bun.spawn(["bun", "run", "astro", "build"], {
      cwd: join(RACINE, "site"),
      env: { ...process.env, OBS_DATA: DONNEES_TEST, OBS_DIST: DIST_TEST, OBS_CONFIG: CONFIG_TEST, OBS_CONTOURS: CONTOURS_TEST },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [sortie, erreurs, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code !== 0) throw new Error(`astro build a échoué (${code}) :\n${sortie}\n${erreurs}`);
    return DIST_TEST;
  })();
  return construction;
}

const fichierDe = (chemin: string) =>
  chemin.endsWith(".html") || chemin.includes(".") ? join(DIST_TEST, chemin) : join(DIST_TEST, chemin, "index.html");

/** HTML d'une page (« etablissement/0440001A »). Appeler `await siteTest()` avant. */
export function page(chemin: string): string {
  const f = fichierDe(chemin);
  if (!existsSync(f)) throw new Error(`page absente : ${f}`);
  return readFileSync(f, "utf8");
}

export const octets = (chemin: string): number => statSync(fichierDe(chemin)).size;

export const doc = (chemin: string) => parseHTML(page(chemin)).document;

/**
 * Texte visible d'une page (sans scripts ni styles), espaces normalisés. Une espace sépare le texte
 * de deux éléments voisins (« Sans classement » puis « On compare » ne doivent pas se coller).
 */
export function texte(chemin: string): string {
  const d = doc(chemin);
  for (const n of d.querySelectorAll("script, style")) n.remove();
  const espace = parseHTML(`<!doctype html><html><body>${(d.body?.innerHTML ?? "").replace(/</g, " <")}</body></html>`).document;
  return (espace.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}
