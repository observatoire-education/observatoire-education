// Bâtiment et travaux des lycées, par UAI, à partir des tables de 09_batiments_lycees.sql (Région Île-de-France).
import type { Batiment, OperationPpi, OperationVotee } from "@obs/shared/types";
import type { Db } from "./db.ts";

const entier = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function calculerBatiments(db: Db): Promise<Map<string, Batiment>> {
  const res = new Map<string, Batiment>();
  const entree = (uai: string): Batiment => {
    let b = res.get(uai);
    if (!b) res.set(uai, (b = { anneeConstruction: null, ppi: [], operations: [] }));
    return b;
  };
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
