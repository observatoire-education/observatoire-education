// Élèves par niveau, sexe et langue : SQL généré depuis colonnes-eleves.ts, puis assemblage en objets Eleves.
// Règle : une valeur absente reste null, et un total est null dès qu'une de ses parties est null.
import type { Eleves, NiveauEleves, SourceId } from "@obs/shared/types";
import { type Composante, type DefJeu, JEUX_EFFECTIFS } from "./colonnes-eleves.ts";
import type { Db } from "./db.ts";
import { ident, litteral } from "./duck.ts";

const nb = (c: string) => `nombre(${ident(c)})`;

/** Somme stricte : null si une partie est null (l'addition SQL propage null). */
const somme = (cols: string[]) => (cols.length ? `(${cols.map(nb).join(" + ")})` : "null::double");

/**
 * Filles ou garçons d'un niveau. Si une partie n'a pas de répartition par sexe dans la source,
 * le résultat n'est connu que lorsque cette partie est vide (0 élève) ; sinon null.
 */
function sexe(composantes: Composante[], cle: "filles" | "garcons"): string {
  // Une partie sans élève compte 0 fille et 0 garçon, même si la source laisse la case vide
  // (constaté sur les jeux réels) : c'est une déduction certaine, pas un zéro inventé.
  const parties = composantes.flatMap((c) =>
    c[cle] ? [`(case when ${nb(c.eleves)} = 0 then 0 else ${nb(c[cle])} end)`] : [],
  );
  const total = parties.length ? `(${parties.join(" + ")})` : "null::double";
  const sans = composantes.filter((c) => !c[cle]);
  if (sans.length === 0) return total;
  return `(case when ${sans.map((c) => `${nb(c.eleves)} = 0`).join(" and ")} then ${total} end)`;
}

const uai = (j: DefJeu) => `upper(trim(${ident(j.uai)}))`;
const rentree = (j: DefJeu) => `rentree(${ident(j.rentree)})`;
const perimetre = "where uai in (select uai from fiches_etab) and rentree is not null";

function selectNiveaux(j: DefJeu): string[] {
  return j.niveaux.map((n) => {
    const select = `select ${uai(j)} as uai, ${rentree(j)} as rentree, ${n.ordre} as ordre, ${litteral(n.libelle)} as libelle,
      ${somme(n.composantes.map((c) => c.eleves))} as eleves,
      ${sexe(n.composantes, "filles")} as filles,
      ${sexe(n.composantes, "garcons")} as garcons
    from src_${j.source}`;
    if (!n.familles) return select;
    // Hors des familles du niveau, la ligne n'est gardée que si elle compte des élèves.
    return `select * from (${select}) where eleves > 0
      or uai in (select uai from fiches_etab where famille in (${n.familles.map(litteral).join(", ")}))`;
  });
}

function selectTotaux(j: DefJeu, ordreSource: number): string {
  return `select ${uai(j)} as uai, ${rentree(j)} as rentree, ${litteral(j.source)} as source, ${ordreSource} as ordre_source,
      ${nb(j.total)} as eleves,
      ${j.segpa ? nb(j.segpa) : "null::double"} as segpa,
      ${j.ulis ? nb(j.ulis) : "null::double"} as ulis,
      ${j.ueea ? nb(j.ueea) : "null::double"} as ueea,
      ${j.classes ? nb(j.classes) : "null::double"} as classes
    from src_${j.source}`;
}

function selectLangues(j: DefJeu): string[] {
  return j.langues.map(
    (l) => `select ${uai(j)} as uai, ${rentree(j)} as rentree, ${l.rang} as rang, ${l.ordre} as ordre,
      ${litteral(l.langue)} as langue, ${somme(l.colonnes)} as eleves
    from src_${j.source}`,
  );
}

/** Étape « 03 » du croisement : tables effectifs_niveaux, effectifs et lv. */
export function sqlEleves(): string {
  const jeux = [...JEUX_EFFECTIFS];
  return `
create or replace table effectifs_niveaux as
select * from (
  ${jeux.flatMap(selectNiveaux).join("\n  union all\n  ")}
) ${perimetre}
order by uai, rentree, ordre;

create or replace table effectifs_jeux as
select * from (
  ${jeux.map((j, i) => selectTotaux(j, i)).join("\n  union all\n  ")}
) ${perimetre};

-- Un établissement présent dans plusieurs jeux (LPO : GT et pro) additionne ses élèves, sans double compte.
create or replace table effectifs as
-- filles / garcons : stricts (null si un niveau est inconnu) ;
-- filles_pub / garcons_pub : sommes sur les niveaux publiés (décision « partielle + couverture »).
with sexes as (
  select uai, rentree,
    case when bool_and(filles is not null) then sum(filles) end as filles,
    case when bool_and(garcons is not null) then sum(garcons) end as garcons,
    sum(filles) filter (where filles is not null and garcons is not null) as filles_pub,
    sum(garcons) filter (where filles is not null and garcons is not null) as garcons_pub
  from effectifs_niveaux
  group by uai, rentree
)
select j.uai, j.rentree,
  case when bool_and(j.eleves is not null) then sum(j.eleves) end as eleves,
  any_value(s.filles) as filles,
  any_value(s.garcons) as garcons,
  any_value(s.filles_pub) as filles_pub,
  any_value(s.garcons_pub) as garcons_pub,
  max(j.segpa) as segpa,
  max(j.ulis) as ulis,
  max(j.ueea) as ueea,
  max(j.classes) as classes,
  list(j.source order by j.ordre_source) as sources
from effectifs_jeux j
left join sexes s on s.uai = j.uai and s.rentree = j.rentree
group by j.uai, j.rentree
order by j.uai, j.rentree;

create or replace table lv as
select * from (
  ${jeux.flatMap(selectLangues).join("\n  union all\n  ")}
) ${perimetre}
order by uai, rentree, rang, ordre;
`;
}

/** Élèves de la dernière rentrée connue de chaque établissement du périmètre. */
export async function calculerEleves(db: Db): Promise<Map<string, Eleves>> {
  const totaux = await db.sql<{
    uai: string; rentree: number; eleves: number | null; segpa: number | null; ulis: number | null; ueea: number | null;
    sources: SourceId[];
  }>(`select uai, rentree, eleves, segpa, ulis, ueea, sources from effectifs
      qualify row_number() over (partition by uai order by rentree desc) = 1`);
  const niveaux = await db.sql<NiveauEleves & { uai: string }>(
    `select n.uai, n.libelle, n.eleves, n.filles, n.garcons
     from effectifs_niveaux n
     join (select uai, max(rentree) as rentree from effectifs group by uai) d using (uai, rentree)
     order by n.uai, n.ordre`,
  );
  const parUai = Map.groupBy(niveaux, (n) => n.uai);
  // Le champ UEEA n'existe que pour les jeux qui le publient (écoles).
  const avecUeea = new Set<SourceId>(JEUX_EFFECTIFS.filter((j) => j.ueea).map((j) => j.source));
  const resultat = new Map<string, Eleves>();
  for (const t of totaux) {
    const e: Eleves = {
      rentree: t.rentree,
      total: t.eleves,
      niveaux: (parUai.get(t.uai) ?? []).map(({ libelle, eleves, filles, garcons }) => ({ libelle, eleves, filles, garcons })),
      segpa: t.segpa,
      ulis: t.ulis,
      source: t.sources,
    };
    if (t.sources.some((s) => avecUeea.has(s))) e.ueea = t.ueea;
    resultat.set(t.uai, e);
  }
  return resultat;
}
