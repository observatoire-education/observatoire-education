// Point d'entrée : `bun pipeline/src/cli.ts collect | data`.
import { readFileSync } from "node:fs";
import { Manifest } from "./archive.ts";
import { assurerCache, collecter } from "./collect.ts";
import { ouvrir } from "./db.ts";
import { type Depot, DepotGithub, DepotLocal } from "./depot.ts";
import { assemblerFiches, exporter } from "./fiches.ts";
import { OdsClient } from "./ods.ts";
import { ecrireRegistre, lireRegistre, mettreAJourRegistre } from "./registre.ts";
import { controlerPonderation, ipsMoyens, verifierPonderation } from "./territoires.ts";

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
  donnees: "site/data",
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

/** Croisement et export : site/data/ et registre des pages. */
async function data(): Promise<void> {
  const debut = performance.now();
  const manifest = Manifest.lire(CHEMINS.manifest);
  const chemins = await assurerCache(manifest, choisirDepot(lireConfig()), CHEMINS.cache);
  const registre = lireRegistre(CHEMINS.registre);
  const db = await ouvrir(chemins, { registre });
  // Les dates du registre sont celles des données (collecte de l'annuaire), pas celle du build.
  const dateDonnees = new Date(manifest.derniere("annuaire")!.collecteLe);
  const fiches = await assemblerFiches(db, manifest, registre, dateDonnees);
  // Contrôle de la moyenne pondérée (pages communes) : appliquée aux départements, elle doit retrouver la DEPP.
  // En cas d'échec, rien n'est écrit ni publié.
  // n = 0 (jointure IPS cassée, table vide) est aussi un échec.
  const [{ r: rentree } = { r: null }] = await db.sql<{ r: number | null }>("select max(rentree) as r from effectifs");
  const ponderation = controlerPonderation(fiches.filter((f) => f.disparuLe === null), await ipsMoyens(db, "dep"), rentree);
  let chiffres: string;
  try {
    chiffres = verifierPonderation(ponderation);
  } catch (e) {
    db.fermer();
    throw e;
  }
  console.log(`pondération des IPS : ${chiffres}`);
  ecrireRegistre(CHEMINS.registre, mettreAJourRegistre(registre, fiches, dateDonnees.toISOString().slice(0, 10)));
  await exporter(fiches, db, manifest, CHEMINS.donnees);

  const disparues = fiches.filter((f) => f.disparuLe !== null).length;
  console.log(`${fiches.length - disparues} fiches actives, ${disparues} page(s) conservée(s) après disparition`);
  for (const { motif, n } of await db.sql<{ motif: string; n: number }>(
    "select motif, count(*)::integer as n from exclus group by motif order by n desc",
  )) console.log(`  exclus ${motif.padEnd(28)} ${n}`);
  console.log(`données écrites dans ${CHEMINS.donnees}/ en ${Math.round(performance.now() - debut)} ms`);
  db.fermer();
}

const commande = process.argv[2];
if (commande === "collect") await collect();
else if (commande === "data") await data();
else {
  console.error("usage : bun pipeline/src/cli.ts collect | data");
  process.exit(2);
}
