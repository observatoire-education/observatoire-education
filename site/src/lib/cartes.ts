// Cartes SVG des territoires (Observable Plot au build, aucun JavaScript côté navigateur).
// Couleurs en variables CSS ; la légende est en HTML (le `legend: true` de Plot exige un canvas).
import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { PointCarte, ValeurCarte } from "@obs/shared/donnees";
import { contoursDepartements } from "./contours";
import { svg } from "./plot";

const { document } = parseHTML("<!doctype html><html><body></body></html>");

export type VueCarte = "prive" | "ecart_ips";

const DROM = ["971", "972", "973", "974", "976"];
const TITRE: Record<VueCarte, string> = {
  prive: "Part des élèves dans le privé sous contrat",
  ecart_ips: "Écart d'IPS moyen privé − public des collèges",
};
const TEINTE: Record<VueCarte, [string, string]> = {
  prive: ["var(--pri-soft)", "var(--pri-ink)"],
  ecart_ips: ["var(--pub-soft)", "var(--pub-ink)"],
};
const DOMAINE: Record<VueCarte, [number, number]> = { prive: [0, 50], ecart_ips: [0, 40] };
const UNITE: Record<VueCarte, string> = { prive: " %", ecart_ips: " points" };
const STYLE = { background: "transparent", color: "var(--muted)", overflow: "visible" };

type Fond = Feature<Geometry, { code: string; dep?: string }>;
type Fonds = FeatureCollection<Geometry, { code: string; dep?: string }>;
type Boite = [number, number, number, number];

/** Couleur d'une valeur sur la rampe de la vue ; une valeur hors domaine est bornée, une absence est grisée. */
function couleur(vue: VueCarte, v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "var(--line)";
  const [min, max] = DOMAINE[vue];
  const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
  const [clair, fonce] = TEINTE[vue];
  return `color-mix(in srgb, ${fonce} ${Math.round(t * 100)}%, ${clair})`;
}

function parcourir(c: unknown, f: (lon: number, lat: number) => void): void {
  if (!Array.isArray(c)) return;
  if (typeof c[0] === "number") f(c[0] as number, c[1] as number);
  else for (const x of c) parcourir(x, f);
}

function boite(objets: Array<Feature | Geometry>): Boite | null {
  let b: Boite | null = null;
  for (const o of objets) {
    const g = o.type === "Feature" ? o.geometry : o;
    if (!g || g.type === "GeometryCollection") continue;
    parcourir(g.coordinates, (x, y) => {
      b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
    });
  }
  return b;
}

const multiPoint = (pts: Array<[number, number]>): Geometry => ({ type: "MultiPoint", coordinates: pts });

export function svgCarteDepartements(
  valeurs: ValeurCarte[],
  vue: VueCarte,
  opts: { encartsDrom: boolean },
): { svg: string; absents: string[] } {
  const parCode = new Map(valeurs.map((v) => [v.dep, v]));
  const connus = new Map(contoursDepartements().features.map((f) => [f.properties.code, f]));
  const absents = valeurs.map((v) => v.dep).filter((d) => !connus.has(d));
  const lire = (dep: string) => {
    const v = parCode.get(dep);
    return vue === "prive" ? v?.partPrive : v?.ecartIpsColleges;
  };
  const dessiner = (features: Fond[], projection: object, largeur: number, hauteur: number, aria: string) => {
    const domain: Fonds = { type: "FeatureCollection", features };
    const p = Plot.plot({
      document, width: largeur, height: hauteur, margin: 2, style: STYLE,
      projection: { ...projection, domain },
      marks: [
        Plot.geo(features, {
          fill: { value: (f: Fond) => couleur(vue, lire(f.properties.code)), scale: null },
          stroke: "var(--surface)", strokeWidth: 0.6,
        }),
      ],
    });
    return svg(p, aria);
  };
  const presents = valeurs.map((v) => connus.get(v.dep)).filter((f): f is Fond => !!f);
  const aria = `Carte par département : ${TITRE[vue]}`;
  if (!opts.encartsDrom) {
    return { svg: dessiner(presents, { type: "conic-conformal", parallels: [44, 49], rotate: [-3, 0] }, 560, 560, aria), absents };
  }
  const metropole = presents.filter((f) => !f.properties.code.startsWith("97"));
  const sorties = [dessiner(metropole, { type: "conic-conformal", parallels: [44, 49], rotate: [-3, 0] }, 560, 560, aria)];
  for (const code of DROM) {
    const f = connus.get(code);
    if (f && parCode.has(code)) sorties.push(dessiner([f], { type: "mercator" }, 120, 120, `${aria} : département ${code}`));
  }
  return { svg: sorties.join(""), absents };
}

export function svgCartePoints(
  points: PointCarte[],
  fond: { territoire: Fond | null; mailles: Fonds | null },
): { svg: string; absents: string[] } {
  let absents: string[] = [];
  let dessines = points;
  let domain: Geometry | Fond | Fonds;
  if (fond.territoire) {
    domain = fond.territoire;
    const b = boite([fond.territoire]);
    if (b) {
      const mx = (b[2] - b[0]) * 0.1;
      const my = (b[3] - b[1]) * 0.1;
      const dedans = (p: PointCarte) => p.lon >= b[0] - mx && p.lon <= b[2] + mx && p.lat >= b[1] - my && p.lat <= b[3] + my;
      dessines = points.filter(dedans);
      absents = points.filter((p) => !dedans(p)).map((p) => p.uai);
    }
  } else if (fond.mailles && fond.mailles.features.length) {
    domain = fond.mailles;
  } else {
    domain = multiPoint(points.map((p): [number, number] => [p.lon, p.lat]));
  }
  const marks: Plot.Markish[] = [];
  if (fond.mailles) marks.push(Plot.geo(fond.mailles.features, { fill: "none", stroke: "var(--line)", strokeWidth: 0.6 }));
  if (fond.territoire) marks.push(Plot.geo(fond.territoire, { fill: "none", stroke: "var(--muted)", strokeWidth: 1 }));
  const rayon = { r: { range: [1.5, 9] as [number, number], domain: [0, Math.max(1, ...dessines.map((p) => p.eleves ?? 0))] as [number, number] } };
  const avecEleves = (s: PointCarte["secteur"]) => dessines.filter((p) => p.secteur === s);
  // Un établissement sans effectif garde le rayon minimal.
  const r = (p: PointCarte) => p.eleves ?? 0;
  marks.push(
    Plot.dot(avecEleves("public"), { x: "lon", y: "lat", r, fill: "var(--pub)", fillOpacity: 0.85, title: (p: PointCarte) => p.nom }),
    Plot.dot(avecEleves("prive_sous_contrat"), { x: "lon", y: "lat", r, fill: "none", stroke: "var(--pri)", strokeWidth: 1.6, title: (p: PointCarte) => p.nom }),
  );
  const p = Plot.plot({
    document, width: 560, height: 460, margin: 4, style: STYLE,
    projection: { type: "mercator", domain },
    ...rayon,
    marks,
  });
  return { svg: svg(p, `Carte des établissements : ${dessines.length} points, public en plein, privé sous contrat en anneau`), absents };
}

/** Rampe, bornes et case « non disponible » de la vue. */
export function legendeCarte(vue: VueCarte, domaine: [number, number]): string {
  const [clair, fonce] = TEINTE[vue];
  const fmt = (n: number) => String(n).replace(".", ",");
  return (
    `<div class="legende-carte"><p class="legende-titre">${TITRE[vue]}</p>` +
    `<div class="legende-rampe" role="img" aria-label="De ${fmt(domaine[0])}${UNITE[vue]} à ${fmt(domaine[1])}${UNITE[vue]}" style="height:10px;background:linear-gradient(to right, ${clair}, ${fonce})"></div>` +
    `<div class="legende-bornes" style="display:flex;justify-content:space-between"><span>${fmt(domaine[0])}${UNITE[vue]}</span><span>${fmt(domaine[1])}${UNITE[vue]}</span></div>` +
    `<p class="legende-nd"><span class="legende-case" style="display:inline-block;width:12px;height:12px;background:var(--line)"></span> non disponible</p></div>`
  );
}
