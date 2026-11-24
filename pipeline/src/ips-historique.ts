// IPS de 2016 à aujourd'hui : moyennes par territoire, groupe de familles et rentrée.
// Moyenne publiée par la DEPP quand elle existe (département, académie, France), sinon calculée par
// l'observatoire : Σ(IPS × élèves) / Σ élèves, arrondie à 0,1. Commune et région : toujours calculées.
// Groupes : chaque famille du second degré à part ; les écoles (maternelles, élémentaires, primaires) ensemble,
// comme les moyennes publiées par la DEPP pour les écoles. Une école n'entre jamais dans une moyenne de collèges.
import { regionDe } from "@obs/shared/collectivites";
import { estEcole, FAMILLES_SECOND_DEGRE } from "@obs/shared/libelles";
import type { Famille, Mesure, PointIps, Secteur } from "@obs/shared/types";
import { communeDeRattachement } from "@obs/shared/territoires";
import type { Db } from "./db.ts";
import { litteral } from "./duck.ts";

export type NiveauIps = "commune" | "departement" | "academie" | "region" | "france";

export interface IpsHistorique {
  /**
   * Points par rentrée croissante, un par rentrée où au moins une valeur (public ou privé) existe.
   * Pour une famille d'écoles : la série de toutes les écoles.
   */
  serie(niveau: NiveauIps, famille: Famille, territoire: string): PointIps[];
}

/** Groupe de familles des moyennes d'IPS : les écoles ensemble, chaque famille du second degré à part. */
export const groupeIps = (f: Famille): string => (estEcole(f) ? "ecoles" : f);

/** Première rentrée des effectifs : elle pondère aussi les rentrées antérieures (2016 à 2018). */
export const RENTREE_EFFECTIFS = 2019;

/**
 * Sous-requête : dernière rentrée de l'IPS du second degré (null si aucune). Les écoles n'y entrent pas : un IPS
 * des écoles publié avant celui des collèges ne doit pas sortir les collèges des agrégats ni du contrôle.
 */
export const SQL_DERNIERE_RENTREE_IPS = `(select max(i.rentree) from ips i join fiches_etab f using (uai)
  where f.famille in (${FAMILLES_SECOND_DEGRE.map(litteral).join(", ")}))`;

/** Dernière rentrée de l'IPS du second degré dans la table `ips` (null si elle est vide). */
export async function derniereRentreeIps(db: Db): Promise<number | null> {
  return (await db.sql<{ r: number | null }>(`select ${SQL_DERNIERE_RENTREE_IPS} as r`))[0]?.r ?? null;
}

/**
 * IPS d'un établissement pour un agrégat (liste, distribution, moyenne, voisin, contrôle) : seulement s'il est
 * de la dernière rentrée de l'IPS. Un IPS plus ancien (la fiche le montre, avec sa rentrée) reste hors des agrégats.
 */
export function ipsCourant(m: Mesure | undefined, derniereRentree: number | null): number | null {
  return m?.statut === "ok" && m.rentree !== null && m.rentree === derniereRentree ? m.valeur : null;
}

const arrondi1 = (x: number) => Math.round(x * 10) / 10;

interface Ligne {
  rentree: number;
  famille: Famille;
  secteur: Secteur;
  dep: string;
  aca: string;
  code_commune: string | null;
  ips: number | null;
  eleves: number | null;
  dep_public: number | null; dep_prive: number | null;
  aca_public: number | null; aca_prive: number | null;
  nat_public: number | null; nat_prive: number | null;
}

type Paire = { public: number | null; prive: number | null };
type Somme = { public: [number, number]; prive: [number, number] };

export async function calculerIpsHistorique(db: Db): Promise<IpsHistorique> {
  // Toutes les fiches (fermées comprises) ; élèves de la même rentrée, ou de RENTREE_EFFECTIFS avant.
  const lignes = await db.sql<Ligne>(`
    select i.rentree, f.famille, f.secteur, f.dep, f.aca, coalesce(e.code_commune, fe.code_commune) as code_commune,
      i.ips, w.eleves, i.dep_public, i.dep_prive, i.aca_public, i.aca_prive, i.nat_public, i.nat_prive
    from ips i
    join fiches_etab f using (uai)
    left join etablissements e using (uai)
    left join fermes fe using (uai)
    left join effectifs w on w.uai = i.uai and w.rentree = greatest(i.rentree, ${RENTREE_EFFECTIFS})`);

  // Moyennes publiées : niveau|groupe|territoire|rentrée → valeurs (constantes dans un groupe, hors null).
  const publiees = new Map<string, Paire>();
  const noter = (cle: string, pub: number | null, priv: number | null) => {
    const p = publiees.get(cle) ?? { public: null, prive: null };
    p.public ??= pub;
    p.prive ??= priv;
    publiees.set(cle, p);
  };
  // Moyennes calculées : sommes (Σ IPS × élèves, Σ élèves) par secteur.
  const sommes = new Map<string, Somme>();
  const ajouter = (cle: string, secteur: Secteur, ips: number, eleves: number) => {
    const s = sommes.get(cle) ?? { public: [0, 0], prive: [0, 0] };
    const t = secteur === "public" ? s.public : s.prive;
    t[0] += ips * eleves;
    t[1] += eleves;
    sommes.set(cle, s);
  };
  const rentreesDe = new Map<string, Set<number>>();
  // Clé par groupe de familles (écoles ensemble), pas par famille.
  const cle = (niveau: NiveauIps, famille: Famille, territoire: string, rentree?: number) =>
    `${niveau}|${groupeIps(famille)}|${territoire}${rentree === undefined ? "" : `|${rentree}`}`;
  const suivre = (c: string, rentree: number) => {
    const ens = rentreesDe.get(c) ?? new Set<number>();
    ens.add(rentree);
    rentreesDe.set(c, ens);
  };

  for (const l of lignes) {
    for (const [niveau, territoire, pub, priv] of [
      ["departement", l.dep, l.dep_public, l.dep_prive],
      ["academie", l.aca, l.aca_public, l.aca_prive],
      ["france", "FR", l.nat_public, l.nat_prive],
    ] as const) {
      if (pub === null && priv === null) continue;
      noter(cle(niveau, l.famille, territoire, l.rentree), pub, priv);
      suivre(cle(niveau, l.famille, territoire), l.rentree);
    }
    if (l.ips === null || l.eleves === null || l.eleves <= 0) continue;
    const region = regionDe(l.dep);
    const territoires: [NiveauIps, string | null][] = [
      ["commune", l.code_commune ? communeDeRattachement(l.code_commune) : null],
      ["departement", l.dep], ["academie", l.aca], ["region", region ?? null], ["france", "FR"],
    ];
    for (const [niveau, territoire] of territoires) {
      if (territoire === null) continue;
      ajouter(cle(niveau, l.famille, territoire, l.rentree), l.secteur, l.ips, l.eleves);
      suivre(cle(niveau, l.famille, territoire), l.rentree);
    }
  }

  const moyenne = ([total, poids]: [number, number]) => (poids > 0 ? arrondi1(total / poids) : null);

  return {
    serie(niveau, famille, territoire) {
      const points: PointIps[] = [];
      for (const rentree of [...(rentreesDe.get(cle(niveau, famille, territoire)) ?? [])].sort((a, b) => a - b)) {
        const c = cle(niveau, famille, territoire, rentree);
        const p = publiees.get(c);
        if (p && (p.public !== null || p.prive !== null)) {
          points.push({ rentree, public: p.public, prive: p.prive, calculee: false });
          continue;
        }
        const s = sommes.get(c);
        const calc = s ? { public: moyenne(s.public), prive: moyenne(s.prive) } : { public: null, prive: null };
        if (calc.public !== null || calc.prive !== null) points.push({ rentree, ...calc, calculee: true });
      }
      return points;
    },
  };
}
