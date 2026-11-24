// Classes des écoles : série des élèves et des classes, typologie de la dernière rentrée (tables de 08_ecoles.sql).
// Écoles les plus proches (spec, section 6.6).
import { FAMILLES_ECOLES, RAYON_ECOLES_PROCHES_KM, SEUILS_ISOLEMENT_KM } from "@obs/shared/libelles";
import type { Classes, EcoleProche, EcolesProches, Famille, FamilleEcole, Secteur, SourceId, TypeClasses } from "@obs/shared/types";
import type { Db } from "./db.ts";
import { FAMILLES_COMPATIBLES_ECOLES, HAVERSINE_SQL } from "./fiches.ts";
import { SOURCES } from "./sources.ts";

export { SEUILS_ISOLEMENT_KM };

/** Ordre des niveaux pour trier les types de classes : « Preel » d'abord, puis CP à CM2. */
const ORDRE_NIVEAUX = ["PREEL", "CP", "CE1", "CE2", "CM1", "CM2"];
const rangNiveau = (libelle: string): number => {
  const i = ORDRE_NIVEAUX.indexOf(libelle.split("-")[0]!.trim().toUpperCase());
  return i === -1 ? ORDRE_NIVEAUX.length : i;
};

/** Classes à un niveau, puis à plusieurs niveaux ; à nombre égal, dans l'ordre du premier niveau. */
function trierTypes(types: TypeClasses[]): TypeClasses[] {
  return types.sort(
    (a, b) => a.niveaux - b.niveaux || rangNiveau(a.libelle) - rangNiveau(b.libelle) || a.libelle.localeCompare(b.libelle),
  );
}

/** Ordre des sources dans le registre. */
const ordreSource = (s: SourceId) => Object.keys(SOURCES).indexOf(s);

/** Classes de chaque école qui a une fiche et au moins une rentrée d'effectifs ou de l'éducation prioritaire. */
export async function calculerClasses(db: Db): Promise<Map<string, Classes>> {
  const series = Map.groupBy(
    await db.sql<{ uai: string; rentree: number; eleves: number | null; classes: number | null; source: SourceId }>(
      "select uai, rentree, eleves, classes, source from classes_historique order by uai, rentree",
    ),
    (l) => l.uai,
  );
  const types = Map.groupBy(
    await db.sql<TypeClasses & { uai: string; rentree: number }>(
      "select uai, rentree, libelle, niveaux, classes from classes_types",
    ),
    (t) => `${t.uai}|${t.rentree}`,
  );

  const resultat = new Map<string, Classes>();
  for (const [uai, serie] of series) {
    const derniere = serie.at(-1)!;
    const typesRentree = types.get(`${uai}|${derniere.rentree}`);
    const sources = new Set<SourceId>(serie.map((l) => l.source));
    if (typesRentree) sources.add("classes_ecoles");
    const c: Classes = {
      rentree: derniere.rentree,
      total: derniere.classes,
      historique: serie.map((l) => [l.rentree, l.eleves, l.classes]),
      types: typesRentree ? trierTypes(typesRentree.map(({ libelle, niveaux, classes }) => ({ libelle, niveaux, classes }))) : null,
      source: [...sources].sort((a, b) => ordreSource(a) - ordreSource(b)),
    };
    if (serie.some((l) => l.source !== derniere.source)) c.sourcesHistorique = serie.map((l) => l.source);
    resultat.set(uai, c);
  }
  return resultat;
}

// --- Écoles les plus proches ---

/** Nombre d'écoles de la liste et rayon de recherche. */
const NB_ECOLES_PROCHES = 6;
/** Clé du résultat de calculerEcolesProches quand il est calculé depuis un point. */
export const DEPUIS = "depuis";

/**
 * Plus grand seuil sous lequel il n'y a aucune école, d'après la distance de la plus proche : null si elle est à moins
 * de 2 km ; le rayon de recherche (50 km) s'il n'y en a aucune dans ce rayon (null en entrée), pour que la phrase
 * reste vraie (« Aucune autre école à moins de 50 km »).
 */
export function seuilIsolement(plusProcheKm: number | null): number | null {
  if (plusProcheKm === null) return RAYON_ECOLES_PROCHES_KM;
  return SEUILS_ISOLEMENT_KM.filter((s) => plusProcheKm >= s).at(-1) ?? null;
}

interface PointDepart { id: string; lat: number; lon: number; famille: FamilleEcole | null }
interface LigneProche {
  id: string; uai: string; nom: string; famille: Famille; secteur: Secteur; commune: string; d: number;
  compatible: boolean; mat: boolean; elem: boolean;
}

const enSql = (fs: readonly string[]) => fs.map((f) => `'${f}'`).join(", ");

/**
 * Pour chaque point de départ, les écoles ouvertes à moins de `rayonKm` qui servent au résultat : les 6 plus proches
 * compatibles, la maternelle ou primaire la plus proche, l'élémentaire ou primaire la plus proche. Triées par distance.
 * Un point sans famille (centre d'une commune) est compatible avec toutes les écoles.
 */
async function lignesProches(db: Db, points: PointDepart[], rayonKm: number): Promise<Map<string, LigneProche[]>> {
  if (points.length === 0) return new Map();
  // Calculé ici et non au chargement du module : fiches.ts importe aussi ce module.
  const compatible = `case a.famille ${Object.entries(FAMILLES_COMPATIBLES_ECOLES)
    .map(([f, cs]) => `when '${f}' then b.famille in (${enSql(cs)})`)
    .join(" ")} else true end`;
  const r = Number(rayonKm);
  // Grille de cases d'au moins `r` km de côté : les écoles à moins de r km sont dans la case du point ou dans l'une des
  // 8 cases voisines (jointure par égalité, sans produit croisé). 111 km par degré de latitude ; en longitude, la case
  // est calculée pour 52° de latitude, plus au nord que tout le territoire couvert.
  const pasLat = r / 111;
  const pasLon = r / (111 * Math.cos((52 * Math.PI) / 180));
  const lignes = await db.sql<LigneProche>(
    `with a as (
       select *, floor(lat / ${pasLat})::bigint as cy, floor(lon / ${pasLon})::bigint as cx
       from (select unnest(from_json($1::json, '[{"id":"VARCHAR","lat":"DOUBLE","lon":"DOUBLE","famille":"VARCHAR"}]'), recursive := true))
     ),
     voisinage as (select a.*, cy + dy as ny, cx + dx as nx from a, range(-1, 2) y(dy), range(-1, 2) x(dx)),
     b as (
       select uai, famille, lat, lon, floor(lat / ${pasLat})::bigint as cy, floor(lon / ${pasLon})::bigint as cx
       from etablissements
       where lat is not null and lon is not null and famille in (${enSql(FAMILLES_ECOLES)})
     ),
     p as (
       select a.id, b.uai, ${HAVERSINE_SQL} as d, ${compatible} as compatible,
         b.famille in ('maternelle', 'primaire') as mat, b.famille in ('elementaire', 'primaire') as elem
       from voisinage a join b on b.cy = a.ny and b.cx = a.nx
       where b.uai <> a.id
     ),
     retenues as (
       select * from p where d <= ${r}
       qualify (compatible and row_number() over (partition by id, compatible order by d, uai) <= ${NB_ECOLES_PROCHES})
         or (mat and row_number() over (partition by id, mat order by d, uai) = 1)
         or (elem and row_number() over (partition by id, elem order by d, uai) = 1)
     )
     select r.*, e.nom, e.famille, e.secteur, e.commune from retenues r join etablissements e using (uai)
     order by id, d, uai`,
    [JSON.stringify(points)],
  );
  return Map.groupBy(lignes, (l) => l.id);
}

/** Dernière rentrée des effectifs des écoles (source effectifs_ecoles) ; null si aucune. */
export async function rentreeEffectifsEcoles(db: Db): Promise<number | null> {
  const [{ r } = { r: null }] = await db.sql<{ r: number | null }>(
    "select max(rentree) as r from classes_historique where source = 'effectifs_ecoles'",
  );
  return r;
}

/**
 * Écoles les plus proches, à vol d'oiseau (spec, section 6.6).
 *
 * Sans `depuis` : une entrée par école ouverte ; null pour une école sans coordonnées, qui n'apparaît chez aucune
 * autre. Les écoles fermées n'apparaissent jamais. La liste et la phrase « Aucune autre école à moins de n km »
 * (`aucuneAMoinsDe`) portent sur les autres écoles compatibles avec celle de la fiche (FAMILLES_COMPATIBLES_ECOLES :
 * une maternelle avec les maternelles et les primaires, etc.) ; les deux écoles « la plus proche » sont cherchées
 * parmi toutes les autres écoles, dans le même rayon de 50 km.
 *
 * Avec `depuis` (centre d'une commune sans école) : une seule entrée, de clé DEPUIS, calculée sur toutes les écoles
 * ouvertes, sans compatibilité ni exclusion.
 *
 * Élèves et classes : ceux de `rentree` (effectifs des écoles) seulement, la rentrée que la page affiche en titre de
 * colonne ; par défaut, la dernière rentrée des effectifs des écoles (rentreeEffectifsEcoles). null : aucun chiffre.
 */
export async function calculerEcolesProches(
  db: Db, depuis?: { lat: number; lon: number }, rentree?: number | null,
): Promise<Map<string, EcolesProches | null>> {
  const ecoles = depuis
    ? []
    : await db.sql<{ uai: string; famille: FamilleEcole; lat: number | null; lon: number | null }>(
        `select uai, famille, lat, lon from etablissements where famille in (${enSql(FAMILLES_ECOLES)}) order by uai`,
      );
  const points: PointDepart[] = depuis
    ? [{ id: DEPUIS, lat: depuis.lat, lon: depuis.lon, famille: null }]
    : ecoles.filter((e) => e.lat !== null && e.lon !== null).map((e) => ({ id: e.uai, lat: e.lat!, lon: e.lon!, famille: e.famille }));

  // Élèves et classes de la rentrée affichée seulement (une rentrée plus ancienne n'est pas montrée).
  const r = rentree === undefined ? await rentreeEffectifsEcoles(db) : rentree;
  const chiffres = new Map(
    (r === null ? [] : await db.sql<{ uai: string; eleves: number | null; classes: number | null }>(
      "select uai, eleves, classes from classes_historique where source = 'effectifs_ecoles' and rentree = $1",
      [r],
    )).map((c) => [c.uai, c]),
  );
  const ecole = (l: LigneProche): EcoleProche => {
    const c = chiffres.get(l.uai);
    return {
      uai: l.uai, nom: l.nom, famille: l.famille, secteur: l.secteur, commune: l.commune, distanceKm: l.d,
      eleves: c?.eleves ?? null, classes: c?.classes ? c.classes : null, // 0 classe : absence, jamais un zéro
    };
  };
  const resume = (lignes: LigneProche[]): EcolesProches => {
    const liste = lignes.filter((l) => l.compatible).slice(0, NB_ECOLES_PROCHES).map(ecole);
    const mat = lignes.find((l) => l.mat);
    const elem = lignes.find((l) => l.elem);
    return {
      liste,
      plusProcheMaternelle: mat ? ecole(mat) : null,
      plusProcheElementaire: elem ? ecole(elem) : null,
      aucuneAMoinsDe: seuilIsolement(liste[0]?.distanceKm ?? null),
    };
  };

  // Deux passes : la plupart des écoles trouvent tout à moins de 10 km (le plus grand seuil, qui suffit toujours pour
  // la phrase) ; les autres sont reprises dans le rayon de 50 km.
  const complet = (p: EcolesProches) =>
    p.liste.length === NB_ECOLES_PROCHES && p.plusProcheMaternelle !== null && p.plusProcheElementaire !== null;
  const proches = new Map<string, EcolesProches>();
  const premiere = await lignesProches(db, points, Math.max(...SEUILS_ISOLEMENT_KM));
  for (const p of points) proches.set(p.id, resume(premiere.get(p.id) ?? []));
  const aReprendre = points.filter((p) => !complet(proches.get(p.id)!));
  const seconde = await lignesProches(db, aReprendre, RAYON_ECOLES_PROCHES_KM);
  for (const p of aReprendre) proches.set(p.id, resume(seconde.get(p.id) ?? []));

  if (depuis) return new Map([[DEPUIS, proches.get(DEPUIS)!]]);
  return new Map(ecoles.map((e) => [e.uai, proches.get(e.uai) ?? null]));
}
