// Indicateurs situés et répartitions.
// SQL (généré depuis les définitions ci-dessous) : mesures par établissement et par rentrée,
// moyennes Σ numérateurs / Σ dénominateurs par territoire, famille, secteur et rentrée.
// TypeScript : assemblage en objets Indicateur / Repartition.
import {
  CODES_INDICATEURS, type CodeIndicateur, type CodeRepartition, INDICATEURS, REPARTITIONS,
} from "@obs/shared/libelles";
import type {
  Comparaison, Famille, Indicateur, Mesure, Niveau, PartsReference, Repartition, Secteur, SourceId,
} from "@obs/shared/types";
import type { Db } from "./db.ts";
import { litteral } from "./duck.ts";
import { calculerIpsHistorique } from "./ips-historique.ts";

// --- Définitions ---

/** Une mesure calculée sur la table `base` (effectifs ⨝ personnels, par UAI et rentrée). */
interface DefMesure {
  code: Exclude<CodeIndicateur, "ips" | "ecart_type_ips">;
  num: string;
  den?: string;
  facteur?: number;
  /** « effectifs » : la source est le premier jeu d'effectifs de l'établissement. */
  source: "personnels" | "effectifs";
  /** Expression de la couverture (en %), si la valeur peut ne porter que sur une partie des élèves. */
  couverture?: string;
}

const part = (code: DefMesure["code"], num: string): DefMesure => ({
  code, num, den: "etp_ens", facteur: 100, source: "personnels",
});

export const MESURES: DefMesure[] = [
  { code: "eleves", num: "eleves", source: "effectifs" },
  { code: "etp_total", num: "etp_total", source: "personnels" },
  { code: "etp_enseignants", num: "etp_ens", source: "personnels" },
  { code: "etp_vs", num: "etp_vs", source: "personnels" },
  { code: "eleves_par_etp_ens", num: "eleves", den: "etp_ens", source: "personnels" },
  { code: "eleves_par_etp_vs", num: "eleves", den: "etp_vs", source: "personnels" },
  part("part_enseignantes", "etp_femmes"),
  part("part_non_titulaires", "etp_non_tit"),
  part("part_agreges", "etp_agreges"),
  part("part_moins_35", "etp_moins_35"),
  part("part_50_plus", "etp_50_plus"),
  part("part_anciennete_moins_2", "etp_anc_moins_2"),
  part("part_anciennete_8_plus", "etp_anc_8_plus"),
  {
    code: "part_filles", num: "filles_pub", den: "filles_pub + garcons_pub", facteur: 100, source: "effectifs",
    couverture: "least(100, 100 * (filles_pub + garcons_pub) / nullif(eleves, 0))",
  },
];

/**
 * Couverture minimale (en % des élèves) pour afficher une part calculée sur les seuls niveaux publiés
 * (décision du porteur, 2026-11-23). En dessous : « non disponible », et l'établissement n'entre pas
 * dans les moyennes ni dans les références.
 */
export const SEUIL_COUVERTURE = 50;

/** La DEPP ne publie pas les ETP de vie scolaire du privé. */
const NON_PUBLIES_PRIVE = new Set<CodeIndicateur>(["etp_vs", "eleves_par_etp_vs"]);

interface DefRepartition {
  code: CodeRepartition;
  /** Requête qui renvoie (uai, rentree, source, cats double[], couverture). */
  sql: string;
  source: SourceId;
  /** Familles concernées (toutes si absent). */
  familles?: Famille[];
}

const repPersonnels = (code: CodeRepartition, cats: string[]): DefRepartition => ({
  code,
  source: "personnels",
  sql: `select uai, rentree, 'personnels' as source, [${cats.join(", ")}]::double[] as cats, null::double as couverture
        from personnels`,
});

const repLangue = (code: "lv1" | "lv2", rang: 1 | 2): DefRepartition => ({
  code,
  source: "effectifs_colleges",
  familles: ["college"],
  sql: `select uai, rentree, 'effectifs_colleges' as source, list(eleves order by ordre)::double[] as cats, null::double as couverture
        from lv where rang = ${rang} group by uai, rentree`,
});

export const DEF_REPARTITIONS: DefRepartition[] = [
  repPersonnels("sexe_enseignants", ["etp_femmes", "etp_ens - etp_femmes"]),
  repPersonnels("statuts", ["etp_agreges", "etp_certifies", "etp_plp", "etp_autres_tit", "etp_non_tit"]),
  repPersonnels("ages", ["etp_moins_35", "etp_35_49", "etp_50_plus"]),
  repPersonnels("anciennete", ["etp_anc_moins_2", "etp_anc_2_4", "etp_anc_5_7", "etp_anc_8_plus"]),
  {
    code: "sexe_eleves",
    source: "effectifs_colleges",
    sql: `select uai, rentree, sources[1] as source, [filles_pub, garcons_pub]::double[] as cats,
            least(100, 100 * (filles_pub + garcons_pub) / nullif(eleves, 0)) as couverture
          from effectifs`,
  },
  repLangue("lv1", 1),
  repLangue("lv2", 2),
];

const NIVEAUX: Niveau[] = ["departement", "academie", "france"];
const NIVEAUX_REFERENCES: Niveau[] = ["departement", "france"];
const SECTEURS: Secteur[] = ["public", "prive_sous_contrat"];

/** Colonne de territoire de chaque niveau dans `etablissements`. */
const TERRITOIRE: Record<Niveau, string> = { departement: "dep", academie: "aca", france: "'FR'" };

// --- SQL (étape « 02 ») ---

function selectMesure(d: DefMesure): string {
  const source = d.source === "effectifs" ? "source_effectifs" : "'personnels'";
  return `select uai, rentree, ${litteral(d.code)} as code, ${source} as source, ${d.facteur ?? 1}::double as facteur,
      (${d.num})::double as num, ${d.den ? `(${d.den})::double` : "null::double"} as den,
      ${d.couverture ?? "null::double"} as couverture
    from base where (${d.num}) is not null`;
}

const parTerritoire = (select: (niveau: Niveau) => string) => NIVEAUX.map(select).join("\n  union all\n  ");

export function sqlIndicateurs(): string {
  return `
-- Effectifs et personnels par UAI et rentrée.
create or replace table base as
select
  coalesce(e.uai, p.uai) as uai,
  coalesce(e.rentree, p.rentree) as rentree,
  e.eleves, e.filles_pub, e.garcons_pub, e.sources[1] as source_effectifs,
  p.* exclude (uai, rentree)
from effectifs e
full outer join personnels p on p.uai = e.uai and p.rentree = e.rentree;

-- Une ligne par établissement, indicateur et rentrée. valeur = facteur × num / den (null si den nul ou absent).
create or replace table mesures as
select *, case when couverture < ${SEUIL_COUVERTURE} then null
               when den is null and code not in (${MESURES.filter((d) => d.den).map((d) => litteral(d.code)).join(", ")})
               then num when den > 0 then facteur * num / den end as valeur
from (
  ${MESURES.map(selectMesure).join("\n  union all\n  ")}
  union all
  select uai, rentree, 'ips', source, 1, ips, null, null from ips where ips is not null
  union all
  select uai, rentree, 'ecart_type_ips', source, 1, ecart_type, null, null from ips where ecart_type is not null
);

-- Moyennes Σ num / Σ den : seuls comptent les établissements du périmètre dont num et den sont présents, den > 0.
create or replace table moyennes as
with m as (
  select m.code, m.rentree, m.facteur, m.num, m.den, e.famille, e.secteur, e.dep, e.aca
  from mesures m join etablissements e using (uai)
  where m.den > 0 and m.num is not null and coalesce(m.couverture, 100) >= ${SEUIL_COUVERTURE}
)
select * from (
  ${parTerritoire((n) => `select code, '${n}' as niveau, ${TERRITOIRE[n]} as territoire, famille, secteur, rentree,
      any_value(facteur) * sum(num) / sum(den) as valeur, count(*)::integer as etablissements
    from m group by all`)}
);

-- Répartitions (barres empilées) : catégories en ETP ou en élèves, par établissement et rentrée.
create or replace table repartitions as
select r.*, list_count(cats) = len(cats) and list_sum(cats) > 0
  and coalesce(couverture, 100) >= ${SEUIL_COUVERTURE} as valide
from (
  ${DEF_REPARTITIONS.map((d) => `select ${litteral(d.code)} as code, * from (${d.sql})${
    d.familles ? ` where uai in (select uai from fiches_etab where famille in (${d.familles.map(litteral).join(", ")}))` : ""
  }`).join("\n  union all\n  ")}
) r;

-- Sommes de référence par catégorie (département et France, par famille et secteur).
create or replace table references_repartitions as
with u as (
  select r.code, r.rentree, e.famille, e.secteur, e.dep, unnest(r.cats) as x, generate_subscripts(r.cats, 1) as i
  from repartitions r join etablissements e using (uai)
  where r.valide
)
select code, 'departement' as niveau, dep as territoire, famille, secteur, rentree, list(s order by i) as sommes
from (select code, dep, famille, secteur, rentree, i, sum(x) as s from u group by all)
group by all
union all
select code, 'france', 'FR', famille, secteur, rentree, list(s order by i)
from (select code, famille, secteur, rentree, i, sum(x) as s from u group by all)
group by all;
`;
}

// --- Assemblage ---

interface Etab {
  uai: string;
  famille: Famille;
  secteur: Secteur;
  dep: string;
  aca: string;
}

const territoireDe = (e: Etab, n: Niveau) => (n === "departement" ? e.dep : n === "academie" ? e.aca : "FR");
const cle = (...p: (string | number)[]) => p.join("|");
const absente = (statut: Mesure["statut"] = "non_disponible", rentree: number | null = null): Mesure => ({
  valeur: null, statut, source: null, rentree,
});

async function etablissements(db: Db): Promise<Etab[]> {
  return db.sql<Etab>("select uai, famille, secteur, dep, aca from fiches_etab order by uai");
}

/** Dernière rentrée disponible par code (pour situer un établissement sans donnée). */
async function dernieresRentrees(db: Db, table: "moyennes" | "references_repartitions"): Promise<Map<string, number>> {
  const r = await db.sql<{ code: string; rentree: number }>(`select code, max(rentree) as rentree from ${table} group by code`);
  return new Map(r.map((x) => [x.code, x.rentree]));
}

export async function calculerIndicateurs(db: Db): Promise<Map<string, Indicateur[]>> {
  const etabs = await etablissements(db);
  const lignes = await db.sql<{
    uai: string; code: CodeIndicateur; rentree: number; source: SourceId; couverture: number | null;
    valeur: number | null;
  }>(`select uai, code, rentree, source, valeur, couverture from mesures
      where valeur is not null or couverture is not null order by uai, code, rentree`);
  const mesures = Map.groupBy(lignes, (l) => cle(l.uai, l.code));

  const moy = new Map(
    (await db.sql<{ code: string; niveau: Niveau; territoire: string; famille: string; secteur: string; rentree: number; valeur: number }>(
      "select code, niveau, territoire, famille, secteur, rentree, valeur from moyennes",
    )).map((m) => [cle(m.code, m.niveau, m.territoire, m.famille, m.secteur, m.rentree), m.valeur]),
  );
  const ipsSource = Map.groupBy(
    await db.sql<{
      uai: string; rentree: number; source: SourceId;
    }>("select uai, rentree, source from ips"),
    (r) => r.uai,
  );
  const ipsHistorique = await calculerIpsHistorique(db);
  const derniere = await dernieresRentrees(db, "moyennes");
  const derniereIps = (await db.sql<{ r: number }>("select max(rentree) as r from ips"))[0]?.r ?? null;

  const moyenne = (code: string, n: Niveau, e: Etab, secteur: Secteur, rentree: number, source: SourceId | null): Mesure => {
    const v = moy.get(cle(code, n, territoireDe(e, n), e.famille, secteur, rentree));
    return v === undefined ? absente("non_disponible", rentree) : { valeur: v, statut: "ok", source, rentree };
  };

  const resultat = new Map<string, Indicateur[]>();
  for (const e of etabs) {
    const prive = e.secteur === "prive_sous_contrat";
    const liste: Indicateur[] = [];
    for (const code of CODES_INDICATEURS) {
      const brut = mesures.get(cle(e.uai, code)) ?? [];
      const serie = brut.filter((l): l is typeof l & { valeur: number } => l.valeur !== null);
      const derniereLigne = serie.at(-1);
      let mesure: Mesure;
      let historique: [number, number][] = serie.map((l) => [l.rentree, l.valeur]);
      let sourcesHistorique: SourceId[] | undefined;
      if (prive && NON_PUBLIES_PRIVE.has(code)) {
        mesure = absente("non_publie_prive");
        historique = [];
      } else if (derniereLigne) {
        mesure = { valeur: derniereLigne.valeur, statut: "ok", source: derniereLigne.source, rentree: derniereLigne.rentree };
        if (derniereLigne.couverture !== null && derniereLigne.couverture < 100) mesure.couverture = derniereLigne.couverture;
        // La source de chaque point, quand elle change (IPS : un jeu par période).
        if (serie.some((l) => l.source !== derniereLigne.source)) sourcesHistorique = serie.map((l) => l.source);
      } else {
        mesure = absente();
        // part sous le seuil de couverture : la couverture reste connue, pour l'expliquer
        const c = brut.at(-1)?.couverture;
        if (c !== null && c !== undefined && c < SEUIL_COUVERTURE) {
          mesure = { ...absente("non_disponible", brut.at(-1)!.rentree), couverture: c };
        }
      }

      let comparaisons: Comparaison[] = [];
      const genre = INDICATEURS[code].genre;
      if (genre === "indice") {
        const r = mesure.rentree ?? derniereIps;
        const ligne = (ipsSource.get(e.uai) ?? []).find((x) => x.rentree === r);
        const m = (v: number | null | undefined, calculee = false): Mesure =>
          v === null || v === undefined ? absente("non_disponible", r) : { valeur: v, statut: "ok", source: calculee ? null : ligne!.source, rentree: r };
        // Moyenne publiée pour la rentrée, sinon calculée par l'observatoire (série du territoire).
        comparaisons = NIVEAUX.map((n) => {
          const point = ligne && ipsHistorique.serie(n, e.famille, territoireDe(e, n)).find((p) => p.rentree === r);
          return { niveau: n, public: m(point?.public, point?.calculee), prive: m(point?.prive, point?.calculee), calculee: point?.calculee ?? false };
        });
      } else if (genre === "ratio" || genre === "part") {
        const r = mesure.rentree ?? derniere.get(code);
        if (r !== undefined) {
          comparaisons = NIVEAUX.map((n) => ({
            niveau: n,
            public: moyenne(code, n, e, "public", r, mesure.source),
            prive: NON_PUBLIES_PRIVE.has(code)
              ? absente("non_publie_prive", r)
              : moyenne(code, n, e, "prive_sous_contrat", r, mesure.source),
            calculee: true,
          }));
        }
      }
      const indicateur: Indicateur = { code, mesure, comparaisons, historique };
      if (sourcesHistorique) indicateur.sourcesHistorique = sourcesHistorique;
      if (code === "ips") indicateur.referencesHistoriques = ipsHistorique.serie("departement", e.famille, e.dep);
      liste.push(indicateur);
    }
    resultat.set(e.uai, liste);
  }
  return resultat;
}

const enParts = (v: number[]): number[] => {
  const total = v.reduce((a, b) => a + b, 0);
  return v.map((x) => (100 * x) / total);
};

export async function calculerRepartitions(db: Db): Promise<Map<string, Repartition[]>> {
  const etabs = await etablissements(db);
  const lignes = await db.sql<{
    uai: string; code: CodeRepartition; rentree: number; source: SourceId | null; cats: (number | null)[];
    couverture: number | null; valide: boolean | null;
  }>("select uai, code, rentree, source, cats, couverture, valide from repartitions order by uai, code, rentree");
  const parUai = Map.groupBy(lignes, (l) => cle(l.uai, l.code));
  const refs = new Map(
    (await db.sql<{ code: string; niveau: Niveau; territoire: string; famille: string; secteur: string; rentree: number; sommes: number[] }>(
      "select * from references_repartitions",
    )).map((r) => [cle(r.code, r.niveau, r.territoire, r.famille, r.secteur, r.rentree), r.sommes]),
  );
  const derniere = await dernieresRentrees(db, "references_repartitions");

  const resultat = new Map<string, Repartition[]>();
  for (const e of etabs) {
    const liste: Repartition[] = [];
    for (const d of DEF_REPARTITIONS) {
      if (d.familles && !d.familles.includes(e.famille)) continue;
      const serie = parUai.get(cle(e.uai, d.code)) ?? [];
      const valide = serie.filter((l) => l.valide).at(-1);
      const rentree = valide?.rentree ?? serie.at(-1)?.rentree ?? derniere.get(d.code) ?? null;
      const references: PartsReference[] = NIVEAUX_REFERENCES.flatMap((n) =>
        SECTEURS.map((s) => {
          const sommes = rentree === null ? undefined : refs.get(cle(d.code, n, territoireDe(e, n), e.famille, s, rentree));
          return sommes
            ? { niveau: n, secteur: s, parts: enParts(sommes), statut: "ok" as const }
            : { niveau: n, secteur: s, parts: null, statut: "non_disponible" as const };
        }),
      );
      const r: Repartition = {
        code: d.code,
        categories: [...REPARTITIONS[d.code].categories],
        parts: valide ? enParts(valide.cats as number[]) : null,
        statut: valide ? "ok" : "non_disponible",
        references,
        source: valide?.source ?? d.source,
        rentree,
      };
      const couverture = (valide ?? serie.at(-1))?.couverture;
      if (couverture !== null && couverture !== undefined && couverture < 100) r.couverture = couverture;
      liste.push(r);
    }
    resultat.set(e.uai, liste);
  }
  return resultat;
}
