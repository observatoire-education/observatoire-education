// Balances DGFiP : collectivité de chaque budget, fonction normalisée, postes de dépense par niveau et secteur.
import type { IdCollectivite } from "@obs/shared/collectivites";
import { REGIONS } from "@obs/shared/collectivites";
import type { Db } from "./db.ts";

export interface LigneBudget {
  categ: string;
  ndept: string | null;
  cregi: string | null;
  lbudg: string;
  /** Code de la commune dans son département (3 caractères), pour les budgets de communes. */
  insee?: string | null;
}

/**
 * Codes DGFiP de l'outre-mer (constatés dans les balances 2020-2025) : 101 Guadeloupe, 102 Guyane, 103 Martinique,
 * 104 La Réunion, 106 Mayotte. Valeur : [département, région INSEE].
 */
const OUTRE_MER: Record<string, [string, string]> = {
  "101": ["971", "01"], "102": ["973", "03"], "103": ["972", "02"], "104": ["974", "04"], "106": ["976", "06"],
};

/** Département : `044` → `44`, `02A` → `2A` ; outre-mer `101` → `971`, `102` → `973`. null si le code n'est pas reconnu. */
function codeDepartement(ndept: string | null): string | null {
  const n = ndept?.trim();
  if (!n) return null;
  if (OUTRE_MER[n]) return OUTRE_MER[n][0];
  if (/^0\d\d$|^0\d[AB]$/.test(n)) return n.slice(1);
  return null;
}

/** Région : le code DGFiP (`cregi`, 3 caractères) est le code INSEE précédé d'un 0, sauf outre-mer (`OUTRE_MER`). */
function codeRegion(cregi: string | null): string | null {
  const c = cregi?.trim();
  if (!c || c.length !== 3) return null;
  const insee = OUTRE_MER[c] ? OUTRE_MER[c][1] : c.startsWith("0") ? c.slice(1) : null;
  return insee && REGIONS.some((r) => r.code === insee) ? insee : null;
}

/**
 * Code INSEE d'une commune : département DGFiP sans son 0 (`044` → `44`, `02A` → `2A`) suivi de `insee` ; outre-mer
 * (`101` à `106`) : `97` suivi de `insee` (`101` + `101` → `97101`, `102` + `302` → `97302`). null si incomplet.
 */
function codeCommune(ndept: string | null, insee: string | null | undefined): string | null {
  const n = ndept?.trim();
  const i = insee?.trim();
  if (!n || !i || !/^\d{3}$/.test(i)) return null;
  if (OUTRE_MER[n]) return `97${i}`;
  return /^0\d\d$|^0\d[AB]$/.test(n) ? `${n.slice(1)}${i}` : null;
}

/** Syndicats (catégorie `SYND`) : regroupés sous un seul identifiant, hors des montants par élève. */
export const ID_SYNDICATS = "syndicats";

/**
 * Collectivité qui porte un budget de la balance ; null si elle n'est pas reconnue (listée dans `budget_inconnus`).
 * Communes : `com-<code INSEE>` ; syndicats (SIVOS…) : tous sous `syndicats`, jamais attribués à une commune.
 */
export function collectiviteDuBudget(l: LigneBudget): IdCollectivite | null {
  const lbudg = l.lbudg.toUpperCase();
  switch (l.categ) {
    case "DEPT": {
      if (lbudg.includes("ALSACE")) return "cea";
      const dep = codeDepartement(l.ndept);
      return dep ? `dep-${dep}` : null;
    }
    case "REG": {
      const reg = codeRegion(l.cregi);
      return reg ? `reg-${reg}` : null;
    }
    case "ML":
      return "ml-lyon";
    case "Commune": {
      const code = codeCommune(l.ndept, l.insee);
      return code ? `com-${code}` : null;
    }
    case "SYND":
      return ID_SYNDICATS;
    case "PARIS":
      return "paris";
    case "CTU":
      for (const [mot, id] of [["CORSE", "ctu-corse"], ["MARTINIQUE", "ctu-martinique"], ["GUYANE", "ctu-guyane"]] as const) {
        if (lbudg.includes(mot)) return id;
      }
      return null;
    default:
      return null;
  }
}

/**
 * Fonction normalisée : 221, 222, 223 seuls ou précédés d'un chapitre 90 à 94 ;
 * 21 et tout code qui commence par 21 (211, 212, 213, détails locaux), seuls ou précédés d'un chapitre 90 à 94,
 * deviennent « 21 » (écoles) ;
 * 22 seul ou précédé d'un chapitre 90 à 94 (`9322`) devient « 22 » (non détaillée) ;
 * 24 (cités scolaires), seul ou préfixé (`9324`), devient « 24 » ; `924` est ignoré.
 * `922`, `932`… (chapitre + fonction 2, tout l'enseignement) sont ignorés.
 */
const RE_DETAILLEE = "^(9[0-4])?(221|222|223)$";
const RE_NON_DETAILLEE = "^(9[0-4])?22$";
const RE_CITES = "^(9[0-4])?24$";
const RE_ECOLES = "^(9[0-4])?21[0-9]*$";

export function fonctionNormalisee(code: string): "221" | "222" | "223" | "22" | "24" | "21" | null {
  if (new RegExp(RE_DETAILLEE).test(code)) return code.slice(-3) as "221" | "222" | "223";
  if (new RegExp(RE_CITES).test(code)) return "24";
  if (new RegExp(RE_ECOLES).test(code)) return "21";
  return new RegExp(RE_NON_DETAILLEE).test(code) ? "22" : null;
}

const num = (c: string) => `coalesce(try_cast(${c} as double), 0)`;

/** Dépense réelle d'une ligne de balance : opérations budgétaires nettes, hors opérations d'ordre. */
export const depenseReelle = `((${num("obnetdeb")} - ${num("oobdeb")}) - (${num("obnetcre")} - ${num("oobcre")}))`;

const fonctionSql = (c: string) =>
  `case when regexp_matches(${c}, '${RE_DETAILLEE}') then right(${c}, 3)
        when regexp_matches(${c}, '${RE_NON_DETAILLEE}') then '22'
        when regexp_matches(${c}, '${RE_CITES}') then '24'
        when regexp_matches(${c}, '${RE_ECOLES}') then '21' end`;

const unionAll = (exercices: number[], select: (e: number) => string, vide: string, op = "union all") =>
  exercices.length ? exercices.map(select).join(`\n${op}\n`) : vide;

/** Exercices dont la vue `src_budget_<exercice>` existe. */
export async function exercicesPresents(db: Db): Promise<number[]> {
  const r = await db.sql<{ n: string }>(
    "select table_name as n from information_schema.tables where regexp_matches(table_name, '^src_budget_[0-9]{4}$') order by 1",
  );
  return r.map((x) => Number(x.n.slice(-4)));
}

/** Étape de `ETAPES` : remplit `budget_collectivites` (TypeScript) puis renvoie le SQL des tables de budget. */
export async function etapeBudget(db: Db): Promise<string> {
  const exercices = await exercicesPresents(db);
  await db.executer(`create or replace table budget_collectivites
    (categ varchar, ndept varchar, cregi varchar, lbudg varchar, insee varchar, collectivite varchar)`);
  if (exercices.length) {
    const combinaisons = await db.sql<LigneBudget>(
      unionAll(exercices, (e) => `select categ, ndept, cregi, lbudg, insee from src_budget_${e}`, "", "union") +
        " order by categ, ndept, cregi, lbudg, insee",
    );
    // lbudg reste null s'il est null à la source : la jointure compare avec `is not distinct from`.
    const lignes = combinaisons.map((l) => ({ ...l, collectivite: collectiviteDuBudget({ ...l, lbudg: l.lbudg ?? "" }) }));
    await db.sql(
      `insert into budget_collectivites
       select unnest(from_json($1::json,
         '[{"categ":"VARCHAR","ndept":"VARCHAR","cregi":"VARCHAR","lbudg":"VARCHAR","insee":"VARCHAR","collectivite":"VARCHAR"}]'),
         recursive := true)`,
      [JSON.stringify(lignes)],
    );
  }
  return sqlBudget(exercices);
}

const JOINTURE = `join budget_collectivites m on b.categ is not distinct from m.categ and b.ndept is not distinct from m.ndept
  and b.cregi is not distinct from m.cregi and b.lbudg is not distinct from m.lbudg and b.insee is not distinct from m.insee`;

const classe6 = "(compte like '6%' and compte not like '68%' and compte not like '675%' and compte not like '676%')";
const investissement = "(compte like '20%' or compte like '21%' or compte like '23%')";
/**
 * Contribution aux collèges privés : correspondance exacte (`655112` commence par `65511`).
 * M57 `655122` (dotations de fonctionnement des lycées privés) : en fonction 221, c'est le forfait des collèges privés
 * imputé au compte voisin (Corrèze et Nièvre 2024-2025, Martinique 2020 ; voir docs/budget-controles.md).
 */
const comptePrive = "((nomen = 'M52' and compte = '65512') or (nomen = 'M57' and compte in ('655112', '655122')))";
/**
 * Écoles : comptes hors des écoles publiques de la commune, exclus de ses postes. 6558 (autres contributions
 * obligatoires, M14 et M57) mêle le forfait des écoles privées sous contrat et les frais de scolarité versés à d'autres
 * communes, que les comptes ne séparent pas ; 2042 : subventions d'équipement aux personnes de droit privé. Même règle
 * que la part privée des collèges (voir docs/budget-controles.md, section 9).
 */
const horsEcolesPubliques = "(compte = '6558' or compte like '2042%')";

/**
 * Tables `budget_lignes`, `budget_postes` (niveaux collèges, lycées et écoles), `budget_non_detaille`, `budget_cites`
 * et `budget_inconnus`
 * (suppose `budget_collectivites` remplie).
 */
export function sqlBudget(exercices: number[]): string {
  const lignes = unionAll(
    exercices,
    (e) => `select ${e}::integer as exercice, m.collectivite, trim(b.nomen) as nomen, ${fonctionSql("trim(b.fonction)")} as fonction,
      trim(b.compte) as compte, sum(${depenseReelle})::double as montant
    from src_budget_${e} b ${JOINTURE}
    where m.collectivite is not null and ${fonctionSql("trim(b.fonction)")} is not null
    group by all`,
    "select null::integer as exercice, null::varchar as collectivite, null::varchar as nomen, null::varchar as fonction, null::varchar as compte, null::double as montant where false",
  );
  const inconnus = unionAll(
    exercices,
    (e) => `select distinct ${e}::integer as exercice, b.ident, b.lbudg from src_budget_${e} b ${JOINTURE} where m.collectivite is null`,
    "select null::integer as exercice, null::varchar as ident, null::varchar as lbudg where false",
  );
  return `
create or replace table budget_lignes as ${lignes};

create or replace table budget_inconnus as ${inconnus};

create or replace table budget_postes as
with c as (
  select exercice, collectivite, nomen, fonction, compte, montant,
    case when fonction = '221' then 'colleges' else 'lycees' end as niveau
  from budget_lignes
  where (fonction = '221' and collectivite not like 'reg-%')
     or (fonction in ('222', '223') and (collectivite like 'reg-%' or collectivite like 'ctu-%'))
), s as (
  select *, case when niveau = 'colleges' then (case when ${comptePrive} or compte like '2042%' then 'prive' else 'public' end)
                 else (case when fonction = '222' then 'public' else 'prive' end) end as secteur
  from c
)
select exercice, collectivite, niveau, secteur, poste, sum(montant)::double as montant from (
  select *, case
    when secteur = 'public' then
      case when compte like '64%' then 'personnel'
           when ${classe6} then 'fonctionnement_hors_personnel'
           when ${investissement} then 'investissement' end
    when niveau = 'colleges' then
      case when ${comptePrive} then 'fonctionnement' when compte like '2042%' then 'investissement' end
    else case when ${classe6} then 'fonctionnement' when ${investissement} then 'investissement' end
  end as poste from s
) where poste is not null
group by exercice, collectivite, niveau, secteur, poste

union all

-- Écoles : la commune (la Ville de Paris pour la commune 75056), public seulement ; syndicats et intercommunalités exclus.
select exercice, collectivite, 'ecoles' as niveau, 'public' as secteur, poste, sum(montant)::double as montant from (
  select exercice, case when collectivite = 'paris' then 'com-75056' else collectivite end as collectivite, montant, case
    when compte like '64%' then 'personnel'
    when ${horsEcolesPubliques} then null
    when ${classe6} then 'fonctionnement_hors_personnel'
    when ${investissement} then 'investissement' end as poste
  from budget_lignes
  where fonction = '21' and (collectivite like 'com-%' or collectivite = 'paris')
) where poste is not null
group by exercice, collectivite, niveau, secteur, poste;

create or replace table budget_non_detaille as
select distinct l.exercice, l.collectivite, n.niveau
from budget_lignes l
join (values ('colleges'), ('lycees')) n(niveau) on
  (n.niveau = 'colleges' and l.collectivite not like 'reg-%') or (n.niveau = 'lycees' and (l.collectivite like 'reg-%' or l.collectivite like 'ctu-%'))
where l.fonction = '22'
  and not exists (
    select 1 from budget_lignes d
    where d.exercice = l.exercice and d.collectivite = l.collectivite
      and ((n.niveau = 'colleges' and d.fonction = '221') or (n.niveau = 'lycees' and d.fonction in ('222', '223'))));

create or replace table budget_cites as
select exercice, collectivite, sum(montant)::double as montant
from budget_lignes
where fonction = '24' and (${classe6} or ${investissement})
group by exercice, collectivite;
`;
}
