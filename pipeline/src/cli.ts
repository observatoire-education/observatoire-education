// Point d'entrée : `bun pipeline/src/cli.ts collect | data`.
import { readFileSync } from "node:fs";
import { Manifest } from "./archive.ts";
import { calculerBudgets, statutsDernierExercice } from "./budget-eleves.ts";
import { aiguiller, assurerCache, collecter, sourcesSansVersion } from "./collect.ts";
import { lireCorrections } from "./corrections.ts";
import { ouvrir } from "./db.ts";
import { type Depot, DepotGithub, DepotLocal } from "./depot.ts";
import { assemblerFiches, exporter, type RapportSuccesseurs } from "./fiches.ts";
import { FichierClient } from "./fichier.ts";
import { OdsClient } from "./ods.ts";
import { ecrireRegistre, lireRegistre, mettreAJourRegistre } from "./registre.ts";
import type { RapportPial } from "./pial.ts";
import type { RapportSecteurs } from "./secteurs.ts";
import { derniereRentreeIps } from "./ips-historique.ts";
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
  corrections: "archives/corrections.json",
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

async function collect(manquantes: boolean): Promise<void> {
  const config = lireConfig();
  const manifest = Manifest.lire(CHEMINS.manifest);
  const journal = await collecter({
    manifest,
    client: aiguiller(new OdsClient(), new FichierClient()),
    depot: choisirDepot(config),
    maintenant: new Date(),
    tmp: CHEMINS.tmp,
    journal: CHEMINS.journal,
    corrections: CHEMINS.corrections,
    // Sur GitHub Actions, les sources à collecte locale (serveur injoignable de là) sont sautées.
    distante: process.env.GITHUB_ACTIONS === "true",
    manquantes,
  });
  for (const l of journal) {
    const detail = [l.lignes !== undefined ? `${l.lignes} lignes` : "", l.motif ?? ""].filter(Boolean).join(" · ");
    console.log(`${l.source.padEnd(22)} ${l.action.padEnd(10)} ${detail}`);
  }
  // Collecte complète : toujours 0, un rejet n'est pas un échec de la collecte, le journal fait foi.
  // --manquantes (publication) : 1 si une source déclarée reste sans version, le build ne pourrait pas la lire.
  if (!manquantes) return;
  const restantes = sourcesSansVersion(manifest);
  for (const id of restantes) {
    const motif = journal.findLast((l) => l.source === id)?.motif ?? "aucune ligne de journal";
    console.error(`source sans version archivée : ${id} (${motif})`);
  }
  if (restantes.length) process.exit(1);
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
  const successeurs: RapportSuccesseurs = { regle1: 0, regle2: 0, manuels: 0, ambigus: 0, sansFiche: 0 };
  const corrections = lireCorrections(CHEMINS.corrections);
  const rapportSecteurs: RapportSecteurs = { sansFiche: 0, ecolesSansFiche: 0, communesDeuxCartes: 0 };
  const rapportPial: RapportPial = { tetesSansFiche: 0, membresSansTete: 0 };
  const fiches = await assemblerFiches(db, manifest, registre, dateDonnees, {
    rapport: successeurs, corrections, secteurs: rapportSecteurs, pial: rapportPial,
  });
  // Contrôle de la moyenne pondérée (pages communes) : appliquée aux départements, elle doit retrouver la DEPP.
  // En cas d'échec, rien n'est écrit ni publié.
  // n = 0 (jointure IPS cassée, table vide) est aussi un échec.
  const [{ r: rentree } = { r: null }] = await db.sql<{ r: number | null }>("select max(rentree) as r from effectifs");
  const ponderation = controlerPonderation(fiches.filter((f) => f.disparuLe === null), await ipsMoyens(db, "dep"), rentree, await derniereRentreeIps(db));
  let chiffres: string;
  try {
    chiffres = verifierPonderation(ponderation);
  } catch (e) {
    db.fermer();
    throw e;
  }
  console.log(`pondération des IPS : ${chiffres}`);
  ecrireRegistre(CHEMINS.registre, mettreAJourRegistre(registre, fiches, dateDonnees.toISOString().slice(0, 10)));
  await exporter(fiches, db, manifest, CHEMINS.donnees, corrections);

  const disparues = fiches.filter((f) => f.disparuLe !== null).length;
  console.log(`${fiches.length - disparues} fiches actives, ${disparues} page(s) conservée(s) après disparition`);
  for (const { motif, n } of await db.sql<{ motif: string; n: number }>(
    "select motif, count(*)::integer as n from exclus group by motif order by n desc",
  )) console.log(`  exclus ${motif.padEnd(28)} ${n}`);
  const [{ n: historiques } = { n: 0 }] = await db.sql<{ n: number }>("select count(*)::integer as n from historiques");
  const [excl = { n: 0, famille: 0, secteur: 0, date: 0 }] = await db.sql<{ n: number; famille: number; secteur: number; date: number }>(
    `select count(*)::integer as n, count(*) filter (where sans_famille)::integer as famille,
       count(*) filter (where sans_secteur)::integer as secteur, count(*) filter (where sans_date)::integer as date
     from historiques_exclus`);
  console.log(`  ${historiques} fiche(s) historique(s) d'établissements fermés, ${excl.n} fermé(s) cité(s) exclu(s) (famille inconnue ${excl.famille}, secteur inconnu ${excl.secteur}, date inconnue ${excl.date})`);
  console.log(`  successeurs : ${successeurs.regle1} règle 1, ${successeurs.regle2} règle 2, ${successeurs.manuels} manuels, ${successeurs.ambigus} ambigus, ${successeurs.sansFiche} sans fiche`);
  const ignores = await db.sql<{ source: string; n: number }>("select source, n from resultats_ignores order by source");
  console.log(`  résultats ignorés (UAI sans fiche) : ${ignores.map((l) => `${l.source} ${l.n}`).join(", ") || "aucun"}`);
  const ecoles = await db.sql<{ source: string; n: number }>("select source, n from ecoles_ignorees order by source");
  console.log(`  écoles ignorées (UAI sans fiche) : ${ecoles.map((l) => `${l.source} ${l.n}`).join(", ") || "aucune"}`);
  // Rattachements calculés par assemblerFiches (écoles ouvertes)
  const rattachements = fiches.flatMap((f) => (f.rattachements ? [f.rattachements] : []));
  const parStatut = Map.groupBy(rattachements, (r) => r.secteur.statut);
  const taux = (n: number) => `${((100 * n) / Math.max(rattachements.length, 1)).toFixed(1).replace(".", ",")} %`;
  console.log(`  collège de secteur de ${rattachements.length} écoles : ${[...parStatut].map(([s, l]) => `${s} ${l.length} (${taux(l.length)})`).join(", ")}`);
  console.log(`    ${rapportSecteurs.ecolesSansFiche} école(s) non rapprochée(s) faute de fiche pour un collège de leur secteur (${rapportSecteurs.sansFiche} collège(s) sans fiche)`);
  // Commune citée par les cartes de deux départements : ses lignes sont réunies et rapprochées ensemble.
  console.log(`    ${rapportSecteurs.communesDeuxCartes} commune(s) présente(s) dans les cartes de deux départements, lignes réunies`);
  const avecPial = rattachements.filter((r) => r.pial !== null).length;
  console.log(`  PIAL : ${avecPial} école(s) rattachée(s) ; ${rapportPial.tetesSansFiche} tête(s) de PIAL sans fiche (circonscription ou hors périmètre), ${rapportPial.membresSansTete} école(s) ou établissement(s) concerné(s), sans PIAL affiché`);
  const [{ n: inconnus } = { n: 0 }] = await db.sql<{ n: number }>("select count(*)::integer as n from budget_inconnus");
  console.log(`  ${inconnus} budget(s) de collectivité non identifiée dans les balances`);
  const budgets = await calculerBudgets(db, fiches);
  const exercice = budgets.france[0]?.exercices.at(-1)?.exercice;
  console.log(`  ${budgets.collectivites.size} collectivités ; fonctionnement hors personnel du public, exercice ${exercice}, par statut :`);
  for (const [niveau, statuts] of Object.entries(statutsDernierExercice(budgets))) {
    console.log(`    ${niveau.padEnd(9)} ${Object.entries(statuts).map(([s, n]) => `${s} ${n}`).join(", ") || "aucune"}`);
  }
  // Écoles : dépenses des syndicats (SIVOS…), collectées mais attribuées à aucune commune.
  const syndicats = await db.sql<{ exercice: number; m: number }>(
    `select exercice::int as exercice, sum(montant)::double as m from budget_lignes where collectivite = 'syndicats' group by 1 order by 1`,
  );
  const s = syndicats.at(-1);
  if (s) console.log(`  écoles : ${(s.m / 1e6).toFixed(1).replace(".", ",")} M€ de syndicats en ${s.exercice}, attribués à aucune commune`);
  console.log(`données écrites dans ${CHEMINS.donnees}/ en ${Math.round(performance.now() - debut)} ms`);
  db.fermer();
}

if (import.meta.main) {
  const commande = process.argv[2];
  if (commande === "collect") await collect(process.argv.includes("--manquantes"));
  else if (commande === "data") await data();
  else {
    console.error("usage : bun pipeline/src/cli.ts collect [--manquantes] | data");
    process.exit(2);
  }
}
