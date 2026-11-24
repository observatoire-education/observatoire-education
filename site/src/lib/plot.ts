// Graphiques Observable Plot rendus en SVG au build (aucun JavaScript côté navigateur).
// Couleurs en variables CSS : le thème sombre s'applique sans recalcul.
import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";
import type { AnneeSegregation, ExerciceBudget, Nuage, PointNuage } from "@obs/shared/donnees";
import type { Classes, PointIps } from "@obs/shared/types";
import { FINE, nombre } from "@obs/shared/format";
import { LIBELLES_BUDGET, LIBELLES_NUAGES, LIBELLES_SEGREGATION, SECTEURS } from "@obs/shared/libelles";
import { vaSignee } from "./resultats";

const { document } = parseHTML("<!doctype html><html><body></body></html>");

/** Même style, tel que Plot le sérialise dans l'attribut `style`. */
const STYLE_CSS = "background:transparent;color:var(--muted);font-family:var(--mono);font-size:11px;overflow:visible";
const STYLE = { background: "transparent", color: "var(--muted)", fontFamily: "var(--mono)", fontSize: "11px", overflow: "visible" };

/** `decimales` : précision des coordonnées (cartes de territoires : 1, soit un dixième de pixel). */
export function svg(p: SVGSVGElement | HTMLElement, aria: string, decimales: 1 | 2 = 2): string {
  const el = p.tagName.toLowerCase() === "svg" ? p : p.querySelector("svg")!;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", aria);
  el.removeAttribute("width");
  el.querySelector("style")?.remove(); // styles par défaut de Plot : remplacés par obs.css
  el.removeAttribute("class");
  // Le style commun des graphiques vit dans obs.css (classe `plot`) : pas répété dans chaque SVG.
  if (el.getAttribute("style") === STYLE_CSS) {
    el.removeAttribute("style");
    el.setAttribute("class", "plot");
  }
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

/** Séries de références (public, privé) et rentrées calculées, tirées de points d'IPS. Une valeur absente reste `null`. */
export function seriesReferencesIps(points: PointIps[]): { publique: [number, number | null][]; privee: [number, number | null][]; calculees: number[] } {
  return {
    publique: points.map((p) => [p.rentree, p.public]),
    privee: points.map((p) => [p.rentree, p.prive]),
    calculees: points.filter((p) => p.calculee).map((p) => p.rentree),
  };
}

/** Vrai si au moins un point de référence est une moyenne calculée par l'observatoire (valeur présente). */
export function aPointCalcule(points: PointIps[]): boolean {
  return points.some((p) => p.calculee && (p.public !== null || p.prive !== null));
}

/**
 * Courbe de l'historique de l'établissement (`serie`, éventuellement vide), avec les moyennes publique et privée
 * si elles sont fournies. Une valeur `null` fait un trou dans la ligne, jamais un zéro. `calculees` : rentrées
 * dont les points de référence sont des moyennes calculées par l'observatoire (rond creux ; plein sinon).
 */
export function svgCourbe(
  serie: [number, number][],
  publique: [number, number | null][],
  privee: [number, number | null][],
  calculees: number[] = [],
): string {
  const pts = (s: [number, number | null][], k: string) => s.map(([annee, v]) => ({ annee, v, k }));
  const pub = pts(publique, "pub");
  const pri = pts(privee, "pri");
  const me = pts(serie, "me");
  const definis = [...me, ...pub, ...pri].filter((x) => x.v !== null);
  if (definis.length === 0) return "";
  const valeurs = definis.map((x) => x.v!);
  const annees = [...new Set([...me, ...pub, ...pri].map((x) => x.annee))].sort((a, b) => a - b);
  // Au-delà de six rentrées : une étiquette sur deux, en comptant depuis la dernière (largeur 320).
  const graduations = annees.length > 6 ? annees.filter((_, i) => (annees.length - 1 - i) % 2 === 0) : annees;
  const calculee = new Set(calculees);
  const plein = (d: { annee: number; v: number | null }) => d.v !== null && !calculee.has(d.annee);
  const creux = (d: { annee: number; v: number | null }) => d.v !== null && calculee.has(d.annee);
  const p = Plot.plot({
    document, width: 320, height: 110, marginLeft: 34, marginRight: 12, marginTop: 10, style: STYLE,
    x: { domain: [Math.min(...annees), Math.max(...annees)], ticks: graduations, tickFormat: (a: number) => String(a), label: null },
    y: { domain: [Math.min(...valeurs) - 4, Math.max(...valeurs) + 4], label: null, ticks: 3, grid: true, tickFormat: (d: number) => nombre(d, 0) },
    marks: [
      Plot.line(pub, { x: "annee", y: "v", stroke: "var(--pub)", strokeWidth: 2 }),
      Plot.line(pri, { x: "annee", y: "v", stroke: "var(--pri)", strokeWidth: 2, strokeDasharray: "4 3" }),
      Plot.dot(pub.filter(plein), { x: "annee", y: "v", r: 2.5, fill: "var(--pub)" }),
      Plot.dot(pub.filter(creux), { x: "annee", y: "v", r: 3, fill: "var(--surface)", stroke: "var(--pub)", strokeWidth: 1.5 }),
      Plot.dot(pri.filter(plein), { x: "annee", y: "v", r: 2.5, fill: "var(--pri)" }),
      Plot.dot(pri.filter(creux), { x: "annee", y: "v", r: 3, fill: "var(--surface)", stroke: "var(--pri)", strokeWidth: 1.5 }),
      Plot.line(me, { x: "annee", y: "v", stroke: "var(--me)", strokeWidth: 2.5 }),
      Plot.dot(me, { x: "annee", y: "v", r: 3, fill: "var(--me)" }),
    ],
  });
  const decrit = (nom: string, s: typeof pub) => `${nom} : ${s.map((d) => `${d.annee} ${d.v === null ? "non disponible" : nombre(d.v)}`).join(", ")}`;
  const aria = me.length
    ? `Évolution : ${serie.map(([a, v]) => `${a} ${nombre(v)}`).join(", ")}`
    : `Évolution : ${[decrit("public", pub), decrit("privé sous contrat", pri)].join(" ; ")}`;
  return svg(p, aria);
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

/** Infobulle d'un point : « nom (commune) · secteur · IPS x · réussite y % · valeur ajoutée ±z · n candidats ». */
export function titrePoint(voie: Nuage["voie"], p: PointNuage): string {
  const taux = nombre(p.taux, Number.isInteger(p.taux) ? 0 : 1);
  return [
    `${p.nom} (${p.commune})`, SECTEURS[p.secteur], `IPS ${nombre(p.ips)}`, `réussite ${taux}${FINE}%`,
    p.va === null ? LIBELLES_NUAGES.vaNonPubliee : `valeur ajoutée ${vaSignee(p.va)}`,
    ...(p.effectif === null ? [] : [`${nombre(p.effectif, 0)} ${LIBELLES_NUAGES.effectif[voie]}`]),
  ].join(" · ");
}

/**
 * Options Plot d'un nuage IPS × réussite : fonction pure des données (réutilisable dans le navigateur, sans
 * `document`). Public : disque plein ; privé : contour sans remplissage ; rayon fixe, aucune couleur selon la valeur,
 * aucun texte sur les points (l'infobulle `title` porte le nom). Une seule ligne par axe : la moyenne du territoire.
 */
export function optionsNuage(n: Nuage): Plot.PlotOptions {
  const titre = (p: PointNuage) => titrePoint(n.voie, p);
  const publics = n.points.filter((p) => p.secteur === "public");
  const prives = n.points.filter((p) => p.secteur !== "public");
  const ips = domaine([...n.points.map((p) => p.ips), n.moyennes.ips]);
  const taux = domaine([...n.points.map((p) => p.taux), n.moyennes.taux]);
  return {
    width: 640, height: 380, marginLeft: 44, marginRight: 14, marginTop: 12, marginBottom: 40, style: STYLE,
    x: { domain: ips, label: LIBELLES_NUAGES.axeIps, labelAnchor: "center", tickFormat: (d: number) => nombre(d, 0) },
    y: { domain: [taux[0], Math.min(100, taux[1])], label: LIBELLES_NUAGES.axeTaux, labelAnchor: "center", tickFormat: (d: number) => nombre(d, 0) },
    marks: [
      ...(n.moyennes.ips === null ? [] : [Plot.ruleX([n.moyennes.ips], { stroke: "var(--muted)", strokeDasharray: "4 3", className: "moyenne-ips" })]),
      ...(n.moyennes.taux === null ? [] : [Plot.ruleY([n.moyennes.taux], { stroke: "var(--muted)", strokeDasharray: "4 3", className: "moyenne-taux" })]),
      Plot.dot(publics, { x: "ips", y: "taux", r: 3, fill: "var(--pub)", title: titre }),
      Plot.dot(prives, { x: "ips", y: "taux", r: 3, fill: "var(--surface)", stroke: "var(--pri)", strokeWidth: 1.5, title: titre }),
    ],
  };
}

/** SVG d'un nuage, rendu au build (coordonnées à une décimale, comme les cartes). */
export function svgNuage(n: Nuage): string {
  const p = Plot.plot({ document, ...optionsNuage(n) });
  return svg(p, `${LIBELLES_NUAGES.titres[n.voie]} : ${n.points.length} établissements`, 1);
}

/**
 * Évolution de l'indice d'entropie d'un département : « Ensemble des collèges » (trait plein) et « Entre public et privé »
 * (pointillé). Une valeur absente fait un trou dans la ligne, jamais un zéro ; l'axe part de 0.
 */
export function svgSegregation(annees: AnneeSegregation[]): string {
  const pts = (cle: "ensemble" | "publicPrive") => annees.map((a) => ({ annee: a.annee, v: a.entropie[cle] }));
  const ensemble = pts("ensemble");
  const publicPrive = pts("publicPrive");
  const definis = [...ensemble, ...publicPrive].filter((x) => x.v !== null);
  if (definis.length === 0) return "";
  const xs = annees.map((a) => a.annee);
  const graduations = xs.length > 6 ? xs.filter((_, i) => (xs.length - 1 - i) % 2 === 0) : xs;
  const p = Plot.plot({
    document, width: 320, height: 130, marginLeft: 38, marginRight: 12, marginTop: 10, style: STYLE,
    x: { domain: [Math.min(...xs), Math.max(...xs)], ticks: graduations, tickFormat: (a: number) => String(a), label: null },
    y: { domain: [0, Math.max(...definis.map((x) => x.v!)) * 1.1], label: null, ticks: 4, grid: true, tickFormat: (d: number) => nombre(d, 2) },
    marks: [
      // Plot sépare la ligne aux valeurs null : le trou n'est jamais comblé.
      Plot.line(ensemble, { x: "annee", y: "v", stroke: "var(--me)", strokeWidth: 2.5 }),
      Plot.line(publicPrive, { x: "annee", y: "v", stroke: "var(--ink)", strokeWidth: 2, strokeDasharray: "4 3" }),
      Plot.dot(ensemble.filter((d) => d.v !== null), { x: "annee", y: "v", r: 3, fill: "var(--me)" }),
      Plot.dot(publicPrive.filter((d) => d.v !== null), { x: "annee", y: "v", r: 2.5, fill: "var(--ink)" }),
    ],
  });
  const decrit = (nom: string, s: typeof ensemble) => `${nom} : ${s.map((d) => `${d.annee} ${d.v === null ? "non disponible" : nombre(d.v, 3)}`).join(", ")}`;
  return svg(p, `Évolution de l'indice d'entropie. ${decrit(LIBELLES_SEGREGATION.indices.ensemble, ensemble)} ; ${decrit(LIBELLES_SEGREGATION.indices.publicPrive, publicPrive)}`);
}

/**
 * Élèves et classes d'une école sur toute la série : élèves en trait plein (axe de gauche), classes en pointillé
 * (axe de droite, ramené à l'échelle des élèves) ; les ouvertures et fermetures de classes se lisent sur la marche.
 * Une valeur absente, ou 0 classe, fait un trou dans la ligne, jamais un zéro. Chaîne vide sans aucune valeur.
 */
export function svgElevesClasses(historique: Classes["historique"]): string {
  const eleves = historique.map(([annee, e]) => ({ annee, v: e }));
  const nbClasses = historique.map(([annee, , c]) => ({ annee, n: c === 0 ? null : c }));
  const ve = eleves.flatMap((d) => (d.v === null ? [] : [d.v]));
  const vc = nbClasses.flatMap((d) => (d.n === null ? [] : [d.n]));
  if (ve.length === 0 && vc.length === 0) return "";
  const maxE = Math.max(1, ...ve);
  const maxC = Math.max(1, ...vc);
  const k = maxE / maxC; // facteur d'échelle des classes vers l'axe des élèves
  const classes = nbClasses.map((d) => ({ annee: d.annee, v: d.n === null ? null : d.n * k }));
  const pas = Math.max(1, Math.ceil(maxC / 4));
  const ticksClasses: number[] = [];
  for (let c = 0; c <= maxC; c += pas) ticksClasses.push(c * k);
  const annees = historique.map(([a]) => a);
  const graduations = annees.length > 6 ? annees.filter((_, i) => (annees.length - 1 - i) % 2 === 0) : annees;
  // Ronds seulement pour la dernière rentrée et pour un point isolé (sans voisin, la ligne ne le montrerait pas) :
  // une série de quinze rentrées reste légère.
  const ronds = (s: { v: number | null }[]) => s.filter((d, i) =>
    d.v !== null && (i === s.length - 1 || ((s[i - 1]?.v ?? null) === null && (s[i + 1]?.v ?? null) === null)));
  const p = Plot.plot({
    document, width: 320, height: 130, marginLeft: 34, marginRight: 28, marginTop: 10, style: STYLE,
    x: {
      domain: annees.length > 1 ? [annees[0]!, annees.at(-1)!] : [annees[0]! - 1, annees[0]! + 1],
      ticks: graduations, tickFormat: (a: number) => String(a), label: null, tickSize: 0,
    },
    y: { domain: [0, maxE * 1.1], axis: null },
    marks: [
      Plot.gridY({ ticks: 3 }),
      Plot.axisY({ anchor: "left", ticks: 3, tickFormat: (d: number) => nombre(d, 0), label: null, tickSize: 0 }),
      Plot.axisY(ticksClasses, { anchor: "right", tickFormat: (d: number) => nombre(d / k, 0), label: null, tickSize: 0 }),
      // Plot sépare la ligne aux valeurs null : le trou n'est jamais comblé.
      Plot.line(eleves, { x: "annee", y: "v", stroke: "var(--me)", strokeWidth: 2.5 }),
      Plot.dot(ronds(eleves), { x: "annee", y: "v", r: 3, fill: "var(--me)" }),
      Plot.line(classes, { x: "annee", y: "v", stroke: "var(--ink)", strokeWidth: 2, strokeDasharray: "4 3", curve: "step" }),
      Plot.dot(ronds(classes), { x: "annee", y: "v", r: 2.5, fill: "var(--ink)" }),
    ],
  });
  // Description : les élèves rentrée par rentrée, les classes par périodes de même nombre (« 8 de 2011 à 2018 »).
  const val = (n: number | null) => (n === null ? "non disponible" : nombre(n, 0));
  const periodes: { n: number | null; de: number; a: number }[] = [];
  for (const d of nbClasses) {
    const der = periodes.at(-1);
    if (der && der.n === d.n) der.a = d.annee;
    else periodes.push({ n: d.n, de: d.annee, a: d.annee });
  }
  const aria = `Élèves : ${eleves.map((d) => `${d.annee} ${val(d.v)}`).join(", ")}. Classes : ${
    periodes.map((x) => `${val(x.n)} ${x.de === x.a ? `en ${x.de}` : `de ${x.de} à ${x.a}`}`).join(", ")}`;
  // La marche répète chaque sommet (« L43.2,18.1L43.2,18.1 ») : un seul suffit.
  return svg(p, aria, 1).replace(/(L[\d.]+,[\d.]+)\1+/g, "$1");
}
