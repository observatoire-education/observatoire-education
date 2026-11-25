// Voisinage, assemblage des fiches et export des fichiers de données du site (site/data/).
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DonneesSource, EntreeIndex } from "@obs/shared/donnees";
import type {
  Batiment, Classes, CodeIndicateur, Famille, FamilleEcole, FamilleSecondDegre, Fiche, Identite, Indicateur, LigneEcole, Mesure, Rattachements,
  Repartition, ResultatsVoie, Rpi, Secteur, Site, SourceId, SourceRef, Voisin,
} from "@obs/shared/types";
import { estEcole, FAMILLES_SECOND_DEGRE } from "@obs/shared/libelles";
import type { Manifest } from "./archive.ts";
import type { Db } from "./db.ts";
import { calculerBatiments } from "./batiments.ts";
import { budgetDeFiche, calculerBudgets } from "./budget-eleves.ts";
import { collectivitesCorrigees, correctionEnVigueur, type EntreeCorrection, resoudreCorrection } from "./corrections.ts";
import { calculerClasses, calculerEcolesProches, rentreeEffectifsEcoles } from "./ecoles.ts";
import { calculerEleves } from "./eleves.ts";
import { NOM_NON_PUBLIE } from "./noms-cites.ts";
import { calculerPial, type RapportPial } from "./pial.ts";
import { calculerResultats, dernieresSessions, resume } from "./resultats.ts";
import { calculerSecteurs, ecolesDesSecteurs, type RapportSecteurs } from "./secteurs.ts";
import { calculerIndicateurs, calculerRepartitions } from "./indicateurs.ts";
import type { Registre } from "./registre.ts";
import { API_FICHIER, SOURCES, toutesSources } from "./sources.ts";
import { appliquerManuels, attacherSuccesseurs, deduireSuccesseurs, lireManuels, type Manuels, verifierCycles } from "./successeurs.ts";
import { derniereRentreeIps, ipsCourant } from "./ips-historique.ts";
import { ecrireJson, exporterTerritoires } from "./territoires.ts";

// --- Voisinage ---

const RAYON_TERRE_KM = 6371.0;

/** Distance haversine en kilomètres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(a));
}

/** Familles comparables pour le voisinage (publié sur /methode/). Second degré seulement : les écoles n'ont pas de voisins. */
export const FAMILLES_VOISINES: Record<FamilleSecondDegre, FamilleSecondDegre[]> = {
  college: ["college"],
  legt: ["legt", "lpo"],
  lpo: ["legt", "lpo", "lp"],
  lp: ["lp", "lpo"],
  erea: ["erea"],
};

/** Écoles compatibles entre elles (successeurs et écoles proches). */
export const FAMILLES_COMPATIBLES_ECOLES: Record<FamilleEcole, Famille[]> = {
  maternelle: ["maternelle", "primaire"],
  elementaire: ["elementaire", "primaire"],
  primaire: ["maternelle", "elementaire", "primaire"],
};

const SECOND_DEGRE_SQL = FAMILLES_SECOND_DEGRE.map((f) => `'${f}'`).join(", ");

/** Distance haversine en SQL entre les lignes `a` et `b` (colonnes lat, lon), en kilomètres. */
export const HAVERSINE_SQL = `2 * ${RAYON_TERRE_KM} * asin(sqrt(
  pow(sin(radians(b.lat - a.lat) / 2), 2) + cos(radians(a.lat)) * cos(radians(b.lat)) * pow(sin(radians(b.lon - a.lon) / 2), 2)))`;

/**
 * Les k plus proches établissements actifs de familles compatibles, publics et privés sous contrat,
 * dans le rayon. null si l'établissement n'a pas de coordonnées. Les pages disparues n'ont pas de voisins
 * et ne sont voisines de personne. Les écoles non plus : absentes du résultat, leur fiche reçoit null.
 */
export async function calculerVoisins(
  db: Db,
  k = 6,
  rayonKm = 30,
  indicateurs?: Map<string, Indicateur[]>,
  resultats?: Map<string, ResultatsVoie[]>,
): Promise<Map<string, Voisin[] | null>> {
  const ind = indicateurs ?? (await calculerIndicateurs(db));
  const res = resultats ?? (await calculerResultats(db));
  const sessions = await dernieresSessions(db);
  const compat = Object.entries(FAMILLES_VOISINES)
    .flatMap(([a, bs]) => bs.map((b) => `('${a}', '${b}')`))
    .join(", ");
  const paires = await db.sql<{
    uai: string; voisin: string; d: number; nom: string; famille: Famille; secteur: Secteur; commune: string;
  }>(`
    with e as (
      select uai, nom, famille, secteur, commune, lat, lon from etablissements
      where lat is not null and lon is not null and famille in (${SECOND_DEGRE_SQL})
    ),
    compat(a, b) as (values ${compat}),
    p as (
      select a.uai, b.uai as voisin, ${HAVERSINE_SQL} as d, b.nom, b.famille, b.secteur, b.commune
      from e a
      join compat c on c.a = a.famille
      join e b on b.famille = c.b and b.uai <> a.uai
        and abs(b.lat - a.lat) <= 0.3 and abs(b.lon - a.lon) <= 0.45
    )
    select * from p where d <= ${Number(rayonKm)}
    qualify row_number() over (partition by uai order by d, voisin) <= ${Number(k)}
    order by uai, d, voisin`);
  const parUai = Map.groupBy(paires, (p) => p.uai);
  const avecCoordonnees = await db.sql<{ uai: string; gps: boolean }>(
    `select uai, lat is not null and lon is not null as gps from etablissements where famille in (${SECOND_DEGRE_SQL})`,
  );
  const mesure = (uai: string, code: CodeIndicateur): Mesure =>
    ind.get(uai)?.find((i) => i.code === code)?.mesure ?? { valeur: null, statut: "non_disponible", source: null, rentree: null };
  // IPS d'un voisin : seulement celui de la dernière rentrée (un IPS plus ancien n'est pas comparé).
  const rentreeIps = await derniereRentreeIps(db);
  const mesureIps = (uai: string): Mesure => {
    const m = mesure(uai, "ips");
    return ipsCourant(m, rentreeIps) === null ? { valeur: null, statut: "non_disponible", source: null, rentree: rentreeIps } : m;
  };

  const resultat = new Map<string, Voisin[] | null>();
  for (const { uai, gps } of avecCoordonnees) {
    resultat.set(
      uai,
      gps
        ? (parUai.get(uai) ?? []).map((p) => ({
            uai: p.voisin, nom: p.nom, famille: p.famille, secteur: p.secteur, commune: p.commune, distanceKm: p.d,
            eleves: mesure(p.voisin, "eleves"),
            elevesParEtpEns: mesure(p.voisin, "eleves_par_etp_ens"),
            ips: mesureIps(p.voisin),
            partAgreges: mesure(p.voisin, "part_agreges"),
            reussite: resume({ famille: p.famille, resultats: res.get(p.voisin) ?? [] }, sessions),
          }))
        : null,
    );
  }
  return resultat;
}

// --- Fiches ---

interface LigneIdentite {
  uai: string; nom: string; famille: Famille; secteur: Secteur; contrat: string | null; adresse: string;
  code_postal: string; commune: string; code_commune: string; dep: string; dep_libelle: string; aca: string;
  aca_libelle: string; ep: "REP+" | "REP" | null; segpa: boolean; ulis: boolean; internat: boolean;
  lat: number | null; lon: number | null;
}

async function identitesActives(db: Db): Promise<Map<string, Identite>> {
  const lignes = await db.sql<LigneIdentite>("select * from etablissements order by uai");
  const sites = Map.groupBy(
    await db.sql<{ uai: string; nom: string; adresse: string; code_postal: string; commune: string }>(
      "select uai, nom, adresse, code_postal, commune from sites where not principal order by uai, rang",
    ),
    (s) => s.uai,
  );
  return new Map(
    lignes.map((l) => [
      l.uai,
      {
        nom: l.nom, famille: l.famille, secteur: l.secteur, contrat: l.contrat, adresse: l.adresse,
        codePostal: l.code_postal, commune: l.commune, codeCommune: l.code_commune, dep: l.dep, depLibelle: l.dep_libelle,
        aca: l.aca, acaLibelle: l.aca_libelle, ep: l.ep, segpa: l.segpa, ulis: l.ulis, internat: l.internat,
        lat: l.lat, lon: l.lon,
        autresSites: (sites.get(l.uai) ?? []).map(
          (s): Site => ({ nom: s.nom, adresse: s.adresse, codePostal: s.code_postal, commune: s.commune }),
        ),
      },
    ]),
  );
}

interface IdentiteFerme { uai: string; nom: string | null; commune: string | null; code_commune: string | null }

/**
 * Identité d'une page conservée, figée au registre, complétée par le jeu des fermés (et les noms qu'y apportent les
 * sources citantes) : un nom absent ou générique (`NOM_NON_PUBLIE`), une commune ou un code commune absents.
 * Ce qui est déjà connu n'est jamais remplacé.
 */
export function completerIdentite(identite: Identite, ferme: IdentiteFerme | undefined): Identite {
  if (!ferme) return identite;
  const nom = (identite.nom == null || identite.nom === NOM_NON_PUBLIE) && ferme.nom ? ferme.nom : identite.nom;
  const commune = identite.commune ?? ferme.commune;
  // le code n'est repris que s'il va avec la commune retenue
  const codeCommune = identite.codeCommune ?? (commune === ferme.commune ? ferme.code_commune : null);
  return nom === identite.nom && commune === identite.commune && codeCommune === identite.codeCommune
    ? identite
    : { ...identite, nom, commune, codeCommune };
}

/** Fiches historiques : établissements fermés cités par une source ; l'identité vient de la liste des fermés. */
async function identitesHistoriques(db: Db): Promise<Map<string, { identite: Identite; fermeLe: string }>> {
  const lignes = await db.sql<LigneIdentite & { ferme: string }>(
    "select h.*, date_fermeture::varchar as ferme from historiques h order by uai",
  );
  return new Map(
    lignes.map((l) => [
      l.uai,
      {
        fermeLe: l.ferme,
        identite: {
          nom: l.nom, famille: l.famille, secteur: l.secteur, contrat: null, adresse: l.adresse,
          codePostal: l.code_postal, commune: l.commune, codeCommune: l.code_commune, dep: l.dep, depLibelle: l.dep_libelle,
          aca: l.aca, acaLibelle: l.aca_libelle, ep: null, segpa: false, ulis: false, internat: false,
          lat: l.lat, lon: l.lon, autresSites: [],
        },
      },
    ]),
  );
}

/** Millésimes des classes d'une école, avec leur source : chaque point de la série, et la typologie de la dernière rentrée. */
function millesimesClasses(c: Classes | null | undefined): [SourceId, number][] {
  if (!c) return [];
  const serie = c.source.find((s) => s !== "classes_ecoles")!;
  return [
    ...c.historique.map(([rentree], k): [SourceId, number] => [c.sourcesHistorique?.[k] ?? serie, rentree]),
    ...(c.types ? [["classes_ecoles", c.rentree] as [SourceId, number]] : []),
  ];
}

/**
 * Les sources effectivement utilisées par la fiche, dans l'ordre du registre, avec le millésime le plus récent.
 * L'identité vient de l'Annuaire, ou du jeu des fermés pour une fiche historique (`historique`) ; le jeu des fermés
 * date aussi la fermeture affichée (`fermes` : la fiche ou l'un de ses prédécesseurs a une date de fermeture).
 */
function sourcesUtilisees(
  manifest: Manifest, indicateurs: Indicateur[], repartitions: Repartition[], eleves: Fiche["eleves"], resultats: ResultatsVoie[],
  classes: Classes | null | undefined,
  { historique = false, fermes = false, listes = [], batiment }: { historique?: boolean; fermes?: boolean; listes?: RentreeListe[]; batiment?: Batiment } = {},
): SourceRef[] {
  const rentrees = new Map<SourceId, number | null>([[historique ? "fermes" : "annuaire", null]]);
  if (fermes) rentrees.set("fermes", null);
  const noter = (id: SourceId | null, rentree: number | null) => {
    if (!id) return;
    const r = rentrees.get(id);
    rentrees.set(id, r === undefined || r === null ? rentree : rentree === null ? r : Math.max(r, rentree));
  };
  for (const i of indicateurs) {
    if (i.mesure.statut === "ok") noter(i.mesure.source, i.mesure.rentree);
    i.sourcesHistorique?.forEach((s, k) => noter(s, i.historique[k]![0]));
  }
  for (const r of repartitions) if (r.statut === "ok") noter(r.source, r.rentree);
  for (const s of eleves?.source ?? []) noter(s, eleves!.rentree);
  for (const r of resultats) noter(r.source, r.session); // la « rentrée » d'une source de résultats est sa session
  for (const [s, rentree] of millesimesClasses(classes)) noter(s, rentree);
  // Chiffres des écoles listées sur la fiche (écoles du secteur d'un collège)
  for (const l of listes) noter(l.source, l.rentree);
  // Bâtiment et travaux (jeux de la région, sans millésime)
  if (batiment?.anneeConstruction != null) noter("idf_lycees", null);
  if (batiment?.ppi.length) noter("idf_ppi", null);
  if (batiment?.operations.length) noter("idf_operations", null);

  return Object.values(SOURCES)
    .filter((s) => rentrees.has(s.id))
    .map((s) => {
      const v = manifest.derniere(s.id);
      if (!v) throw new Error(`aucune version archivée pour ${s.id}`);
      return {
        id: s.id, producteur: s.producteur, titre: s.titre, pageUrl: s.pageUrl,
        rentree: rentrees.get(s.id) ?? null, collecteLe: v.collecteLe, brutUrl: v.url,
      };
    });
}

// --- Corrections de millésime ---

/**
 * Millésimes que la fiche affiche, par source : rentrées des séries et des mesures d'indicateurs, des répartitions
 * et des élèves, exercices du budget. Seul endroit à étendre quand la fiche affiche un nouveau millésime.
 */
export function millesimesAffiches(f: Fiche): Map<SourceId, Set<number>> {
  const affiches = new Map<SourceId, Set<number>>();
  const noter = (source: SourceId | null, m: number | null) => {
    if (!source || m === null) return;
    const ens = affiches.get(source) ?? new Set<number>();
    ens.add(m);
    affiches.set(source, ens);
  };
  for (const i of f.indicateurs) {
    if (i.mesure.statut === "ok") noter(i.mesure.source, i.mesure.rentree);
    i.historique.forEach(([rentree], k) => noter(i.sourcesHistorique?.[k] ?? i.mesure.source, rentree));
  }
  for (const r of f.repartitions) if (r.statut === "ok") noter(r.source, r.rentree);
  for (const s of f.eleves?.source ?? []) noter(s, f.eleves!.rentree);
  for (const [s, rentree] of millesimesClasses(f.classes)) noter(s, rentree);
  for (const ex of (f.budget.colleges ?? f.budget.lycees ?? f.budget.ecoles)?.exercices ?? []) noter(ex.source, ex.exercice);
  for (const r of f.resultats) for (const [session] of r.historique) noter(r.source, session);
  for (const r of f.resultats) noter(r.source, r.session);
  return affiches;
}

const parDate = (a: { le: string; millesime: number }, b: { le: string; millesime: number }) => a.le.localeCompare(b.le) || a.millesime - b.millesime;

/**
 * Rattache à chaque source de chaque fiche les corrections en vigueur (`correctionEnVigueur`) d'un millésime que
 * la fiche affiche. Idempotent.
 */
export function attacherCorrections(fiches: Fiche[], corrections: EntreeCorrection[], manifest: Manifest): void {
  const sourcesBudget = toutesSources(manifest);
  const actuelle = (e: EntreeCorrection) => correctionEnVigueur(manifest, e);
  for (const f of fiches) {
    const collectivite = (f.budget.colleges ?? f.budget.lycees ?? f.budget.ecoles)?.id;
    // Un exercice corrigé et affiché porte sa propre source, même s'il n'est pas le dernier exercice du bloc budget.
    for (const ex of (f.budget.colleges ?? f.budget.lycees ?? f.budget.ecoles)?.exercices ?? []) {
      const touche = corrections.some((e) => actuelle(e) && e.source === ex.source && e.millesime === ex.exercice && !!collectivite && collectivitesCorrigees(e).has(collectivite));
      const s = touche && sourcesBudget.find((x) => x.id === ex.source);
      const v = s && manifest.derniere(s.id);
      if (s && v && !f.sources.some((x) => x.id === s.id)) {
        f.sources.push({ id: s.id, producteur: s.producteur, titre: s.titre, pageUrl: s.pageUrl, rentree: ex.rentree, collecteLe: v.collecteLe, brutUrl: v.url });
      }
    }
    const affiches = millesimesAffiches(f);
    for (const s of f.sources) {
      const trouvees = corrections
        .filter((e) => {
          if (e.source !== s.id || !affiches.get(e.source)?.has(e.millesime)) return false;
          // Une correction ne vaut plus si le portail est revenu à une version collectée avant elle.
          if (!actuelle(e)) return false;
          return e.source.startsWith("budget_") ? !!collectivite && collectivitesCorrigees(e).has(collectivite) : e.cles.includes(f.uai);
        })
        .map((e) => resoudreCorrection(manifest, e))
        .sort(parDate);
      if (trouvees.length) s.corrections = trouvees;
      else delete s.corrections;
    }
  }
}

/** Budget de la collectivité de chaque fiche, et source (dernier exercice affiché) parmi les sources de la fiche. */
export function attacherBudgets(
  fiches: Fiche[], budgets: Parameters<typeof budgetDeFiche>[1], manifest: Manifest, corrections: EntreeCorrection[] = [],
): void {
  const sourcesBudget = toutesSources(manifest);
  for (const f of fiches) {
    f.budget = budgetDeFiche(f, budgets);
    f.sources = f.sources.filter((x) => !x.id.startsWith("budget_"));
    // École publique dont la commune est absente des balances : l'absence est constatée sur le dernier exercice.
    const dernier = f.budget.ecoles === null ? f.budget.france[0]?.exercices.at(-1)?.exercice : undefined;
    const ex = (f.budget.colleges ?? f.budget.lycees ?? f.budget.ecoles)?.exercices.at(-1)
      ?? (dernier !== undefined ? { source: `budget_${dernier}` as const, rentree: dernier - 1 } : undefined);
    const s = ex && sourcesBudget.find((x) => x.id === ex.source);
    const v = s && manifest.derniere(s.id);
    if (s && v) {
      f.sources.push({
        id: s.id, producteur: s.producteur, titre: s.titre, pageUrl: s.pageUrl,
        rentree: ex.rentree, collecteLe: v.collecteLe, brutUrl: v.url,
      });
    }
  }
  attacherCorrections(fiches, corrections, manifest);
}

/** Chiffres du journal des successeurs, remplis par assemblerFiches. */
export interface RapportSuccesseurs {
  regle1: number; regle2: number; manuels: number; ambigus: number; sansFiche: number;
}

export interface OptionsAssemblage {
  rapport?: RapportSuccesseurs;
  /** Fichier manuel des successeurs (par défaut pipeline/successeurs-manuels.json). */
  manuels?: Manuels;
  /** Corrections de millésime détectées (archives/corrections.json), lues par l'appelant. */
  corrections?: EntreeCorrection[];
  /** Chiffres du collège de secteur des écoles, remplis par assemblerFiches. */
  secteurs?: RapportSecteurs;
  /** Chiffres des PIAL dont la tête n'a pas de fiche, remplis par assemblerFiches. */
  pial?: RapportPial;
}

/** Rentrée et source d'un chiffre des listes d'écoles. */
export interface RentreeListe { rentree: number; source: SourceId }

/**
 * Dernière rentrée publiée pour les écoles (élèves, IPS) et la source qui la porte ; null si aucune école n'a de
 * valeur. Les listes d'écoles titrent leurs colonnes avec ces rentrées.
 */
export function rentreesEcoles(actives: Map<string, Identite>, indicateurs: Map<string, Indicateur[]>): Record<"eleves" | "ips", RentreeListe | null> {
  const mesures = (code: CodeIndicateur) =>
    [...actives]
      .filter(([, i]) => estEcole(i.famille))
      .map(([uai]) => indicateurs.get(uai)?.find((i) => i.code === code)?.mesure)
      .filter((m) => m?.statut === "ok" && m.rentree !== null && m.source !== null)
      .map((m) => ({ rentree: m!.rentree!, source: m!.source! }));
  const derniere = (code: CodeIndicateur): RentreeListe | null =>
    mesures(code).reduce<RentreeListe | null>((a, m) => (a === null || m.rentree > a.rentree ? m : a), null);
  return { eleves: derniere("eleves"), ips: derniere("ips") };
}

/**
 * Ligne de chaque école ouverte pour les listes : élèves et IPS seulement s'ils sont de la dernière rentrée
 * publiée pour les écoles (une ligne sans rentrée ne doit pas montrer un chiffre ancien comme actuel).
 */
export function lignesEcoles(
  actives: Map<string, Identite>, indicateurs: Map<string, Indicateur[]>, rentrees = rentreesEcoles(actives, indicateurs),
): Map<string, LigneEcole> {
  const ecoles = [...actives].filter(([, i]) => estEcole(i.famille));
  const mesure = (uai: string, code: CodeIndicateur) => indicateurs.get(uai)?.find((i) => i.code === code)?.mesure;
  const courant = (uai: string, code: CodeIndicateur, rentree: number | undefined) => {
    const m = mesure(uai, code);
    return m?.statut === "ok" && m.rentree === rentree ? m.valeur : null;
  };
  const rentreeEleves = rentrees.eleves?.rentree;
  const rentreeIps = rentrees.ips?.rentree;
  return new Map(
    ecoles.map(([uai, i]) => [
      uai,
      {
        uai, nom: i.nom, famille: i.famille, secteur: i.secteur, commune: i.commune,
        eleves: courant(uai, "eleves", rentreeEleves), ips: courant(uai, "ips", rentreeIps),
      },
    ]),
  );
}

/**
 * Une fiche par établissement actif, et une par page conservée (UAI du registre sortie du périmètre).
 * `registre` doit être celui avec lequel `db` a été ouverte.
 */
export async function assemblerFiches(db: Db, manifest: Manifest, registre: Registre, maintenant: Date, opts: OptionsAssemblage = {}): Promise<Fiche[]> {
  const indicateurs = await calculerIndicateurs(db);
  const repartitions = await calculerRepartitions(db);
  const eleves = await calculerEleves(db);
  const classes = await calculerClasses(db);
  const resultats = await calculerResultats(db);
  const voisins = await calculerVoisins(db, 6, 30, indicateurs, resultats);
  const actives = await identitesActives(db);
  // Rattachements (écoles ouvertes) ; PIAL et écoles du secteur (second degré)
  const secteurs = await calculerSecteurs(db, opts.secteurs);
  const pial = await calculerPial(db, opts.pial);
  // Écoles proches : élèves et classes de la rentrée des effectifs des écoles, citée dans les sources (titre de colonne).
  const rentreeProches = await rentreeEffectifsEcoles(db);
  const ecolesProches = await calculerEcolesProches(db, undefined, rentreeProches);
  const circonscriptions = new Map(
    (await db.sql<{ uai: string; circonscription: string | null }>("select uai, circonscription from etablissements")).map((l) => [l.uai, l.circonscription]),
  );
  const rpis = new Map(
    (await db.sql<{ uai: string; rpi: Rpi }>("select uai, rpi from etablissements where rpi is not null")).map((l) => [l.uai, l.rpi]),
  );
  const rentreesListes = rentreesEcoles(actives, indicateurs);
  const batiments = await calculerBatiments(db);
  const ecolesSecteur = await ecolesDesSecteurs(db, secteurs, lignesEcoles(actives, indicateurs, rentreesListes));
  const disparus = await db.sql<{ uai: string }>("select uai from disparus order by uai");
  const historiques = await identitesHistoriques(db);
  const fermetures = new Map(
    (await db.sql<{ uai: string; ferme: string }>("select uai, date_fermeture::varchar as ferme from fermes")).map((r) => [r.uai, r.ferme]),
  );
  // Noms et communes des fermés : ils complètent l'identité figée au registre quand elle en manque.
  const identitesFermes = new Map(
    (await db.sql<IdentiteFerme>("select uai, nom, commune, code_commune from fermes")).map((r) => [r.uai, r]),
  );
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  const fiche = (uai: string, identite: Identite, disparuLe: string | null): Fiche => {
    const ind = indicateurs.get(uai) ?? [];
    const rep = repartitions.get(uai) ?? [];
    const el = eleves.get(uai) ?? null;
    const res = resultats.get(uai) ?? [];
    // classes : écoles seulement (le champ est absent des fiches du second degré)
    const cl = estEcole(identite.famille) ? (classes.get(uai) ?? null) : undefined;
    const ouverte = disparuLe === null;
    const secteur = secteurs.get(uai);
    // rattachements : écoles ouvertes ; pial et ecolesDuSecteur : second degré (null pour une page disparue)
    const rattachements: Rattachements | undefined = estEcole(identite.famille) && ouverte && secteur
      ? { secteur, pial: pial.get(uai) ?? null, circonscription: circonscriptions.get(uai) ?? null }
      : undefined;
    const secondDegre = estEcole(identite.famille)
      ? {}
      : {
          pial: ouverte ? (pial.get(uai) ?? null) : null,
          ecolesDuSecteur: ouverte && identite.famille === "college" && identite.secteur === "public" ? (ecolesSecteur.get(uai) ?? null) : null,
        };
    return {
      uai, ...identite, disparuLe, fermeLe: disparuLe === null ? null : (fermetures.get(uai) ?? null),
      successeurs: [], predecesseurs: [], // remplacés plus bas, quand toutes les fiches sont connues
      indicateurs: ind, repartitions: rep, eleves: el,
      ...(cl === undefined ? {} : { classes: cl }),
      ...(rattachements === undefined ? {} : { rattachements }),
      ...(estEcole(identite.famille) && ouverte ? { rpi: rpis.get(uai) ?? null } : {}),
      // écoles les plus proches : écoles ouvertes seulement (null sans coordonnées)
      ...(estEcole(identite.famille) && ouverte ? { ecolesProches: ecolesProches.get(uai) ?? null } : {}),
      ...secondDegre,
      // bâtiment et travaux : second degré public (patrimoine de la région), quand elle publie quelque chose pour l'établissement
      ...(!estEcole(identite.famille) && identite.secteur === "public" && batiments.has(uai) ? { batiment: batiments.get(uai)! } : {}),
      budget: { france: [] }, // remplacé plus bas, quand toutes les fiches (disparues comprises) sont connues
      voisins: disparuLe === null ? (voisins.get(uai) ?? null) : null,
      resultats: res,
      sources: sourcesUtilisees(manifest, ind, rep, el, res, cl),
    };
  };

  const fiches = [...actives].map(([uai, identite]) => fiche(uai, identite, null));
  for (const { uai } of disparus) {
    const historique = historiques.get(uai);
    if (historique) {
      fiches.push(fiche(uai, historique.identite, historique.fermeLe));
      continue;
    }
    const entree = registre[uai];
    if (!entree) continue;
    fiches.push(fiche(uai, completerIdentite(entree.identite, identitesFermes.get(uai)), fermetures.get(uai) ?? entree.disparuLe ?? aujourdhui));
  }
  // Successeurs : déduits, corrigés par le fichier manuel, sans cycle ; seuls les liens entre fiches sont gardés.
  const { liens: deduits, ambigus } = await deduireSuccesseurs(db);
  const connues = new Set([...fiches.map((f) => f.uai), ...(await db.sql<{ uai: string }>("select uai from fermes")).map((r) => r.uai)]);
  const liens = appliquerManuels(deduits, opts.manuels ?? lireManuels(), connues);
  verifierCycles(liens);
  const avecFiche = new Set(fiches.map((f) => f.uai));
  const gardes = liens.filter((l) => avecFiche.has(l.de) && avecFiche.has(l.vers));
  attacherSuccesseurs(fiches, gardes);
  // Sources connues seulement maintenant : la date de fermeture affichée (fiche ou prédécesseur) vient du jeu des fermés.
  for (const f of fiches) {
    f.sources = sourcesUtilisees(manifest, f.indicateurs, f.repartitions, f.eleves, f.resultats, f.classes, {
      historique: f.disparuLe !== null && historiques.has(f.uai),
      fermes: f.fermeLe !== null || f.predecesseurs.some((p) => p.fermeLe !== null),
      listes: [
        ...(f.ecolesDuSecteur?.length ? [rentreesListes.eleves, rentreesListes.ips] : []),
        // élèves et classes des écoles proches : dernière rentrée des effectifs des écoles
        ...(f.ecolesProches?.liste.length && rentreeProches !== null ? [{ rentree: rentreeProches, source: "effectifs_ecoles" as const }] : []),
      ].filter((l) => l !== null),
      ...(f.batiment ? { batiment: f.batiment } : {}),
    });
  }
  if (opts.rapport) {
    Object.assign(opts.rapport, {
      regle1: gardes.filter((l) => l.regle === 1).length, regle2: gardes.filter((l) => l.regle === 2).length,
      manuels: gardes.filter((l) => l.regle === "manuel").length, ambigus: ambigus.length, sansFiche: liens.length - gardes.length,
    });
  }
  // Les dénominateurs comptent aussi les établissements fermés : toutes les fiches, actives et disparues.
  const budgets = await calculerBudgets(db, fiches);
  attacherBudgets(fiches, budgets, manifest, opts.corrections);
  return fiches.sort((a, b) => a.uai.localeCompare(b.uai));
}

// --- Export ---

export async function exporter(
  fiches: Fiche[], db: Db, manifest: Manifest, sortie = "site/data", corrections: EntreeCorrection[] = [],
): Promise<void> {
  // Titre, fil d'Ariane et recherche affichent nom et commune : une fiche sans l'un des deux est refusée.
  const incompletes = fiches.filter((f) => !f.nom || !f.commune).map((f) => f.uai);
  if (incompletes.length > 0) {
    throw new Error(`${incompletes.length} fiche(s) sans nom ou sans commune : ${incompletes.slice(0, 10).join(", ")}`);
  }
  await rm(sortie, { recursive: true, force: true });
  await mkdir(join(sortie, "fiches"), { recursive: true });

  const index: EntreeIndex[] = fiches.map((f) => ({
    u: f.uai, n: f.nom, c: f.commune, d: f.dep, f: f.famille, s: f.secteur, ...(f.disparuLe ? { x: 1 as const } : {}),
  }));
  await ecrireJson(join(sortie, "index.json"), index);

  const actives = fiches.filter((f) => f.disparuLe === null);
  const [{ r: rentree } = { r: null }] = await db.sql<{ r: number | null }>("select max(rentree) as r from effectifs");
  const { pagesCommune, table } = await exporterTerritoires(actives, db, sortie, rentree, await calculerBudgets(db, fiches), corrections, manifest);
  // Écoles, ouvertes ou fermées : page commune d'aujourd'hui, avec la même clé que les pages commune (fil d'Ariane).
  for (const f of fiches) {
    if (estEcole(f.famille)) {
      const code = table.actuelle(f.codeCommune);
      f.communePage = pagesCommune.has(code) ? { code, libelle: pagesCommune.get(code)! } : null;
    }
    await ecrireJson(join(sortie, "fiches", `${f.uai}.json`), f);
  }

  const sources: Record<string, DonneesSource> = Object.fromEntries(
    toutesSources(manifest).map((s) => [s.id, {
      id: s.id, titre: s.titre, producteur: s.producteur, pageUrl: s.pageUrl,
      ...(s.api === API_FICHIER ? { dateSituation: true as const } : {}),
      actuelle: manifest.derniere(s.id) ?? null, versions: manifest.versions(s.id),
    }]),
  );
  await ecrireJson(join(sortie, "sources.json"), sources);
}
