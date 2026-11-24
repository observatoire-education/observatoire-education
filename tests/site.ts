// Site d'essai construit une fois par session de tests : données des fixtures, puis `astro build`.
// Les tests lisent le HTML produit ; ils ne dépendent pas du générateur.
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseHTML } from "linkedom";
import { calculerBudgets } from "../pipeline/src/budget-eleves.ts";
import { assemblerFiches, attacherBudgets, exporter } from "../pipeline/src/fiches.ts";
import type { Registre } from "../pipeline/src/registre.ts";
import { dbAvecRegistre, identiteTest, manifestTest } from "./aide.ts";

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
    const fiches = await assemblerFiches(db, manifest, REGISTRE_TEST, new Date("2026-11-23T02:17:00Z"));
    for (const f of fiches) {
      const h = ELEVES_HISTORIQUES[f.uai];
      const i = f.indicateurs.find((x) => x.code === "eleves");
      if (h && i) i.historique = [...h, ...i.historique.filter(([a]) => !h.some(([b]) => a === b))].sort((a, b) => a[0] - b[0]);
    }
    const budgets = await calculerBudgets(db, fiches);
    attacherBudgets(fiches, budgets, manifest);
    await exporter(fiches, db, manifest, DONNEES_TEST);
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
