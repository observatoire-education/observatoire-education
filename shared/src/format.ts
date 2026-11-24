// Formatage à la française : virgule décimale, espace fine insécable (U+202F)
// pour les milliers et avant « % », signe moins typographique (U+2212).
import { LIBELLES_STATUT } from "./libelles.ts";
import type { SourceRef, Statut } from "./types.ts";

const FINE = " ";
const MOINS = "−";
const ABSENT = "—";

const formateurs = new Map<number, Intl.NumberFormat>();

function formateur(decimales: number): Intl.NumberFormat {
  let f = formateurs.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    formateurs.set(decimales, f);
  }
  return f;
}

/** Nombre avec `decimales` chiffres après la virgule ; « — » si absent. */
export function nombre(x: number | null, decimales = 1): string {
  if (x === null || !Number.isFinite(x)) return ABSENT;
  return formateur(decimales)
    .format(x)
    .replace(/[   ]/g, FINE)
    .replace(/^[-−]/, MOINS);
}

export function entier(x: number | null): string {
  return nombre(x, 0);
}

/** Part en pourcentage, une décimale : « 10,0 % ». */
export function part(x: number | null): string {
  return x === null ? ABSENT : `${nombre(x, 1)}${FINE}%`;
}

/** Montant en millions d'euros, une décimale : « 97,3 M€ ». */
export function millions(euros: number): string {
  return `${nombre(euros / 1e6, 1)}${FINE}M€`;
}

/** Écart à une moyenne, puis la moyenne : « −14,0 (106,4) ». */
export function ecart(valeur: number, moyenne: number, decimales = 1): string {
  const d = valeur - moyenne;
  const seuil = 0.5 * 10 ** -decimales;
  const e = Math.abs(d) < seuil ? nombre(0, decimales) : `${d > 0 ? "+" : ""}${nombre(d, decimales)}`;
  return `${e} (${nombre(moyenne, decimales)})`;
}

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Date ISO → « jj/mm/aaaa ». Une date seule est lue telle quelle ; un horodatage est converti à l'heure de Paris. */
export function date(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, j] = iso.split("-");
    return `${j}/${m}/${a}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`date invalide : ${iso}`);
  return formatDate.format(d);
}

/** « Source : {producteur}, {titre} · rentrée {r}-{r+1} · collecté le {jj/mm/aaaa} ». */
export function ligneSource(s: SourceRef): string {
  const morceaux = [`Source : ${s.producteur}, ${s.titre}`];
  if (s.rentree !== null) morceaux.push(`rentrée ${s.rentree}-${s.rentree + 1}`);
  morceaux.push(`collecté le ${date(s.collecteLe)}`);
  return morceaux.join(" · ");
}

/** Libellé exact d'une absence. Appeler avec « ok » est une erreur de programmation. */
export function absence(statut: Statut): string {
  if (statut === "ok") throw new Error("absence() appelée sur une mesure présente");
  return LIBELLES_STATUT[statut];
}
