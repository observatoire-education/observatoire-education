// Graphiques Observable Plot rendus en SVG au build (aucun JavaScript côté navigateur).
// Couleurs en variables CSS : le thème sombre s'applique sans recalcul.
import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";
import type { ExerciceBudget } from "@obs/shared/donnees";
import { nombre } from "@obs/shared/format";
import { LIBELLES_BUDGET } from "@obs/shared/libelles";

const { document } = parseHTML("<!doctype html><html><body></body></html>");

const STYLE = { background: "transparent", color: "var(--muted)", fontFamily: "var(--mono)", fontSize: "11px", overflow: "visible" };

/** `decimales` : précision des coordonnées (cartes de territoires : 1, soit un dixième de pixel). */
export function svg(p: SVGSVGElement | HTMLElement, aria: string, decimales: 1 | 2 = 2): string {
  const el = p.tagName.toLowerCase() === "svg" ? p : p.querySelector("svg")!;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", aria);
  el.removeAttribute("width");
  el.querySelector("style")?.remove(); // styles par défaut de Plot : remplacés par obs.css
  el.removeAttribute("class");
  // Le SVG entier porte sa description (role="img") : les libellés des groupes internes sont superflus.
  for (const g of el.querySelectorAll("[aria-label]")) if (g !== el) g.removeAttribute("aria-label");
  // Coordonnées tronquées à `decimales` décimales.
  return el.outerHTML.replace(decimales === 1 ? /(\d+\.\d)\d+/g : /(\d+\.\d{2})\d+/g, "$1");
}

export interface RangPoints {
  libelle: string;
  public: number | null;
  prive: number | null;
}

/** Points : losange pour l'établissement, point plein (public), anneau (privé), une ligne par territoire. */
export function svgPoints(rangs: RangPoints[], valeur: number | null, domaine: [number, number]): string {
  const lignes = rangs.map((r) => ({ ...r, me: valeur }));
  const etendue = lignes.map((r) => {
    const v = [r.public, r.prive, r.me].filter((x): x is number => x !== null);
    return { libelle: r.libelle, x1: v.length ? Math.min(...v) : null, x2: v.length ? Math.max(...v) : null };
  });
  const p = Plot.plot({
    document, width: 440, height: 34 * rangs.length + 30, marginLeft: 112, marginRight: 14, style: STYLE,
    x: { domain: domaine, grid: true, label: null, tickFormat: (d: number) => nombre(d, 0) },
    y: { domain: rangs.map((r) => r.libelle), label: null, tickSize: 0 },
    marks: [
      Plot.ruleY(etendue.filter((e) => e.x1 !== null), { y: "libelle", x1: "x1", x2: "x2", stroke: "var(--line)", strokeWidth: 6, strokeLinecap: "round" }),
      Plot.dot(lignes.filter((r) => r.public !== null), { x: "public", y: "libelle", r: 6.5, fill: "var(--pub)", title: (d: RangPoints) => `Moyenne public ${nombre(d.public)}` }),
      Plot.dot(lignes.filter((r) => r.prive !== null), { x: "prive", y: "libelle", r: 5.5, fill: "var(--surface)", stroke: "var(--pri)", strokeWidth: 3, title: (d: RangPoints) => `Moyenne privé sous contrat ${nombre(d.prive)}` }),
      ...(valeur === null ? [] : [Plot.dot(lignes, { x: "me", y: "libelle", r: 7, symbol: "diamond2", fill: "var(--me)", title: () => `Établissement ${nombre(valeur)}` })]),
    ],
  });
  const desc = rangs
    .map((r) => `${r.libelle} : public ${nombre(r.public)}, privé ${nombre(r.prive)}`)
    .join(" ; ");
  return svg(p, `Établissement ${nombre(valeur)} ; ${desc}`);
}

/** Barres de l'historique (dernière année en encre, les autres en gris). */
export function svgBarres(serie: [number, number][]): string {
  const d = serie.map(([annee, v], i) => ({ annee: String(annee), v, dernier: i === serie.length - 1 }));
  const p = Plot.plot({
    document, width: 320, height: 110, marginLeft: 0, marginRight: 0, marginTop: 16, style: STYLE,
    x: { domain: d.map((x) => x.annee), label: null, tickSize: 0, padding: 0.25 },
    y: { axis: null, domain: [0, Math.max(...d.map((x) => x.v), 1) * 1.12] },
    marks: [
      Plot.barY(d, { x: "annee", y: "v", fill: (x: { dernier: boolean }) => (x.dernier ? "var(--ink)" : "var(--line)"), rx: 3 }),
      Plot.text(d, { x: "annee", y: "v", text: (x: { v: number }) => nombre(x.v, 0), dy: -7, fill: "var(--muted)" }),
    ],
  });
  return svg(p, `Évolution : ${d.map((x) => `${x.annee} ${nombre(x.v, 0)}`).join(", ")}`);
}

/** Courbe de l'historique de l'établissement, avec les moyennes publique et privée si elles sont fournies. */
export function svgCourbe(serie: [number, number][], publique: [number, number][], privee: [number, number][]): string {
  const pts = (s: [number, number][], k: string) => s.map(([annee, v]) => ({ annee, v, k }));
  const tout = [...pts(serie, "me"), ...pts(publique, "pub"), ...pts(privee, "pri")];
  const valeurs = tout.map((x) => x.v);
  const annees = [...new Set(tout.map((x) => x.annee))].sort();
  const p = Plot.plot({
    document, width: 320, height: 110, marginLeft: 34, marginRight: 12, marginTop: 10, style: STYLE,
    x: { domain: [Math.min(...annees), Math.max(...annees)], ticks: annees, tickFormat: (a: number) => String(a), label: null },
    y: { domain: [Math.min(...valeurs) - 4, Math.max(...valeurs) + 4], label: null, ticks: 3, grid: true, tickFormat: (d: number) => nombre(d, 0) },
    marks: [
      Plot.line(pts(publique, "pub"), { x: "annee", y: "v", stroke: "var(--pub)", strokeWidth: 2 }),
      Plot.line(pts(privee, "pri"), { x: "annee", y: "v", stroke: "var(--pri)", strokeWidth: 2, strokeDasharray: "4 3" }),
      Plot.line(pts(serie, "me"), { x: "annee", y: "v", stroke: "var(--me)", strokeWidth: 2.5 }),
      Plot.dot(pts(serie, "me"), { x: "annee", y: "v", r: 3, fill: "var(--me)" }),
    ],
  });
  return svg(p, `Évolution : ${serie.map(([a, v]) => `${a} ${nombre(v)}`).join(", ")}`);
}

/** Domaine arrondi à la dizaine qui contient toutes les valeurs, avec une marge. */
export function domaine(valeurs: (number | null)[], marge = 4): [number, number] {
  const v = valeurs.filter((x): x is number => x !== null);
  if (!v.length) return [0, 100];
  return [Math.floor((Math.min(...v) - marge) / 10) * 10, Math.ceil((Math.max(...v) + marge) / 10) * 10];
}

/** Distribution des IPS par classes de 5 points : public en barres pleines, privé en contour. */
export function svgDistribution(publique: number[], privee: number[], bornes: number[]): string {
  const classes = (comptes: number[], decalage: number, secteur: string) =>
    comptes.map((n, i) => ({ x1: bornes[i]! + decalage, x2: bornes[i]! + decalage + 2.5, n, secteur }));
  const pub = classes(publique, 0, "public");
  const pri = classes(privee, 2.5, "privé sous contrat");
  const max = Math.max(1, ...publique, ...privee);
  const p = Plot.plot({
    document, width: 640, height: 170, marginLeft: 28, marginRight: 8, marginTop: 10, style: STYLE,
    x: { domain: [bornes[0]!, bornes.at(-1)!], ticks: bornes.filter((_, i) => i % 2 === 0), label: null, tickFormat: (d: number) => nombre(d, 0) },
    y: { domain: [0, max], label: null, ticks: Math.min(4, max), grid: true, tickFormat: (d: number) => (Number.isInteger(d) ? nombre(d, 0) : "") },
    marks: [
      Plot.rectY(pub.filter((d) => d.n > 0), { x1: "x1", x2: "x2", y: "n", fill: "var(--pub)", insetRight: 0.5, rx: 2 }),
      Plot.rectY(pri.filter((d) => d.n > 0), { x1: "x1", x2: "x2", y: "n", fill: "var(--pri-soft)", stroke: "var(--pri)", strokeWidth: 1.5, insetLeft: 0.5, rx: 2 }),
    ],
  });
  const resume = (c: number[]) => c.reduce((a, b) => a + b, 0);
  return svg(p, `Répartition des établissements selon leur IPS, par classes de 5 points : ${resume(publique)} publics, ${resume(privee)} privés sous contrat`);
}

/** Vrai si « Fonctionnement, personnel compris » a au moins un exercice ok : c'est alors le poste tracé, avec le privé. */
export function posteEvolutionAvecPersonnel(exercices: ExerciceBudget[]): boolean {
  return exercices.some((e) => e.public.avecPersonnel.statut === "ok" && e.public.avecPersonnel.parEleve !== null);
}

/**
 * Évolution des moyens de la collectivité, en € par élève : le public (fonctionnement personnel compris, ou
 * hors personnel si le personnel n'est jamais rattaché) et le privé (contribution). Un exercice sans valeur
 * fait un trou dans la courbe, jamais un zéro. Chaîne vide s'il n'y a aucune valeur à tracer.
 */
export function svgEvolutionBudget(exercices: ExerciceBudget[]): string {
  const valeur = (m: { parEleve: number | null; statut: string }) => (m.statut === "ok" ? m.parEleve : null);
  const avec = posteEvolutionAvecPersonnel(exercices);
  const poste = avec ? LIBELLES_BUDGET.postes.avecPersonnel : LIBELLES_BUDGET.postes.horsPersonnel;
  const serie = (k: string, v: (e: ExerciceBudget) => number | null) =>
    exercices.map((e) => ({ annee: e.exercice, v: v(e), k }));
  const pub = serie("pub", (e) => valeur(avec ? e.public.avecPersonnel : e.public.horsPersonnel));
  // Le privé n'est jamais tracé à côté du public « hors personnel » (postes non comparables).
  const pri = avec ? serie("pri", (e) => valeur(e.prive.fonctionnement)) : [];
  const defini = [...pub, ...pri].filter((d) => d.v !== null);
  if (defini.length === 0) return "";
  const annees = exercices.map((e) => e.exercice);
  const max = Math.max(...defini.map((d) => d.v!));
  const p = Plot.plot({
    document, width: 440, height: 150, marginLeft: 44, marginRight: 14, marginTop: 10, style: STYLE,
    x: {
      domain: annees.length > 1 ? [Math.min(...annees), Math.max(...annees)] : [annees[0]! - 1, annees[0]! + 1],
      ticks: annees, tickFormat: (a: number) => String(a), label: null,
    },
    y: { domain: [0, max * 1.1], label: null, ticks: 4, grid: true, tickFormat: (d: number) => nombre(d, 0) },
    marks: [
      Plot.line(pub, { x: "annee", y: "v", stroke: "var(--pub)", strokeWidth: 2 }),
      ...(avec ? [Plot.line(pri, { x: "annee", y: "v", stroke: "var(--pri)", strokeWidth: 2, strokeDasharray: "4 3" })] : []),
      Plot.dot(pub.filter((d) => d.v !== null), { x: "annee", y: "v", r: 3.5, fill: "var(--pub)" }),
      ...(avec ? [Plot.dot(pri.filter((d) => d.v !== null), { x: "annee", y: "v", r: 3, fill: "var(--surface)", stroke: "var(--pri)", strokeWidth: 2 })] : []),
    ],
  });
  const decrit = (nom: string, s: typeof pub) =>
    `${nom} : ${s.map((d) => `${d.annee} ${d.v === null ? "non disponible" : nombre(d.v, 0)}`).join(", ")}`;
  return svg(p, `Évolution en € par élève. ${decrit(`Public, ${poste.toLowerCase()}`, pub)}${avec ? `. ${decrit("Privé sous contrat, contribution", pri)}` : ""}`);
}
