// Site d'essai construit une fois par session de tests : données des fixtures, puis `astro build`.
// Les tests lisent le HTML produit ; ils ne dépendent pas du générateur.
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseHTML } from "linkedom";
import { assemblerFiches, exporter } from "../pipeline/src/fiches.ts";
import type { Registre } from "../pipeline/src/registre.ts";
import { dbAvecRegistre, identiteTest, manifestTest } from "./aide.ts";

const RACINE = resolve(import.meta.dir, "..");
export const DIST_TEST = join(RACINE, ".cache", "dist-test");
const DONNEES_TEST = join(RACINE, ".cache", "data-test");

/** Une page disparue figure dans le site d'essai. */
export const REGISTRE_TEST: Registre = {
  "0440099Z": { premiere: "2026-01-01", identite: identiteTest("Collège Disparu"), disparuLe: "2026-10-01" },
};

let construction: Promise<string> | undefined;

export function siteTest(): Promise<string> {
  construction ??= (async () => {
    await rm(DIST_TEST, { recursive: true, force: true });
    await mkdir(join(RACINE, ".cache"), { recursive: true });
    const db = await dbAvecRegistre(REGISTRE_TEST);
    const manifest = manifestTest(await mkdir(join(RACINE, ".cache", "manifest-test"), { recursive: true }).then(() => join(RACINE, ".cache", "manifest-test")));
    const fiches = await assemblerFiches(db, manifest, REGISTRE_TEST, new Date("2026-11-23T02:17:00Z"));
    await exporter(fiches, db, manifest, DONNEES_TEST);
    const p = Bun.spawn(["bun", "run", "astro", "build"], {
      cwd: join(RACINE, "site"),
      env: { ...process.env, OBS_DATA: DONNEES_TEST, OBS_DIST: DIST_TEST },
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
