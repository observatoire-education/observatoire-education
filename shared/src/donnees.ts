// Format des fichiers de données produits par le pipeline (site/data/) et lus par le site.
import type { IdCollectivite, NiveauBudget } from "./collectivites.ts";
import type { CodeIndicateur } from "./libelles.ts";
import type { Comparaison, Correction, Famille, PointIps, ResumeResultat, Secteur, SourceId, Statut } from "./types.ts";

/** Une entrée de `index.json` (et de la recherche) : clés courtes. */
export interface EntreeIndex {
  /** UAI */ u: string;
  /** nom */ n: string;
  /** commune */ c: string;
  /** département */ d: string;
  /** famille */ f: Famille;
  /** secteur */ s: Secteur;
  /** 1 si la page est conservée après disparition */ x?: 1;
}

export interface LigneListe {
  uai: string;
  nom: string;
  secteur: Secteur;
  commune: string;
  /** Code INSEE de la commune (ou de l'arrondissement pour Paris, Lyon et Marseille). */
  codeCommune: string;
  ep: string | null;
  eleves: number | null;
  elevesParEtpEns: number | null;
  elevesParEtpVs: number | null;
  statutVs: Statut;
  partEnseignantes: number | null;
  ips: number | null;
  reussite: ResumeResultat[];
}

export interface ParSecteur<T> {
  public: T;
  prive: T;
}

/** Moyennes d'un indicateur pour un territoire, face aux niveaux supérieurs. */
export interface MoyenneTerritoire {
  code: CodeIndicateur;
  comparaisons: Comparaison[];
}

export interface SyntheseFamille {
  compte: ParSecteur<number>;
  eleves: ParSecteur<number | null>;
  ipsMoyen: IpsMoyens;
  /** Moyennes d'IPS du territoire, de 2016 à la dernière rentrée (publiées, sinon calculées). */
  ipsHistorique: PointIps[];
  /** Nombre d'établissements par classe de 5 points d'IPS ; `bornes` a une case de plus que les comptes. */
  distributionIps: { public: number[]; prive: number[]; bornes: number[] };
  moyennes: MoyenneTerritoire[];
  /** Triée par nom. */
  liste: LigneListe[];
}

export type NiveauTerritoire = "france" | "region" | "academie" | "departement" | "commune";

/** Un territoire désigné par son niveau et son code (France : code « FR »). */
export interface RefTerritoire {
  niveau: NiveauTerritoire;
  code: string;
  libelle: string;
}

/** IPS moyen d'un territoire, par secteur. */
export interface IpsMoyens {
  public: number | null;
  prive: number | null;
  /** false : valeur publiée par la DEPP. */
  calculee: boolean;
  /** Seulement si calculee : établissements pris en compte. */
  n?: ParSecteur<number>;
}

export interface LigneTerritoire {
  ref: RefTerritoire;
  compte: ParSecteur<number>;
  eleves: ParSecteur<number | null>;
  partPrive: number | null;
  ecartIpsColleges: number | null;
}

export interface PointCarte {
  uai: string;
  nom: string;
  lat: number;
  lon: number;
  secteur: Secteur;
  eleves: number | null;
}

export interface ValeurCarte {
  dep: string;
  partPrive: number | null;
  ecartIpsColleges: number | null;
  /** Fonctionnement hors personnel par élève du public (collèges, dernier exercice) de la collectivité du département. */
  budget?: number | null;
}

export type CarteDonnees =
  | { genre: "points"; points: PointCarte[] }
  | { genre: "departements"; valeurs: ValeurCarte[] }
  | { genre: "collectivites"; valeurs: { id: IdCollectivite; deps: string[]; budget: number | null }[] };

/** Un établissement d'un nuage IPS × réussite. */
export interface PointNuage {
  uai: string; nom: string; commune: string; secteur: Secteur;
  ips: number; taux: number; va: number | null; effectif: number | null;
}

/** Nuage IPS × réussite d'un territoire pour une voie : un point par établissement, au moins cinq. */
export interface Nuage {
  voie: "brevet_general" | "bac_gt" | "bac_pro";
  session: number;
  rentreeIps: number;
  /** true : IPS d'ensemble faute d'IPS par voie publié. */
  ipsEnsemble: boolean;
  /** Moyennes pondérées par l'effectif sur les points du nuage ; null si l'effectif total est nul. */
  moyennes: { ips: number | null; taux: number | null };
  points: PointNuage[];
  /** Sources affichées sous le nuage : celle des résultats, celles de l'IPS de la rentrée `rentreeIps`. */
  sources: { resultats: SourceId; ips: SourceId[] };
}

/** Ségrégation sociale entre collèges d'un département pour une année, telle que publiée par la DEPP. */
export interface AnneeSegregation {
  annee: number; colleges: number | null; partPrive: number | null;
  entropie: { ensemble: number | null; public: number | null; prive: number | null; publicPrive: number | null };
  /** Contributions publiées (en %). */
  contributions: { public: number | null; prive: number | null; publicPrive: number | null };
}

export interface DonneesTerritoire {
  ref: RefTerritoire;
  /** Du plus large au plus proche ; [] pour la France. */
  parents: RefTerritoire[];
  rentree: number | null;
  familles: Partial<Record<Famille, SyntheseFamille>>;
  horsContrat: number;
  /** France : académies ; académie : départements ; sinon []. */
  enfants: LigneTerritoire[];
  /** Département : communes ayant une page ; sinon []. */
  communes: RefTerritoire[];
  carte: CarteDonnees;
  budget: BudgetTerritoire;
  /** Page région : académies de la région ; sinon absent. */
  academies?: RefTerritoire[];
  /** Départements et académies : nuages IPS × réussite d'au moins 5 points ; absent sinon. */
  nuages?: Nuage[];
  /** Pages département : ségrégation sociale entre collèges, par année croissante ; absent sinon. */
  segregation?: AnneeSegregation[];
  /** Corrections de millésime des données affichées sur la page (ségrégation du département, budgets) ; absent si aucune. */
  corrections?: (Correction & { source: SourceId })[];
}

/** Données de la France : celles d'un territoire, plus les académies et leurs départements, les régions et la carte du budget. */
export interface DonneesFrance extends DonneesTerritoire {
  academiesEtDepartements: { aca: string; libelle: string; departements: { dep: string; libelle: string }[] }[];
  regions: RefTerritoire[];
  /** Vue « budget » de la carte : fonctionnement hors personnel par élève du public des collèges, par collectivité. */
  carteBudget: Extract<CarteDonnees, { genre: "collectivites" }>;
}

/** Une version archivée d'une source (GitHub Release). */
export interface VersionSource {
  sha256: string;
  tag: string;
  fichier: string;
  /** URL permanente de téléchargement (« donnée brute »). */
  url: string;
  /** Date de modification annoncée par le portail. */
  modified: string;
  collecteLe: string;
  lignes: number;
  /** Requête qui a produit le fichier (sources interrogées par requête, comme le budget). */
  requete?: string;
}

export interface DonneesSource {
  id: SourceId;
  titre: string;
  producteur: string;
  pageUrl: string;
  /** true : la date `modified` des versions est la date de situation du fichier (COG au 1er janvier), pas une modification. */
  dateSituation?: true;
  /** Version actuelle (celle qu'utilise le site). */
  actuelle: VersionSource | null;
  /** Toutes les versions archivées, de la plus ancienne à la plus récente. */
  versions: VersionSource[];
}

export type StatutBudget =
  | "ok"
  | "personnel_non_rattache"
  | "fonction_non_detaillee"
  | "aucun_eleve_prive"
  | "collectivite_non_identifiee"
  | "aucune_collectivite"
  | "aucune_contribution_identifiee"
  | "non_disponible";

/** Un montant (€) et son montant par élève ; `null` jamais remplacé par zéro, le statut dit pourquoi. */
export interface MontantBudget {
  total: number | null;
  parEleve: number | null;
  statut: StatutBudget;
}

export interface ExerciceBudget {
  exercice: number;
  /** Rentrée des élèves : exercice − 1. */
  rentree: number;
  source: SourceId;
  eleves: ParSecteur<number | null>;
  public: { horsPersonnel: MontantBudget; avecPersonnel: MontantBudget; investissement: MontantBudget };
  prive: { fonctionnement: MontantBudget; investissement: MontantBudget };
  /** Dépenses des cités scolaires (fonction 24) de la collectivité pour l'exercice, en euros, hors montants par élève ; null si aucune ligne. */
  citesScolaires: number | null;
}

export interface BudgetCollectivite {
  id: IdCollectivite;
  libelle: string;
  niveau: NiveauBudget;
  /** Par exercice croissant. */
  exercices: ExerciceBudget[];
  mentions: ("agricole" | "cites_scolaires")[];
  partCitesScolaires?: number;
}

/** Moyenne France d'un poste : `n` collectivités ayant une valeur. */
export interface MoyenneBudget {
  valeur: number | null;
  n: number;
}

export interface MoyennesBudgetFrance {
  niveau: NiveauBudget;
  exercices: {
    exercice: number;
    public: { horsPersonnel: MoyenneBudget; avecPersonnel: MoyenneBudget; investissement: MoyenneBudget };
    prive: { fonctionnement: MoyenneBudget; investissement: MoyenneBudget };
  }[];
}

export interface BudgetTerritoire {
  collectivites: BudgetCollectivite[];
  france: MoyennesBudgetFrance[];
}
