// Contours simplifiés des départements et des communes (IGN, ADMIN EXPRESS COG CARTO), au format TopoJSON.
// Le dossier vient de OBS_CONTOURS, par défaut site/contours (le build s'exécute depuis site/).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMMUNES_METROPOLE_LYON, REGIONS, collectiviteDe, type IdCollectivite } from "@obs/shared/collectivites";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature, merge } from "topojson-client";
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification";

type Contour = Feature<Geometry, { code: string; dep?: string }>;
type Contours = FeatureCollection<Geometry, { code: string; dep?: string }>;

interface Charge {
  topoDepartements: { topo: Topology; geometries: (Polygon | MultiPolygon)[] };
  topoCommunes: { topo: Topology; geometries: (Polygon | MultiPolygon)[] };
  departements: Contour[];
  communes: Contour[];
  communesParCode: Map<string, Contour>;
  communesParDep: Map<string, Contour[]>;
}

let cache: { dossier: string; charge: Charge } | undefined;

function topologie(dossier: string, fichier: string): { topo: Topology; objet: GeometryCollection<{ code: string }> } {
  const topo = JSON.parse(readFileSync(resolve(dossier, fichier), "utf8")) as Topology;
  const objet = Object.values(topo.objects)[0] as GeometryCollection<{ code: string }> | undefined;
  if (!objet || objet.type !== "GeometryCollection") throw new Error(`${fichier} : aucun objet TopoJSON`);
  return { topo, objet };
}

function lire(dossier: string, fichier: string): Contour[] {
  const { topo, objet } = topologie(dossier, fichier);
  return (feature(topo, objet) as unknown as Contours).features;
}

function charger(): Charge {
  const dossier = process.env.OBS_CONTOURS ?? resolve(process.cwd(), "..", "site", "contours");
  if (cache?.dossier === dossier) return cache.charge;
  const dep = topologie(dossier, "departements.topo.json");
  const departements = lire(dossier, "departements.topo.json");
  const com = topologie(dossier, "communes.topo.json");
  const communes = (feature(com.topo, com.objet) as unknown as Contours).features;
  const communesParCode = new Map<string, Contour>();
  const communesParDep = new Map<string, Contour[]>();
  for (const c of communes) {
    communesParCode.set(c.properties.code, c);
    const dep = c.properties.dep ?? "";
    const liste = communesParDep.get(dep) ?? [];
    liste.push(c);
    communesParDep.set(dep, liste);
  }
  const charge = { topoDepartements: { topo: dep.topo, geometries: dep.objet.geometries as (Polygon | MultiPolygon)[] }, topoCommunes: { topo: com.topo, geometries: com.objet.geometries as (Polygon | MultiPolygon)[] }, departements, communes, communesParCode, communesParDep };
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

/**
 * Contour d'une région : fusion des contours de ses départements (`merge` de topojson-client, sans frontière
 * intérieure). Null si aucun de ses départements n'a de contour.
 */
export function contourRegion(code: string): Contour | null {
  const region = REGIONS.find((r) => r.code === code);
  if (!region) return null;
  const { topo, geometries } = charger().topoDepartements;
  const membres = geometries.filter((g) => region.deps.includes(String((g.properties as { code?: string } | undefined)?.code)));
  if (!membres.length) return null;
  return { type: "Feature", properties: { code }, geometry: merge(topo, membres) };
}

const propCode = (g: Polygon | MultiPolygon): string => String((g.properties as { code?: string } | undefined)?.code);
const propDep = (g: Polygon | MultiPolygon): string => String((g.properties as { dep?: string } | undefined)?.dep);

/**
 * Formes de la carte du budget, une par département, sauf le Rhône : la Métropole de Lyon (fusion de ses communes,
 * Lyon qu'elle soit découpée en arrondissements ou non) et le reste du Rhône sont deux formes. Le code du contour
 * est celui du département ; `id` est la collectivité qui porte les collèges (Bas-Rhin et Haut-Rhin : `cea`, etc.).
 * Sans contour de communes pour le Rhône, le département entier porte `dep-69`.
 */
export function formesCollectivites(): { id: IdCollectivite; contour: Contour }[] {
  const { departements, topoCommunes } = charger();
  const formes: { id: IdCollectivite; contour: Contour }[] = [];
  for (const d of departements) {
    const code = d.properties.code;
    if (code !== "69") {
      const id = collectiviteDe("colleges", code, "");
      if (id) formes.push({ id, contour: d });
      continue;
    }
    const communes = topoCommunes.geometries.filter((g) => propDep(g) === "69");
    const lyon = communes.filter((g) => COMMUNES_METROPOLE_LYON.has(propCode(g)));
    const reste = communes.filter((g) => !COMMUNES_METROPOLE_LYON.has(propCode(g)));
    if (!lyon.length || !reste.length) {
      formes.push({ id: "dep-69", contour: d });
      continue;
    }
    const forme = (membres: (Polygon | MultiPolygon)[]): Contour => ({ type: "Feature", properties: { code: "69" }, geometry: merge(topoCommunes.topo, membres) });
    formes.push({ id: "ml-lyon", contour: forme(lyon) }, { id: "dep-69", contour: forme(reste) });
  }
  return formes;
}
