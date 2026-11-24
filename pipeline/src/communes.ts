// Communes nouvelles : d'un code commune ancien au code en vigueur, et communes déléguées d'une commune nouvelle,
// d'après le Code officiel géographique de l'Insee (sources cog_communes et cog_mouvements). Centre d'une commune :
// centroïde de son contour (site/contours, IGN ADMIN EXPRESS COG CARTO).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "./db.ts";

export interface TableCommunes {
  /** Code de la commune d'aujourd'hui ; inchangé si le code est en vigueur ou inconnu du Code officiel géographique. */
  actuelle(code: string): string;
  /** Communes déléguées (et associées) d'une commune en vigueur, triées par nom ; vide s'il n'y en a pas. */
  deleguees(code: string): { code: string; nom: string }[];
}

interface Mouvement {
  ap: string;
  le: string;
}

/**
 * La liste des communes en vigueur (cog_communes) dit l'état d'aujourd'hui : commune (COM), ou commune déléguée,
 * associée ou arrondissement municipal rattaché à sa commune parente. Un code absent de cette liste a disparu : les
 * mouvements (cog_mouvements) donnent la commune qui l'a absorbé, et ainsi de suite jusqu'à une commune en vigueur.
 */
export async function chargerCommunes(db: Db): Promise<TableCommunes> {
  const communes = await db.sql<{ typecom: string; com: string; nom: string; parent: string | null }>(
    `select trim(typecom) as typecom, trim(com) as com, trim(libelle) as nom, nullif(trim(comparent), '') as parent
     from src_cog_communes where nullif(trim(com), '') is not null`,
  );
  // Un code qui devient une autre commune (fusion, commune nouvelle, changement de code), du plus récent au plus ancien.
  const mouvements = await db.sql<{ av: string } & Mouvement>(
    `select distinct trim(com_av) as av, trim(com_ap) as ap, trim(date_eff) as le from src_cog_mouvements
     where trim(typecom_ap) = 'COM' and trim(com_av) <> trim(com_ap)
     order by le desc, ap`,
  );

  const enVigueur = new Set(communes.filter((c) => c.typecom === "COM").map((c) => c.com));
  const parents = new Map<string, string>();
  const deleguees = new Map<string, { code: string; nom: string }[]>();
  for (const c of communes) {
    if (c.typecom === "COM" || !c.parent) continue;
    parents.set(c.com, c.parent);
    // les arrondissements de Paris, Lyon et Marseille ne sont pas des communes déléguées
    if (c.typecom === "COMD" || c.typecom === "COMA") {
      const liste = deleguees.get(c.parent) ?? [];
      liste.push({ code: c.com, nom: c.nom });
      deleguees.set(c.parent, liste);
    }
  }
  for (const liste of deleguees.values()) liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.code.localeCompare(b.code));
  const successeurs = new Map<string, Mouvement[]>();
  for (const { av, ...m } of mouvements) {
    const liste = successeurs.get(av) ?? [];
    liste.push(m);
    successeurs.set(av, liste);
  }

  return {
    actuelle(code) {
      let c = code;
      let depuis = "";
      const vus = new Set<string>();
      while (!vus.has(c)) {
        vus.add(c);
        if (enVigueur.has(c)) return c;
        const parent = parents.get(c);
        if (parent) return parent;
        // le mouvement le plus récent qui ne précède pas l'étape d'avant (un code peut avoir été réattribué)
        const suivant = successeurs.get(c)?.find((m) => m.le >= depuis);
        if (!suivant) return c;
        c = suivant.ap;
        depuis = suivant.le;
      }
      return c;
    },
    deleguees: (code) => (deleguees.get(code) ?? []).map((d) => ({ ...d })),
  };
}

// --- Centre d'une commune : centroïde de son contour TopoJSON ---

type Anneau = number[];
interface GeometrieTopo {
  type: string;
  arcs?: Anneau[] | Anneau[][];
  properties?: { code?: string };
}
interface Topologie {
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: Record<string, { geometries: GeometrieTopo[] }>;
}

let contours: { dossier: string; topo: Topologie; parCode: Map<string, GeometrieTopo>; centres: Map<string, { lat: number; lon: number } | null> } | undefined;

function chargerContours() {
  const dossier = process.env.OBS_CONTOURS ?? resolve(import.meta.dir, "..", "..", "site", "contours");
  if (contours?.dossier === dossier) return contours;
  const topo = JSON.parse(readFileSync(resolve(dossier, "communes.topo.json"), "utf8")) as Topologie;
  const objet = Object.values(topo.objects)[0];
  const parCode = new Map((objet?.geometries ?? []).map((g) => [g.properties?.code ?? "", g]));
  contours = { dossier, topo, parCode, centres: new Map() };
  return contours;
}

/** Points d'un arc décodé (coordonnées quantifiées en deltas) ; un indice négatif `~i` désigne l'arc i inversé. */
function arc(topo: Topologie, i: number): [number, number][] {
  const brut = topo.arcs[i < 0 ? ~i : i] ?? [];
  const [sx, sy] = topo.transform?.scale ?? [1, 1];
  const [tx, ty] = topo.transform?.translate ?? [0, 0];
  let x = 0;
  let y = 0;
  const points = brut.map(([dx, dy]): [number, number] => {
    if (topo.transform) {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    }
    return [dx, dy];
  });
  return i < 0 ? points.reverse() : points;
}

/**
 * Centroïde (pondéré par la surface, en degrés : l'écart dû à la projection est négligeable à l'échelle d'une
 * commune) du contour de la commune en vigueur `insee` ; null si elle n'a pas de contour. Les trous comptent en négatif.
 */
export function centreCommune(insee: string): { lat: number; lon: number } | null {
  const c = chargerContours();
  if (c.centres.has(insee)) return c.centres.get(insee)!;
  const g = c.parCode.get(insee);
  let centre: { lat: number; lon: number } | null = null;
  if (g?.arcs) {
    const polygones = (g.type === "MultiPolygon" ? g.arcs : [g.arcs]) as Anneau[][];
    let aire = 0;
    let mx = 0;
    let my = 0;
    for (const anneau of polygones.flat()) {
      const pts = anneau.flatMap((i) => arc(c.topo, i));
      for (let k = 0; k < pts.length; k++) {
        const [x0, y0] = pts[k]!;
        const [x1, y1] = pts[(k + 1) % pts.length]!;
        const a = x0 * y1 - x1 * y0;
        aire += a;
        mx += (x0 + x1) * a;
        my += (y0 + y1) * a;
      }
    }
    if (aire !== 0) {
      const arrondi = (v: number) => Math.round(v * 1e5) / 1e5;
      centre = { lat: arrondi(my / (3 * aire)), lon: arrondi(mx / (3 * aire)) };
    }
  }
  c.centres.set(insee, centre);
  return centre;
}
