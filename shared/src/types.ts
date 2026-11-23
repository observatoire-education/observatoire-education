// Types communs au pipeline et au site.
// Règle cardinale : une donnée absente n'est jamais un zéro ; elle porte un statut.
import type { CodeIndicateur, CodeRepartition } from "./libelles.ts";

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
  | "personnels";

/** Une valeur, son statut et son origine (source et rentrée de septembre). */
export interface Mesure {
  valeur: number | null;
  statut: Statut;
  source: SourceId | null;
  rentree: number | null;
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
}

export interface Fiche {
  uai: string;
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
  /** Date ISO de dernière présence dans l'annuaire si l'établissement a disparu. */
  disparuLe: string | null;
  /** Autres sites de la même UAI (le site principal est décrit par la fiche elle-même). */
  autresSites: Site[];
  indicateurs: Indicateur[];
  repartitions: Repartition[];
  eleves: Eleves | null;
  /** null = voisins non calculables (coordonnées absentes ou page disparue). */
  voisins: Voisin[] | null;
  sources: SourceRef[];
}
