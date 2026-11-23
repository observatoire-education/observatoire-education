// Aides des pages de territoire (département) : synthèses, lignes de liste, CSV.
import type { DonneesDepartement, LigneListe, SyntheseFamille } from "@obs/shared/donnees";
import type { Famille } from "@obs/shared/types";

export const ORDRE_FAMILLES: Famille[] = ["college", "legt", "lpo", "lp", "erea"];

export const famillesDe = (d: DonneesDepartement): [Famille, SyntheseFamille][] =>
  ORDRE_FAMILLES.flatMap((f) => (d.familles[f] ? [[f, d.familles[f]!] as [Famille, SyntheseFamille]] : []));

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

/** CSV (séparateur « ; », point décimal) ; une absence est vide, ou porte son statut (« non_publie_prive »). */
export function csvDepartement(d: DonneesDepartement): string {
  const lignes = famillesDe(d).flatMap(([famille, s]) =>
    s.liste.map((l: LigneListe) =>
      [
        l.uai, l.nom, famille, l.secteur, l.commune, l.ep, l.eleves, l.elevesParEtpEns,
        l.elevesParEtpVs ?? (l.statutVs === "non_publie_prive" ? "non_publie_prive" : null),
        l.partEnseignantes, l.ips,
      ].map(champ).join(";"),
    ),
  );
  return `${[COLONNES_CSV.join(";"), ...lignes].join("\n")}\n`;
}
