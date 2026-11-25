// Bâtiment et travaux des lycées, par UAI, à partir des tables de 09_batiments_lycees.sql (Région Île-de-France).
import type { LigneTravaux } from "@obs/shared/donnees";
import type { Batiment, BatimentDetail, Fiche, OperationPpi, OperationVotee } from "@obs/shared/types";
import type { Db } from "./db.ts";

const somme = (v: (number | null)[]): number | null => {
  const d = v.filter((x) => x !== null);
  return d.length ? d.reduce((a, b) => a + b, 0) : null;
};

/**
 * Lignes « bâtiment et travaux » d'un territoire : une par établissement qui a des données de la région,
 * triées par nom puis UAI ; undefined si aucune (le champ est alors absent du JSON).
 */
export function lignesTravaux(fiches: Fiche[]): LigneTravaux[] | undefined {
  const lignes = fiches
    .filter((f): f is Fiche & { batiment: Batiment } => f.batiment !== undefined)
    .map((f): LigneTravaux => {
      const b = f.batiment;
      const annees = [
        ...b.ppi.map((o) => o.anneeLivraison ?? o.anneeIndividualisation),
        ...b.operations.map((o) => o.derniereAnnee),
      ].filter((a) => a !== null);
      return {
        uai: f.uai, nom: f.nom, commune: f.commune, famille: f.famille, anneeConstruction: b.anneeConstruction,
        ppi: b.ppi.length, enveloppePpiMeur: somme(b.ppi.map((o) => o.enveloppeMeur)),
        operations: b.operations.length, montantVote: somme(b.operations.map((o) => o.montantVote)),
        derniereAnnee: annees.length ? Math.max(...annees) : null,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.uai.localeCompare(b.uai));
  return lignes.length ? lignes : undefined;
}

const entier = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function calculerBatiments(db: Db): Promise<Map<string, Batiment>> {
  const res = new Map<string, Batiment>();
  const entree = (uai: string): Batiment => {
    let b = res.get(uai);
    if (!b) res.set(uai, (b = { anneeConstruction: null, batiments: [], ppi: [], operations: [] }));
    return b;
  };
  // Bretagne : bâtiments un par un ; l'année du lycée est celle du plus grand en surface bâtie.
  const details = await db.sql<{
    uai: string; libelle: string; nom: string | null; fonction: string | null; annee: number | null; surface: number | null; niveaux: number | null;
  }>("select uai, libelle, nom, fonction, annee, surface, niveaux from batiments_detail order by uai, annee nulls last, libelle, code");
  for (const l of details) {
    const d: BatimentDetail = {
      libelle: l.libelle, nom: l.nom, fonction: l.fonction, annee: entier(l.annee), surface: l.surface, niveaux: entier(l.niveaux),
    };
    entree(l.uai).batiments.push(d);
  }
  for (const b of res.values()) {
    if (!b.batiments.length) continue;
    const plusGrand = b.batiments.reduce((a, x) => ((x.surface ?? -1) > (a.surface ?? -1) ? x : a));
    b.anneeConstruction = plusGrand.annee;
  }
  for (const l of await db.sql<{ uai: string; annee_construction: number }>("select uai, annee_construction from batiments_lycees")) {
    entree(l.uai).anneeConstruction = entier(l.annee_construction);
  }
  const ppi = await db.sql<{
    uai: string; ppi: string | null; intitule: string; enveloppe_meur: number | null; etat: string | null;
    annee_individualisation: number | null; annee_livraison: number | null;
  }>(`select * from travaux_ppi
      order by uai, coalesce(annee_livraison, annee_individualisation) desc nulls last, intitule`);
  for (const l of ppi) {
    const o: OperationPpi = {
      ppi: l.ppi, intitule: l.intitule, enveloppeMeur: l.enveloppe_meur, etat: l.etat,
      anneeIndividualisation: entier(l.annee_individualisation), anneeLivraison: entier(l.annee_livraison),
    };
    entree(l.uai).ppi.push(o);
  }
  const ops = await db.sql<{
    uai: string; intitule: string; premiere_annee: number | null; derniere_annee: number | null; montant_vote: number | null; decisions: number;
  }>("select * from travaux_operations order by uai, derniere_annee desc nulls last, montant_vote desc nulls last, intitule");
  for (const l of ops) {
    const o: OperationVotee = {
      intitule: l.intitule, premiereAnnee: entier(l.premiere_annee), derniereAnnee: entier(l.derniere_annee),
      montantVote: l.montant_vote, decisions: Number(l.decisions),
    };
    entree(l.uai).operations.push(o);
  }
  return res;
}
