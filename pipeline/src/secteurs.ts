// Collège de secteur à l'adresse de chaque école : rapprochement de l'adresse de l'Annuaire et de la carte
// scolaire des collèges publics. C'est une déduction de l'observatoire : aucun rapprochement approché
// (ni distance d'édition, ni numéro supposé) ; au moindre doute, l'adresse est « non rapprochée ».
import { FAMILLES_ECOLES } from "@obs/shared/libelles";
import type { LienEtab, SecteurCollege } from "@obs/shared/types";
import type { Db } from "./db.ts";
import { litteral } from "./duck.ts";

export interface AdresseNormalisee {
  numero: number | null;
  indice: string | null;
  voie: string | null;
}

/** Abréviations du type de voie, développées seulement en tête du libellé (« R » ailleurs est une initiale). */
const ABREVIATIONS: Record<string, string> = {
  R: "RUE",
  AV: "AVENUE",
  BD: "BOULEVARD",
  PL: "PLACE",
  CHE: "CHEMIN",
  IMP: "IMPASSE",
  ALL: "ALLEE",
  LD: "LIEU DIT",
};

/** Abréviations développées partout dans le libellé. */
const SAINTS: Record<string, string> = { ST: "SAINT", STE: "SAINTE" };

/**
 * Articles retirés des deux côtés : la carte écrit tantôt « ROUTE DU CHATEAU », tantôt « ROUTE DE CHATEAU »,
 * et « LIEU DIT LE CHAMP DU POIRIER » à côté de « LIEU DIT CHAMP DU POIRIER ». Deux voies distinctes que
 * seuls les articles séparent mèneraient au même libellé : le rapprochement les distingue encore (voir parVoie).
 */
const ARTICLES = new Set(["DE", "DU", "DES", "LA", "LE", "LES", "L", "D"]);

/** Indices de répétition écrits en toutes lettres → lettre de la carte scolaire (« 3 bis » → B). */
const INDICES: Record<string, string> = { BIS: "B", TER: "T", QUATER: "Q" };

/** Majuscules sans accents ; toute ponctuation devient une espace ; espaces réduites. */
function nettoyer(texte: string): string {
  return texte
    .toUpperCase()
    .replace(/Œ/g, "OE")
    .replace(/Æ/g, "AE")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Libellé de voie comparable : « R. de l'Église » → « RUE EGLISE », « Imp. St-Jean » → « IMPASSE SAINT JEAN ». */
export function normaliserVoie(libelle: string): string {
  const mots = nettoyer(libelle).split(" ");
  const type = ABREVIATIONS[mots[0]!];
  if (type) mots[0] = type;
  return mots
    .map((m) => SAINTS[m] ?? m)
    .filter((m) => !ARTICLES.has(m))
    .join(" ");
}

/** Boîte postale ou équivalent : pas une adresse de voie. */
const BOITE_POSTALE = /^(BP|B P|CS|TSA)\s*\d/;
/** Numéro, indice de répétition (en lettres, ou une lettre accolée au numéro), puis voie. */
const NUMERO = /^(\d+)(?:\s*(BIS|TER|QUATER)|([A-Z]))?(?:\s+(.*))?$/;

/**
 * Adresse de l'Annuaire découpée en numéro, indice et voie normalisée. Une adresse sans numéro garde sa voie
 * (« rue des Lilas ») ; une boîte postale n'a pas de voie.
 */
export function normaliserAdresse(adresse: string): AdresseNormalisee {
  const t = nettoyer(adresse);
  if (t === "" || BOITE_POSTALE.test(t)) return { numero: null, indice: null, voie: null };
  const m = t.match(NUMERO);
  if (!m) return { numero: null, indice: null, voie: normaliserVoie(t) || null };
  const [, numero, mot, lettre, reste] = m;
  return {
    numero: Number(numero),
    indice: mot ? INDICES[mot]! : (lettre ?? null),
    voie: (reste && normaliserVoie(reste)) || null,
  };
}

/** Une ligne de la carte : commune entière (voie nulle) ou tronçon de voie. */
interface Troncon {
  insee: string;
  lieu_dit: string | null;
  voie: string | null;
  debut: number | null;
  indice_debut: string | null;
  fin: number | null;
  indice_fin: string | null;
  parite: string | null;
  rne: string;
}

/** Vrai, faux, ou null quand la carte ne permet pas de trancher (indices de répétition différents à une borne). */
type Verdict = boolean | null;

/** (numéro, indice) ≥ (début, indice de début) : sans indice, « 3 » précède « 3 bis ». */
function apres(n: number, i: string | null, d: number, di: string | null): Verdict {
  if (n !== d) return n > d;
  if (di === null) return true;
  if (i === null) return false;
  return i === di ? true : null;
}

/** (numéro, indice) ≤ (fin, indice de fin). */
function avant(n: number, i: string | null, f: number, fi: string | null): Verdict {
  if (n !== f) return n < f;
  if (i === null) return true;
  if (fi === null) return false;
  return i === fi ? true : null;
}

function parite(n: number, p: string | null): Verdict {
  if (p === "PI") return true;
  if (p === "P") return n % 2 === 0;
  if (p === "I") return n % 2 === 1;
  return null; // parité inconnue
}

/** Le tronçon couvre-t-il ce numéro ? Faux dès qu'une condition est fausse, indéterminé si l'une l'est. */
function couvre(t: Troncon, n: number, i: string | null): Verdict {
  if (t.debut === null || t.fin === null) return null;
  const verdicts = [apres(n, i, t.debut, t.indice_debut), avant(n, i, t.fin, t.indice_fin), parite(n, t.parite)];
  if (verdicts.includes(false)) return false;
  return verdicts.includes(null) ? null : true;
}

/** Voie d'un tronçon : libellé comparé à l'adresse, et libellé de la carte seulement nettoyé (articles gardés). */
interface VoieTroncon {
  cle: string;
  libelle: string;
}

/**
 * Collèges d'une adresse dans une commune découpée par voie, ou null si elle n'est pas rapprochée : sans numéro
 * ou sans voie, voie absente, numéro hors des tronçons, tronçon indéterminé, ou ambiguïté. Il y a ambiguïté quand
 * les tronçons retenus viennent de voies distinctes de la carte (même libellé dans plusieurs lieux-dits d'une
 * commune nouvelle, ou libellés que seuls les articles séparent) et mènent à des collèges différents. Plusieurs
 * collèges sur un même tronçon forment un secteur multi-collèges : tous sont retenus.
 */
function parVoie(adresse: AdresseNormalisee, troncons: Troncon[], voies: Map<Troncon, VoieTroncon>): string[] | null {
  const { numero, indice, voie } = adresse;
  if (numero === null || voie === null) return null;
  const retenus: Troncon[] = [];
  for (const t of troncons) {
    if (voies.get(t)?.cle !== voie) continue;
    const v = couvre(t, numero, indice);
    if (v === null) return null;
    if (v) retenus.push(t);
  }
  if (retenus.length === 0) return null;
  const parVoieDistincte = Map.groupBy(retenus, (t) => `${t.lieu_dit ?? ""}|${voies.get(t)!.libelle}`);
  const ensembles = new Set([...parVoieDistincte.values()].map((ts) => [...new Set(ts.map((t) => t.rne))].sort().join(",")));
  if (ensembles.size > 1) return null;
  return [...new Set(retenus.map((t) => t.rne))];
}

export interface RapportSecteurs {
  /** Collèges de la carte retenus pour au moins une école mais sans fiche : écartés. */
  sansFiche: number;
}

const ecoles = `famille in (${FAMILLES_ECOLES.map(litteral).join(", ")})`;

/**
 * Secteur de collège de chaque école ouverte (publique ou privée sous contrat). Une commune de la carte
 * sans aucune voie est rattachée en entier ; une commune qui a des voies (même avec une ligne de commune
 * entière) est découpée : l'adresse doit tomber dans un tronçon. Une commune absente de la carte donne
 * « non rapprochée » si le département de l'école a publié sa carte, « carte non publiée » sinon.
 */
export async function calculerSecteurs(db: Db, rapport?: RapportSecteurs): Promise<Map<string, SecteurCollege>> {
  const listeEcoles = await db.sql<{ uai: string; adresse: string | null; code_commune: string | null; dep: string }>(
    `select uai, adresse, code_commune, dep from etablissements where ${ecoles} order by uai`,
  );
  // Département de chaque carte publiée : celui de la majorité de ses communes (le jeu publie la carte de la
  // Haute-Corse sous le code « 720 », et une carte peut citer des communes limitrophes d'un autre département).
  const publies = new Set(
    (
      await db.sql<{ dep: string }>(
        `with c as (
           select trim(code_departement) as carte,
             case when regexp_matches(trim(code_insee), '^9[78]') then left(trim(code_insee), 3) else left(trim(code_insee), 2) end as dep
           from src_carte_scolaire where nullif(trim(code_insee), '') is not null
         ), n as (select carte, dep, count(*) as n from c group by all)
         select distinct first(dep order by n desc, dep) as dep from n group by carte`,
      )
    ).map((l) => l.dep),
  );
  const troncons = Map.groupBy(
    await db.sql<Troncon>(
      `select trim(code_insee) as insee, nullif(trim(lieu_dit), '') as lieu_dit, nullif(trim(type_et_libelle), '') as voie,
         nombre(n_de_voie_debut) as debut, nullif(upper(trim(indice_de_repetition_debut)), '') as indice_debut,
         nombre(n_de_voie_fin) as fin, nullif(upper(trim(indice_de_repetition_fin)), '') as indice_fin,
         nullif(upper(trim(parite)), '') as parite, upper(trim(code_rne)) as rne
       from src_carte_scolaire
       where nullif(trim(code_rne), '') is not null
         and trim(code_insee) in (select code_commune from etablissements where ${ecoles})`,
    ),
    (t) => t.insee,
  );
  const voies = new Map<Troncon, VoieTroncon>();
  for (const ts of troncons.values()) {
    for (const t of ts) if (t.voie !== null) voies.set(t, { cle: normaliserVoie(t.voie), libelle: nettoyer(t.voie) });
  }

  const fiches = new Map(
    (
      await db.sql<LienEtab>(
        `select uai, nom, null::varchar as "fermeLe" from etablissements
         union all select uai, nom, date_fermeture::varchar from historiques`,
      )
    ).map((l) => [l.uai, l]),
  );
  const sansFiche = new Set<string>();
  const liens = (rnes: string[]): LienEtab[] => {
    const l: LienEtab[] = [];
    for (const rne of rnes) {
      const f = fiches.get(rne);
      if (f) l.push({ uai: f.uai, nom: f.nom, fermeLe: f.fermeLe });
      else sansFiche.add(rne);
    }
    return l.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.uai.localeCompare(b.uai));
  };

  const resultat = new Map<string, SecteurCollege>();
  const nonRapproche = (): SecteurCollege => ({ statut: "non_rapproche", colleges: [] });
  for (const e of listeEcoles) {
    const lignes = (e.code_commune && troncons.get(e.code_commune)) || [];
    if (lignes.length === 0) {
      resultat.set(e.uai, publies.has(e.dep) ? nonRapproche() : { statut: "carte_non_publiee", colleges: [] });
      continue;
    }
    const decoupee = lignes.some((t) => t.voie !== null);
    const rnes = decoupee
      ? parVoie(normaliserAdresse(e.adresse ?? ""), lignes, voies)
      : [...new Set(lignes.map((t) => t.rne))];
    const colleges = rnes ? liens(rnes) : [];
    // Des collèges tous sans fiche : impossible de les nommer, l'adresse reste non rapprochée.
    resultat.set(e.uai, colleges.length > 0 ? { statut: decoupee ? "voie" : "commune", colleges } : nonRapproche());
  }
  if (rapport) rapport.sansFiche = sansFiche.size;
  return resultat;
}
