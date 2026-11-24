// Contours simplifiés des départements et des communes (IGN, ADMIN EXPRESS COG CARTO), au format TopoJSON.
// Le dossier vient de OBS_CONTOURS, par défaut site/contours (le build s'exécute depuis site/).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

type Contour = Feature<Geometry, { code: string; dep?: string }>;
type Contours = FeatureCollection<Geometry, { code: string; dep?: string }>;

interface Charge {
  departements: Contour[];
  communes: Contour[];
  communesParCode: Map<string, Contour>;
  communesParDep: Map<string, Contour[]>;
}

let cache: { dossier: string; charge: Charge } | undefined;

function lire(dossier: string, fichier: string): Contour[] {
  const topo = JSON.parse(readFileSync(resolve(dossier, fichier), "utf8")) as Topology;
  const objet = Object.values(topo.objects)[0];
  if (!objet) throw new Error(`${fichier} : aucun objet TopoJSON`);
  return (feature(topo, objet) as unknown as Contours).features;
}

function charger(): Charge {
  const dossier = process.env.OBS_CONTOURS ?? resolve(process.cwd(), "..", "site", "contours");
  if (cache?.dossier === dossier) return cache.charge;
  const departements = lire(dossier, "departements.topo.json");
  const communes = lire(dossier, "communes.topo.json");
  const communesParCode = new Map<string, Contour>();
  const communesParDep = new Map<string, Contour[]>();
  for (const c of communes) {
    communesParCode.set(c.properties.code, c);
    const dep = c.properties.dep ?? "";
    const liste = communesParDep.get(dep) ?? [];
    liste.push(c);
    communesParDep.set(dep, liste);
  }
  const charge = { departements, communes, communesParCode, communesParDep };
  cache = { dossier, charge };
  return charge;
}

const collection = (features: Contour[]): Contours => ({ type: "FeatureCollection", features });

/** Contours des départements (tous, ou ceux dont le code INSEE canonique est listé). */
export function contoursDepartements(codes?: string[]): Contours {
  const { departements } = charger();
  return collection(codes ? departements.filter((f) => codes.includes(f.properties.code)) : departements);
}

export const contourDepartement = (code: string): Contour | null =>
  charger().departements.find((f) => f.properties.code === code) ?? null;

export const communesDuDepartement = (dep: string): Contours => collection(charger().communesParDep.get(dep) ?? []);

export const contourCommune = (insee: string): Contour | null => charger().communesParCode.get(insee) ?? null;
