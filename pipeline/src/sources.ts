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
  /** Source millésimée : colonne du millésime et colonnes de la clé d'une ligne (détection des corrections). */
  millesime?: { colonne: string; cles: string[] };
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
  millesime?: Source["millesime"],
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
    ...(millesime ? { millesime } : {}),
  };
}

/** Millésime d'une source dont la clé est l'UAI. */
const parUai = (colonne: string, uai = "uai"): Source["millesime"] => ({ colonne, cles: [uai] });

/** Liste de noms de colonnes séparés par des virgules (un ou plusieurs textes). */
const noms = (...textes: string[]): string[] => textes.flatMap((t) => t.split(","));

/** Filtre ODSQL des établissements fermés : second degré, fermés depuis 2012. */
export const FILTRE_FERMES = `date_fermeture >= date'2012-01-01' and (nature_uai_libe like "COLLEGE%" or nature_uai_libe like "LYCEE%" or nature_uai_libe like "ETAB REGIONAL%")`;

const IPS_ETAB = ["rentree_scolaire", "uai", "secteur", "ips", "ecart_type_de_l_ips"];
const IPS_LYCEES = noms(
  "rentree_scolaire,uai,secteur,type_de_lycee,ips_voie_gt,ips_voie_pro,ips_ensemble_gt_pro",
  "ecart_type_de_l_ips_voie_gt,ecart_type_de_l_ips_voie_pro",
);
const IVAL = noms(
  "annee,uai,secteur,presents_total,taux_reu_total,va_reu_total,taux_acces_2nde,va_acces_2nde,taux_men_total,va_men_total",
);

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
      "date_ouverture",
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
    false,
    parUai("rentree_scolaire"),
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
    false,
    parUai("rentree_scolaire"),
  ),
  // Effectifs : les colonnes requises sont exactement celles que lit le calcul des élèves.
  effectifs_colleges: source(
    "effectifs_colleges",
    "fr-en-college-effectifs-niveau-sexe-lv",
    "Effectifs d'élèves par niveau, sexe et langue des collèges",
    colonnesDe(JEUX_EFFECTIFS[0]),
    false,
    parUai("rentree_scolaire", "numero_college"),
  ),
  effectifs_lycees_gt: source(
    "effectifs_lycees_gt",
    "fr-en-lycee_gt-effectifs-niveau-sexe-lv",
    "Effectifs d'élèves des lycées généraux et technologiques",
    colonnesDe(JEUX_EFFECTIFS[1]),
    false,
    parUai("rentree_scolaire", "numero_lycee"),
  ),
  effectifs_lycees_pro: source(
    "effectifs_lycees_pro",
    "fr-en-lycee_pro-effectifs-niveau-sexe-lv",
    "Effectifs d'élèves des lycées professionnels",
    colonnesDe(JEUX_EFFECTIFS[2]),
    false,
    parUai("rentree_scolaire", "numero_lycee"),
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
    false,
    parUai("annee_de_la_rentree_scolaire"),
  ),
  // --- Phase 4 : résultats, IPS des anciennes séries, ségrégation, établissements fermés (champs vérifiés le 2026-11-24) ---
  fermes: {
    ...source(
      "fermes",
      "fr-en-etablissements-fermes",
      "Établissements fermés",
      noms(
        "numero_uai,appellation_officielle,secteur_public_prive_libe,date_ouverture,date_fermeture,adresse_uai,code_postal_uai",
        "code_commune,libelle_commune,code_departement,libelle_departement,code_academie,libelle_academie",
        "nature_uai_libe,latitude,longitude",
      ),
    ),
    filtre: FILTRE_FERMES,
  },
  ips_colleges_2016: source(
    "ips_colleges_2016",
    "fr-en-ips_colleges",
    "Indices de position sociale des collèges (2016-2021)",
    IPS_ETAB,
    false,
    parUai("rentree_scolaire"),
  ),
  ips_colleges_2022: source(
    "ips_colleges_2022",
    "fr-en-ips-colleges-ap2022",
    "Indices de position sociale des collèges (2022)",
    [...IPS_ETAB, "effectifs"],
    false,
    parUai("rentree_scolaire"),
  ),
  ips_lycees_2016: source(
    "ips_lycees_2016",
    "fr-en-ips_lycees",
    "Indices de position sociale des lycées (2016-2021)",
    IPS_LYCEES,
    false,
    parUai("rentree_scolaire"),
  ),
  ips_lycees_2022: source(
    "ips_lycees_2022",
    "fr-en-ips-lycees-ap2022",
    "Indices de position sociale des lycées (2022)",
    [...IPS_LYCEES, "effectifs_voie_gt", "effectifs_voie_pro", "effectifs_ensemble_gt_pro"],
    false,
    parUai("rentree_scolaire"),
  ),
  ips_erea_2016: source(
    "ips_erea_2016",
    "fr-en-ips_erea",
    "Indices de position sociale des EREA (2016-2021)",
    IPS_ETAB,
    false,
    parUai("rentree_scolaire"),
  ),
  ips_erea: source(
    "ips_erea",
    "fr-en-ips-erea-ap2022",
    "Indices de position sociale des EREA (à partir de 2022)",
    [...IPS_ETAB, ...cols("ips_{departemental,academique,national}_{public,prive}")],
    false,
    parUai("rentree_scolaire"),
  ),
  ivac: source(
    "ivac",
    "fr-en-indicateurs-valeur-ajoutee-colleges",
    "Indicateurs de valeur ajoutée des collèges",
    noms(
      "session,uai,secteur,nb_candidats_g,taux_de_reussite_g,va_du_taux_de_reussite_g,nb_candidats_p,taux_de_reussite_p",
      "note_a_l_ecrit_g,va_de_la_note_g,note_a_l_ecrit_p,taux_d_acces_6eme_3eme,nb_mentions_ab_g,nb_mentions_b_g,nb_mentions_tb_g",
    ),
    false,
    parUai("session"),
  ),
  ival_gt: source(
    "ival_gt",
    "fr-en-indicateurs-de-resultat-des-lycees-gt_v2",
    "Indicateurs de résultat des lycées d'enseignement général et technologique",
    IVAL,
    false,
    parUai("annee"),
  ),
  ival_pro: source(
    "ival_pro",
    "fr-en-indicateurs-de-resultat-des-lycees-pro_v2",
    "Indicateurs de résultat des lycées professionnels",
    IVAL,
    false,
    parUai("annee"),
  ),
  segregation: source(
    "segregation",
    "fr-en-indicateur_segregation_sociale_colleges",
    "Indicateurs de ségrégation sociale entre collèges dans les départements",
    noms(
      "annee,dep,nb_coll_calcul,poids_prive_calcul,i_entropie_tot,i_entropie_pu,i_entropie_pr,i_entropie_interpupr",
      "contrib_pu,contrib_pr,contrib_interpupr",
    ),
    false,
    parUai("annee", "dep"),
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
  2025: "balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-croisee-nature-fonction-2025",
};

/**
 * Fonction collèges (221) et lycées (222, 223), seules ou précédées d'un chapitre 90 à 94 ; 22 et ses chapitres
 * 90 à 94 (9322…) : non détaillée ; 24 (cités scolaires, M57) et ses chapitres (9324…) : signalée, hors montants par élève.
 */
const FONCTIONS_BUDGET = [
  ...["221", "222", "223", "22", "24"].flatMap((f) => ["", "90", "91", "92", "93", "94"].map((p) => `${p}${f}`)),
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
    millesime: { colonne: "exer", cles: ["categ", "ndept", "cregi", "lbudg"] },
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
