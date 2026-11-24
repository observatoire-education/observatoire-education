// Libellés exacts affichés sur le site. Toute formulation passe par ce fichier :
// ton neutre, vocabulaire des producteurs de données, aucun mot de palmarès.
import type { Famille, Secteur, Statut } from "./types.ts";

const jjmmaaaa = (isoDate: string): string => {
  const [a, m, j] = isoDate.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
};

export const LIBELLES = {
  nonPubliePrive: "non publié pour le privé",
  nonDisponible: "non disponible",
  nonCouvert: "non couvert par les statistiques publiques",
  pasDeSegpa: "pas de SEGPA",
  voisinsNonCalculables: "Voisins non calculables (coordonnées absentes)",
  aucunCommentaire: "Ce document ne contient aucun commentaire : il reproduit des données publiques.",
  piedDePage: "Données : Licence Ouverte 2.0. Code : AGPL-3.0. Ce site ne commente pas les chiffres.",
  multiSites: (n: number): string => `Établissement réparti sur ${n} sites`,
  disparu: (isoDate: string): string => {
    const [a, m, j] = isoDate.slice(0, 10).split("-");
    return `Cet établissement n'apparaît plus dans l'Annuaire de l'éducation depuis le ${j}/${m}/${a}.`;
  },
  ferme: (isoDate: string): string => `Fermé le ${jjmmaaaa(isoDate)}`,
  correction: (millesime: string, isoDate: string): string => `Millésime ${millesime} corrigé par le producteur le ${jjmmaaaa(isoDate)}`,
  versionPrecedente: "version précédente",
  versionCorrigee: "version corrigée",
  successeur: "Successeur : ",
  succedeA: (nom: string, uai: string, isoDate: string | null): string =>
    `Succède à ${nom} (${uai})${isoDate ? `, fermé le ${jjmmaaaa(isoDate)}` : ""}`,
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

/** Libellés lisibles des contrats du privé (libellés de l'annuaire en majuscules → texte courant). */
export const CONTRATS: Record<string, string> = {
  "CONTRAT D'ASSOCIATION TOUTES CLASSES": "Contrat d'association",
  "CONTRAT ASSOCIATION PARTIE DES CLASSES": "Contrat d'association (partie des classes)",
  "CONTRAT SIMPLE TOUTES CLASSES": "Contrat simple",
  "C0NTRAT SIMPLE POUR PARTIE DES CLASSES": "Contrat simple (partie des classes)",
  "CONTRAT PARTIE DES CLASSES SIMPLE+ASSOC": "Contrat simple et d'association (partie des classes)",
  "CONTRAT TTES CLASSES SIMPLE+ASSOCIATION": "Contrat simple et d'association",
  "SOUS CONTRAT ETABLISSEMENT AGRICOLE": "Établissement agricole sous contrat",
};

/** « Académie de Nantes », « Académie d'Orléans-Tours ». */
export function academie(libelle: string): string {
  return /^[AEIOUYÉÈÊÀÂÎÏÔÛH]/i.test(libelle) ? `Académie d'${libelle}` : `Académie de ${libelle}`;
}

export const NIVEAUX_TERRITORIAUX = {
  departement: "Département",
  academie: "Académie",
  region: "Région",
  france: "France",
} as const;

/** Libellés du bloc « Moyens de la collectivité » (budget des collèges et des lycées). */
export const LIBELLES_BUDGET = {
  titre: "Moyens de la collectivité",
  postes: {
    horsPersonnel: "Fonctionnement hors personnel",
    avecPersonnel: "Fonctionnement, personnel compris",
    investissement: "Investissement",
    contributionColleges: "Contribution aux collèges privés",
    contributionLycees: "Contribution aux lycées privés",
  },
  unites: {
    parEleve: "€ par élève",
    parElevePrive: "€ par élève du privé",
  },
  absences: {
    personnelNonRattacheColleges: "personnel non rattaché aux collèges dans les comptes de la collectivité",
    personnelNonRattacheLycees: "personnel non rattaché aux lycées dans les comptes de la collectivité",
    fonctionNonDetailleeColleges: "fonction collèges non détaillée dans les comptes de la collectivité",
    fonctionNonDetailleeLycees: "fonction lycées non détaillée dans les comptes de la collectivité",
    aucunElevePrive: "aucun élève du privé sous contrat",
    collectiviteNonIdentifiee: "collectivité non identifiée dans les balances de la DGFiP",
    aucuneCollectivite: "aucune collectivité ne finance ces établissements dans les balances de la DGFiP",
    aucuneContributionIdentifiee: "aucune contribution au privé identifiée dans les comptes de la collectivité pour cet exercice",
  },
  moyenne: {
    calculee: "moyenne calculée par l'observatoire",
    de: (n: number) => `moyenne de ${n} collectivité${n > 1 ? "s" : ""}`,
    nonDisponible: "moyenne non disponible",
  },
  /** Textes d'interface du bloc (en-têtes, repères). */
  interface: {
    montant: "Montant",
    ecartMoyenne: "Écart (moyenne)",
    ecartAvecPublic: "Écart avec le public",
    public: "public",
    prive: "privé sous contrat",
    collectivite: "Collectivité",
    evolution: "Évolution",
    exercice: (n: number) => `exercice ${n}`,
    investissementPrive: "Investissement (privé)",
    sourceSansExercice: "DGFiP, balances comptables",
    exercicesDe: (premier: number, dernier: number) => `Exercices ${premier} à ${dernier}`,
    voirSources: "Sources et méthode",
    requeteRejouee: "Requête utilisée (rejouée sur les données actuelles du portail)",
    donneeBrute: "donnée brute",
  },
  source: (exercice: number) =>
    `DGFiP, balances comptables, exercice ${exercice} · élèves à la rentrée ${exercice - 1} (DEPP)`,
  mentionAgricole:
    "Les dépenses de la région incluent l'enseignement agricole, dont les élèves ne sont pas comptés ici : le montant par élève en est surestimé, surtout pour le privé.",
  /** Montant formaté par l'appelant (par exemple « 97,3 M€ »). */
  citesScolairesHorsMontants: (montant: string) =>
    `${montant} dépensés par la collectivité pour des cités scolaires (collège et lycée réunis) ne sont pas comptés ici : les comptes ne les répartissent pas entre collèges et lycées.`,
  mentionCitesScolaires: (pourcent: string, exercice: number) =>
    `Les comptes de la collectivité incluent des reversements entre collectivités pour des cités scolaires (environ ${pourcent} % des dépenses retenues, mesurée sur l'exercice ${exercice}).`,
} as const;

/** Libellés de la section « Résultats » (brevet et baccalauréat). */
export const LIBELLES_RESULTATS = {
  titre: "Résultats",
  voies: {
    brevet_general: "Diplôme national du brevet, série générale",
    brevet_pro: "Diplôme national du brevet, série professionnelle",
    bac_gt: "Baccalauréat, voie générale et technologique",
    bac_pro: "Baccalauréat, voie professionnelle",
  },
  effectif: { brevet_general: "Candidats", brevet_pro: "Candidats", bac_gt: "Présents", bac_pro: "Présents" },
  lignes: {
    taux_reussite: "Taux de réussite",
    note_ecrit: "Note moyenne à l'écrit",
    taux_mentions: "Taux de mentions",
    tauxAccesBrevet: "Taux d'accès de la 6e à la 3e",
    tauxAccesBac: "Taux d'accès de la seconde au bac",
    mentions: "Mentions (assez bien · bien · très bien)",
  },
  colonneVa: "Valeur ajoutée",
  aucun: "pas de résultats publiés pour cet établissement",
  nonPublie: "non publié pour cette session",
  vaNonPublieePro: "valeur ajoutée non publiée pour la série professionnelle",
  phraseVa: "La valeur ajoutée compare le résultat de l'établissement à celui qu'on attendrait compte tenu de ses élèves.",
  commentLaLire: "Comment la lire",
  lienVa: "/methode/#valeur-ajoutee",
  rupture: "Réforme du baccalauréat : les séries changent à partir de la session 2021.",
  session: (s: number) => `session ${s}`,
  reussite: "Réussite",
} as const;
