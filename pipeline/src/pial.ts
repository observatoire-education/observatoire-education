// PIAL (pôle inclusif d'accompagnement localisé) d'après la colonne `pial` de l'Annuaire : chaque établissement
// ouvert y indique l'UAI de la tête de son pôle (collège, lycée, école ou circonscription).
import type { Famille, MembreEtab, Pial, Secteur } from "@obs/shared/types";
import type { Db } from "./db.ts";

export interface RapportPial {
  /** Têtes de PIAL sans fiche (circonscription, établissement hors périmètre) : leurs membres n'affichent aucun PIAL. */
  tetesSansFiche: number;
  /** Établissements rattachés à un PIAL dont la tête n'a pas de fiche. */
  membresSansTete: number;
}

const parNom = (a: MembreEtab, b: MembreEtab) => a.nom.localeCompare(b.nom, "fr") || a.uai.localeCompare(b.uai);

/**
 * PIAL de chaque établissement ouvert, sous la clé de chaque membre et de la tête. Un PIAL dont la tête n'a pas
 * de fiche est ignoré (compté dans `rapport`), comme un PIAL sans autre membre que sa tête. Un établissement
 * tête d'un PIAL et membre d'un autre reçoit celui dont il est la tête.
 */
export async function calculerPial(db: Db, rapport?: RapportPial): Promise<Map<string, Pial>> {
  type Ligne = MembreEtab & { pial: string | null };
  const ouverts = await db.sql<Ligne>(
    `select uai, nom, null::varchar as "fermeLe", famille, secteur, pial from etablissements order by uai`,
  );
  // La tête peut être fermée et garder une fiche historique : son lien porte alors la date de fermeture.
  const fermes = await db.sql<MembreEtab>(
    `select uai, nom, date_fermeture::varchar as "fermeLe", famille, secteur from historiques order by uai`,
  );
  const fiches = new Map<string, MembreEtab>(
    [...ouverts, ...fermes].map(({ uai, nom, fermeLe, famille, secteur }) => [
      uai, { uai, nom, fermeLe, famille: famille as Famille, secteur: secteur as Secteur },
    ]),
  );

  const resultat = new Map<string, Pial>();
  const tetes: [string, Pial][] = [];
  let tetesSansFiche = 0;
  let membresSansTete = 0;
  for (const [tete, lignes] of Map.groupBy(ouverts.filter((l) => l.pial !== null), (l) => l.pial!)) {
    const membres = lignes.filter((l) => l.uai !== tete).map((l) => fiches.get(l.uai)!).sort(parNom);
    const lien = fiches.get(tete);
    if (!lien) {
      tetesSansFiche++;
      membresSansTete += membres.length;
      continue;
    }
    if (membres.length === 0) continue;
    const pial: Pial = { tete: lien, membres };
    for (const m of membres) resultat.set(m.uai, pial);
    tetes.push([tete, pial]);
  }
  for (const [tete, pial] of tetes) resultat.set(tete, pial);
  if (rapport) Object.assign(rapport, { tetesSansFiche, membresSansTete });
  return resultat;
}
