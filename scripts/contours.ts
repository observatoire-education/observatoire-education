// Télécharge les contours IGN (ADMIN EXPRESS COG CARTO, Géoplateforme, WFS), les simplifie avec mapshaper
// et écrit deux TopoJSON dans site/contours/. Lancé à la main : `bun scripts/contours.ts`.
// Une trentaine de requêtes (pages de 1 000 communes), User-Agent du projet, aucune donnée personnelle.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error mapshaper n'a pas de déclarations de types
import mapshaper from "mapshaper";

const WFS = "https://data.geopf.fr/wfs/ows";
const USER_AGENT = "observatoireeducation/0.1 (+https://observatoireeducation.fr)";
const COUCHE = "ADMINEXPRESS-COG-CARTO.LATEST";
const PAGE = 1000;
const SIMPLIFICATION = "3%";
const BUDGET = { departements: 1_000_000, communes: 8_000_000 };
const SORTIE = resolve(import.meta.dir, "..", "site", "contours");

interface Entite {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, string>;
}

let requetes = 0;

async function page(type: string, champs: string, debut: number, nb: number): Promise<{ features: Entite[]; total: number }> {
  const url = new URL(WFS);
  const params = {
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: `${COUCHE}:${type}`,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    PROPERTYNAME: `${champs},geometrie`,
    SORTBY: "code_insee",
    COUNT: String(nb),
    STARTINDEX: String(debut),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  requetes++;
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`WFS ${type} @${debut} : HTTP ${r.status}`);
  const j = (await r.json()) as { features: Entite[]; numberMatched: number };
  return { features: j.features, total: j.numberMatched };
}

async function toutes(type: string, champs: string): Promise<Entite[]> {
  const out: Entite[] = [];
  for (;;) {
    const { features, total } = await page(type, champs, out.length, PAGE);
    out.push(...features);
    console.log(`${type} : ${out.length} / ${total}`);
    if (features.length === 0 || out.length >= total) return out;
  }
}

async function simplifier(nom: string, features: Entite[]): Promise<string> {
  const entree = JSON.stringify({ type: "FeatureCollection", features });
  const cmd = `-i in.json -simplify ${SIMPLIFICATION} keep-shapes -o out.json format=topojson quantization=1e5 target=*`;
  const sortie = (await mapshaper.applyCommands(cmd, { "in.json": entree })) as Record<string, string | Uint8Array>;
  const brut = sortie["out.json"];
  if (brut === undefined) throw new Error(`mapshaper : pas de sortie pour ${nom}`);
  return typeof brut === "string" ? brut : new TextDecoder().decode(brut);
}

const vide = (v: unknown) => typeof v !== "string" || v.trim() === "";

const departements = (await toutes("departement", "code_insee")).map((f) => ({
  type: "Feature" as const,
  geometry: f.geometry,
  properties: { code: f.properties.code_insee ?? "" },
}));
const canonique = (d: string) => /^(\d\d|2A|2B|97\d)$/.test(d);
// Le service donne « NR » pour Saint-Pierre-et-Miquelon : on déduit alors le département du code commune.
const depDe = (code: string, brut: string | undefined) =>
  brut && canonique(brut) ? brut : code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2);
const communes = (await toutes("commune", "code_insee,code_insee_du_departement")).map((f) => {
  const code = f.properties.code_insee ?? "";
  return { type: "Feature" as const, geometry: f.geometry, properties: { code, dep: depDe(code, f.properties.code_insee_du_departement) } };
});

if (departements.some((f) => vide(f.properties.code))) throw new Error("département sans code");
if (communes.some((f) => vide(f.properties.code) || vide(f.properties.dep))) throw new Error("commune sans code ou sans département");
const horsNorme = communes.filter((f) => !canonique(f.properties.dep));
if (horsNorme.length) throw new Error(`département non canonique pour ${horsNorme.length} communes (ex. ${horsNorme[0]?.properties.code})`);
for (const insee of ["75056", "69123", "13055"]) {
  if (!communes.some((f) => f.properties.code === insee)) throw new Error(`commune ${insee} absente du jeu de contours`);
}

mkdirSync(SORTIE, { recursive: true });
for (const [nom, features] of [["departements", departements], ["communes", communes]] as const) {
  const topo = await simplifier(nom, features as unknown as Entite[]);
  const octets = Buffer.byteLength(topo);
  console.log(`${nom} : ${features.length} entités, ${(octets / 1e6).toFixed(2)} Mo (budget ${BUDGET[nom] / 1e6} Mo)`);
  if (octets > BUDGET[nom]) throw new Error(`${nom} : ${octets} octets, au-delà du budget de ${BUDGET[nom]}`);
  writeFileSync(resolve(SORTIE, `${nom}.topo.json`), topo);
}
console.log(`${requetes} requêtes WFS, simplification ${SIMPLIFICATION} keep-shapes`);
