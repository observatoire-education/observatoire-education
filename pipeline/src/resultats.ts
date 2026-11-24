// Résultats aux examens d'une fiche : brevet (IVAC) et baccalauréat (IVAL), à partir des tables `resultats`
// et `moyennes_resultats`. Une valeur absente n'est jamais un zéro : elle porte le statut « non_publie ».
import type { Nuage, ParSecteur, PointNuage } from "@obs/shared/donnees";
import type { Famille, Fiche, Niveau, ResultatsVoie, ResumeResultat, SourceId, ValeurResultat, VoieResultat } from "@obs/shared/types";
import type { CodeResultat, StatutResultat } from "@obs/shared/types";
import type { Db } from "./db.ts";

export type { CodeResultat, ResultatsVoie, ResumeResultat, StatutResultat, ValeurResultat, VoieResultat };

/** Ordre d'affichage des voies sur une fiche. */
export const VOIES: VoieResultat[] = ["brevet_general", "brevet_pro", "bac_gt", "bac_pro"];

/** Valeurs affichées par voie, dans l'ordre. */
const CODES: Record<VoieResultat, CodeResultat[]> = {
  brevet_general: ["taux_reussite", "note_ecrit", "taux_acces"],
  brevet_pro: ["taux_reussite", "note_ecrit"],
  bac_gt: ["taux_reussite", "taux_acces", "taux_mentions"],
  bac_pro: ["taux_reussite", "taux_acces", "taux_mentions"],
};

const NIVEAUX: Niveau[] = ["departement", "academie", "france"];
const RUPTURE = 2021;

interface Ligne {
  uai: string; voie: VoieResultat; session: number; source: SourceId; effectif: number | null;
  taux_reussite: number | null; va_reussite: number | null; note_ecrit: number | null; va_note: number | null;
  taux_acces: number | null; va_acces: number | null; taux_mentions: number | null; va_mentions: number | null;
  mentions_ab: number | null; mentions_b: number | null; mentions_tb: number | null;
}
interface LigneMoyenne {
  voie: VoieResultat; code: CodeResultat; niveau: Niveau; territoire: string; secteur: string; session: number; valeur: number; n: number;
}

const valeurDe = (l: Ligne, code: CodeResultat): number | null => l[code];

/** Valeur ajoutée de la ligne pour un code ; undefined = sans objet par construction. */
function vaDe(l: Ligne, code: CodeResultat): number | null | undefined {
  if (l.voie === "brevet_pro") return undefined;
  if (l.voie === "brevet_general") return code === "taux_reussite" ? l.va_reussite : code === "note_ecrit" ? l.va_note : undefined;
  return code === "taux_reussite" ? l.va_reussite : code === "taux_acces" ? l.va_acces : code === "taux_mentions" ? l.va_mentions : undefined;
}

const statut = (v: number | null): StatutResultat => (v === null ? "non_publie" : "ok");

/** Session affichée : la dernière qui a au moins une valeur publiée (à défaut, la dernière ligne). */
function sessionAffichee(lignes: Ligne[], voie: VoieResultat): Ligne {
  const codes = CODES[voie];
  const avecValeur = lignes.filter((l) => codes.some((c) => valeurDe(l, c) !== null));
  return (avecValeur.at(-1) ?? lignes.at(-1))!;
}

export async function calculerResultats(db: Db): Promise<Map<string, ResultatsVoie[]>> {
  const lignes = await db.sql<Ligne>("select * from resultats order by uai, voie, session");
  const moyennes = await db.sql<LigneMoyenne>("select * from moyennes_resultats");
  const territoires = new Map(
    (await db.sql<{ uai: string; dep: string; aca: string }>("select uai, dep, aca from fiches_etab")).map((r) => [r.uai, r]),
  );
  const index = new Map<string, LigneMoyenne>();
  for (const m of moyennes) index.set([m.voie, m.code, m.niveau, m.territoire, m.secteur, m.session].join("|"), m);

  const resultat = new Map<string, ResultatsVoie[]>();
  for (const [uai, deLaFiche] of Map.groupBy(lignes, (l) => l.uai)) {
    const t = territoires.get(uai);
    const voies: ResultatsVoie[] = [];
    for (const voie of VOIES) {
      const l = deLaFiche.filter((x) => x.voie === voie);
      if (!l.length) continue;
      const affichee = sessionAffichee(l, voie);
      const code = (c: CodeResultat, niveau: Niveau, secteur: string) => {
        const territoire = niveau === "france" ? "FR" : niveau === "departement" ? t?.dep : t?.aca;
        const m = territoire ? index.get([voie, c, niveau, territoire, secteur, affichee.session].join("|")) : undefined;
        return m ?? null;
      };
      const valeurs: ValeurResultat[] = CODES[voie].map((c) => {
        const v = valeurDe(affichee, c);
        const va = vaDe(affichee, c);
        return {
          code: c, valeur: v, statut: statut(v),
          va: va ?? null, statutVa: va === undefined ? "sans_objet" : statut(va),
          comparaisons: c === "note_ecrit"
            ? []
            : NIVEAUX.map((niveau) => {
                const pub = code(c, niveau, "public");
                const pri = code(c, niveau, "prive_sous_contrat");
                const n: ParSecteur<number> = { public: pub?.n ?? 0, prive: pri?.n ?? 0 };
                return { niveau, public: pub?.valeur ?? null, prive: pri?.valeur ?? null, n };
              }),
        };
      });
      const historique = l.filter((x) => x.taux_reussite !== null).map((x): [number, number] => [x.session, x.taux_reussite!]);
      const bac = voie === "bac_gt" || voie === "bac_pro";
      const rupture = bac && historique.some(([s]) => s < RUPTURE) && historique.some(([s]) => s >= RUPTURE) ? RUPTURE : null;
      const mentions = voie === "brevet_general" && (affichee.mentions_ab !== null || affichee.mentions_b !== null || affichee.mentions_tb !== null)
        ? { ab: affichee.mentions_ab, b: affichee.mentions_b, tb: affichee.mentions_tb }
        : null;
      voies.push({ voie, source: affichee.source, session: affichee.session, effectif: affichee.effectif, valeurs, mentions, historique, rupture });
    }
    resultat.set(uai, voies);
  }
  return resultat;
}

/** Voies résumées par famille (règle « un seul chiffre par établissement »). */
const VOIES_RESUME: Record<Famille, VoieResultat[]> = {
  college: ["brevet_general"],
  legt: ["bac_gt"],
  lp: ["bac_pro"],
  lpo: ["bac_gt", "bac_pro"],
  erea: ["brevet_general", "bac_gt", "bac_pro"],
};

/** Dernière session de chaque source de résultats (ivac, ival_gt, ival_pro). */
export type DernieresSessions = Partial<Record<SourceId, number>>;

export async function dernieresSessions(db: Db): Promise<DernieresSessions> {
  const l = await db.sql<{ source: SourceId; s: number }>("select source, max(session)::integer as s from resultats group by source");
  return Object.fromEntries(l.map((r) => [r.source, r.s]));
}

/**
 * Un chiffre par voie utile : taux de réussite et valeur ajoutée de la session affichée. Seules les voies présentes
 * dont la session est la dernière de leur source : une session plus ancienne reste sur la fiche, hors des listes.
 */
export function resume(f: Pick<Fiche, "famille" | "resultats">, dernieres: DernieresSessions): ResumeResultat[] {
  return VOIES_RESUME[f.famille].flatMap((voie) => {
    const r = f.resultats.find((x) => x.voie === voie);
    const v = r?.valeurs.find((x) => x.code === "taux_reussite");
    return r && v && r.session === dernieres[r.source] ? [{ voie, session: r.session, taux: v.valeur, va: v.va }] : [];
  });
}

/** Nombre minimal de points pour qu'un nuage soit affiché. */
export const MIN_POINTS_NUAGE = 5;

const VOIES_NUAGE: Nuage["voie"][] = ["brevet_general", "bac_gt", "bac_pro"];

/** Moyenne pondérée par l'effectif ; null si l'effectif total est nul (jamais un zéro). */
function moyennePonderee(points: PointNuage[], valeur: (p: PointNuage) => number): number | null {
  const total = points.reduce((a, p) => a + (p.effectif ?? 0), 0);
  return total > 0 ? points.reduce((a, p) => a + valeur(p) * (p.effectif ?? 0), 0) / total : null;
}

/** IPS d'un établissement à une rentrée : de la voie GT, de la voie pro, et de l'ensemble de l'établissement. */
export interface IpsRentree { gt: number | null; pro: number | null; ips: number | null }

/**
 * Nuages IPS × réussite d'un groupe de fiches actives : un par voie, avec au moins 5 points. Un point : voie à la
 * dernière session de sa source (`dernieres`), dont la rentrée `session − 1` est `rentreeIps` (année scolaire de
 * l'examen), taux publié, IPS de cette rentrée (`ipsParVoie`). Brevet : IPS de l'établissement. Bac : IPS de la voie ;
 * si aucun lycée n'a d'IPS par voie à cette rentrée, IPS d'ensemble pour tous les points du nuage (`ipsEnsemble`).
 */
export function nuages(groupe: Fiche[], ipsParVoie: Map<string, IpsRentree>, rentreeIps: number, dernieres: DernieresSessions): Nuage[] {
  const parVoie = (k: "gt" | "pro") => [...ipsParVoie.values()].some((v) => v[k] !== null);
  return VOIES_NUAGE.flatMap((voie): Nuage[] => {
    const bac = voie !== "brevet_general";
    const cle = voie === "bac_gt" ? "gt" : "pro";
    const ensemble = bac && !parVoie(cle);
    const points: PointNuage[] = [];
    for (const f of groupe) {
      const r = f.resultats.find((x) => x.voie === voie);
      if (!r || r.session !== dernieres[r.source] || r.session - 1 !== rentreeIps) continue;
      const v = r.valeurs.find((x) => x.code === "taux_reussite");
      if (!v || v.valeur === null) continue;
      const i = ipsParVoie.get(f.uai);
      const ips = (!bac || ensemble ? i?.ips : i?.[cle]) ?? null;
      if (ips === null) continue;
      points.push({ uai: f.uai, nom: f.nom, commune: f.commune, secteur: f.secteur, ips, taux: v.valeur, va: v.va, effectif: r.effectif });
    }
    if (points.length < MIN_POINTS_NUAGE) return [];
    points.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.uai.localeCompare(b.uai));
    return [{
      voie, session: rentreeIps + 1, rentreeIps, ipsEnsemble: ensemble,
      moyennes: { ips: moyennePonderee(points, (p) => p.ips), taux: moyennePonderee(points, (p) => p.taux) },
      points,
    }];
  });
}
