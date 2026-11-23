// Garde-fous de fin de build : volume de dist/ (limites de GitHub Pages) et fichiers d'hébergement.
// `bun scripts/garde-fous.ts [dist]` : échoue (code 1) si dist/ dépasse les limites.
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Limites {
  octets: number;
  fichiers: number;
}

/** 900 Mo et 50 000 fichiers : sous la limite de 1 Go de GitHub Pages, avec de la marge. */
export const LIMITES: Limites = { octets: 900e6, fichiers: 50_000 };

export interface Config {
  SITE_URL: string;
  DOMAINE: string;
  DEPOT: string;
  INDEXABLE: boolean;
}

/** Taille et nombre de fichiers de `dossier` ; lève une erreur au-delà des limites. */
export function verifierDist(dossier: string, limites: Limites = LIMITES): { octets: number; fichiers: number } {
  let octets = 0;
  let fichiers = 0;
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      const s = statSync(p);
      if (s.isDirectory()) parcourir(p);
      else {
        octets += s.size;
        fichiers++;
      }
    }
  };
  parcourir(dossier);
  if (octets > limites.octets) {
    throw new Error(`dist/ trop volumineux : ${octets} octets > ${limites.octets} (prévoir le passage à Cloudflare Pages)`);
  }
  if (fichiers > limites.fichiers) throw new Error(`dist/ contient trop de fichiers : ${fichiers} > ${limites.fichiers}`);
  return { octets, fichiers };
}

/** CNAME seulement si un domaine est configuré ; robots.txt selon INDEXABLE. */
export function ecrireFichiersHebergement(dossier: string, config: Config): void {
  const cname = join(dossier, "CNAME");
  if (config.DOMAINE) writeFileSync(cname, `${config.DOMAINE}\n`);
  else if (existsSync(cname)) rmSync(cname);
  writeFileSync(
    join(dossier, "robots.txt"),
    config.INDEXABLE
      ? `User-agent: *\nAllow: /\nSitemap: ${config.SITE_URL}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
}

if (import.meta.main) {
  const dossier = process.argv[2] ?? "dist";
  const config = JSON.parse(readFileSync(process.env.OBS_CONFIG ?? "observatoire.config.json", "utf8")) as Config;
  try {
    ecrireFichiersHebergement(dossier, config);
    const { octets, fichiers } = verifierDist(dossier);
    console.log(`${dossier}/ : ${(octets / 1e6).toFixed(1)} Mo, ${fichiers} fichiers (limites : ${LIMITES.octets / 1e6} Mo, ${LIMITES.fichiers} fichiers)`);
    console.log(config.INDEXABLE ? "référencement autorisé" : "aperçu non référencé (noindex, robots.txt Disallow)");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
