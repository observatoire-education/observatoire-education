// Types communs au pipeline et au site.
// Règle cardinale : une donnée absente n'est jamais un zéro ; elle porte un statut.
import type { CodeIndicateur, CodeRepartition } from "./libelles.ts";
import type { BudgetCollectivite, MoyennesBudgetFrance, ParSecteur } from "./donnees.ts";

export type { CodeIndicateur, CodeRepartition };

export type Statut = "ok" | "non_publie_prive" | "non_disponible";
export type Famille = "college" | "legt" | "lpo" | "lp" | "erea";
export type Secteur = "public" | "prive_sous_contrat";
export type Niveau = "departement" | "academie" | "france";
export type SourceId =
  | "annuaire"
  | "ips_colleges"
  | "ips_lycees"
  | "effectifs_colleges"
  | "effectifs_lycees_gt"
  | "effectifs_lycees_pro"
  | "personnels"
  | "fermes"
  | "ips_colleges_2016"
  | "ips_colleges_2022"
  | "ips_lycees_2016"
  | "ips_lycees_2022"
  | "ips_erea_2016"
  | "ips_erea"
  | "ivac"
  | "ival_gt"
  | "ival_pro"
  | "segregation"
  | "effectifs_ecoles"
  | "ips_ecoles_2016"
  | "ips_ecoles"
  | "personnels_ecoles"
  | "classes_ecoles"
  | "ecoles_ep"
  | `budget_${number}`;

/** Une valeur, son statut et son origine (source et rentrée de septembre). */
export interface Mesure {
  valeur: number | null;
  statut: Statut;
  source: SourceId | null;
  rentree: number | null;
  /** Part des élèves (en %) sur laquelle porte la valeur, si elle est inférieure à 100 (secret statistique). */
  couverture?: number;
}

/** Moyennes public et privé d'un niveau territorial. `calculee` = false si publiée par la source. */
export interface Comparaison {
  niveau: Niveau;
  public: Mesure;
  prive: Mesure;
  calculee: boolean;
}

export interface Indicateur {
  code: CodeIndicateur;
  mesure: Mesure;
  comparaisons: Comparaison[];
  /** [rentrée, valeur], par rentrée croissante. */
  historique: [number, number][];
  /**
   * Source de chaque point de `historique` (même ordre), seulement si elle change d'une rentrée à l'autre
   * (IPS : un jeu par période).
   */
  sourcesHistorique?: SourceId[];
  /** IPS : moyennes du département de l'établissement, par rentrée (publiées ou calculées). */
  referencesHistoriques?: PointIps[];
}

/** Moyenne d'IPS d'un territoire pour une rentrée : par secteur, publiée par la DEPP ou calculée. */
export interface PointIps {
  rentree: number;
  public: number | null;
  prive: number | null;
  /** true : moyenne calculée par l'observatoire (la DEPP n'en publie pas pour cette rentrée). */
  calculee: boolean;
}

export interface PartsReference {
  niveau: Niveau;
  secteur: Secteur;
  parts: number[] | null;
  statut: Statut;
}

export interface Repartition {
  code: CodeRepartition;
  categories: string[];
  parts: number[] | null;
  statut: Statut;
  references: PartsReference[];
  source: SourceId;
  rentree: number | null;
  /** Comme Mesure.couverture. */
  couverture?: number;
}

export interface NiveauEleves {
  libelle: string;
  eleves: number | null;
  filles: number | null;
  garcons: number | null;
}

export interface Eleves {
  rentree: number;
  total: number | null;
  niveaux: NiveauEleves[];
  segpa: number | null;
  ulis: number | null;
  source: SourceId[];
}

/** Un autre site d'un établissement réparti sur plusieurs adresses (même UAI). */
export interface Site {
  nom: string;
  adresse: string;
  codePostal: string;
  commune: string;
}

export interface Voisin {
  uai: string;
  nom: string;
  famille: Famille;
  secteur: Secteur;
  commune: string;
  distanceKm: number;
  eleves: Mesure;
  elevesParEtpEns: Mesure;
  ips: Mesure;
  /** Part d'enseignants agrégés ; un seul chiffre de réussite par voie (règle de la fiche). */
  partAgreges: Mesure;
  reussite: ResumeResultat[];
}

export type VoieResultat = "brevet_general" | "brevet_pro" | "bac_gt" | "bac_pro";
export type CodeResultat = "taux_reussite" | "note_ecrit" | "taux_acces" | "taux_mentions";
export type StatutResultat = "ok" | "non_publie";

export interface ValeurResultat {
  code: CodeResultat;
  valeur: number | null;
  statut: StatutResultat;
  va: number | null;
  /** « sans_objet » : la source ne publie pas de valeur ajoutée pour cette valeur. */
  statutVa: StatutResultat | "sans_objet";
  /** Taux seulement ; la note à l'écrit n'a pas de moyenne. */
  comparaisons: { niveau: Niveau; public: number | null; prive: number | null; n: ParSecteur<number> }[];
}

export interface ResultatsVoie {
  voie: VoieResultat;
  source: SourceId;
  /** Année de l'examen (2025 = juin 2025). */
  session: number;
  effectif: number | null;
  valeurs: ValeurResultat[];
  mentions: { ab: number | null; b: number | null; tb: number | null } | null;
  /** [session, taux de réussite] par session croissante. */
  historique: [number, number][];
  /** 2021 pour les voies du baccalauréat si l'historique la traverse. */
  rupture: number | null;
}

/** Un chiffre de réussite pour les listes et les voisins. */
export interface ResumeResultat {
  voie: VoieResultat;
  session: number;
  taux: number | null;
  va: number | null;
}

/** Correction d'un millésime par le producteur : URL des deux versions archivées. */
export interface Correction {
  millesime: number;
  /** Date ISO de collecte de la version corrigée. */
  le: string;
  precedente: string;
  corrigee: string;
}

export interface SourceRef {
  id: SourceId;
  producteur: string;
  titre: string;
  pageUrl: string;
  rentree: number | null;
  /** Horodatage ISO 8601 de la collecte. */
  collecteLe: string;
  brutUrl: string;
  /** Corrections de millésimes affichés par la page, de la plus ancienne à la plus récente. */
  corrections?: Correction[];
}

/** Identité d'un établissement (annuaire, site principal). Conservée au registre des pages. */
export interface Identite {
  nom: string;
  famille: Famille;
  secteur: Secteur;
  contrat: string | null;
  adresse: string;
  codePostal: string;
  commune: string;
  codeCommune: string;
  dep: string;
  depLibelle: string;
  aca: string;
  acaLibelle: string;
  ep: "REP+" | "REP" | null;
  segpa: boolean;
  ulis: boolean;
  internat: boolean;
  lat: number | null;
  lon: number | null;
  /** Autres sites de la même UAI (le site principal est décrit par l'identité elle-même). */
  autresSites: Site[];
}

/** Lien vers un établissement qui a une fiche (successeur ou prédécesseur). */
export interface LienEtab {
  uai: string;
  nom: string;
  /** Date ISO de fermeture de l'établissement lié, null s'il est ouvert. */
  fermeLe: string | null;
}

export interface Fiche extends Identite {
  uai: string;
  /** Date ISO de la première collecte où l'établissement n'apparaissait plus dans le périmètre. */
  disparuLe: string | null;
  /** Date ISO de fermeture officielle (établissements fermés des sources DEPP), null si l'UAI n'y figure pas. */
  fermeLe: string | null;
  /** Établissements qui ont repris celui-ci (un seul maillon : A → B, pas A → C). */
  successeurs: LienEtab[];
  /** Établissements fermés dont celui-ci est le successeur. */
  predecesseurs: LienEtab[];
  indicateurs: Indicateur[];
  repartitions: Repartition[];
  eleves: Eleves | null;
  /** null = voisins non calculables (coordonnées absentes ou page disparue). */
  voisins: Voisin[] | null;
  /** Résultats aux examens, dans l'ordre brevet général, brevet pro, bac GT, bac pro ; [] si aucun. */
  resultats: ResultatsVoie[];
  sources: SourceRef[];
  /** Moyens de la collectivité ; seul le niveau de la famille est présent, null = collectivité non identifiée. */
  budget: {
    colleges?: BudgetCollectivite | null;
    lycees?: BudgetCollectivite | null;
    france: MoyennesBudgetFrance[];
    /** Pourquoi la collectivité est null : aucune (Mayotte) ou non identifiée (Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon). */
    motif?: "aucune_collectivite" | "collectivite_non_identifiee";
  };
}
