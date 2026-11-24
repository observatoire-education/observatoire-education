// Format des fichiers de données produits par le pipeline (site/data/) et lus par le site.
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
  ipsMoyen: ParSecteur<number | null>;
  /** Nombre d'établissements par classe de 5 points d'IPS ; `bornes` a une case de plus que les comptes. */
  distributionIps: { public: number[]; prive: number[]; bornes: number[] };
  moyennes: MoyenneTerritoire[];
  /** Triée par nom. */
  liste: LigneListe[];
}

export interface DonneesDepartement {
  dep: string;
  libelle: string;
  aca: string;
  acaLibelle: string;
  /** Rentrée de référence (dernière rentrée des effectifs). */
  rentree: number | null;
  familles: Partial<Record<Famille, SyntheseFamille>>;
  /** Établissements privés hors contrat de l'annuaire (non couverts par les statistiques publiques). */
  horsContrat: number;
}

export interface DonneesFrance {
  rentree: number | null;
  familles: Partial<Record<Famille, Pick<SyntheseFamille, "compte" | "eleves" | "ipsMoyen">>>;
  horsContrat: number;
  academies: { aca: string; libelle: string; departements: { dep: string; libelle: string }[] }[];
}

export type NiveauTerritoire = "france" | "academie" | "departement" | "commune";

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
}

export type CarteDonnees =
  | { genre: "points"; points: PointCarte[] }
  | { genre: "departements"; valeurs: ValeurCarte[] };

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
}

/** Données de la France pour la phase 2 (le type `DonneesFrance` ci-dessus est conservé pour l'instant). */
export interface DonneesFranceTerritoire extends DonneesTerritoire {
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
