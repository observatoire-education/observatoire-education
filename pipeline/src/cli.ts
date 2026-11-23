// Point d'entrée : `bun pipeline/src/cli.ts collect | data`.
import { readFileSync } from "node:fs";
import { Manifest } from "./archive.ts";
import { collecter } from "./collect.ts";
import { type Depot, DepotGithub, DepotLocal } from "./depot.ts";
import { OdsClient } from "./ods.ts";

interface Config {
  SITE_URL: string;
  DOMAINE: string;
  DEPOT: string;
  INDEXABLE: boolean;
}

export const CHEMINS = {
  config: "observatoire.config.json",
  manifest: "archives/manifest.json",
  journal: "archives/journal.jsonl",
  registre: "archives/registre-pages.json",
  tmp: ".cache/tmp",
  depotLocal: ".cache/depot",
  cache: ".cache/archives",
};

export function lireConfig(): Config {
  return JSON.parse(readFileSync(CHEMINS.config, "utf8")) as Config;
}

/** OBS_DEPOT=local : archives dans .cache/depot (essais) ; sinon GitHub Releases du dépôt configuré. */
export function choisirDepot(config: Config): Depot {
  return process.env.OBS_DEPOT === "local" ? new DepotLocal(CHEMINS.depotLocal) : new DepotGithub(config.DEPOT);
}

async function collect(): Promise<void> {
  const config = lireConfig();
  const journal = await collecter({
    manifest: Manifest.lire(CHEMINS.manifest),
    client: new OdsClient(),
    depot: choisirDepot(config),
    maintenant: new Date(),
    tmp: CHEMINS.tmp,
    journal: CHEMINS.journal,
  });
  for (const l of journal) {
    const detail = [l.lignes !== undefined ? `${l.lignes} lignes` : "", l.motif ?? ""].filter(Boolean).join(" · ");
    console.log(`${l.source.padEnd(22)} ${l.action.padEnd(10)} ${detail}`);
  }
  // Toujours 0 : un rejet n'est pas un échec de la collecte, le journal fait foi.
}

const commande = process.argv[2];
if (commande === "collect") await collect();
else if (commande === "data") throw new Error("sous-commande data : tâche 7 du plan");
else {
  console.error("usage : bun pipeline/src/cli.ts collect | data");
  process.exit(2);
}
