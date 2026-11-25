// Configuration du site (observatoire.config.json à la racine du dépôt).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  SITE_URL: string;
  DOMAINE: string;
  DEPOT: string;
  INDEXABLE: boolean;
  /** Mesure d'audience Umami auto-hébergée (facultative). */
  UMAMI?: { SCRIPT: string; ID: string };
}

export const CONFIG: Config = JSON.parse(
  readFileSync(process.env.OBS_CONFIG ?? resolve(process.cwd(), "..", "observatoire.config.json"), "utf8"),
);

export const NOM_SITE = "Observatoire citoyen de l'éducation en France";

/** Éditeur et directeur de la publication (mentions légales, pied de page, à propos). */
export const EDITEUR = "Ludovic Bonnet";

/** Lien permanent d'une page (absolu si SITE_URL est défini). */
export const lienPermanent = (chemin: string): string => `${CONFIG.SITE_URL}${chemin}`;
