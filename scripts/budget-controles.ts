// Contrôles du budget des collectivités sur les balances DGFiP réelles (tâche 4 de la phase 3).
// `OBS_DEPOT=local bun scripts/budget-controles.ts [--manifest <chemin>] [--hors-ligne]`
// Imprime un rapport : chaque contrôle a un critère écrit et un verdict (RÉUSSI / À EXAMINER).
// --manifest : manifest à lire (par défaut archives/manifest.json ; une copie locale peut contenir les exercices de budget).
// --hors-ligne : saute les contrôles qui interrogent l'OFGL et data.economie.gouv.fr (6 requêtes au plus).
import { readFileSync } from "node:fs";
import { collectiviteDe, type NiveauBudget } from "@obs/shared/collectivites";
import { Manifest } from "../pipeline/src/archive.ts";
import { assurerCache } from "../pipeline/src/collect.ts";
import { type Db, ouvrir } from "../pipeline/src/db.ts";
import { type Depot, DepotGithub, DepotLocal } from "../pipeline/src/depot.ts";
import { API_ECO, EXERCICES_BUDGET } from "../pipeline/src/sources.ts";
import { AGRICOLE, CITES_SCOLAIRES, SEUIL_PERSONNEL_PAR_ELEVE } from "../pipeline/src/budget-constantes.ts";

const args = process.argv.slice(2);
const option = (nom: string) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const cheminManifest = option("--manifest") ?? process.env.OBS_MANIFEST ?? "archives/manifest.json";
const horsLigne = args.includes("--hors-ligne");

const fmt = (n: number, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const meur = (n: number) => `${fmt(n / 1e6, 2)} M€`;
const titre = (t: string) => console.log(`\n=== ${t} ===`);
const critere = (t: string) => console.log(`critère : ${t}`);
const verdict = (ok: boolean, detail = "") => console.log(`verdict : ${ok ? "RÉUSSI" : "À EXAMINER"}${detail ? ` (${detail})` : ""}`);

function depot(): Depot {
  if (process.env.OBS_DEPOT === "local") return new DepotLocal(".cache/depot");
  const config = JSON.parse(readFileSync("observatoire.config.json", "utf8")) as { DEPOT: string };
  return new DepotGithub(config.DEPOT);
}

async function json<T>(url: string, params: Record<string, string>): Promise<T> {
  const r = await fetch(`${url}?${new URLSearchParams(params)}`);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

/** Établissements du périmètre et leur collectivité (collèges : niveau collèges ; LEGT, LPO, LP : lycées ; EREA écartés). */
async function chargerEleves(db: Db): Promise<void> {
  const etabs = await db.sql<{ uai: string; famille: string; dep: string; code_commune: string }>(
    "select uai, famille, dep, code_commune from etablissements where famille <> 'erea'",
  );
  const lignes = etabs.map((e) => {
    const niveau: NiveauBudget = e.famille === "college" ? "colleges" : "lycees";
    return { uai: e.uai, niveau, collectivite: collectiviteDe(niveau, e.dep, e.code_commune ?? "") };
  });
  await db.sql(
    `create or replace table etab_collectivite as select unnest(from_json($1::json,
       '[{"uai":"VARCHAR","niveau":"VARCHAR","collectivite":"VARCHAR"}]'), recursive := true)`,
    [JSON.stringify(lignes)],
  );
  // Élèves de la rentrée N−1 pour l'exercice N, par collectivité, niveau et secteur.
  await db.executer(`create or replace table eleves_collectivite as
    select f.rentree + 1 as exercice, c.collectivite, c.niveau,
      case when e.secteur = 'public' then 'public' else 'prive' end as secteur, sum(f.eleves)::double as eleves
    from effectifs f join etablissements e using (uai) join etab_collectivite c using (uai)
    where f.eleves is not null group by all`);
}

const ATTENDUS_REG = ["01", "04", "11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93"];

// --- 1. Formule de la dépense réelle -------------------------------------------------------------------
async function controleFormule(db: Db): Promise<void> {
  titre("1. Formule de la dépense réelle (comparaison avec l'OFGL, 2024)");
  critere("écart < 1 % entre la classe 6 de la fonction 221 et l'agrégat OFGL « Dépenses de fonctionnement » de la fonction 221");
  if (horsLigne) return console.log("hors ligne : contrôle sauté");
  let ok = true;
  for (const dep of ["44", "59", "33"]) {
    // Une requête par département.
    const r = await json<{ results: { agregat: string; montant: number }[] }>(
      "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-departements-fonctionnelle/records",
      {
        where: `exer=date'2024' and dep_code='${dep}' and type_de_budget='Budget principal' and fonction='221'`,
        select: "agregat, montant",
        limit: "100",
      },
    );
    const ofgl = (a: string) => r.results.find((x) => x.agregat === a)?.montant ?? NaN;
    const [n] = await db.sql<{ f: number; p: number; i: number }>(
      `select sum(montant) filter (where compte like '6%' and compte not like '68%' and compte not like '675%' and compte not like '676%') as f,
         sum(montant) filter (where compte like '64%') as p,
         sum(montant) filter (where compte like '20%' or compte like '21%' or compte like '23%') as i
       from budget_lignes where exercice = 2024 and collectivite = 'dep-${dep}' and fonction = '221'`,
    );
    const ecart = (a: number, b: number) => `${fmt(((a - b) / b) * 100, 2)} %`;
    const fo = ofgl("Dépenses de fonctionnement");
    const e = Math.abs((n!.f - fo) / fo);
    ok &&= e < 0.01;
    console.log(`dep-${dep} fonctionnement : balances ${meur(n!.f)}, OFGL ${meur(fo)}, écart ${ecart(n!.f, fo)}`);
    console.log(`        (information) investissement 20+21+23 : ${meur(n!.i)} ; OFGL « Dépenses d'investissement hors remb » ${meur(ofgl("Dépenses d'investissement hors remb"))}, écart ${ecart(n!.i, ofgl("Dépenses d'investissement hors remb"))}`);
    console.log(`        (information) personnel 64 : ${meur(n!.p)} ; OFGL « Frais de personnel » ${meur(ofgl("Frais de personnel"))}, écart ${ecart(n!.p, ofgl("Frais de personnel"))}`);
  }
  verdict(ok, "formule (obnetdeb − oobdeb) − (obnetcre − oobcre)");
}

async function operationsDOrdre(db: Db, exercices: number[]): Promise<void> {
  console.log("lignes portant des opérations d'ordre (oobdeb ou oobcre non nul), par exercice :");
  for (const e of exercices) {
    const [r] = await db.sql<{ n: number; total: number; ordre: number }>(
      `select count(*)::int as n,
         count(*) filter (where coalesce(try_cast(oobdeb as double), 0) <> 0 or coalesce(try_cast(oobcre as double), 0) <> 0)::int as ordre,
         sum(coalesce(try_cast(oobdeb as double), 0)) as total
       from src_budget_${e}`,
    );
    console.log(`  ${e} : ${r!.ordre} lignes sur ${r!.n}, ${meur(r!.total)} au débit d'ordre`);
  }
}

// --- 2. Couverture -------------------------------------------------------------------------------------
async function controleCouverture(db: Db, exercices: number[]): Promise<void> {
  titre("2. Couverture par exercice");
  critere("toute collectivité attendue a des lignes 221 (collèges) ou 222 / 223 (lycées), ou figure dans budget_inconnus / budget_non_detaille avec une explication");
  const attendues = await db.sql<{ niveau: string; collectivite: string }>(
    "select distinct niveau, collectivite from etab_collectivite where collectivite is not null order by 1, 2",
  );
  let ok = true;
  for (const e of exercices) {
    const presentes = await db.sql<{ niveau: string; collectivite: string }>(
      `select distinct niveau, collectivite from budget_postes where exercice = ${e}`,
    );
    const nd = await db.sql<{ niveau: string; collectivite: string }>(
      `select niveau, collectivite from budget_non_detaille where exercice = ${e}`,
    );
    const inconnus = await db.sql<{ lbudg: string }>(`select lbudg from budget_inconnus where exercice = ${e}`);
    const a = (niv: string, l: { niveau: string; collectivite: string }[]) => new Set(l.filter((x) => x.niveau === niv).map((x) => x.collectivite));
    for (const niveau of ["colleges", "lycees"]) {
      const p = a(niveau, presentes);
      let att = a(niveau, attendues);
      // Alsace : la CEA existe depuis 2021 ; en 2020, Bas-Rhin et Haut-Rhin ont chacun leur budget (pas de fusion).
      if (e === 2020 && att.has("cea")) att = new Set([...[...att].filter((x) => x !== "cea"), "dep-67", "dep-68"]);
      const manquantes = [...att].filter((x) => !p.has(x) && !a(niveau, nd).has(x));
      const enTrop = [...p].filter((x) => !att.has(x));
      console.log(`${e} ${niveau.padEnd(8)} : ${p.size} collectivités avec des lignes (attendues ${att.size})` +
        `${manquantes.length ? ` ; sans lignes : ${manquantes.join(", ")}` : ""}${enTrop.length ? ` ; sans élèves rattachés : ${enTrop.join(", ")}` : ""}`);
      // Mayotte : le Département n'exerce pas la compétence (voir docs/budget-controles.md) ; seule absence expliquée.
      ok &&= manquantes.every((x) => x === "dep-976");
    }
    console.log(`     budget_non_detaille : ${nd.length ? nd.map((x) => `${x.collectivite} (${x.niveau})`).join(", ") : "aucun"} ; budget_inconnus : ${inconnus.length ? inconnus.map((x) => x.lbudg).join(", ") : "aucun"}`);
  }
  verdict(ok, "seule absence : Département de Mayotte, expliquée");
  const mayotte = await db.sql<{ exercice: number; fonction: string; compte: string; montant: number }>(
    `select exercice, fonction, compte, montant from budget_lignes where collectivite = 'dep-976' order by 1, 2, 3`,
  );
  console.log("Département de Mayotte, toutes ses lignes 22x :");
  for (const l of mayotte) console.log(`  ${l.exercice} ${l.fonction} ${l.compte.padEnd(7)} ${fmt(l.montant)} €`);
}

// --- 3. Seuil du personnel -----------------------------------------------------------------------------
async function controleSeuil(db: Db): Promise<void> {
  titre("3. Personnel rattaché aux collèges (2024)");
  critere("le seuil est dans le creux entre le groupe qui rattache son personnel et le groupe qui ne le rattache pas");
  const r = await db.sql<{ collectivite: string; personnel: number | null; eleves: number | null }>(
    `select c.collectivite, p.montant as personnel, e.eleves
     from (select distinct collectivite from budget_postes where exercice = 2024 and niveau = 'colleges') c
     left join budget_postes p on p.collectivite = c.collectivite and p.exercice = 2024 and p.niveau = 'colleges' and p.poste = 'personnel'
     left join eleves_collectivite e on e.collectivite = c.collectivite and e.exercice = 2024 and e.niveau = 'colleges' and e.secteur = 'public'
     order by 1`,
  );
  const v = r.map((x) => ({ ...x, parEleve: x.eleves ? (x.personnel ?? 0) / x.eleves : null }))
    .sort((a, b) => (a.parEleve ?? -1) - (b.parEleve ?? -1));
  for (const x of v) {
    console.log(`  ${x.collectivite.padEnd(15)} ${x.parEleve === null ? "sans élèves" : `${fmt(x.parEleve, 2).padStart(10)} € / élève`}  (${meur(x.personnel ?? 0)})`);
  }
  const au = v.filter((x) => x.parEleve !== null && x.parEleve >= SEUIL_PERSONNEL_PAR_ELEVE).length;
  const sous = v.filter((x) => x.parEleve !== null && x.parEleve < SEUIL_PERSONNEL_PAR_ELEVE).length;
  // Plus grand rapport entre deux valeurs successives (non nulles) : le creux.
  const nonNuls = v.filter((x) => (x.parEleve ?? 0) > 0);
  let creux = { bas: 0, haut: 0, rapport: 0 };
  for (let i = 1; i < nonNuls.length; i++) {
    const rapport = nonNuls[i]!.parEleve! / nonNuls[i - 1]!.parEleve!;
    if (rapport > creux.rapport) creux = { bas: nonNuls[i - 1]!.parEleve!, haut: nonNuls[i]!.parEleve!, rapport };
  }
  console.log(`plus grand creux : de ${fmt(creux.bas, 2)} à ${fmt(creux.haut, 2)} € / élève (× ${fmt(creux.rapport, 1)})`);
  console.log(`seuil retenu : ${fmt(SEUIL_PERSONNEL_PAR_ELEVE)} € / élève → ${au} collectivités rattachent leur personnel, ${sous} non`);
  verdict(SEUIL_PERSONNEL_PAR_ELEVE > creux.bas && SEUIL_PERSONNEL_PAR_ELEVE <= creux.haut);
  for (const e of [2020, 2021, 2022, 2023, 2025]) {
    const [c] = await db.sql<{ au: number; sous: number; zone: string | null }>(
      `with x as (select c.collectivite, coalesce(p.montant, 0) / e.eleves as v
        from (select distinct collectivite from budget_postes where exercice = ${e} and niveau = 'colleges') c
        join eleves_collectivite e on e.collectivite = c.collectivite and e.exercice = ${e} and e.niveau = 'colleges' and e.secteur = 'public'
        left join budget_postes p on p.collectivite = c.collectivite and p.exercice = ${e} and p.niveau = 'colleges' and p.poste = 'personnel')
       select count(*) filter (where v >= ${SEUIL_PERSONNEL_PAR_ELEVE})::int as au, count(*) filter (where v < ${SEUIL_PERSONNEL_PAR_ELEVE})::int as sous,
         string_agg(collectivite || ' ' || round(v)::int, ', ') filter (where v between ${SEUIL_PERSONNEL_PAR_ELEVE / 4} and ${SEUIL_PERSONNEL_PAR_ELEVE * 4}) as zone
       from x`,
    );
    console.log(`  ${e} : ${c!.au} au-dessus, ${c!.sous} en dessous ; entre ${fmt(SEUIL_PERSONNEL_PAR_ELEVE / 4)} et ${fmt(SEUIL_PERSONNEL_PAR_ELEVE * 4)} € : ${c!.zone ?? "aucune"}`);
  }
  const lycees = await db.sql<{ collectivite: string; v: number }>(
    `select p.collectivite, p.montant / e.eleves as v from budget_postes p
     join eleves_collectivite e on e.collectivite = p.collectivite and e.exercice = p.exercice and e.niveau = 'lycees' and e.secteur = 'public'
     where p.exercice = 2024 and p.niveau = 'lycees' and p.poste = 'personnel' order by 2`,
  );
  console.log(`lycées 2024, personnel par élève du public : ${lycees.map((x) => `${x.collectivite} ${fmt(x.v)}`).join(", ")}`);
}

// --- 4. Enseignement agricole --------------------------------------------------------------------------
async function controleAgricole(db: Db): Promise<void> {
  titre("4. Enseignement agricole (fonctions 222 / 223 des régions, 2024)");
  critere("un ensemble de comptes propre à l'enseignement agricole, présent dans toutes les régions → mode « isole » ; sinon « mention »");
  const r = await db.sql<{ fonction: string; compte: string; n: number; montant: number }>(
    `select fonction, compte, count(distinct collectivite)::int as n, sum(montant) as montant from budget_lignes
     where exercice = 2024 and fonction in ('222', '223') and (collectivite like 'reg-%' or collectivite like 'ctu-%')
       and (compte like '65%' or compte like '204%')
     group by all having abs(sum(montant)) >= 1e6 order by 1, 4 desc`,
  );
  for (const x of r) console.log(`  ${x.fonction} ${x.compte.padEnd(7)} ${String(x.n).padStart(2)} collectivités  ${meur(x.montant)}`);
  console.log("aucun compte propre à l'enseignement agricole : les balances ne donnent ni bénéficiaire ni libellé de ligne, et les dotations (655121 / 655122) et subventions (6574x, 204x) sont les comptes de tous les lycées");
  console.log(`mode retenu : ${AGRICOLE.mode}`);
  verdict(AGRICOLE.mode === "mention");
}

// --- 5. Cités scolaires --------------------------------------------------------------------------------
/** Reversements à des départements et régions : subventions de fonctionnement 65732 / 65733, d'équipement 20412 / 20413 (sous-comptes compris). */
const REVERSEMENT = "(compte like '65732%' or compte like '65733%' or compte like '20412%' or compte like '20413%')";
const RETENU = `((compte like '6%' and compte not like '68%' and compte not like '675%' and compte not like '676%')
  or compte like '20%' or compte like '21%' or compte like '23%')`;

async function controleCites(db: Db): Promise<void> {
  titre("5. Cités scolaires : reversements à d'autres collectivités (2024)");
  critere("les collectivités dont la part dépasse 3 % des dépenses retenues sont dans CITES_SCOLAIRES, avec leur part");
  const r = await db.sql<{ collectivite: string; niveau: string; part: number; rev: number; total: number }>(
    `with l as (select *, case when fonction = '221' then 'colleges' else 'lycees' end as niveau from budget_lignes
       where exercice = 2024 and ((fonction = '221' and collectivite not like 'reg-%') or (fonction in ('222', '223') and (collectivite like 'reg-%' or collectivite like 'ctu-%'))))
     select collectivite, niveau, sum(montant) filter (where ${REVERSEMENT}) as rev, sum(montant) filter (where ${RETENU}) as total,
       100 * coalesce(sum(montant) filter (where ${REVERSEMENT}), 0) / sum(montant) filter (where ${RETENU}) as part
     from l group by all having sum(montant) filter (where ${REVERSEMENT}) <> 0 order by part desc`,
  );
  for (const x of r) console.log(`  ${x.collectivite.padEnd(15)} ${x.niveau.padEnd(8)} ${fmt(x.part, 2).padStart(6)} %  (${meur(x.rev)} sur ${meur(x.total)})`);
  const au = new Map<string, number>();
  for (const x of r.filter((y) => y.part > 3)) au.set(x.collectivite, Math.max(au.get(x.collectivite) ?? 0, x.part));
  const ok = au.size === Object.keys(CITES_SCOLAIRES).length &&
    [...au].every(([id, p]) => CITES_SCOLAIRES[id] !== undefined && Math.abs(CITES_SCOLAIRES[id]! - p) < 0.5);
  verdict(ok, `au-dessus de 3 % : ${[...au.keys()].join(", ") || "aucune"}`);
  if (horsLigne) return;
  // Fonction 24 « Cités scolaires » (M57) : hors des fonctions 221 / 222 / 223, donc hors de l'extrait. Une requête.
  const f24 = await json<{ results: { categ: string; lbudg: string; dep: number }[] }>(
    `${API_ECO}/${EXERCICES_BUDGET[2024]}/records`,
    {
      select: "categ, lbudg, sum(obnetdeb - oobdeb - obnetcre + oobcre) as dep",
      where: `categ in ('REG','CTU','DEPT','ML','PARIS') and cbudg='1' and fonction in ('24','9024','9124','9324','9224','9424')
        and ((startswith(compte,'6') and not startswith(compte,'68') and not startswith(compte,'675') and not startswith(compte,'676'))
          or startswith(compte,'20') or startswith(compte,'21') or startswith(compte,'23'))`,
      group_by: "categ, lbudg",
      order_by: "dep desc",
      limit: "100",
    },
  );
  console.log("(information) fonction 24 « Cités scolaires », 2024, dépenses réelles classe 6 et 20 / 21 / 23 (non retenues) :");
  for (const x of f24.results) console.log(`  ${x.lbudg.padEnd(36)} ${meur(x.dep)}`);
}

// --- 6. Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon ------------------------------------------
async function controleCom(): Promise<void> {
  titre("6. Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon (balances 2024)");
  critere("une collectivité de ces territoires avec une fonction 221 / 222 → règle ajoutée ; sinon null");
  if (horsLigne) return console.log("hors ligne : contrôle sauté");
  const r = await json<{ results: { ndept: string }[] }>(`${API_ECO}/${EXERCICES_BUDGET[2024]}/records`, {
    select: "ndept", group_by: "ndept", limit: "200",
  });
  const om = r.results.map((x) => x.ndept).filter((d) => /^1\d\d$|^97/.test(d ?? ""));
  console.log(`codes de département outre-mer présents dans tout le jeu 2024 (toutes catégories) : ${om.join(", ")}`);
  console.log("101 Guadeloupe, 102 Guyane, 103 Martinique, 104 La Réunion, 106 Mayotte : aucun code pour les trois collectivités d'outre-mer");
  // Recherche par libellé de budget, toutes catégories (une requête).
  const libelles = await json<{ results: { categ: string; ndept: string; lbudg: string }[] }>(`${API_ECO}/${EXERCICES_BUDGET[2024]}/records`, {
    select: "categ, ndept, lbudg",
    where: "search(lbudg, 'MIQUELON') or search(lbudg, 'BARTHELEMY') or search(lbudg, 'SAINT-MARTIN') or search(lbudg, 'ST MARTIN')",
    group_by: "categ, ndept, lbudg",
    limit: "200",
  });
  const horsMetropole = libelles.results.filter((x) => !/^0\d[\dAB]$/.test(x.ndept ?? ""));
  console.log(`libellés contenant MIQUELON, BARTHELEMY, SAINT-MARTIN ou ST MARTIN : ${libelles.results.length} budgets, ` +
    `départements ${[...new Set(libelles.results.map((x) => x.ndept))].sort().join(", ")} ; hors métropole : ${horsMetropole.length}`);
  for (const x of horsMetropole) console.log(`  ${x.categ} ${x.ndept} ${x.lbudg}`);
  verdict(!om.some((d) => !["101", "102", "103", "104", "106"].includes(d)) && horsMetropole.length === 0, "collectiviteDe reste null pour 975, 977, 978");
}

// --- Compléments -----------------------------------------------------------------------------------------
async function controle655122(db: Db): Promise<void> {
  titre("7. Compte M57 655122 (dotations aux lycées privés) dans la fonction 221");
  critere("le compte est compté comme contribution au privé (collèges)");
  const r = await db.sql<{ exercice: number; collectivite: string; montant: number; prive: number | null }>(
    `select l.exercice, l.collectivite, l.montant, p.montant as prive from budget_lignes l
     left join budget_postes p on p.exercice = l.exercice and p.collectivite = l.collectivite and p.niveau = 'colleges'
       and p.secteur = 'prive' and p.poste = 'fonctionnement'
     where l.fonction = '221' and l.nomen = 'M57' and l.compte = '655122' order by 2, 1`,
  );
  for (const x of r) console.log(`  ${x.exercice} ${x.collectivite.padEnd(15)} 655122 ${meur(x.montant)} ; contribution aux collèges privés ${x.prive === null ? "absente" : meur(x.prive)}`);
  verdict(r.every((x) => x.prive !== null && x.prive >= x.montant - 0.5));
  const sansPrive = await db.sql<{ exercice: number; collectivite: string; eleves: number }>(
    `select e.exercice, e.collectivite, e.eleves from eleves_collectivite e
     where e.niveau = 'colleges' and e.secteur = 'prive' and e.eleves > 0
       and e.exercice in (select distinct exercice from budget_postes)
       and exists (select 1 from budget_postes p where p.exercice = e.exercice and p.collectivite = e.collectivite and p.niveau = 'colleges')
       and not exists (select 1 from budget_postes p where p.exercice = e.exercice and p.collectivite = e.collectivite
         and p.niveau = 'colleges' and p.secteur = 'prive' and p.poste = 'fonctionnement')
     order by 2, 1`,
  );
  console.log("(information) élèves de collèges privés sous contrat sans contribution au privé dans la fonction 221 :");
  for (const x of sansPrive) console.log(`  ${x.exercice} ${x.collectivite.padEnd(15)} ${fmt(x.eleves)} élèves du privé`);
}

async function controleAlsaceEt2025(db: Db): Promise<void> {
  titre("8. Alsace (2020 / 2021) et exercice 2025");
  critere("Alsace : dep-67 et dep-68 en 2020 seulement, cea à partir de 2021 ; 2025 : mêmes collectivités qu'en 2024");
  const alsace = await db.sql<{ collectivite: string; ex: number[] }>(
    "select collectivite, list(distinct exercice order by exercice) as ex from budget_postes where collectivite in ('cea', 'dep-67', 'dep-68') group by 1 order by 1",
  );
  for (const x of alsace) console.log(`  ${x.collectivite} : ${[...x.ex].join(", ")}`);
  const okA = alsace.length === 3 && alsace.every((x) => (x.collectivite === "cea" ? x.ex[0] === 2021 : x.ex.length === 1 && x.ex[0] === 2020));
  const diff = await db.sql<{ niveau: string; secteur: string; poste: string; n24: number; n25: number; seul24: string | null; seul25: string | null }>(
    `with a as (select distinct exercice, collectivite, niveau, secteur, poste from budget_postes where exercice in (2024, 2025))
     select niveau, secteur, poste, count(*) filter (where exercice = 2024)::int as n24, count(*) filter (where exercice = 2025)::int as n25,
       (select string_agg(collectivite, ', ') from a x where x.exercice = 2024 and x.niveau = a.niveau and x.secteur = a.secteur and x.poste = a.poste
         and not exists (select 1 from a y where y.exercice = 2025 and y.collectivite = x.collectivite and y.niveau = x.niveau and y.secteur = x.secteur and y.poste = x.poste)) as seul24,
       (select string_agg(collectivite, ', ') from a x where x.exercice = 2025 and x.niveau = a.niveau and x.secteur = a.secteur and x.poste = a.poste
         and not exists (select 1 from a y where y.exercice = 2024 and y.collectivite = x.collectivite and y.niveau = x.niveau and y.secteur = x.secteur and y.poste = x.poste)) as seul25
     from a group by all order by all`,
  );
  for (const x of diff) {
    console.log(`  ${x.niveau}/${x.secteur}/${x.poste} : 2024 ${x.n24}, 2025 ${x.n25}${x.seul24 ? ` ; seulement 2024 : ${x.seul24}` : ""}${x.seul25 ? ` ; seulement 2025 : ${x.seul25}` : ""}`);
  }
  const [t] = await db.sql<{ t24: number; t25: number }>(
    "select sum(montant) filter (where exercice = 2024) as t24, sum(montant) filter (where exercice = 2025) as t25 from budget_postes",
  );
  console.log(`  total des postes : 2024 ${meur(t!.t24)}, 2025 ${meur(t!.t25)} (${fmt(((t!.t25 - t!.t24) / t!.t24) * 100, 1)} %)`);
  const [c] = await db.sql<{ n24: number; n25: number }>(
    "select count(distinct collectivite) filter (where exercice = 2024)::int as n24, count(distinct collectivite) filter (where exercice = 2025)::int as n25 from budget_postes",
  );
  verdict(okA && c!.n24 === c!.n25, `${c!.n24} collectivités en 2024, ${c!.n25} en 2025`);
}

// --- Exécution -------------------------------------------------------------------------------------------
const manifest = Manifest.lire(cheminManifest);
const chemins = await assurerCache(manifest, depot(), ".cache/archives");
const db = await ouvrir(chemins);
const exercices = (await db.sql<{ e: number }>("select distinct exercice as e from budget_lignes order by 1")).map((x) => x.e);
console.log(`manifest : ${cheminManifest} ; exercices : ${exercices.join(", ")} ; seuil ${SEUIL_PERSONNEL_PAR_ELEVE} € ; agricole « ${AGRICOLE.mode} »`);
await chargerEleves(db);
await controleFormule(db);
await operationsDOrdre(db, exercices);
await controleCouverture(db, exercices);
await controleSeuil(db);
await controleAgricole(db);
await controleCites(db);
await controleCom();
await controle655122(db);
await controleAlsaceEt2025(db);
db.fermer();
