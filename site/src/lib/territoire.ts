// Aides des pages de territoire (France, académie, département, commune) : synthèses, lignes de liste, CSV.
import type { DonneesTerritoire, LigneListe, LigneTerritoire, SyntheseFamille } from "@obs/shared/donnees";
import { FAMILLES } from "@obs/shared/libelles";
import type { Famille } from "@obs/shared/types";

export const ORDRE_FAMILLES: Famille[] = ["college", "legt", "lpo", "lp", "erea"];

export const famillesDe = (d: DonneesTerritoire): [Famille, SyntheseFamille][] =>
  ORDRE_FAMILLES.flatMap((f) => (d.familles[f] ? [[f, d.familles[f]!] as [Famille, SyntheseFamille]] : []));

/** Pluriel des familles dans une phrase (« 2 lycées professionnels ») ; le sigle EREA est invariable. */
const PLURIEL: Record<Famille, string> = {
  college: "collèges",
  legt: "lycées généraux et technologiques",
  lpo: "lycées polyvalents",
  lp: "lycées professionnels",
  erea: "EREA",
};

/** Nom d'une famille dans une phrase : en minuscules, au singulier ou au pluriel selon n ; EREA reste un sigle. */
export const nomFamille = (f: Famille, n: number): string =>
  f === "erea" ? FAMILLES.erea : n > 1 ? PLURIEL[f] : FAMILLES[f].toLowerCase();

/** Valeur de tri d'une cellule numérique (vide si absente : triée en dernier). */
export const valeurTri = (v: number | null): string => (v === null ? "" : String(Math.round(v * 100) / 100));

const COLONNES_CSV = [
  "uai", "nom", "famille", "secteur", "commune", "ep", "eleves", "eleves_par_etp_ens", "eleves_par_etp_vs",
  "part_enseignantes", "ips",
] as const;

/**
 * Champ CSV. Un texte qui commence par =, +, -, @, tabulation ou retour chariot est préfixé d'une
 * apostrophe, pour qu'aucun tableur ne l'interprète comme une formule ; les nombres sont laissés tels quels.
 */
const champ = (v: string | number | null): string => {
  if (v === null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const COLONNES_CSV_ENFANTS = [
  "code", "libelle", "etablissements_public", "etablissements_prive", "eleves_public", "eleves_prive", "part_prive",
  "ecart_ips_colleges",
] as const;

const csv = (colonnes: readonly string[], lignes: (string | number | null)[][]): string =>
  `${[colonnes.join(";"), ...lignes.map((l) => l.map(champ).join(";"))].join("\n")}\n`;

/**
 * CSV (séparateur « ; », point décimal) ; une absence est vide, ou porte son statut (« non_publie_prive »).
 * Département et commune : un établissement par ligne ; région, académie et France : un territoire enfant par ligne.
 */
export function csvTerritoire(d: DonneesTerritoire): string {
  if (d.ref.niveau === "academie" || d.ref.niveau === "france" || d.ref.niveau === "region") {
    return csv(COLONNES_CSV_ENFANTS, d.enfants.map((e: LigneTerritoire) => [
      e.ref.code, e.ref.libelle, e.compte.public, e.compte.prive, e.eleves.public, e.eleves.prive, e.partPrive,
      e.ecartIpsColleges,
    ]));
  }
  return csv(COLONNES_CSV, famillesDe(d).flatMap(([famille, s]) =>
    s.liste.map((l: LigneListe) => [
      l.uai, l.nom, famille, l.secteur, l.commune, l.ep, l.eleves, l.elevesParEtpEns,
      l.elevesParEtpVs ?? (l.statutVs === "non_publie_prive" ? "non_publie_prive" : null),
      l.partEnseignantes, l.ips,
    ]),
  ));
}

/**
 * Part des élèves du privé (%) : null si les élèves sont inconnus ; 0 quand le territoire n'a aucun
 * établissement privé (`aucunPrive`) et que les élèves du public sont connus.
 */
export function partPrive(e: { public: number | null; prive: number | null }, aucunPrive = false): number | null {
  if (aucunPrive && e.prive === null && e.public) return 0;
  const t = e.public === null && e.prive === null ? null : (e.public ?? 0) + (e.prive ?? 0);
  return t && e.prive !== null ? (100 * e.prive) / t : null;
}
