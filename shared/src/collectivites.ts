// Collectivités compétentes pour les collèges (départements) et les lycées (régions),
// régions, et rattachement d'une commune à sa collectivité.

/** Identifiant d'une collectivité : `dep-44`, `reg-52`, `ml-lyon`, `paris`, `cea`, `ctu-corse`, `ctu-martinique`, `ctu-guyane`. */
export type IdCollectivite = string;
export type NiveauBudget = "colleges" | "lycees";

/** Les 18 régions (codes INSEE) et leurs départements (codes au format du site). Le 975 n'a pas de région. */
export const REGIONS: readonly { code: string; libelle: string; deps: readonly string[] }[] = [
  { code: "11", libelle: "Île-de-France", deps: ["75", "77", "78", "91", "92", "93", "94", "95"] },
  { code: "24", libelle: "Centre-Val de Loire", deps: ["18", "28", "36", "37", "41", "45"] },
  { code: "27", libelle: "Bourgogne-Franche-Comté", deps: ["21", "25", "39", "58", "70", "71", "89", "90"] },
  { code: "28", libelle: "Normandie", deps: ["14", "27", "50", "61", "76"] },
  { code: "32", libelle: "Hauts-de-France", deps: ["02", "59", "60", "62", "80"] },
  { code: "44", libelle: "Grand Est", deps: ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"] },
  { code: "52", libelle: "Pays de la Loire", deps: ["44", "49", "53", "72", "85"] },
  { code: "53", libelle: "Bretagne", deps: ["22", "29", "35", "56"] },
  { code: "75", libelle: "Nouvelle-Aquitaine", deps: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] },
  { code: "76", libelle: "Occitanie", deps: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"] },
  { code: "84", libelle: "Auvergne-Rhône-Alpes", deps: ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"] },
  { code: "93", libelle: "Provence-Alpes-Côte d'Azur", deps: ["04", "05", "06", "13", "83", "84"] },
  { code: "94", libelle: "Corse", deps: ["2A", "2B"] },
  { code: "01", libelle: "Guadeloupe", deps: ["971"] },
  { code: "02", libelle: "Martinique", deps: ["972"] },
  { code: "03", libelle: "Guyane", deps: ["973"] },
  { code: "04", libelle: "La Réunion", deps: ["974"] },
  { code: "06", libelle: "Mayotte", deps: ["976"] },
];

/** Code de la région d'un département ; null pour le 975 (Saint-Pierre-et-Miquelon) ou un code inconnu. */
export function regionDe(dep: string): string | null {
  return REGIONS.find((r) => r.deps.includes(dep))?.code ?? null;
}

/**
 * Communes de la Métropole de Lyon (EPCI 200046977), arrondissements de Lyon (69381 à 69389) compris.
 * Source : https://geo.api.gouv.fr/epcis/200046977/communes ; copie du 2026-11-24.
 */
export const COMMUNES_METROPOLE_LYON: ReadonlySet<string> = new Set([
  "69003", "69029", "69033", "69034", "69040", "69044", "69046", "69063", "69068", "69069",
  "69071", "69072", "69081", "69085", "69087", "69088", "69089", "69091", "69096", "69100",
  "69116", "69117", "69123", "69127", "69142", "69143", "69149", "69153", "69163", "69168",
  "69191", "69194", "69199", "69202", "69204", "69205", "69207", "69233", "69244", "69250",
  "69256", "69259", "69260", "69266", "69271", "69273", "69275", "69276", "69278", "69279",
  "69282", "69283", "69284", "69286", "69290", "69292", "69293", "69296",
  "69381", "69382", "69383", "69384", "69385", "69386", "69387", "69388", "69389",
]);

/**
 * Collectivité qui porte les dépenses des collèges (départements) ou des lycées (régions) d'une commune.
 * null : aucune collectivité (Mayotte) ou collectivité non identifiée (Saint-Martin, Saint-Barthélemy,
 * Saint-Pierre-et-Miquelon) ; `motifSansCollectivite` dit lequel.
 */
export function collectiviteDe(niveau: NiveauBudget, dep: string, codeCommune: string): IdCollectivite | null {
  if (dep === "975" || codeCommune.startsWith("977") || codeCommune.startsWith("978")) return null;
  if (dep === "2A" || dep === "2B") return "ctu-corse";
  if (dep === "972") return "ctu-martinique";
  if (dep === "973") return "ctu-guyane";
  if (dep === "976") return null; // Mayotte : le Département ne finance ni collèges ni lycées dans les balances
  if (niveau === "lycees") {
    const region = regionDe(dep);
    return region ? `reg-${region}` : null;
  }
  if (dep === "75") return "paris";
  if (dep === "67" || dep === "68") return "cea";
  if (dep === "69" && COMMUNES_METROPOLE_LYON.has(codeCommune)) return "ml-lyon";
  return `dep-${dep}`;
}

/** Pourquoi `collectiviteDe` renvoie null : Mayotte n'a aucune collectivité de rattachement, les autres ne sont pas identifiées. */
export function motifSansCollectivite(dep: string, _codeCommune: string): "aucune_collectivite" | "collectivite_non_identifiee" {
  return dep === "976" ? "aucune_collectivite" : "collectivite_non_identifiee";
}

/** Complément du nom de chaque département (« de la Loire-Atlantique » → « Département de Loire-Atlantique »). */
const DEPARTEMENTS: Record<string, string> = {
  "01": "de l'Ain", "02": "de l'Aisne", "03": "de l'Allier", "04": "des Alpes-de-Haute-Provence",
  "05": "des Hautes-Alpes", "06": "des Alpes-Maritimes", "07": "de l'Ardèche", "08": "des Ardennes",
  "09": "de l'Ariège", "10": "de l'Aube", "11": "de l'Aude", "12": "de l'Aveyron",
  "13": "des Bouches-du-Rhône", "14": "du Calvados", "15": "du Cantal", "16": "de la Charente",
  "17": "de la Charente-Maritime", "18": "du Cher", "19": "de la Corrèze", "21": "de la Côte-d'Or",
  "22": "des Côtes-d'Armor", "23": "de la Creuse", "24": "de la Dordogne", "25": "du Doubs",
  "26": "de la Drôme", "27": "de l'Eure", "28": "d'Eure-et-Loir", "29": "du Finistère",
  "30": "du Gard", "31": "de la Haute-Garonne", "32": "du Gers", "33": "de la Gironde",
  "34": "de l'Hérault", "35": "d'Ille-et-Vilaine", "36": "de l'Indre", "37": "d'Indre-et-Loire",
  "38": "de l'Isère", "39": "du Jura", "40": "des Landes", "41": "de Loir-et-Cher",
  "42": "de la Loire", "43": "de la Haute-Loire", "44": "de Loire-Atlantique", "45": "du Loiret",
  "46": "du Lot", "47": "de Lot-et-Garonne", "48": "de la Lozère", "49": "de Maine-et-Loire",
  "50": "de la Manche", "51": "de la Marne", "52": "de la Haute-Marne", "53": "de la Mayenne",
  "54": "de Meurthe-et-Moselle", "55": "de la Meuse", "56": "du Morbihan", "57": "de la Moselle",
  "58": "de la Nièvre", "59": "du Nord", "60": "de l'Oise", "61": "de l'Orne",
  "62": "du Pas-de-Calais", "63": "du Puy-de-Dôme", "64": "des Pyrénées-Atlantiques",
  "65": "des Hautes-Pyrénées", "66": "des Pyrénées-Orientales", "69": "du Rhône",
  "70": "de la Haute-Saône", "71": "de Saône-et-Loire", "72": "de la Sarthe", "73": "de la Savoie",
  "74": "de la Haute-Savoie", "76": "de la Seine-Maritime", "77": "de Seine-et-Marne",
  "78": "des Yvelines", "79": "des Deux-Sèvres", "80": "de la Somme", "81": "du Tarn",
  "82": "de Tarn-et-Garonne", "83": "du Var", "84": "de Vaucluse", "85": "de la Vendée",
  "86": "de la Vienne", "87": "de la Haute-Vienne", "88": "des Vosges", "89": "de l'Yonne",
  "90": "du Territoire de Belfort", "91": "de l'Essonne", "92": "des Hauts-de-Seine",
  "93": "de la Seine-Saint-Denis", "94": "du Val-de-Marne", "95": "du Val-d'Oise",
  "971": "de la Guadeloupe", "974": "de La Réunion", "976": "de Mayotte",
};

const FIXES: Record<string, string> = {
  "ml-lyon": "Métropole de Lyon",
  paris: "Ville de Paris",
  cea: "Collectivité européenne d'Alsace",
  "ctu-corse": "Collectivité de Corse",
  "ctu-martinique": "Collectivité territoriale de Martinique",
  "ctu-guyane": "Collectivité territoriale de Guyane",
};

/** Nom d'usage d'une collectivité (« Département de Loire-Atlantique », « Région Pays de la Loire »). */
export function libelleCollectivite(id: IdCollectivite): string {
  if (FIXES[id]) return FIXES[id];
  if (id.startsWith("reg-")) {
    const region = REGIONS.find((r) => r.code === id.slice(4));
    if (region) return `Région ${region.libelle}`;
  }
  if (id.startsWith("dep-")) {
    const complement = DEPARTEMENTS[id.slice(4)];
    if (complement) return `Département ${complement}`;
  }
  return id;
}
