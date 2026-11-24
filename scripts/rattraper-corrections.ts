// Rattrapage : compare chaque paire de versions consécutives du manifest et ajoute les corrections de millésime
// à archives/corrections.json (idempotent). Lecture seule sur le dépôt d'archives.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Manifest } from "../pipeline/src/archive.ts";
import { CHEMINS, choisirDepot, lireConfig } from "../pipeline/src/cli.ts";
import { ajouterCorrections, comparerVersions, type EntreeCorrection } from "../pipeline/src/corrections.ts";
import { connexion } from "../pipeline/src/duck.ts";
import { toutesSources } from "../pipeline/src/sources.ts";

const manifest = Manifest.lire(CHEMINS.manifest);
const depot = choisirDepot(lireConfig());
const tmp = join(CHEMINS.tmp, "rattrapage");
await mkdir(tmp, { recursive: true });
const duck = await connexion();
const trouvees: EntreeCorrection[] = [];
try {
  for (const s of toutesSources(manifest)) {
    if (!s.millesime) continue;
    const versions = manifest.versions(s.id);
    for (let i = 1; i < versions.length; i++) {
      const [avant, apres] = [versions[i - 1]!, versions[i]!];
      const [a, n] = [join(tmp, "avant.parquet"), join(tmp, "apres.parquet")];
      await depot.recuperer(avant, a);
      await depot.recuperer(apres, n);
      for (const t of await comparerVersions(duck, s, a, n)) {
        trouvees.push({ source: s.id, millesime: t.millesime, cles: t.cles, precedente: avant.sha256, corrigee: apres.sha256, le: apres.collecteLe });
      }
    }
  }
} finally {
  duck.closeSync();
  await rm(tmp, { recursive: true, force: true });
}
ajouterCorrections(CHEMINS.corrections, trouvees);
console.log(`${trouvees.length} correction(s) de millésime détectée(s)`);
