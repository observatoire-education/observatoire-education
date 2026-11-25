// Transport scolaire dans les balances DGFiP : codes de fonction retenus selon la nomenclature comptable.
// Inventaire des exercices 2020 à 2025 : docs/budget-controles.md, section « Transport scolaire ».

/**
 * M57 et M52 : fonction 81 « transports scolaires » (seule ou précédée des chapitres 908 et 938) et fonction 252
 * « transports scolaires » du bloc enseignement (seule ou précédée des chapitres 902 et 932). Exclus : 82x
 * (transports publics de voyageurs), 90281 (fonction 281), 9025 et 9325 (fonction 25), 93881.
 */
export const FONCTIONS_TRANSPORT_M57 = ["81", "9081", "9381", "252", "90252", "93252"] as const;

/** M14 (communes, intercommunalités et syndicats jusqu'en 2023) : 252 seulement ; 81x y désigne les services urbains. */
export const FONCTIONS_TRANSPORT_M14 = ["252", "90252", "93252"] as const;

/**
 * M71 (régions jusqu'en 2022) : la nomenclature n'isole pas le transport scolaire de façon cohérente d'une région à
 * l'autre. Ces lignes ne sont pas des montants : elles servent seulement à savoir quels exercices d'une région sont
 * tenus en M71, pour le dire au lieu d'afficher une absence de dépense.
 */
export const FONCTIONS_MARQUEUR_M71 = ["93811", "93813", "93815"] as const;

export const CATEGORIES_TRANSPORT = ["REG", "CTU", "DEPT", "ML", "PARIS", "GFP", "SYND"] as const;

const liste = (valeurs: readonly string[]) => valeurs.map((v) => `"${v}"`).join(",");

/** Clause `where` ODSQL des sources `transport_<exercice>`. */
export const FILTRE_TRANSPORT = `cbudg = "1" and categ in (${liste(CATEGORIES_TRANSPORT)}) and (`
  + `(nomen in ("M57", "M52") and fonction in (${liste(FONCTIONS_TRANSPORT_M57)}))`
  + ` or (nomen = "M14" and fonction in (${liste(FONCTIONS_TRANSPORT_M14)}))`
  + ` or (nomen = "M71" and categ = "REG" and fonction in (${liste(FONCTIONS_MARQUEUR_M71)})))`;
