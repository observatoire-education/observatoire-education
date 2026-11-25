// Transport scolaire : montants par collectivité, poste et exercice (sources `transport_<exercice>`).
// Règles et inventaire : docs/budget-controles.md, section 10.
import type { IdCollectivite } from "@obs/shared/collectivites";
import { classe6, codeDepartement, collectiviteDuBudget, depenseReelle, investissement, type LigneBudget } from "./budget.ts";
import type { Db } from "./db.ts";
import { FONCTIONS_TRANSPORT_M14, FONCTIONS_TRANSPORT_M57 } from "./transport-constantes.ts";

/**
 * Collectivité qui porte une ligne de transport scolaire : celle du budget pour les régions, CTU, départements,
 * Métropole de Lyon et Ville de Paris ; `grp-<département>-<SIREN>` pour une intercommunalité (GFP) ou un syndicat
 * (SYND), rattaché au département de son siège. null si non reconnue (listée dans `transport_inconnus`).
 */
export function collectiviteTransport(l: LigneBudget & { siren?: string | null }): IdCollectivite | null {
  if (l.categ === "GFP" || l.categ === "SYND") {
    const dep = codeDepartement(l.ndept);
    const siren = l.siren?.trim();
    return dep && siren ? `grp-${dep}-${siren}` : null;
  }
  return collectiviteDuBudget(l);
}

const liste = (valeurs: readonly string[]) => valeurs.map((v) => `'${v}'`).join(", ");
const num = (c: string) => `coalesce(try_cast(${c} as double), 0)`;
/** Recette réelle d'une ligne : opérations budgétaires nettes au crédit, hors opérations d'ordre. */
const recetteReelle = `((${num("obnetcre")} - ${num("oobcre")}) - (${num("obnetdeb")} - ${num("oobdeb")}))`;
/** Ligne de transport scolaire selon la nomenclature (M14 : 252 seulement) ; les marqueurs M71 n'en sont pas. */
const estTransport = `((nomen in ('M57', 'M52') and fonction in (${liste(FONCTIONS_TRANSPORT_M57)}))
  or (nomen = 'M14' and fonction in (${liste(FONCTIONS_TRANSPORT_M14)})))`;

/** Exercices dont la vue `src_transport_<exercice>` existe. */
async function exercicesTransport(db: Db): Promise<number[]> {
  const r = await db.sql<{ n: string }>(
    "select table_name as n from information_schema.tables where regexp_matches(table_name, '^src_transport_[0-9]{4}$') order by 1",
  );
  return r.map((x) => Number(x.n.slice(-4)));
}

const COLONNES = ["categ", "ndept", "cregi", "lbudg", "siren"] as const;

/**
 * Étape de `ETAPES` : tables `transport_montants` (exercice, collectivite, libelle, poste, montant),
 * `transport_m71` (exercices d'une région tenus en M71, sans montant) et `transport_inconnus`.
 */
export async function etapeTransport(db: Db): Promise<string> {
  const exercices = await exercicesTransport(db);
  await db.executer(`create or replace table transport_collectivites
    (categ varchar, ndept varchar, cregi varchar, lbudg varchar, siren varchar, collectivite varchar)`);
  const src = exercices.length
    ? exercices.map((e) => `select ${e}::integer as exercice, ${COLONNES.join(", ")}, trim(nomen) as nomen, trim(fonction) as fonction,
        trim(compte) as compte, obnetdeb, obnetcre, oobdeb, oobcre from src_transport_${e}`).join("\nunion all\n")
    : `select null::integer as exercice, ${COLONNES.map((c) => `null::varchar as ${c}`).join(", ")}, null::varchar as nomen,
        null::varchar as fonction, null::varchar as compte, null::varchar as obnetdeb, null::varchar as obnetcre,
        null::varchar as oobdeb, null::varchar as oobcre where false`;
  if (exercices.length) {
    const combinaisons = await db.sql<Record<(typeof COLONNES)[number], string | null>>(
      `select distinct ${COLONNES.join(", ")} from (${src}) order by all`,
    );
    const lignes = combinaisons.map((l) => ({ ...l, collectivite: collectiviteTransport({ ...l, lbudg: l.lbudg ?? "" }) }));
    await db.sql(
      `insert into transport_collectivites
       select unnest(from_json($1::json,
         '[{"categ":"VARCHAR","ndept":"VARCHAR","cregi":"VARCHAR","lbudg":"VARCHAR","siren":"VARCHAR","collectivite":"VARCHAR"}]'),
         recursive := true)`,
      [JSON.stringify(lignes)],
    );
  }
  const jointure = COLONNES.map((c) => `s.${c} is not distinct from m.${c}`).join(" and ");
  return `
create or replace table transport_source as
select s.*, m.collectivite from (${src}) s join transport_collectivites m on ${jointure};

create or replace table transport_montants as
with postes as (
  select exercice, collectivite, lbudg, case
      when ${classe6} then 'fonctionnement'
      when ${investissement} then 'investissement'
      when compte like '70%' then 'produits_services' end as poste,
    case when compte like '70%' then ${recetteReelle} else ${depenseReelle} end as montant
  from transport_source
  where collectivite is not null and ${estTransport}
), libelles as (
  select collectivite, arg_max(lbudg, exercice) as libelle from transport_source where collectivite is not null group by collectivite
)
select p.exercice, p.collectivite, l.libelle, p.poste, sum(p.montant)::double as montant
from postes p join libelles l using (collectivite)
where p.poste is not null
group by all;

create or replace table transport_m71 as
select distinct exercice, collectivite from transport_source
where nomen = 'M71' and collectivite is not null
  and not exists (select 1 from transport_montants t where t.exercice = transport_source.exercice and t.collectivite = transport_source.collectivite);

create or replace table transport_inconnus as
select distinct exercice, categ, ndept, lbudg from transport_source where collectivite is null;
`;
}
