// Types communs au pipeline et au site.
// Règle cardinale : une donnée absente n'est jamais un zéro ; elle porte un statut.
import type { CodeIndicateur, CodeRepartition } from "./libelles.ts";
import type { BudgetCollectivite, MotifSansBudget, MoyennesBudgetFrance, ParSecteur } from "./donnees.ts";

export type { CodeIndicateur, CodeRepartition };

export type Statut = "ok" | "non_publie_prive" | "non_disponible";
export type FamilleSecondDegre = "college" | "legt" | "lpo" | "lp" | "erea";
export type FamilleEcole = "maternelle" | "elementaire" | "primaire";
export type Famille = FamilleSecondDegre | FamilleEcole;
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
  | "carte_scolaire"
  | "cog_mouvements"
  | "cog_communes"
  | `budget_${number}`
  | `transport_${number}`;

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
  /** Élèves des unités d'enseignement externalisées (écoles seulement). */
  ueea?: number | null;
  source: SourceId[];
}

/** Un type de classe d'une école (typologie des classes) : « CE1 », « CM1-CM2 »… */
export interface TypeClasses {
  libelle: string;
  /** Nombre de niveaux réunis dans la classe (segments séparés par « - »). */
  niveaux: number;
  classes: number;
}

/** Classes d'une école. */
export interface Classes {
  rentree: number;
  total: number | null;
  /** [rentrée, élèves, classes] par rentrée croissante, série complète (effectifs_ecoles, puis ecoles_ep). */
  historique: [number, number | null, number | null][];
  /** Source de chaque point de l'historique, quand elle change le long de la série. */
  sourcesHistorique?: SourceId[];
  /** null si la typologie n'est pas publiée pour la rentrée. */
  types: TypeClasses[] | null;
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

/**
 * Rapprochement de l'adresse d'une école avec la carte scolaire des collèges publics : commune entièrement
 * rattachée, tronçon de voie, adresse non rapprochée (commune absente de la carte, voie ou numéro introuvable,
 * ambiguïté), ou département dont la carte n'est pas publiée.
 */
export type StatutSecteur = "commune" | "voie" | "non_rapproche" | "carte_non_publiee";

/** Collège(s) public(s) dont le secteur couvre l'adresse de l'école, triés par nom ; liste vide hors « commune » et « voie ». */
export interface SecteurCollege {
  statut: StatutSecteur;
  colleges: LienEtab[];
}

/** Établissement d'un PIAL : lien vers sa fiche, avec sa famille et son secteur. */
export interface MembreEtab extends LienEtab {
  famille: Famille;
  secteur: Secteur;
}

/**
 * PIAL (pôle inclusif d'accompagnement localisé) d'après la colonne `pial` de l'Annuaire. La tête a une fiche
 * (sinon aucun PIAL n'est affiché) ; `membres` : les autres établissements du pôle, triés par nom, tête exclue.
 */
export interface Pial {
  tete: MembreEtab;
  membres: MembreEtab[];
}

/** Une école ouverte dans une liste (écoles du secteur d'un collège) ; élèves et IPS de la dernière rentrée publiée. */
export interface LigneEcole {
  uai: string;
  nom: string;
  famille: Famille;
  secteur: Secteur;
  commune: string;
  eleves: number | null;
  ips: number | null;
}

/** Regroupement pédagogique intercommunal d'une école (Annuaire de l'éducation) : classes réparties entre les écoles des communes (dispersé) ou réunies dans une seule (concentré). */
export type Rpi = "concentre" | "disperse";

/** Rattachements d'une école ouverte : collège de secteur à son adresse, PIAL et circonscription. */
export interface Rattachements {
  secteur: SecteurCollege;
  pial: Pial | null;
  circonscription: string | null;
}

/** Une école ouverte proche, à vol d'oiseau ; élèves et classes de la dernière rentrée publiée pour les écoles. */
export interface EcoleProche {
  uai: string;
  nom: string;
  famille: Famille;
  secteur: Secteur;
  commune: string;
  distanceKm: number;
  eleves: number | null;
  /** null si non publié ou 0 (jamais un zéro pour une absence). */
  classes: number | null;
}

/** Écoles les plus proches d'une école ouverte (spec, section 6.6), ou d'un point (centre d'une commune sans école). */
export interface EcolesProches {
  /** Les 6 écoles ouvertes compatibles les plus proches à moins de 50 km, triées par distance. */
  liste: EcoleProche[];
  /** École maternelle ou primaire la plus proche, à moins de 50 km. */
  plusProcheMaternelle: EcoleProche | null;
  /** École élémentaire ou primaire la plus proche, à moins de 50 km. */
  plusProcheElementaire: EcoleProche | null;
  /** Plus grand seuil de SEUILS_ISOLEMENT_KM sans autre école compatible, null s'il y en a une à moins de 2 km. */
  aucuneAMoinsDe: number | null;
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
  /** Classes : présent pour les écoles seulement (null = aucune donnée de classes). */
  classes?: Classes | null;
  /** Écoles ouvertes seulement (absent des fiches du second degré et des écoles fermées). */
  rattachements?: Rattachements;
  /**
   * Écoles seulement, ouvertes ou fermées : page commune d'aujourd'hui (code en vigueur, même clé que les pages
   * commune) pour le fil d'Ariane ; null si la commune n'a pas de page. Absent du second degré.
   */
  communePage?: { code: string; libelle: string } | null;
  /** Écoles ouvertes seulement : regroupement pédagogique intercommunal de l'Annuaire ; null hors RPI. */
  rpi?: Rpi | null;
  /** Écoles ouvertes seulement : écoles les plus proches ; null si l'école n'a pas de coordonnées. */
  ecolesProches?: EcolesProches | null;
  /** Second degré seulement : PIAL dont l'établissement est la tête ou un membre ; null sinon. */
  pial?: Pial | null;
  /**
   * Second degré seulement : écoles ouvertes (publiques et privées sous contrat) dont l'adresse relève du secteur
   * du collège, triées par nom. null hors collège public ouvert présent dans la carte scolaire.
   */
  ecolesDuSecteur?: LigneEcole[] | null;
  /** null = voisins non calculables (coordonnées absentes ou page disparue). */
  voisins: Voisin[] | null;
  /** Résultats aux examens, dans l'ordre brevet général, brevet pro, bac GT, bac pro ; [] si aucun. */
  resultats: ResultatsVoie[];
  sources: SourceRef[];
  /**
   * Moyens de la collectivité ; seul le niveau de la famille est présent, null = collectivité non identifiée.
   * École publique : `ecoles`, la commune (null si elle est absente des balances) ; école privée : aucun niveau.
   */
  budget: {
    colleges?: BudgetCollectivite | null;
    lycees?: BudgetCollectivite | null;
    ecoles?: BudgetCollectivite | null;
    france: MoyennesBudgetFrance[];
    /**
     * Pourquoi la collectivité est null : aucune (Mayotte), non identifiée (Saint-Martin, Saint-Barthélemy,
     * Saint-Pierre-et-Miquelon) ou, pour une école, commune absente des balances par fonction.
     */
    motif?: MotifSansBudget;
  };
}
