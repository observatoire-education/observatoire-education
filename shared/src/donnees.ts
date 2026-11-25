// Format des fichiers de données produits par le pipeline (site/data/) et lus par le site.
import type { IdCollectivite, NiveauBudget } from "./collectivites.ts";
import type { CodeIndicateur } from "./libelles.ts";
import type {
  Comparaison, Correction, EcolesProches, Famille, LienEtab, LigneEcole, PointIps, ResumeResultat, Secteur, SourceId, Statut,
} from "./types.ts";

/** Bâtiment et travaux d'un lycée, résumés pour la liste d'une page région ou département. */
export interface LigneTravaux {
  uai: string;
  nom: string;
  commune: string;
  famille: Famille;
  anneeConstruction: number | null;
  /** Opérations du plan pluriannuel d'investissement et somme de leurs enveloppes prévisionnelles (M€). */
  ppi: number;
  enveloppePpiMeur: number | null;
  /** Opérations votées depuis 2021 et somme des montants votés (€). */
  operations: number;
  montantVote: number | null;
  /** Année la plus récente parmi les opérations (livraison ou individualisation PPI, décision votée). */
  derniereAnnee: number | null;
  /** Bâtiments détaillés par la région (Bretagne ; 0 ailleurs), leur surface bâtie totale (m²) et le plus ancien. */
  batiments: number;
  surfaceBatie: number | null;
  anneePlusAncien: number | null;
}

/** Surface bâtie des lycées d'un territoire par décennie de construction (bâtiments datés seulement). */
export interface SurfaceDecennie {
  decennie: number;
  surface: number;
}

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
  /** Rentrées de `eleves` et de `ips` (CSV) ; null sans valeur. */
  rentreeEleves: number | null;
  rentreeIps: number | null;
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

/** Une école fermée depuis 2012, rangée sous la commune d'aujourd'hui. */
export interface EcoleFermee extends LienEtab {
  famille: Famille;
  /** Nom de la commune de l'école quand elle portait un autre code que la commune d'aujourd'hui (commune fusionnée). */
  ancienneCommune?: string;
  /** L'école n'a pas de fiche (citée par aucune source chiffrée) : nommée, sans lien. */
  sansFiche?: true;
}

/**
 * Commune déléguée d'une commune nouvelle et ses écoles fermées (code de la liste des établissements fermés). Les
 * écoles ouvertes n'y sont pas : l'Annuaire les range sous le code de la commune nouvelle (écart à la spec, 6.7).
 */
export interface PartieDeleguee { code: string; nom: string; fermees: EcoleFermee[] }

/** Une école ouverte d'une page commune : classes de la rentrée des élèves (null si non publiées ou 0), éducation prioritaire. */
export interface LigneEcoleCommune extends LigneEcole { classes: number | null; ep: string | null }

/** Écoles d'une page commune (spec, section 6.7). */
export interface EcolesCommune {
  /** Ouvertes, triées par nom ; classes de la rentrée des élèves (null si non publiées ou 0). */
  ecoles: LigneEcoleCommune[];
  /** Rentrées des colonnes Élèves (et Classes) et IPS. */
  rentrees: { eleves: number | null; ips: number | null };
  /** [rentrée, élèves, classes] de la commune : somme de ses écoles, ouvertes et fermées (effectifs des écoles). */
  historique: [number, number | null, number | null][];
  /** Depuis 2012, par date. */
  fermees: EcoleFermee[];
  /** null si la commune a une école ouverte. */
  plusDEcoleDepuis: number | null;
  /** Communes déléguées (hors chef-lieu) qui ont des écoles fermées ; vide si la commune n'est pas une commune nouvelle. */
  deleguees: PartieDeleguee[];
  /** Seulement si la commune n'a plus d'école : depuis le centre de son contour (null sans contour). */
  plusProches: EcolesProches | null;
  /** Écoles ouvertes qui ont des coordonnées (carte). */
  points: PointCarte[];
}

/**
 * Premier degré d'un département, d'une académie, d'une région ou de la France (spec, section 6.8) : écoles ouvertes
 * (publiques et privées sous contrat), élèves et classes de la dernière rentrée des effectifs des écoles, IPS de la
 * dernière rentrée de l'IPS des écoles.
 */
export interface SynthesePremierDegre {
  compte: ParSecteur<number>;
  eleves: ParSecteur<number | null>;
  /** Σ élèves ÷ Σ classes, arrondi à 0,1, sur les écoles qui publient élèves et classes (0 classe : non publié). */
  elevesParClasse: ParSecteur<number | null>;
  /** Moyennes des écoles publiées par la DEPP (département, académie, France), sinon calculées (région). */
  ipsMoyen: IpsMoyens;
  /** Nombre d'écoles par classe de 5 points d'IPS ; `bornes` a une case de plus que les comptes. */
  distributionIps: { public: number[]; prive: number[]; bornes: number[] };
  /** Rentrées de `eleves` et `elevesParClasse`, et de l'IPS. */
  rentrees: { eleves: number | null; ips: number | null };
  /**
   * [rentrée, écoles ouvertes, classes] par rentrée croissante (effectifs des écoles, écoles ouvertes et fermées
   * depuis). Classes : Σ des écoles qui les publient (> 0) ; null si aucune ne les publie. Les autres sont comptées
   * dans `sansClasses` (règle des territoires ; la page commune rend le total inconnu).
   */
  historique: [number, number, number | null][];
  /** [rentrée, écoles sans nombre de classes publié (null ou 0)], rentrées où il y en a au moins une. */
  sansClasses: [number, number][];
  /** [année, écoles fermées cette année-là] depuis 2012, une par école (une fusion de deux écoles : deux), années sans fermeture omises. */
  fermetures: [number, number][];
  /** Écoles privées hors contrat ouvertes (Annuaire) : nombre seulement. */
  horsContrat: number;
}

export interface DonneesTerritoire {
  /** Pages commune : écoles de la commune ; absent si elle n'a ni n'a eu d'école depuis 2012. */
  ecoles?: EcolesCommune;
  /** Département, académie, région et France : premier degré (absent pour une commune). */
  premierDegre?: SynthesePremierDegre;
  /** Pages département : communes qui ont, ou ont eu depuis 2012, une école (pages commune), triées par nom. */
  communesEcoles?: RefTerritoire[];
  /** Pages département : écoles ouvertes, pour le CSV (triées par nom). */
  listeEcoles?: (LigneEcole & { ep: string | null })[];
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
  /** Pages région et département : transport scolaire ; absent ailleurs. */
  transport?: TransportTerritoire;
  /** Pages région et département : bâtiment et travaux de chaque lycée publié par la région ; absent si aucun. */
  travauxLycees?: LigneTravaux[];
  /** Pages région et département : surface bâtie par décennie, quand la région détaille ses bâtiments ; absent sinon. */
  surfacesLycees?: SurfaceDecennie[];
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
  /** Plus ancienne année des séries publiées sur les fiches actives (indicateurs, classes, résultats) ; null sans série. */
  seriesDepuis?: number | null;
  /** Transport scolaire des régions et CTU, dans l'ordre du budget. */
  transportRegions?: CollectiviteTransport[];
  academiesEtDepartements: { aca: string; libelle: string; departements: { dep: string; libelle: string }[] }[];
  regions: RefTerritoire[];
  /** Vue « budget » de la carte : fonctionnement hors personnel par élève du public des collèges, par collectivité. */
  carteBudget: Extract<CarteDonnees, { genre: "collectivites" }>;
  /** Départements dont au moins une école ouverte n'a pas de collège de secteur faute de carte scolaire publiée (page /sources/). */
  departementsSansCarte: RefTerritoire[];
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
  /** Écoles : la commune n'a aucune ligne dans les fonctions des écoles des balances pour l'exercice. */
  | "budget_communal_non_publie"
  /** Écoles : la commune en a absorbé d'autres après le début de l'exercice ; montant par élève non calculé. */
  | "commune_fusionnee_apres_exercice"
  | "non_disponible";

/** Pourquoi une fiche ou une page commune n'a pas de collectivité pour son budget. */
export type MotifSansBudget = "aucune_collectivite" | "collectivite_non_identifiee" | "budget_communal_non_publie";

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

/** Transport scolaire d'un exercice ; null : poste absent des comptes cet exercice-là. */
export interface ExerciceTransport {
  exercice: number;
  fonctionnement: number | null;
  investissement: number | null;
  produitsServices: number | null;
  /** Région dont les comptes de l'exercice sont tenus en M71, qui n'isole pas le transport scolaire. */
  nomenclatureM71?: true;
}

export interface CollectiviteTransport { id: IdCollectivite; libelle: string; serie: ExerciceTransport[] }

/** Dépenses de transport scolaire montrées sur une page région ou département (spec Transport, section 6). */
export interface TransportTerritoire {
  /** Région ou CTU (page région) ; Département, Métropole de Lyon, CEA ou Ville de Paris (page département). */
  collectivites: CollectiviteTransport[];
  /** Page département : intercommunalités et syndicats dont le siège est dans le département, triés par libellé. */
  groupements?: { total: ExerciceTransport[]; liste: CollectiviteTransport[] };
  /** Page région dont ni la Région ni la CTU n'a de ligne ; page département sans collectivité ni groupement. */
  absence?: "region_sans_ligne" | "departement_sans_ligne";
  /** Exercices des sources transport, croissants : chaque série en a un élément par exercice. */
  exercices: number[];
}

export interface BudgetTerritoire {
  collectivites: BudgetCollectivite[];
  france: MoyennesBudgetFrance[];
  /** Page commune qui a une école publique ouverte, mais dont la commune est absente des balances par fonction. */
  motif?: "budget_communal_non_publie";
}
