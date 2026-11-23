// Configuration du site (observatoire.config.json à la racine du dépôt).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  SITE_URL: string;
  DOMAINE: string;
  DEPOT: string;
  INDEXABLE: boolean;
}

export const CONFIG: Config = JSON.parse(
  readFileSync(process.env.OBS_CONFIG ?? resolve(process.cwd(), "..", "observatoire.config.json"), "utf8"),
);

export const NOM_SITE = "Observatoire citoyen de l'éducation en France";

/** Lien permanent d'une page (absolu si SITE_URL est défini). */
export const lienPermanent = (chemin: string): string => `${CONFIG.SITE_URL}${chemin}`;
