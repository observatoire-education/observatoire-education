// Chiffres de la Synthèse (fiches et territoires) : fonctions pures, même donnée et même mise en forme que les onglets.
import type { BudgetCollectivite, DonneesTerritoire, MoyennesBudgetFrance, SyntheseFamille } from "@obs/shared/donnees";
import type { NiveauBudget } from "@obs/shared/collectivites";
import { entier } from "@obs/shared/format";
import { LIBELLES, LIBELLES_RESULTATS, LIBELLES_SYNTHESE } from "@obs/shared/libelles";
import type { Famille, Fiche } from "@obs/shared/types";
import { montantBudget } from "./budget";
import { tauxEntier, vaSignee } from "./resultats";

/** Une ligne par voie de la fiche : taux de réussite et valeur ajoutée publiée (null si absents). */
export function resultatsSynthese(f: Fiche): { voie: string; session: number; taux: string | null; va: string | null }[] {
  return f.resultats.map((r) => {
    const v = r.valeurs.find((x) => x.code === "taux_reussite");
    return {
      voie: LIBELLES_RESULTATS.voies[r.voie],
      session: r.session,
      taux: v && v.statut === "ok" && v.valeur !== null ? tauxEntier(v.valeur) : null,
      va: v && v.statutVa === "ok" && v.va !== null ? vaSignee(v.va) : null,
    };
  });
}

export interface MoyensSynthese { exercice: number; texte: string; absent: boolean; france: string | null }

/** Fonctionnement (public, hors personnel) ou contribution (privé) par élève au dernier exercice, avec la moyenne France du même exercice. */
export function moyensSynthese(
  budget: BudgetCollectivite | null,
  france: MoyennesBudgetFrance | undefined,
  secteur: "public" | "prive",
  niveau: NiveauBudget,
): MoyensSynthese | null {
  const e = budget?.exercices.at(-1);
  if (!e) return null;
  const m = secteur === "public" ? e.public.horsPersonnel : e.prive.fonctionnement;
  const moy = france?.exercices.find((x) => x.exercice === e.exercice);
  const f = moy ? (secteur === "public" ? moy.public.horsPersonnel : moy.prive.fonctionnement).valeur : null;
  return { exercice: e.exercice, ...montantBudget(m, niveau), france: f === null ? null : entier(f) };
}

/** Élèves du second degré (somme des familles), part du privé, et familles dont un effectif n'est pas publié. */
export function totalSecondDegre(familles: [Famille, SyntheseFamille][]): {
  eleves: number | null; prive: number | null; partPrive: number | null; nonPubliees: Famille[];
} {
  let eleves = 0, prive = 0, connu = false, connuPrive = false;
  const nonPubliees: Famille[] = [];
  for (const [fam, s] of familles) {
    const manque = (["public", "prive"] as const).some((k) => s.compte[k] > 0 && s.eleves[k] === null);
    if (manque) nonPubliees.push(fam);
    if (s.eleves.public !== null) { eleves += s.eleves.public; connu = true; }
    if (s.eleves.prive !== null) { eleves += s.eleves.prive; prive += s.eleves.prive; connu = connuPrive = true; }
  }
  return {
    eleves: connu ? eleves : null,
    prive: connuPrive ? prive : null,
    partPrive: connu && connuPrive && eleves > 0 ? prive / eleves : null,
    nonPubliees,
  };
}

/** Moyens de la Synthèse d'un territoire : collèges (département et France), lycées (région) ; null ailleurs. */
export function moyensTerritoire(d: DonneesTerritoire): (MoyensSynthese & { libelle: string }) | null {
  const niveau = d.ref.niveau;
  const libelle = LIBELLES_SYNTHESE.moyens;
  if (niveau === "france") {
    const e = d.budget.france.find((x) => x.niveau === "colleges")?.exercices.at(-1);
    if (!e) return null;
    const m = e.public.horsPersonnel;
    return { exercice: e.exercice, texte: m.valeur === null ? LIBELLES.nonDisponible : entier(m.valeur), absent: m.valeur === null, france: null, libelle };
  }
  const nb: NiveauBudget | null = niveau === "departement" ? "colleges" : niveau === "region" ? "lycees" : null;
  if (!nb) return null;
  const r = moyensSynthese(
    d.budget.collectivites.find((c) => c.niveau === nb) ?? null,
    d.budget.france.find((x) => x.niveau === nb),
    "public",
    nb,
  );
  return r && { ...r, libelle };
}
