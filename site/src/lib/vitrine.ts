// Établissement vitrine de l'accueil et de /sources/ : ses chiffres clés, chacun relié aux sources numérotées d'où il vient.
import type { EntreeIndex } from "@obs/shared/donnees";
import { entier } from "@obs/shared/format";
import { estEcole, LIBELLES_RESULTATS as LRES, LIBELLES_SYNTHESE as LS, type CodeIndicateur } from "@obs/shared/libelles";
import type { Fiche, SourceId } from "@obs/shared/types";
import { formater, reference } from "./affichage";
import { niveauDe } from "./budget";
import { lireFiche, lireIndex } from "./donnees";
import { producteurCourt } from "./fabrique";
import { resultatsSynthese, moyensSynthese } from "./synthese";

export interface SourceVitrine {
  numero: number; id: SourceId; titre: string; producteur: string; portail: string; pageUrl: string;
  /** Précision utile sur le jeu (/sources/), quand il y en a une. */
  precision?: string;
}

/** Précisions affichées sur /sources/ à côté des jeux de la vitrine, dans le vocabulaire des producteurs. */
function precisionDe(id: string): string | undefined {
  if (id === "annuaire") return "relu chaque nuit";
  if (id === "carte_scolaire") return "secteurs définis par le conseil départemental";
  if (id.endsWith("_2016")) return "série 2016-2021, méthode d'avant 2022";
  if (id.endsWith("_2022")) return "rentrée 2022, nouvelle méthode";
  if (id.startsWith("budget_")) return "un jeu par exercice, extrait filtré";
  return undefined;
}
export interface TuileVitrine { libelle: string; valeur: string; detail: string | null; numeros: number[]; large?: boolean }
export interface Vitrine {
  uai: string; nom: string; sousTitre: string; lien: string;
  tuiles: TuileVitrine[]; sources: SourceVitrine[]; producteurs: string[]; portails: number;
}

/** Sources citées par la fiche, dédoublonnées par page d'origine, numérotées 1..N dans l'ordre de la fiche. */
export function sourcesVitrine(f: Fiche): SourceVitrine[] {
  const vues = new Set<string>();
  const out: SourceVitrine[] = [];
  for (const s of f.sources) {
    if (vues.has(s.pageUrl)) continue;
    vues.add(s.pageUrl);
    const precision = precisionDe(s.id);
    out.push({
      numero: out.length + 1, id: s.id, titre: s.titre, producteur: producteurCourt(s.producteur), portail: new URL(s.pageUrl).hostname,
      pageUrl: s.pageUrl, ...(precision ? { precision } : {}),
    });
  }
  return out;
}

/** Les chiffres clés de la vitrine ; une tuile dont la donnée manque est omise (jamais remplacée par zéro). */
export function tuilesVitrine(f: Fiche, sources: SourceVitrine[]): TuileVitrine[] {
  // Numéro de chaque jeu cité, y compris les extraits qui partagent la page d'un autre.
  const parPage = new Map(sources.map((s) => [s.pageUrl, s.numero]));
  const numeroDe = new Map(f.sources.map((s) => [s.id as string, parPage.get(s.pageUrl)!]));
  const numeros = (ids: (string | null | undefined)[]) =>
    [...new Set(ids.map((id) => (id ? numeroDe.get(id) : undefined)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
  const ind = (code: CodeIndicateur) => f.indicateurs.find((i) => i.code === code);
  const ok = (code: CodeIndicateur) => { const i = ind(code); return i && i.mesure.statut === "ok" && i.mesure.valeur !== null ? i : undefined; };
  const dep = (code: CodeIndicateur, secteur: "public" | "prive_sous_contrat") => {
    const r = reference(ind(code)!, "departement", secteur);
    return r && r.statut === "ok" && r.valeur !== null ? formater(code, r.valeur) : null;
  };
  const tuiles: TuileVitrine[] = [];

  const eleves = ok("eleves");
  if (eleves) {
    const h = eleves.historique;
    tuiles.push({
      libelle: `Élèves · ${eleves.mesure.rentree}`, valeur: formater("eleves", eleves.mesure.valeur!),
      detail: h.length > 1 ? `${h[0]![0]} → ${h.at(-1)![0]} : ${entier(h[0]![1])} … ${entier(h.at(-1)![1])}` : null,
      numeros: numeros([eleves.mesure.source, ...(eleves.sourcesHistorique ?? [])]),
    });
  }

  const etp = ok("eleves_par_etp_ens");
  if (etp) {
    const p = dep("eleves_par_etp_ens", "public");
    tuiles.push({ libelle: "Élèves par ETP enseignant", valeur: formater("eleves_par_etp_ens", etp.mesure.valeur!), detail: p && `dép. public ${p}`, numeros: numeros([etp.mesure.source]) });
  }

  const ips = ok("ips");
  if (ips) {
    const h = ips.historique;
    const jeux = new Set(ips.sourcesHistorique ?? []);
    const periode = h.length > 1 ? ` · ${h[0]![0]} → ${h.at(-1)![0]}` : ` · ${ips.mesure.rentree}`;
    const pub = dep("ips", "public"), pri = dep("ips", "prive_sous_contrat");
    tuiles.push({
      libelle: `IPS${periode}${jeux.size >= 2 ? ", deux séries raboutées" : ""}`, valeur: formater("ips", ips.mesure.valeur!),
      detail: [pub && `dép. public ${pub}`, pri && `dép. privé s. c. ${pri}`].filter(Boolean).join(" · ") || null,
      numeros: numeros([ips.mesure.source, ...jeux]), large: true,
    });
  }

  const res = resultatsSynthese(f)[0];
  if (res && res.taux !== null) {
    tuiles.push({
      libelle: `${res.voie} · ${LRES.session(res.session)}`, valeur: res.taux,
      detail: res.va !== null ? `${LS.va} : ${res.va}` : res.vaNonPubliee ? `${LS.va} : ${LRES.nonPublie}` : null,
      numeros: numeros([f.resultats[0]!.source]),
    });
  }

  const niveau = estEcole(f.famille) ? "ecoles" : niveauDe(f.famille);
  const budget = (niveau === "colleges" ? f.budget.colleges : niveau === "lycees" ? f.budget.lycees : f.budget.ecoles) ?? null;
  const moyens = moyensSynthese(budget, f.budget.france.find((m) => m.niveau === niveau), f.secteur === "public" ? "public" : "prive", niveau);
  if (moyens && !moyens.absent) {
    tuiles.push({
      libelle: `${f.secteur === "public" ? "Fonctionnement par élève" : "Contribution par élève"} · ${moyens.exercice}`, valeur: moyens.texte,
      detail: moyens.france && `France ${moyens.france}`,
      numeros: numeros(f.sources.filter((s) => s.id === `budget_${moyens.exercice}`).map((s) => s.id)),
    });
  }

  const secteur = f.ecolesDuSecteur;
  if (secteur && secteur.length > 0) {
    tuiles.push({
      libelle: "Secteur de recrutement", valeur: `${entier(secteur.length)} école${secteur.length > 1 ? "s" : ""} du secteur`,
      detail: null, numeros: numeros(["carte_scolaire"]), large: true,
    });
  }
  // Une tuile sans source citée par la fiche ne peut pas porter de pastille : elle est omise, et le build le dit.
  for (const t of tuiles) if (t.numeros.length === 0) console.warn(`[vitrine] ${f.uai} : tuile « ${t.libelle} » omise, aucune source citée par la fiche.`);
  return tuiles.filter((t) => t.numeros.length > 0);
}

/** Vitrine d'un UAI ; null (avec avertissement) si l'établissement n'a pas de page ouverte. Lecteurs injectables pour les tests. */
export function vitrineDe(uai: string, index: () => EntreeIndex[] = lireIndex, fiche: (u: string) => Fiche = lireFiche): Vitrine | null {
  const e = index().find((x) => x.u === uai);
  if (!e || e.x) {
    console.warn(`[vitrine] ${uai} : aucune page ouverte ; le bloc vitrine est omis.`);
    return null;
  }
  let f: Fiche;
  try { f = fiche(uai); } catch {
    console.warn(`[vitrine] ${uai} : fiche illisible ; le bloc vitrine est omis.`);
    return null;
  }
  if (f.disparuLe !== null || f.fermeLe !== null) {
    console.warn(`[vitrine] ${uai} : établissement fermé ou disparu ; le bloc vitrine est omis.`);
    return null;
  }
  const sources = sourcesVitrine(f);
  return {
    uai, nom: f.nom, lien: `/etablissement/${uai}/`,
    sousTitre: `${f.secteur === "public" ? "Public" : "Privé sous contrat"} · ${f.commune} · UAI ${uai}`,
    tuiles: tuilesVitrine(f, sources), sources,
    producteurs: [...new Set(sources.map((s) => s.producteur))],
    portails: new Set(sources.map((s) => s.portail)).size,
  };
}

/** Vitrine configurée (`VITRINE.UAI` de observatoire.config.json, passé par la page), ou null. */
export const chargerVitrine = (uai: string | undefined): Vitrine | null => (uai ? vitrineDe(uai) : null);
