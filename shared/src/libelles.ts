// Libellés exacts affichés sur le site. Toute formulation passe par ce fichier :
// ton neutre, vocabulaire des producteurs de données, aucun mot de palmarès.
import type { Famille, Secteur, Statut } from "./types.ts";

export const LIBELLES = {
  nonPubliePrive: "non publié pour le privé",
  nonDisponible: "non disponible",
  nonCouvert: "non couvert par les statistiques publiques",
  pasDeSegpa: "pas de SEGPA",
  voisinsNonCalculables: "Voisins non calculables (coordonnées absentes)",
  aucunCommentaire: "Ce document ne contient aucun commentaire : il reproduit des données publiques.",
  piedDePage: "Données : Licence Ouverte 2.0. Code : AGPL-3.0. Ce site ne commente pas les chiffres.",
  disparu: (isoDate: string): string => {
    const [a, m, j] = isoDate.slice(0, 10).split("-");
    return `Cet établissement n'apparaît plus dans l'Annuaire de l'éducation depuis le ${j}/${m}/${a}.`;
  },
} as const;

export const LIBELLES_STATUT: Record<Exclude<Statut, "ok">, string> = {
  non_publie_prive: LIBELLES.nonPubliePrive,
  non_disponible: LIBELLES.nonDisponible,
};

export const FAMILLES: Record<Famille, string> = {
  college: "Collège",
  legt: "Lycée général et technologique",
  lpo: "Lycée polyvalent",
  lp: "Lycée professionnel",
  erea: "EREA",
};

/** Libellés au pluriel, pour les onglets des pages de synthèse. */
export const FAMILLES_PLURIEL: Record<Famille, string> = {
  college: "Collèges",
  legt: "Lycées GT",
  lpo: "Lycées polyvalents",
  lp: "Lycées pro",
  erea: "EREA",
};

export const SECTEURS: Record<Secteur, string> = {
  public: "Public",
  prive_sous_contrat: "Privé sous contrat",
};

// --- Indicateurs (tâche 6 du plan) ---

export const CODES_INDICATEURS = [
  "eleves",
  "ips",
  "ecart_type_ips",
  "etp_total",
  "etp_enseignants",
  "etp_vs",
  "eleves_par_etp_ens",
  "eleves_par_etp_vs",
  "part_enseignantes",
  "part_non_titulaires",
  "part_agreges",
  "part_moins_35",
  "part_50_plus",
  "part_anciennete_moins_2",
  "part_anciennete_8_plus",
  "part_filles",
] as const;
export type CodeIndicateur = (typeof CODES_INDICATEURS)[number];

/** volume : jamais de moyenne ; ratio / part : situé par rapport aux moyennes ; indice : moyennes de la source. */
export type Genre = "volume" | "ratio" | "part" | "indice";

export interface DefIndicateur {
  libelle: string;
  genre: Genre;
  /** Nombre de décimales à l'affichage. */
  decimales: number;
}

export const INDICATEURS: Record<CodeIndicateur, DefIndicateur> = {
  eleves: { libelle: "Élèves", genre: "volume", decimales: 0 },
  ips: { libelle: "Indice de position sociale (IPS)", genre: "indice", decimales: 1 },
  ecart_type_ips: { libelle: "Écart-type de l'IPS", genre: "volume", decimales: 1 },
  etp_total: { libelle: "ETP total", genre: "volume", decimales: 1 },
  etp_enseignants: { libelle: "ETP enseignants", genre: "volume", decimales: 1 },
  etp_vs: { libelle: "ETP de vie scolaire", genre: "volume", decimales: 1 },
  eleves_par_etp_ens: { libelle: "Élèves par ETP enseignant", genre: "ratio", decimales: 1 },
  eleves_par_etp_vs: { libelle: "Élèves par ETP de vie scolaire", genre: "ratio", decimales: 1 },
  part_enseignantes: { libelle: "Part d'enseignantes", genre: "part", decimales: 1 },
  part_non_titulaires: { libelle: "Part d'enseignants non titulaires", genre: "part", decimales: 1 },
  part_agreges: { libelle: "Part d'enseignants agrégés", genre: "part", decimales: 1 },
  part_moins_35: { libelle: "Part d'enseignants de moins de 35 ans", genre: "part", decimales: 1 },
  part_50_plus: { libelle: "Part d'enseignants de 50 ans ou plus", genre: "part", decimales: 1 },
  part_anciennete_moins_2: { libelle: "Part d'enseignants présents depuis moins de 2 ans", genre: "part", decimales: 1 },
  part_anciennete_8_plus: { libelle: "Part d'enseignants présents depuis 8 ans ou plus", genre: "part", decimales: 1 },
  part_filles: { libelle: "Part de filles", genre: "part", decimales: 1 },
};

// --- Répartitions (barres empilées) ---

export const CODES_REPARTITIONS = [
  "sexe_enseignants",
  "statuts",
  "ages",
  "anciennete",
  "sexe_eleves",
  "lv1",
  "lv2",
] as const;
export type CodeRepartition = (typeof CODES_REPARTITIONS)[number];

export const REPARTITIONS: Record<CodeRepartition, { libelle: string; categories: readonly string[] }> = {
  sexe_enseignants: { libelle: "Enseignants : femmes et hommes", categories: ["Femmes", "Hommes"] },
  statuts: {
    libelle: "Enseignants : statuts",
    categories: ["Agrégés", "Certifiés, PEPS", "PLP", "Autres titulaires", "Non titulaires"],
  },
  ages: { libelle: "Enseignants : âge", categories: ["Moins de 35 ans", "35 à 49 ans", "50 ans ou plus"] },
  anciennete: {
    libelle: "Enseignants : ancienneté dans l'établissement",
    categories: ["Moins de 2 ans", "2 à 4 ans", "5 à 7 ans", "8 ans ou plus"],
  },
  sexe_eleves: { libelle: "Élèves : filles et garçons", categories: ["Filles", "Garçons"] },
  lv1: { libelle: "Langue vivante 1", categories: ["Anglais", "Allemand", "Espagnol", "Autres"] },
  lv2: { libelle: "Langue vivante 2", categories: ["Anglais", "Allemand", "Espagnol", "Italien", "Autres"] },
};

export const NIVEAUX_TERRITORIAUX = {
  departement: "Département",
  academie: "Académie",
  france: "France",
} as const;
