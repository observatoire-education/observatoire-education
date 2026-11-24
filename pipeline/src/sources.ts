// Registre des sources de la phase 1 (data.education.gouv.fr, API Opendatasoft v2.1).
// Champs vérifiés sur l'API le 2026-11-23.
import type { SourceId } from "@obs/shared/types";
import type { Manifest } from "./archive.ts";
import { colonnesDe, JEUX_EFFECTIFS } from "./colonnes-eleves.ts";

export interface Source {
  id: SourceId;
  datasetId: string;
  titre: string;
  producteur: string;
  pageUrl: string;
  /** Base de l'API Opendatasoft qui héberge le jeu. */
  api: string;
  /** Clause `where` ODSQL : seul l'extrait filtré est téléchargé (budget). */
  filtre?: string;
  /** Colonnes dont l'absence fait rejeter une version téléchargée. */
  colonnesRequises: string[];
  /** true : référentiel téléchargé chaque nuit (annuaire), sans millésime. */
  referentiel: boolean;
}

export const PORTAIL = "https://data.education.gouv.fr";
export const API = `${PORTAIL}/api/explore/v2.1/catalog/datasets`;
export const PORTAIL_ECO = "https://data.economie.gouv.fr";
export const API_ECO = `${PORTAIL_ECO}/api/explore/v2.1/catalog/datasets`;

/** Produit cartésien de motifs : developper("a_{x,y}_{1,2}") → a_x_1, a_x_2, a_y_1, a_y_2. */
export function developper(motif: string): string[] {
  const m = motif.match(/\{([^}]*)\}/);
  if (!m) return [motif];
  const [bloc, choix] = m as unknown as [string, string];
  return choix.split(",").flatMap((c) => developper(motif.replace(bloc, c)));
}

const cols = (...motifs: string[]): string[] => motifs.flatMap(developper);

function source(
  id: SourceId,
  datasetId: string,
  titre: string,
  colonnesRequises: string[],
  referentiel = false,
): Source {
  return {
    id,
    datasetId,
    titre,
    producteur: id === "annuaire" ? "MEN" : "MEN-DEPP",
    pageUrl: `${PORTAIL}/explore/dataset/${datasetId}/information/`,
    api: API,
    colonnesRequises,
    referentiel,
  };
}

export const SOURCES: Record<SourceId, Source> = {
  annuaire: source(
    "annuaire",
    "fr-en-annuaire-education",
    "Annuaire de l'éducation",
    cols(
      "identifiant_de_l_etablissement",
      "nom_etablissement",
      "type_etablissement",
      "statut_public_prive",
      "type_contrat_prive",
      "libelle_nature",
      "adresse_1",
      "code_postal",
      "code_commune",
      "nom_commune",
      "code_departement",
      "libelle_departement",
      "code_academie",
      "libelle_academie",
      "latitude",
      "longitude",
      "appartenance_education_prioritaire",
      "segpa",
      "ulis",
      "hebergement",
      "etat",
      "multi_uai",
    ),
    true,
  ),
  ips_colleges: source(
    "ips_colleges",
    "fr-en-ips-colleges-ap2023",
    "Indices de position sociale des collèges",
    cols("rentree_scolaire", "uai", "ips", "ecart_type_de_l_ips", "ips_{departemental,academique,national}_{public,prive}"),
  ),
  ips_lycees: source(
    "ips_lycees",
    "fr-en-ips-lycees-ap2023",
    "Indices de position sociale des lycées",
    cols(
      "rentree_scolaire",
      "uai",
      "type_de_lycee",
      "ips_etab",
      "ecart_type_etablissement",
      "ips_{departemental,academique,national}_{legt,lpo,lp}_{public,prive}",
    ),
  ),
  // Effectifs : les colonnes requises sont exactement celles que lit le calcul des élèves.
  effectifs_colleges: source(
    "effectifs_colleges",
    "fr-en-college-effectifs-niveau-sexe-lv",
    "Effectifs d'élèves par niveau, sexe et langue des collèges",
    colonnesDe(JEUX_EFFECTIFS[0]),
  ),
  effectifs_lycees_gt: source(
    "effectifs_lycees_gt",
    "fr-en-lycee_gt-effectifs-niveau-sexe-lv",
    "Effectifs d'élèves des lycées généraux et technologiques",
    colonnesDe(JEUX_EFFECTIFS[1]),
  ),
  effectifs_lycees_pro: source(
    "effectifs_lycees_pro",
    "fr-en-lycee_pro-effectifs-niveau-sexe-lv",
    "Effectifs d'élèves des lycées professionnels",
    colonnesDe(JEUX_EFFECTIFS[2]),
  ),
  personnels: source(
    "personnels",
    "fr-en-indicateurs_personnels_etablissements2d",
    "Les personnels dans les établissements du second degré",
    cols(
      "annee_de_la_rentree_scolaire",
      "uai",
      "etp_total",
      "etp_de_personnels_de_vie_scolaire",
      "etp_enseignants_hommes_et_femmes",
      "etp_de_femmes_enseignantes",
      "etp_d_enseignants_{agreges,certifies_peps,plp,titulaires_d_un_autre_corps,non_titulaires}",
      "etp_d_enseignants_de_{moins_de_35_ans,35_a_moins_de_50_ans,50_ans_ou_plus}",
      "etp_d_enseignants_ayant_une_anciennete_dans_l_etablissement_de_{moins_de_2_ans,2_ans_a_moins_de_5_ans,5_ans_a_moins_de_8_ans,8_ans_ou_plus}",
    ),
  ),
};

// --- Budget des collectivités (DGFiP, data.economie.gouv.fr) : un jeu par exercice, extrait filtré ---

/** Identifiants irréguliers des jeux annuels (vérifiés le 2026-11-24) ; les exercices suivants sont découverts au catalogue. */
export const EXERCICES_BUDGET: Record<number, string> = {
  2020: "balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec7",
  2021: "balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec8",
  2022: "balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-2022",
  2023: "balances-comptables-des-collectivites-et-des-epl-avec-fonction-2023",
  2024: "balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-croisee-nature-fonction-2024",
};

/** Fonction collèges (221) et lycées (222, 223), seules ou précédées d'un chapitre 90 à 94 ; 22 et ses préfixes : non détaillée. */
const FONCTIONS_BUDGET = [
  ...["221", "222", "223", "22"].flatMap((f) => ["", "90", "91", "92", "93", "94"].map((p) => `${p}${f}`)),
  "922",
  "932",
];
const liste = (valeurs: string[]) => valeurs.map((v) => `"${v}"`).join(",");

export const FILTRE_BUDGET = `categ in (${liste(["DEPT", "REG", "CTU", "ML", "PARIS"])}) and cbudg = "1" and fonction in (${liste(FONCTIONS_BUDGET)})`;

export const COLONNES_BUDGET = [
  ...["exer", "ident", "siren", "lbudg", "categ", "ndept", "cregi", "cbudg", "nomen", "fonction", "compte"],
  ...["obnetdeb", "obnetcre", "oobdeb", "oobcre"],
];

export function sourceBudget(exercice: number, datasetId: string): Source {
  return {
    id: `budget_${exercice}`,
    datasetId,
    titre: `Balances comptables des collectivités, présentation croisée nature-fonction ${exercice}`,
    producteur: "DGFiP",
    pageUrl: `${PORTAIL_ECO}/explore/dataset/${datasetId}/information/`,
    api: API_ECO,
    filtre: FILTRE_BUDGET,
    colonnesRequises: COLONNES_BUDGET,
    referentiel: false,
  };
}

/** Sources de phase 1 + exercices budget connus + jeux découverts au catalogue (enregistrés dans le manifest). */
export function toutesSources(manifest: Manifest): Source[] {
  const budgets = new Map<number, string>(Object.entries(EXERCICES_BUDGET).map(([e, d]) => [Number(e), d]));
  for (const [id, datasetId] of manifest.jeuxDecouverts()) {
    const exercice = Number(id.replace("budget_", ""));
    if (!budgets.has(exercice)) budgets.set(exercice, datasetId);
  }
  return [...Object.values(SOURCES), ...[...budgets].sort(([a], [b]) => a - b).map(([e, d]) => sourceBudget(e, d))];
}
