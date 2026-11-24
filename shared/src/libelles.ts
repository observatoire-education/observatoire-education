// Libellés exacts affichés sur le site. Toute formulation passe par ce fichier :
// ton neutre, vocabulaire des producteurs de données, aucun mot de palmarès.
import type { Famille, FamilleEcole, FamilleSecondDegre, Secteur, Statut } from "./types.ts";

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
  /** Fermeture d'une école (accord au féminin). */
  fermee: (isoDate: string): string => `Fermée le ${jjmmaaaa(isoDate)}`,
  correction: (millesime: string, isoDate: string): string => `Millésime ${millesime} corrigé par le producteur le ${jjmmaaaa(isoDate)}`,
  versionPrecedente: "version précédente",
  versionCorrigee: "version corrigée",
  successeur: "Successeur : ",
  /** `feminin` : le prédécesseur est une école (« fermée le »). */
  succedeA: (nom: string, uai: string, isoDate: string | null, feminin = false): string =>
    `Succède à ${nom} (${uai})${isoDate ? `, ${feminin ? "fermée" : "fermé"} le ${jjmmaaaa(isoDate)}` : ""}`,
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
  maternelle: "École maternelle",
  elementaire: "École élémentaire",
  primaire: "École primaire",
};

/** Libellés au pluriel, pour les onglets des pages de synthèse. */
export const FAMILLES_PLURIEL: Record<Famille, string> = {
  college: "Collèges",
  legt: "Lycées GT",
  lpo: "Lycées polyvalents",
  lp: "Lycées pro",
  erea: "EREA",
  maternelle: "Écoles maternelles",
  elementaire: "Écoles élémentaires",
  primaire: "Écoles primaires",
};

/** Familles du second degré (collèges, lycées, EREA), dans l'ordre d'affichage. */
export const FAMILLES_SECOND_DEGRE = ["college", "legt", "lpo", "lp", "erea"] as const satisfies readonly FamilleSecondDegre[];
/** Familles des écoles (premier degré). */
export const FAMILLES_ECOLES = ["maternelle", "elementaire", "primaire"] as const satisfies readonly FamilleEcole[];

/** Vrai pour une école maternelle, élémentaire ou primaire. */
export function estEcole(f: Famille): f is FamilleEcole {
  return (FAMILLES_ECOLES as readonly Famille[]).includes(f);
}

/** Vrai pour un collège, un lycée ou un EREA. */
export function estSecondDegre(f: Famille): f is FamilleSecondDegre {
  return (FAMILLES_SECOND_DEGRE as readonly Famille[]).includes(f);
}

/** Libellés de la fiche école (lot 1). */
export const LIBELLES_ECOLES = {
  derniereRentree: (rentree: number): string => `Rentrée ${rentree}, dernière publiée`,
  elevesParClasse: "Élèves par classe",
  classes: "Classes",
  unNiveau: "Classes à un niveau",
  plusieursNiveaux: "Classes à plusieurs niveaux",
  ipsNonPublie: "IPS non publié pour cette école",
  ficheA4: "Fiche pour le conseil d'école",
  preelementaire: "Préélémentaire",
  ulis: "ULIS",
  ueea: "UEEA",
} as const;

const pluriel = (n: number, singulier: string, plurielle: string) => `${n} ${n > 1 ? plurielle : singulier}`;

/** Titre du PIAL en deux parties : « PIAL du collège » et le nom de la tête (qui porte le lien vers sa fiche). */
export function titrePialEnDeux(famille: Famille, nom: string): { debut: string; nom: string } {
  const f = FAMILLES[famille];
  const court = nom.toLocaleLowerCase("fr").startsWith(`${f.toLocaleLowerCase("fr")} `) ? nom.slice(f.length + 1) : nom;
  const article = /^[aeiouyéèêàâîôûh]/iu.test(f) ? "de l'" : "du ";
  return { debut: `PIAL ${article}${famille === "erea" ? f : f.toLocaleLowerCase("fr")} `, nom: court };
}

/** Rattachements d'une école (collège de secteur, PIAL, circonscription) et blocs de la fiche collège (spec, 6.4 et 6.5). */
export const LIBELLES_RATTACHEMENTS = {
  titre: "Rattachements",
  /** École publique : « Collège de secteur à l'adresse de l'école : » ; privée sous contrat : « Située dans le secteur du collège public ». */
  introSecteur: (prive: boolean): string => (prive ? "Située dans le secteur du collège public" : "Collège de secteur à l'adresse de l'école :"),
  noteSecteur: "Le secteur de collège dépend de l'adresse de chaque famille, pas de l'école fréquentée. Source : carte scolaire des collèges publics, définie par le conseil départemental.",
  notePrive: "Les écoles privées ne sont pas soumises à la carte scolaire. Le collège public de secteur d'un élève dépend de l'adresse de sa famille.",
  carteNonPubliee: "Carte scolaire non publiée pour ce département",
  nonRapprochee: "Adresse de l'école non rapprochée de la carte scolaire",
  circonscription: "Circonscription",
  pial: "PIAL",
  /**
   * « PIAL du {famille en minuscules} {nom} », avec élision devant une voyelle (« de l'école élémentaire ») ; le nom
   * perd la famille qu'il répète (« Collège Jules-Verne » → « PIAL du collège Jules-Verne »).
   */
  titrePial: (famille: Famille, nom: string): string => {
    const t = titrePialEnDeux(famille, nom);
    return `${t.debut}${t.nom}`;
  },
  definitionPial: "Le PIAL (pôle inclusif d'accompagnement localisé) organise l'accompagnement des élèves en situation de handicap.",
  enSavoirPlus: "En savoir plus",
  ecolesDuSecteur: "Écoles de son secteur",
  aucuneEcole: "Aucune école rapprochée de la carte scolaire",
  /** « {n} école(s) publique(s), {m} privée(s) sous contrat » : singulier pour 0 et 1. */
  decompte: (publiques: number, privees: number): string =>
    `${pluriel(publiques, "école publique", "écoles publiques")}, ${pluriel(privees, "privée sous contrat", "privées sous contrat")}`,
  noteListe: "Seules les écoles dont l'adresse a pu être rapprochée de la carte scolaire sont listées.",
  methode: "Méthode",
  nonPublie: "non publié",
} as const;

/** Seuils de la phrase « Aucune autre école à moins de n km » (spec, section 6.6). */
export const SEUILS_ISOLEMENT_KM = [2, 5, 10] as const;
/** Rayon de recherche des écoles proches ; aussi le seuil de la phrase quand aucune école n'est dans ce rayon. */
export const RAYON_ECOLES_PROCHES_KM = 50;

/** Bloc « Autour de l'école » : écoles les plus proches (spec, section 6.6). */
export const LIBELLES_ECOLES_PROCHES = {
  titre: "Autour de l'école",
  aucuneAMoinsDe: (km: number): string => `Aucune autre école à moins de ${km} km`,
  plusProcheMaternelle: "École maternelle ou primaire la plus proche :",
  plusProcheElementaire: "École élémentaire ou primaire la plus proche :",
  aucuneMaternelle: `Aucune école maternelle ou primaire à moins de ${RAYON_ECOLES_PROCHES_KM} km`,
  aucuneElementaire: `Aucune école élémentaire ou primaire à moins de ${RAYON_ECOLES_PROCHES_KM} km`,
  note: "Distances à vol d'oiseau, sans tenir compte du relief ni des routes.",
  sansCoordonnees: "Coordonnées de l'école non publiées",
} as const;

/**
 * Écoles d'une page commune (spec, section 6.7). « Plus d'école à {commune déléguée} depuis {année} » n'est pas
 * affiché : l'Annuaire range les écoles ouvertes d'une commune nouvelle sous son code, pas sous celui de leur commune
 * déléguée, et la phrase pourrait être fausse. Chaque commune déléguée a la liste de ses écoles fermées.
 */
export const LIBELLES_COMMUNE_ECOLES = {
  titre: "Écoles de la commune",
  plusDEcoleDepuis: (annee: number): string => `Plus d'école dans la commune depuis ${annee}`,
  fermees: "Écoles fermées depuis 2012",
  fermeesDeleguee: (deleguee: string): string => `${deleguee} : écoles fermées`,
  evolution: "Élèves et classes des écoles de la commune",
  carte: "Écoles",
  horsCarte: "Écoles non représentées sur la carte (hors du contour de la commune) :",
  csvDepartement: "Télécharger les écoles du département (CSV)",
  titreProches: "Écoles les plus proches",
  /** Depuis le centre d'une commune sans école : pas d'« autre » école. */
  aucuneAMoinsDe: (km: number): string => `Aucune école à moins de ${km} km`,
  noteProches: "Distances mesurées depuis le centre de la commune.",
  /** Commune sans contour (créée après l'édition des contours IGN) : pas de centre, pas de calcul. */
  sansCentre: "Position de la commune non disponible : écoles les plus proches non calculées",
} as const;

/** « Preel-CP » (typologie des classes) → « Préélémentaire-CP ». */
export function libelleTypeClasse(brut: string): string {
  return brut.split("-").map((n) => (n === "Preel" ? LIBELLES_ECOLES.preelementaire : n)).join("-");
}

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
  "eleves_par_classe",
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
  eleves_par_classe: { libelle: "Élèves par classe", genre: "ratio", decimales: 1 },
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
  /** Note sous les listes et les voisins : session de chaque source de résultats affichée. */
  noteSessions: "Réussite et valeur ajoutée",
  sourcesCourtes: { brevet_general: "brevet", brevet_pro: "brevet", bac_gt: "bac GT", bac_pro: "bac pro" },
} as const;

/** Libellés des nuages IPS × réussite (pages département et académie). */
export const LIBELLES_NUAGES = {
  titres: {
    brevet_general: "Collèges : IPS et réussite au brevet (série générale)",
    bac_gt: "Lycées : IPS de la voie générale et technologique et réussite au bac",
    bac_pro: "Lycées : IPS de la voie professionnelle et réussite au bac",
  },
  note: "Chaque point est un établissement. Lignes : moyennes des points du nuage. Survolez un point pour son nom et ses valeurs ; le tableau des établissements donne le taux de réussite et la valeur ajoutée, et l'IPS de la dernière rentrée.",
  noteIpsEnsemble: "IPS de l'ensemble de l'établissement (l'IPS par voie n'est pas publié pour cette rentrée).",
  axeIps: "IPS",
  axeTaux: "Taux de réussite (%)",
  vaNonPubliee: "valeur ajoutée non publiée",
  effectif: { brevet_general: "candidats", bac_gt: "présents", bac_pro: "présents" },
} as const;

/** Mention sous une courbe d'IPS : la DEPP signale une rupture de série à la rentrée 2022. */
export const LIBELLES_IPS = {
  rupture: "rupture de série dès la rentrée 2022",
} as const;

/** Libellés du bloc « Ségrégation sociale entre collèges » (pages département ; renvoi sur les autres pages de territoire). */
export const LIBELLES_SEGREGATION = {
  titre: "Ségrégation sociale entre collèges",
  indices: {
    ensemble: "Ensemble des collèges",
    public: "Entre collèges publics",
    prive: "Entre collèges privés sous contrat",
    publicPrive: "Entre public et privé",
  },
  partPublicPrive: "Part de la ségrégation due à l'écart entre public et privé",
  colleges: "Collèges pris en compte",
  partPrive: "Part du privé",
  indicateur: "Indicateur",
  renvoi: "La DEPP publie la ségrégation sociale entre collèges par département seulement : voir les pages des départements.",
} as const;
