// Mise en forme des résultats (brevet, baccalauréat) : valeur ajoutée signée, un seul chiffre par établissement.
import { FINE, nombre } from "@obs/shared/format";
import { LIBELLES, LIBELLES_RESULTATS } from "@obs/shared/libelles";
import type { Famille, ResumeResultat, VoieResultat } from "@obs/shared/types";

/** Valeur ajoutée telle que publiée : « +3 », « −2 », « 0 » ; une décimale seulement si la source en a une. */
export function vaSignee(v: number): string {
  if (v === 0) return "0";
  const d = Number.isInteger(v) ? 0 : 1;
  return `${v > 0 ? "+" : ""}${nombre(v, d)}`;
}

const ETIQUETTES: Partial<Record<VoieResultat, string>> = { bac_gt: "GT", bac_pro: "pro" };

/** Taux de réussite sans décimale : « 92 % ». */
export const tauxEntier = (t: number): string => `${nombre(t, 0)}${FINE}%`;

/** Étiquette d'une voie dans une cellule à deux chiffres (« GT », « pro »), si l'établissement en a deux possibles. */
const etiquette = (r: ResumeResultat, plusieurs: boolean): string => (plusieurs ? `${ETIQUETTES[r.voie] ?? ""} `.trimStart() : "");

function cellule(r: ResumeResultat[], famille: Famille | undefined, texte: (x: ResumeResultat) => string | null): string {
  const presents = r.map((x) => ({ x, t: texte(x) })).filter((p) => p.t !== null);
  if (presents.length === 0) return LIBELLES.nonDisponible;
  const plusieurs = presents.length > 1 || famille === "lpo";
  return presents.map((p) => `${etiquette(p.x, plusieurs)}${p.t}`).join(" · ");
}

/** « 92 % », « GT 92 % · pro 85 % » (LPO), ou « non disponible ». */
export const celluleReussite = (r: ResumeResultat[], famille?: Famille): string =>
  cellule(r, famille, (x) => (x.taux === null ? null : tauxEntier(x.taux)));

/** Valeur ajoutée, même schéma : « +3 », « GT +3 · pro −1 ». */
export const celluleVa = (r: ResumeResultat[], famille?: Famille): string =>
  cellule(r, famille, (x) => (x.va === null ? null : vaSignee(x.va)));

/**
 * Note sous un tableau de résumés : « Réussite et valeur ajoutée : session 2025 » pour une seule source,
 * « … : bac GT : session 2025 · bac pro : session 2025 » pour plusieurs. Seules les sources dont au moins
 * un chiffre est affiché sont datées ; aucune : pas de note.
 */
export function noteSessions(listes: ResumeResultat[][]): string | null {
  const parSource = new Map<string, Set<number>>();
  for (const r of listes.flat()) {
    if (r.taux === null && r.va === null) continue;
    const s = LIBELLES_RESULTATS.sourcesCourtes[r.voie];
    (parSource.get(s) ?? parSource.set(s, new Set()).get(s)!).add(r.session);
  }
  if (parSource.size === 0) return null;
  const sessions = (x: Set<number>) => [...x].sort((a, b) => a - b).map(LIBELLES_RESULTATS.session).join(", ");
  const ordre = Object.values(LIBELLES_RESULTATS.sourcesCourtes) as string[];
  const mentions = [...parSource].sort(([a], [b]) => ordre.indexOf(a) - ordre.indexOf(b));
  const corps = mentions.length === 1 ? sessions(mentions[0]![1]) : mentions.map(([s, x]) => `${s} : ${sessions(x)}`).join(" · ");
  return `${LIBELLES_RESULTATS.noteSessions} : ${corps}`;
}

/** Clé de tri : le premier chiffre présent, « » sinon (absence toujours en fin). */
export const triReussite = (r: ResumeResultat[]): string => {
  const x = r.find((y) => y.taux !== null)?.taux;
  return x === null || x === undefined ? "" : String(x);
};
export const triVa = (r: ResumeResultat[]): string => {
  const x = r.find((y) => y.va !== null)?.va;
  return x === null || x === undefined ? "" : String(x);
};
