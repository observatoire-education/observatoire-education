// Rattrapage : compare chaque paire de versions consécutives du manifest et ajoute les corrections de millésime
// à archives/corrections.json (idempotent, écrit source par source). Lecture seule sur le dépôt d'archives.
// Une paire en échec est journalisée et n'arrête pas les autres ; une paire de requêtes différentes est sautée.
import { join } from "node:path";
import { Manifest } from "../pipeline/src/archive.ts";
import { CHEMINS, choisirDepot, lireConfig } from "../pipeline/src/cli.ts";
import { rattraperCorrections } from "../pipeline/src/corrections.ts";
import { connexion } from "../pipeline/src/duck.ts";

const duck = await connexion();
try {
  const { entrees, echecs } = await rattraperCorrections({
    manifest: Manifest.lire(CHEMINS.manifest), depot: choisirDepot(lireConfig()), duck,
    tmp: join(CHEMINS.tmp, "rattrapage"), corrections: CHEMINS.corrections,
  });
  console.log(`${entrees} correction(s) de millésime détectée(s), ${echecs} paire(s) en échec`);
  if (echecs) process.exitCode = 1;
} finally {
  duck.closeSync();
}
