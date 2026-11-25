// Transport scolaire : mise en forme des tables `transport_montants` et `transport_m71` pour les pages.
import { comparerCollectivites, type IdCollectivite, libelleCollectivite } from "@obs/shared/collectivites";
import type { CollectiviteTransport, ExerciceTransport, TransportTerritoire } from "@obs/shared/donnees";
import type { Db } from "./db.ts";

export interface TableTransport {
  exercices: number[];
  collectivites: Map<IdCollectivite, CollectiviteTransport>;
}

const POSTES = { fonctionnement: "fonctionnement", investissement: "investissement", produits_services: "produitsServices" } as const;

const exerciceVide = (exercice: number): ExerciceTransport =>
  ({ exercice, fonctionnement: null, investissement: null, produitsServices: null });

const estGroupement = (id: IdCollectivite) => id.startsWith("grp-");

/** Lit les montants et les exercices M71 ; une série par collectivité, un élément par exercice (null si absent). */
export async function lireTransport(db: Db): Promise<TableTransport> {
  const montants = await db.sql<{ exercice: number; collectivite: string; libelle: string; poste: keyof typeof POSTES; montant: number }>(
    "select exercice, collectivite, libelle, poste, montant from transport_montants order by all");
  const m71 = await db.sql<{ exercice: number; collectivite: string }>("select exercice, collectivite from transport_m71 order by all");
  const exercices = (await db.sql<{ e: number }>(
    "select table_name as e from information_schema.tables where regexp_matches(table_name, '^src_transport_[0-9]{4}$') order by 1",
  )).map((x) => Number(String(x.e).slice(-4)));
  const collectivites = new Map<IdCollectivite, CollectiviteTransport>();
  const de = (id: string, libelle: string) => {
    let c = collectivites.get(id);
    if (!c) {
      c = { id, libelle: estGroupement(id) ? libelle : libelleCollectivite(id), serie: exercices.map(exerciceVide) };
      collectivites.set(id, c);
    }
    return c;
  };
  for (const r of montants) {
    const e = de(r.collectivite, r.libelle).serie.find((x) => x.exercice === r.exercice);
    if (e) e[POSTES[r.poste]] = r.montant;
  }
  for (const r of m71) {
    const e = de(r.collectivite, "").serie.find((x) => x.exercice === r.exercice);
    if (e) e.nomenclatureM71 = true;
  }
  return { exercices, collectivites };
}

const presentes = (t: TableTransport, ids: IdCollectivite[]) =>
  ids.flatMap((id) => (t.collectivites.has(id) ? [t.collectivites.get(id)!] : []));

/** Collectivité unique qui exerce les compétences de la Région (CTU ; à Mayotte, le Département). */
const CTU_DE_REGION: Record<string, IdCollectivite> = { "94": "ctu-corse", "02": "ctu-martinique", "03": "ctu-guyane", "06": "dep-976" };

export function transportRegion(t: TableTransport, region: string): TransportTerritoire {
  const ids = [`reg-${region}`, ...(CTU_DE_REGION[region] ? [CTU_DE_REGION[region]] : [])];
  const collectivites = presentes(t, ids);
  return { collectivites, exercices: t.exercices, ...(collectivites.length ? {} : { absence: "region_sans_ligne" as const }) };
}

/** Collectivités à compétence départementale propres à certains départements. */
const PARTICULIERES: Record<string, IdCollectivite[]> = {
  "69": ["ml-lyon"], "67": ["cea"], "68": ["cea"], "75": ["paris"],
  // Collectivités territoriales uniques : elles exercent aussi les compétences départementales.
  "2A": ["ctu-corse"], "2B": ["ctu-corse"], "972": ["ctu-martinique"], "973": ["ctu-guyane"],
};

/** Somme d'un poste sur les groupements ; null si aucun n'a ce poste cet exercice-là. */
function total(liste: CollectiviteTransport[], exercices: number[]): ExerciceTransport[] {
  return exercices.map((exercice, i) => {
    const e = exerciceVide(exercice);
    for (const poste of Object.values(POSTES)) {
      const valeurs = liste.map((c) => c.serie[i]![poste]).filter((v): v is number => v !== null);
      e[poste] = valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : null;
    }
    return e;
  });
}

export function transportDepartement(t: TableTransport, dep: string): TransportTerritoire {
  const collectivites = presentes(t, [`dep-${dep}`, ...(PARTICULIERES[dep] ?? [])]);
  const liste = [...t.collectivites.values()]
    .filter((c) => c.id.startsWith(`grp-${dep}-`))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr") || a.id.localeCompare(b.id));
  return {
    collectivites,
    exercices: t.exercices,
    ...(liste.length ? { groupements: { total: total(liste, t.exercices), liste } } : {}),
    ...(collectivites.length || liste.length ? {} : { absence: "departement_sans_ligne" as const }),
  };
}

/** Page France : régions et CTU, dans l'ordre du budget. */
export function transportRegions(t: TableTransport): CollectiviteTransport[] {
  return [...t.collectivites.values()]
    .filter((c) => c.id.startsWith("reg-") || c.id.startsWith("ctu-"))
    .sort(comparerCollectivites);
}
