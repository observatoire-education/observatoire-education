// Successeurs des établissements fermés : déduction (deux règles), fichier manuel, contrôle des cycles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Fiche } from "@obs/shared/types";
import type { Db } from "./db.ts";
import { FAMILLES_COMPATIBLES_ECOLES, FAMILLES_VOISINES } from "./fiches.ts";

export interface Lien {
  de: string;
  vers: string;
  regle: 1 | 2 | "manuel";
}

export interface Ambigu {
  de: string;
  candidats: string[];
}

interface LienManuel {
  de: string;
  vers: string;
  motif: string;
}

export interface Manuels {
  ajouter: LienManuel[];
  retirer: LienManuel[];
}

export const CHEMIN_MANUELS = join(import.meta.dir, "..", "successeurs-manuels.json");

/** Écart maximal, en jours, entre la fermeture d'un établissement et l'ouverture de son successeur (règle 1). */
const JOURS_REGLE_1 = 92;

export function lireManuels(chemin = CHEMIN_MANUELS): Manuels {
  const m = JSON.parse(readFileSync(chemin, "utf8")) as Partial<Manuels>;
  return { ajouter: m.ajouter ?? [], retirer: m.retirer ?? [] };
}

/**
 * Pour chaque établissement fermé (famille, secteur et date de fermeture connus), les candidats de chaque règle.
 * Un candidat n'est jamais l'établissement lui-même ; il vient des établissements actifs ou des fermés
 * (UAI actives exclues des fermés : une UAI réutilisée n'est pas une fermeture), et n'était pas déjà fermé.
 */
const CANDIDATS_SQL = `
with compat(a, b) as (values %COMPAT%),
f as (
  select * from fermes
  where famille is not null and secteur is not null and date_fermeture is not null
    and uai not in (select uai from etablissements)
),
c as (
  select uai, famille, secteur, code_commune, date_ouverture, null::date as date_fermeture, adresse_n from etablissements
  union all
  select uai, famille, secteur, code_commune, date_ouverture, date_fermeture, adresse_n from fermes
  where uai not in (select uai from etablissements)
),
paires as (
  select f.uai as de, c.uai as vers, f.date_fermeture as ferme, c.date_ouverture as ouvre, f.adresse_n as adr_f, c.adresse_n as adr_c
  from f
  join compat on compat.a = f.famille
  join c on c.famille = compat.b and c.code_commune = f.code_commune and c.secteur = f.secteur and c.uai <> f.uai
    and (c.date_fermeture is null or c.date_fermeture > f.date_fermeture)
)
select de, vers, 1 as regle from paires
  where ouvre is not null and abs(date_diff('day', ferme, ouvre)) <= ${JOURS_REGLE_1}
union all
select de, vers, 2 as regle from paires
  where (ouvre is null or ouvre <= ferme) and adr_f is not null and adr_f = adr_c
order by de, regle, vers`;

/**
 * Règle 1 (ouvert à 92 jours ou moins de la fermeture), sinon règle 2 (ouvert à la date de fermeture, même adresse) :
 * un lien seulement si la règle a un candidat unique. Deux candidats ou plus : aucun lien, l'établissement est
 * signalé ambigu et la règle suivante n'est pas essayée.
 */
export async function deduireSuccesseurs(db: Db): Promise<{ liens: Lien[]; ambigus: Ambigu[] }> {
  // second degré : familles voisines ; écoles : familles compatibles (une maternelle ne passe jamais à une élémentaire seule)
  const compat = [...Object.entries(FAMILLES_VOISINES), ...Object.entries(FAMILLES_COMPATIBLES_ECOLES)]
    .flatMap(([a, bs]) => bs.map((b) => `('${a}', '${b}')`))
    .join(", ");
  const lignes = await db.sql<{ de: string; vers: string; regle: 1 | 2 }>(CANDIDATS_SQL.replace("%COMPAT%", compat));
  const liens: Lien[] = [];
  const ambigus: Ambigu[] = [];
  for (const [de, candidats] of Map.groupBy(lignes, (l) => l.de)) {
    for (const regle of [1, 2] as const) {
      const vers = [...new Set(candidats.filter((c) => Number(c.regle) === regle).map((c) => c.vers))].sort();
      if (vers.length === 0) continue;
      if (vers.length === 1) liens.push({ de, vers: vers[0]!, regle });
      else ambigus.push({ de, candidats: vers });
      break;
    }
  }
  return { liens, ambigus };
}

/** Le fichier manuel l'emporte : les retraits ôtent des liens déduits, les ajouts s'y ajoutent. Une UAI inconnue est une erreur. */
export function appliquerManuels(liens: Lien[], manuels: Manuels, connues: Set<string>): Lien[] {
  for (const [liste, l] of [...manuels.ajouter.map((l) => ["ajouter", l] as const), ...manuels.retirer.map((l) => ["retirer", l] as const)]) {
    for (const uai of [l.de, l.vers]) {
      if (!connues.has(uai)) throw new Error(`successeurs-manuels.json (${liste}) : UAI inconnue ${uai} (${l.de} → ${l.vers})`);
    }
  }
  const retires = new Set(manuels.retirer.map((l) => `${l.de}>${l.vers}`));
  const ajoutes = new Set(manuels.ajouter.map((l) => `${l.de}>${l.vers}`));
  return [
    ...liens.filter((l) => !retires.has(`${l.de}>${l.vers}`) && !ajoutes.has(`${l.de}>${l.vers}`)),
    ...[...ajoutes].filter((k) => !retires.has(k)).map((k): Lien => {
      const [de, vers] = k.split(">") as [string, string];
      return { de, vers, regle: "manuel" };
    }),
  ];
}

/** Échoue en citant les UAI d'un cycle (A → B → A, ou A → A). */
export function verifierCycles(liens: Lien[]): void {
  const suivants = Map.groupBy(liens, (l) => l.de);
  const etat = new Map<string, "en cours" | "fini">();
  const chemin: string[] = [];
  const visiter = (uai: string): void => {
    if (etat.get(uai) === "fini") return;
    if (etat.get(uai) === "en cours") {
      const cycle = [...chemin.slice(chemin.indexOf(uai)), uai];
      throw new Error(`cycle de successeurs : ${cycle.join(" → ")}`);
    }
    etat.set(uai, "en cours");
    chemin.push(uai);
    for (const l of suivants.get(uai) ?? []) visiter(l.vers);
    chemin.pop();
    etat.set(uai, "fini");
  };
  for (const uai of suivants.keys()) visiter(uai);
}

/** Pose successeurs et prédécesseurs sur les fiches ; un lien dont une extrémité n'a pas de fiche est ignoré. */
export function attacherSuccesseurs(fiches: Fiche[], liens: Lien[]): void {
  const parUai = new Map(fiches.map((f) => [f.uai, f]));
  for (const l of liens) {
    const de = parUai.get(l.de);
    const vers = parUai.get(l.vers);
    if (!de || !vers) continue;
    de.successeurs.push({ uai: vers.uai, nom: vers.nom, fermeLe: vers.fermeLe });
    vers.predecesseurs.push({ uai: de.uai, nom: de.nom, fermeLe: de.fermeLe });
  }
  for (const f of fiches) {
    f.successeurs.sort((a, b) => a.uai.localeCompare(b.uai));
    f.predecesseurs.sort((a, b) => a.uai.localeCompare(b.uai));
  }
}
