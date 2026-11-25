// Compteurs de la « fabrique » : ce que l'observatoire rassemble (jeux, producteurs, portails), calculés depuis sources.json.
import type { DonneesSource } from "@obs/shared/donnees";
import { date } from "@obs/shared/format";

export interface SourceHorsRegistre { producteur: string; pageUrl: string }

/** Sources affichées sur /sources/ mais absentes du registre de collecte (contours IGN). */
export const SOURCES_HORS_REGISTRE: SourceHorsRegistre[] = [{ producteur: "IGN", pageUrl: "https://data.geopf.fr/wfs/ows" }];

export interface Fabrique {
  /** Jeux de données distincts : une page d'origine distincte. */
  jeux: number;
  /** Libellés courts, dans l'ordre MEN, DEPP, DGESCO, DGFiP, Insee, IGN, puis alphabétique. */
  producteurs: string[];
  /** Noms d'hôte distincts des pages d'origine. */
  portails: number;
  /** Collecte la plus récente (ISO), null si aucune. */
  derniereCollecte: string | null;
}

const ORDRE = ["MEN", "DEPP", "DGESCO", "DGFiP", "Insee", "IGN"];

/** « MEN-DEPP » → « DEPP », « MEN-DGESCO » → « DGESCO », sinon inchangé. */
export const producteurCourt = (p: string): string => p.replace(/^MEN-/, "");

export function compterFabrique(sources: Record<string, DonneesSource>, horsRegistre: SourceHorsRegistre[] = SOURCES_HORS_REGISTRE): Fabrique {
  const collectees = Object.values(sources).filter((s) => s.actuelle !== null);
  const toutes: SourceHorsRegistre[] = [...collectees, ...horsRegistre];
  const producteurs = [...new Set(toutes.map((s) => producteurCourt(s.producteur)))].sort((a, b) => {
    const ia = ORDRE.indexOf(a), ib = ORDRE.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.localeCompare(b, "fr");
  });
  const dates = collectees.map((s) => s.actuelle!.collecteLe).sort();
  return {
    jeux: new Set(toutes.map((s) => s.pageUrl)).size,
    producteurs,
    portails: new Set(toutes.map((s) => new URL(s.pageUrl).hostname)).size,
    derniereCollecte: dates.at(-1) ?? null,
  };
}

/**
 * « le JJ/MM/AAAA ». Jamais « cette nuit » : le site n'est reconstruit que si un jeu a changé, une mention relative
 * resterait figée sur la page en ligne pendant des jours.
 */
export const libelleCollecte = (iso: string): string => `le ${date(iso)}`;
