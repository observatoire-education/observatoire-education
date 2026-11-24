// Mise en forme des mesures pour la page : valeur, comparaison « écart (moyenne) », couverture.
import { absence, ecart, entier, nombre, part } from "@obs/shared/format";
import { type CodeIndicateur, INDICATEURS } from "@obs/shared/libelles";
import type { Fiche, Indicateur, Mesure, Niveau, Repartition, Secteur, SourceId, SourceRef } from "@obs/shared/types";

export const indicateur = (f: Fiche, code: CodeIndicateur): Indicateur => {
  const i = f.indicateurs.find((x) => x.code === code);
  if (!i) throw new Error(`indicateur ${code} absent de la fiche ${f.uai}`);
  return i;
};

export const repartition = (f: Fiche, code: Repartition["code"]): Repartition | undefined =>
  f.repartitions.find((r) => r.code === code);

export const source = (f: Fiche, id: SourceId): SourceRef | undefined => f.sources.find((s) => s.id === id);

const decimales = (code: CodeIndicateur) => INDICATEURS[code].decimales;

/** Valeur formatée d'une mesure présente (« 14,8 », « 64,0 % », « 590 »). */
export function formater(code: CodeIndicateur, v: number): string {
  if (INDICATEURS[code].genre === "part") return part(v);
  if (code === "eleves") return entier(v);
  return nombre(v, decimales(code));
}

export const absente = (m: Mesure): boolean => m.statut !== "ok" || m.valeur === null;
export const refAbsente = (r: Mesure | undefined): boolean => !r || r.statut !== "ok" || r.valeur === null;

/** Valeur formatée, ou libellé exact de l'absence. */
export function valeur(code: CodeIndicateur, m: Mesure): string {
  return m.statut === "ok" && m.valeur !== null ? formater(code, m.valeur) : absence(m.statut === "ok" ? "non_disponible" : m.statut);
}

/** Sur le web : « −14,0 (106,4) » ; moyenne seule si l'établissement n'a pas de valeur ; absence sinon. */
export function comparaison(code: CodeIndicateur, reference: Mesure, mesure: Mesure): string {
  if (reference.statut !== "ok" || reference.valeur === null) {
    return absence(reference.statut === "ok" ? "non_disponible" : reference.statut);
  }
  if (mesure.statut !== "ok" || mesure.valeur === null) return `(${nombre(reference.valeur, decimales(code))})`;
  return ecart(mesure.valeur, reference.valeur, decimales(code));
}

export function reference(i: Indicateur, niveau: Niveau, secteur: Secteur): Mesure | undefined {
  const c = i.comparaisons.find((x) => x.niveau === niveau);
  return c ? (secteur === "public" ? c.public : c.prive) : undefined;
}

/** « (sur 67 % des élèves) », ou explication d'une part non disponible faute de couverture. */
export function texteCouverture(m: { couverture?: number; statut: Mesure["statut"] }): string | null {
  if (m.couverture === undefined) return null;
  const c = nombre(m.couverture, 0);
  return m.statut === "ok"
    ? `sur ${c} % des élèves (filles et garçons ne sont pas publiés pour tous les niveaux)`
    : `filles et garçons publiés pour ${c} % des élèves seulement`;
}

/** « 2025 » pour la carte d'un indicateur, ou rien. */
export const annee = (m: Mesure): string => (m.rentree === null ? "" : String(m.rentree));
export const anneeScolaire = (r: number | null): string => (r === null ? "" : `${r}-${r + 1}`);

/**
 * Complément d'une ligne de source sur la fiche A4 : « moyennes publiées par la DEPP » pour les jeux actuels d'IPS,
 * sauf si les comparaisons d'IPS de la fiche sont calculées par l'observatoire (IPS d'une rentrée sans moyenne
 * publiée) ; rien pour les autres jeux d'IPS, l'Annuaire et les résultats ; « moyennes calculées » sinon.
 */
export function mentionMoyennesA4(id: SourceId, ipsCalculee: boolean): string {
  if (id === "ips_colleges" || id === "ips_lycees" || id === "ips_erea") return ipsCalculee ? "" : " · moyennes publiées par la DEPP";
  if (id.startsWith("ips_") || id === "annuaire" || id === "ivac" || id.startsWith("ival_")) return "";
  return " · moyennes calculées (Σ / Σ)";
}
