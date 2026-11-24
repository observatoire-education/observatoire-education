// Format des fichiers de données produits par le pipeline (site/data/) et lus par le site.
import type { IdCollectivite, NiveauBudget } from "./collectivites.ts";
import type { CodeIndicateur } from "./libelles.ts";
import type { Comparaison, Famille, Secteur, SourceId, Statut } from "./types.ts";

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
}

/** Données de la France : celles d'un territoire, plus la liste des académies et de leurs départements. */
export interface DonneesFrance extends Omit<DonneesTerritoire, "academies"> {
  academies: { aca: string; libelle: string; departements: { dep: string; libelle: string }[] }[];
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
