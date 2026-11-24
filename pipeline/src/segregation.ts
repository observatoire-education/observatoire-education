// Ségrégation sociale entre collèges (DEPP) : une série par département, telle que publiée.
import type { AnneeSegregation } from "@obs/shared/donnees";
import type { Db } from "./db.ts";

interface Ligne {
  dep: string; annee: number; nb_coll_calcul: number | null; poids_prive_calcul: number | null;
  i_entropie_tot: number | null; i_entropie_pu: number | null; i_entropie_pr: number | null; i_entropie_interpupr: number | null;
  contrib_pu: number | null; contrib_pr: number | null; contrib_interpupr: number | null;
}

/** Séries par département (code canonique), années croissantes. Une valeur non publiée reste `null`, jamais 0. */
export async function calculerSegregation(db: Db): Promise<Map<string, AnneeSegregation[]>> {
  const lignes = await db.sql<Ligne>("select * from segregation order by dep, annee");
  const par = new Map<string, AnneeSegregation[]>();
  for (const l of lignes) {
    const serie = par.get(l.dep) ?? [];
    serie.push({
      annee: Number(l.annee), colleges: l.nb_coll_calcul, partPrive: l.poids_prive_calcul,
      entropie: { ensemble: l.i_entropie_tot, public: l.i_entropie_pu, prive: l.i_entropie_pr, publicPrive: l.i_entropie_interpupr },
      // Contributions publiées en % (somme ≈ 100) : affichées telles quelles.
      contributions: { public: l.contrib_pu, prive: l.contrib_pr, publicPrive: l.contrib_interpupr },
    });
    par.set(l.dep, serie);
  }
  return par;
}
