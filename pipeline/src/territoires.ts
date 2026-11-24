// Synthèses des territoires (France, académie, département, commune) et export de leurs fichiers de données.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  BudgetCollectivite, BudgetTerritoire, CarteDonnees, DonneesFrance, DonneesTerritoire, EcoleFermee, EcolesCommune, IpsMoyens, LigneListe,
  LigneTerritoire, MoyenneTerritoire, ParSecteur, RefTerritoire, SyntheseFamille, SynthesePremierDegre, ValeurCarte,
} from "@obs/shared/donnees";
import { collectiviteDe, type NiveauBudget, REGIONS, regionDe } from "@obs/shared/collectivites";
import { CODES_INDICATEURS, estEcole, estSecondDegre, FAMILLES_ECOLES, INDICATEURS } from "@obs/shared/libelles";
import { communeDeRattachement, LIBELLES_PLM, SEUIL_COMMUNE } from "@obs/shared/territoires";
import type { Famille, Fiche, Identite, Indicateur, Mesure, Niveau, Secteur, SourceId } from "@obs/shared/types";
import type { Manifest } from "./archive.ts";
import type { Budgets } from "./budget-eleves.ts";
import { centreCommune, chargerCommunes, type TableCommunes } from "./communes.ts";
import { ecolesProchesDesPoints } from "./ecoles.ts";
import { lignesEcoles, rentreesEcoles } from "./fiches.ts";
import { collectivitesCorrigees, correctionEnVigueur, type EntreeCorrection, resoudreCorrection } from "./corrections.ts";
import type { Db } from "./db.ts";
import { depCanonique } from "./normalise.ts";
import { dernieresSessions, type DernieresSessions, type IpsRentree, nuages, resume, VOIES_NUAGE } from "./resultats.ts";
import { calculerSegregation } from "./segregation.ts";
import {
  calculerIpsHistorique, derniereRentreeIps, type IpsHistorique, ipsCourant, type NiveauIps, SQL_DERNIERE_RENTREE_IPS,
} from "./ips-historique.ts";

// --- Aides partagées avec fiches.ts ---

export const BORNES_IPS = Array.from({ length: 21 }, (_, i) => 60 + 5 * i);

export function distribution(valeurs: number[]): number[] {
  const comptes = new Array<number>(BORNES_IPS.length - 1).fill(0);
  for (const v of valeurs) {
    const i = Math.min(comptes.length - 1, Math.max(0, Math.floor((v - 60) / 5)));
    comptes[i]!++;
  }
  return comptes;
}

export const valeur = (f: Fiche, code: string): Mesure | undefined => f.indicateurs.find((i) => i.code === code)?.mesure;
export const ok = (m: Mesure | undefined): number | null => (m?.statut === "ok" ? m.valeur : null);
export const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, "fr");

/** Nom de commune affiché : pour un arrondissement, « Paris 15e arrondissement » dérivé du code. */
export function libelleListe(f: Fiche): string {
  const ville = communeDeRattachement(f.codeCommune);
  if (ville === f.codeCommune) return f.commune;
  const base = { "75056": 75100, "69123": 69380, "13055": 13200 }[ville as "75056" | "69123" | "13055"];
  const n = Number(f.codeCommune) - base;
  return `${LIBELLES_PLM[ville as keyof typeof LIBELLES_PLM]} ${n === 1 ? "1er" : `${n}e`} arrondissement`;
}

export function ligneListe(f: Fiche, rentreeIps: number | null, sessions: DernieresSessions): LigneListe {
  const vs = valeur(f, "eleves_par_etp_vs");
  return {
    uai: f.uai, nom: f.nom, secteur: f.secteur, commune: libelleListe(f), codeCommune: f.codeCommune, ep: f.ep,
    eleves: ok(valeur(f, "eleves")),
    elevesParEtpEns: ok(valeur(f, "eleves_par_etp_ens")),
    elevesParEtpVs: ok(vs),
    statutVs: vs?.statut ?? "non_disponible",
    partEnseignantes: ok(valeur(f, "part_enseignantes")),
    ips: ipsCourant(valeur(f, "ips"), rentreeIps),
    reussite: resume(f, sessions),
  };
}

/** Moyennes du territoire : les comparaisons de la fiche du groupe dont la rentrée est la plus récente. */
export function moyennesTerritoire(groupe: Fiche[]): MoyenneTerritoire[] {
  return CODES_INDICATEURS.filter((c) => INDICATEURS[c].genre !== "volume").flatMap((code) => {
    let meilleure: Indicateur | undefined;
    for (const f of groupe) {
      const i = f.indicateurs.find((x) => x.code === code);
      const r = i?.comparaisons[0]?.public.rentree ?? i?.comparaisons[0]?.prive.rentree ?? null;
      const rm = meilleure?.comparaisons[0]?.public.rentree ?? meilleure?.comparaisons[0]?.prive.rentree ?? null;
      if (i && i.comparaisons.length && (meilleure === undefined || (r ?? 0) > (rm ?? 0))) meilleure = i;
    }
    return meilleure ? [{ code, comparaisons: meilleure.comparaisons }] : [];
  });
}

/** Moyenne d'IPS publiée par la DEPP pour une famille et un territoire ; clé `famille|territoire`. */
export interface IpsMoyen {
  famille: Famille;
  territoire: string;
  pub: number | null;
  priv: number | null;
}

/** Moyennes d'IPS de la DEPP (dernière rentrée), par famille et par département, académie ou France (« FR »). */
export async function ipsMoyens(db: Db, niveau: "dep" | "aca" | "nat"): Promise<Map<string, IpsMoyen>> {
  const territoire = niveau === "nat" ? "'FR'" : `e.${niveau}`;
  const lignes = await db.sql<IpsMoyen>(`
    select e.famille, ${territoire} as territoire,
      any_value(i.${niveau}_public) as pub, any_value(i.${niveau}_prive) as priv
    from ips i join etablissements e using (uai)
    where i.rentree = ${SQL_DERNIERE_RENTREE_IPS}
    group by all`);
  return new Map(lignes.map((l) => [`${l.famille}|${l.territoire}`, l]));
}

export async function ecrireJson(chemin: string, donnees: unknown): Promise<void> {
  await Bun.write(chemin, JSON.stringify(donnees));
}

// --- Moyennes calculées par l'observatoire ---

const arrondi1 = (x: number) => Math.round(x * 10) / 10;
const arrondi2 = (x: number) => Math.round(x * 100) / 100;

type Paire = { valeur: number; poids: number };

/** Σ(valeur × poids) / Σ poids, non arrondie ; null si Σ poids = 0. */
function moyennePondereeBrute(paires: Paire[]): number | null {
  const poids = paires.reduce((a, p) => a + p.poids, 0);
  return poids === 0 ? null : paires.reduce((a, p) => a + p.valeur * p.poids, 0) / poids;
}

/** Σ(valeur × poids) / Σ poids, arrondie à 0,1 ; null si Σ poids = 0. */
export function moyennePonderee(paires: Paire[]): number | null {
  const m = moyennePondereeBrute(paires);
  return m === null ? null : arrondi1(m);
}

/** Élèves de la fiche à la rentrée donnée (la dernière des effectifs), sinon null. */
const elevesALaRentree = (f: Fiche, rentree: number | null): number | null => {
  const m = valeur(f, "eleves");
  return m?.statut === "ok" && m.rentree === rentree ? m.valeur : null;
};

/** Paires (IPS, élèves de la rentrée donnée) des fiches qui publient les deux. */
const pairesIps = (groupe: Fiche[], rentree: number | null, rentreeIps: number | null = rentree): Paire[] =>
  groupe.flatMap((f) => {
    const ips = ipsCourant(valeur(f, "ips"), rentreeIps);
    const eleves = elevesALaRentree(f, rentree);
    return ips !== null && eleves !== null ? [{ valeur: ips, poids: eleves }] : [];
  });

/**
 * Les pages de territoire ne portent que sur le second degré (collèges, lycées, EREA) : les écoles en sont
 * retirées avant tout calcul (synthèses, listes, communes retenues, contrôle de la pondération).
 */
export const secondDegre = (fiches: Fiche[]): Fiche[] => fiches.filter((f) => estSecondDegre(f.famille));

/** Communes (arrondissements rattachés) qui comptent au moins SEUIL_COMMUNE établissements actifs distincts du second degré. */
export function communesRetenues(actives: Fiche[]): Map<string, Fiche[]> {
  const groupes = Map.groupBy(secondDegre(actives).filter((f) => f.disparuLe === null), (f) => communeDeRattachement(f.codeCommune));
  return new Map([...groupes].filter(([, g]) => new Set(g.map((f) => f.uai)).size >= SEUIL_COMMUNE));
}

// --- Écoles des communes (spec, section 6.7) ---

/** Écoles d'une commune d'aujourd'hui, avec ce qu'il faut pour écrire sa page si elle n'en a pas pour le second degré. */
export interface EcolesDUneCommune {
  /** Nom de la commune en vigueur (Code officiel géographique), sinon celui de ses écoles. */
  libelle: string;
  dep: { code: string; libelle: string };
  aca: { code: string; libelle: string };
  ecoles: EcolesCommune;
}

/** Une école fermée depuis 2012 de la liste des fermés, avant son rangement sous une commune d'aujourd'hui. */
interface LigneFermee {
  uai: string; nom: string; famille: Famille; ferme: string; code: string; commune: string;
  dep: string; dep_libelle: string; aca: string; aca_libelle: string; fiche: boolean;
}

const enSql = (fs: readonly string[]) => fs.map((f) => `'${f}'`).join(", ");
const plusFrequent = <T>(valeurs: T[], cle: (v: T) => string): T | undefined => {
  const n = Map.groupBy(valeurs, cle);
  return [...n.values()].sort((a, b) => b.length - a.length || cle(a[0]!).localeCompare(cle(b[0]!)))[0]?.[0];
};

/**
 * Écoles de chaque commune d'aujourd'hui qui a, ou a eu depuis 2012, au moins une école : écoles ouvertes (fiches
 * actives), écoles fermées (liste des fermés), rangées sous la commune en vigueur (`TableCommunes.actuelle` : commune
 * nouvelle, ville de Paris, Lyon ou Marseille). Aucune entrée pour un code disparu.
 *
 * Communes déléguées : l'Annuaire range les écoles ouvertes d'une commune nouvelle sous le code de la commune
 * nouvelle (vérifié le 2026-11-24 sur Sèvremoine et Chemillé-en-Anjou ; seule l'adresse, en texte libre, nomme
 * parfois l'ancienne commune). Les parties ne listent donc que les écoles fermées, d'après le code de la liste des
 * fermés ; pas de partie pour le chef-lieu, dont le code est aussi celui de la commune nouvelle.
 */
export async function ecolesDesCommunes(db: Db, actives: Fiche[], table?: TableCommunes): Promise<Map<string, EcolesDUneCommune>> {
  table ??= await chargerCommunes(db);
  const t = table;
  const ouvertes = actives.filter((f) => estEcole(f.famille) && f.disparuLe === null);
  const identites = new Map<string, Identite>(ouvertes.map((f) => [f.uai, f]));
  const indicateurs = new Map(ouvertes.map((f) => [f.uai, f.indicateurs]));
  const rentrees = rentreesEcoles(identites, indicateurs);
  const lignes = lignesEcoles(identites, indicateurs, rentrees);
  const rentreeEleves = rentrees.eleves?.rentree ?? null;

  const fermes = await db.sql<LigneFermee>(`
    select uai, nom, famille, date_fermeture::varchar as ferme, code_commune as code, commune, dep, dep_libelle, aca, aca_libelle,
      uai in (select uai from disparus) as fiche
    from fermes
    where famille in (${enSql(FAMILLES_ECOLES)}) and date_fermeture >= date '2012-01-01' and nullif(code_commune, '') is not null
      and uai not in (select uai from etablissements)`);
  // Élèves et classes par commune d'alors et par rentrée ; une école sans nombre rend le total inconnu (0 classe est
  // une absence de donnée, comme sur la fiche). Écoles : ouvertes, fermées, et pages du registre sorties de l'Annuaire
  // sans entrée dans la liste des fermés (commune de leur dernière identité connue).
  const series = await db.sql<{ code: string; rentree: number; eleves: number | null; sans_eleves: number; classes: number | null; sans_classes: number }>(`
    select c.code, h.rentree, sum(h.eleves)::integer as eleves, count(*) filter (where h.eleves is null)::integer as sans_eleves,
      sum(h.classes)::integer as classes, count(*) filter (where h.classes is null or h.classes = 0)::integer as sans_classes
    from classes_historique h
    join (
      select uai, code_commune as code from etablissements
      union all
      select uai, code_commune from fermes where uai not in (select uai from etablissements)
      union all
      select uai, code_commune from registre
      where uai not in (select uai from etablissements) and uai not in (select uai from fermes)
    ) c using (uai)
    where h.source = 'effectifs_ecoles' and nullif(c.code, '') is not null
    group by all`);

  const ouvertesPar = Map.groupBy(ouvertes, (f) => t.actuelle(f.codeCommune));
  const fermeesPar = Map.groupBy(fermes, (l) => t.actuelle(l.code));
  const historiques = new Map<string, Map<number, { eleves: number; classes: number; sansEleves: boolean; sansClasses: boolean }>>();
  for (const s of series) {
    const code = t.actuelle(s.code);
    const parRentree = historiques.get(code) ?? new Map();
    historiques.set(code, parRentree);
    const x = parRentree.get(s.rentree) ?? { eleves: 0, classes: 0, sansEleves: false, sansClasses: false };
    x.eleves += s.eleves ?? 0;
    x.classes += s.classes ?? 0;
    x.sansEleves ||= s.sans_eleves > 0;
    x.sansClasses ||= s.sans_classes > 0;
    parRentree.set(s.rentree, x);
  }

  const resultat = new Map<string, EcolesDUneCommune>();
  const sansEcole: { id: string; lat: number; lon: number }[] = [];
  for (const code of [...new Set([...ouvertesPar.keys(), ...fermeesPar.keys()])].sort()) {
    const fo = ouvertesPar.get(code) ?? [];
    const ff = fermeesPar.get(code) ?? [];
    const ecoles = fo.map((f) => {
      const c = f.classes?.historique.find(([r]) => r === rentreeEleves)?.[2] ?? null;
      return { ...lignes.get(f.uai)!, classes: c ? c : null, ep: f.ep }; // 0 classe : absence, jamais un zéro
    }).sort((a, b) => parNom(a, b) || a.uai.localeCompare(b.uai));
    const fermees = new Map(ff
      .sort((a, b) => a.ferme.localeCompare(b.ferme) || a.nom.localeCompare(b.nom, "fr") || a.uai.localeCompare(b.uai))
      .map((l): [LigneFermee, EcoleFermee] => [l, {
        uai: l.uai, nom: l.nom, fermeLe: l.ferme, famille: l.famille,
        ...(communeDeRattachement(l.code) === code ? {} : { ancienneCommune: l.commune }),
        ...(l.fiche ? {} : { sansFiche: true as const }),
      }]));
    const deleguees = t.deleguees(code)
      .filter((d) => d.code !== code)
      .map((d) => ({ ...d, fermees: [...fermees].filter(([l]) => l.code === d.code).map(([, e]) => e) }))
      .filter((d) => d.fermees.length > 0);
    const historique = [...(historiques.get(code) ?? new Map())]
      .sort((a, b) => a[0] - b[0])
      .map(([r, x]): [number, number | null, number | null] => [r, x.sansEleves ? null : x.eleves, x.sansClasses || x.classes === 0 ? null : x.classes]);
    const plusDEcoleDepuis = ecoles.length ? null : Math.max(...ff.map((l) => Number(l.ferme.slice(0, 4))));
    if (plusDEcoleDepuis !== null) {
      const centre = centreCommune(code);
      if (centre) sansEcole.push({ id: code, ...centre });
    }
    const fermee = ff.find((l) => l.dep && l.aca) ?? ff[0]!;
    const territoire = fo[0]
      ? { dep: { code: fo[0].dep, libelle: fo[0].depLibelle }, aca: { code: fo[0].aca, libelle: fo[0].acaLibelle } }
      : { dep: { code: fermee.dep, libelle: fermee.dep_libelle }, aca: { code: fermee.aca, libelle: fermee.aca_libelle } };
    const nomEcoles = plusFrequent([...fo.map((f) => f.commune), ...ff.map((l) => l.commune)], (n) => n)!;
    resultat.set(code, {
      libelle: code in LIBELLES_PLM ? LIBELLES_PLM[code as keyof typeof LIBELLES_PLM] : (t.nom(code) ?? nomEcoles),
      ...territoire,
      ecoles: {
        ecoles, rentrees: { eleves: rentreeEleves, ips: rentrees.ips?.rentree ?? null }, historique,
        fermees: [...fermees.values()], plusDEcoleDepuis, deleguees, plusProches: null,
        points: fo.flatMap((f) => f.lat !== null && f.lon !== null
          ? [{ uai: f.uai, nom: f.nom, lat: f.lat, lon: f.lon, secteur: f.secteur, eleves: lignes.get(f.uai)!.eleves }]
          : []),
      },
    });
  }
  // Communes sans école : écoles les plus proches du centre, toutes en une fois.
  for (const [code, p] of await ecolesProchesDesPoints(db, sansEcole, rentreeEleves)) resultat.get(code)!.ecoles.plusProches = p;
  return resultat;
}

/** Écarts tolérés entre la moyenne pondérée par les élèves et la moyenne départementale publiée par la DEPP. */
export const SEUILS_PONDERATION = { mediane: 0.2, p90: 1.0 };

export interface ControlePonderation {
  n: number;
  /** Écarts absolus, arrondis à 0,01. */
  mediane: number;
  p90: number;
}

/** Quantile par interpolation linéaire sur des valeurs triées. */
function quantile(tries: number[], q: number): number {
  if (!tries.length) return 0;
  const pos = (tries.length - 1) * q;
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  return tries[bas]! + (tries[haut]! - tries[bas]!) * (pos - bas);
}

/**
 * Applique la moyenne pondérée par les élèves aux départements et la compare aux moyennes de la DEPP :
 * écart absolu par (famille, département, secteur), médiane et 90e centile.
 */
export function controlerPonderation(
  actives: Fiche[],
  ipsDep: Map<string, IpsMoyen>,
  rentree: number | null,
  rentreeIps: number | null = rentree,
): ControlePonderation {
  const ecarts: number[] = [];
  for (const [cle, groupe] of Map.groupBy(secondDegre(actives), (f) => `${f.famille}|${f.dep}`)) {
    const depp = ipsDep.get(cle);
    if (!depp) continue;
    for (const [secteur, publiee] of [["public", depp.pub], ["prive_sous_contrat", depp.priv]] as const) {
      if (publiee === null) continue;
      const calculee = moyennePondereeBrute(pairesIps(groupe.filter((f) => f.secteur === secteur), rentree, rentreeIps));
      if (calculee !== null) ecarts.push(Math.abs(calculee - publiee));
    }
  }
  const tries = ecarts.sort((a, b) => a - b);
  return { n: tries.length, mediane: arrondi2(quantile(tries, 0.5)), p90: arrondi2(quantile(tries, 0.9)) };
}

/**
 * Garde du build : lève une erreur si aucun groupe n'a pu être contrôlé (jointure IPS cassée, table vide)
 * ou si les écarts dépassent SEUILS_PONDERATION. Renvoie le résumé des trois chiffres.
 */
export function verifierPonderation(c: ControlePonderation): string {
  const chiffres = `${c.n} groupes, écart médian ${c.mediane}, 90e centile ${c.p90}`;
  if (c.n === 0) throw new Error("contrôle de la pondération impossible : aucun groupe (famille, département, secteur) avec une moyenne DEPP et des établissements avec IPS et élèves");
  if (c.mediane > SEUILS_PONDERATION.mediane || c.p90 > SEUILS_PONDERATION.p90) {
    throw new Error(`moyenne pondérée trop éloignée des moyennes de la DEPP : ${chiffres}`);
  }
  return chiffres;
}

// --- Premier degré des territoires (spec, section 6.8) ---

/** Territoire d'une synthèse du premier degré : un critère sur le département ou l'académie, et la série d'IPS. */
export interface TerritoirePremierDegre {
  niveau: Exclude<NiveauIps, "commune">;
  code: string;
  contient: (l: { dep: string; aca: string }) => boolean;
}

/**
 * Synthèses du premier degré : écoles ouvertes (fiches actives), élèves et classes de la dernière rentrée des
 * effectifs des écoles, IPS de la dernière rentrée de l'IPS des écoles (moyennes de `ips-historique.ts` : publiées
 * par la DEPP pour le département, l'académie et la France, calculées pour la région), historique des écoles
 * ouvertes et des classes, fermetures par année, écoles hors contrat (nombre seulement).
 */
export async function synthesesPremierDegre(
  db: Db, actives: Fiche[], ipsHistorique: IpsHistorique,
): Promise<(t: TerritoirePremierDegre) => SynthesePremierDegre> {
  const ouvertes = actives.filter((f) => estEcole(f.famille) && f.disparuLe === null);
  const rentrees = rentreesEcoles(new Map(ouvertes.map((f) => [f.uai, f])), new Map(ouvertes.map((f) => [f.uai, f.indicateurs])));
  const rentreeEleves = rentrees.eleves?.rentree ?? null;
  const rentreeIps = rentrees.ips?.rentree ?? null;
  // Écoles ouvertes et classes par département, académie et rentrée (écoles ouvertes et fermées depuis, d'après les
  // effectifs des écoles) ; une école sans classes publiées (null ou 0) rend le total des classes inconnu.
  const series = await db.sql<{ dep: string; aca: string; rentree: number; ecoles: number; classes: number | null; sans_classes: number }>(`
    select f.dep, f.aca, h.rentree, count(*)::integer as ecoles, sum(h.classes)::integer as classes,
      count(*) filter (where h.classes is null or h.classes = 0)::integer as sans_classes
    from classes_historique h join fiches_etab f using (uai)
    where h.source = 'effectifs_ecoles'
    group by all`);
  // Écoles fermées depuis 2012 (liste des fermés, même périmètre que les pages commune), par année de fermeture.
  const fermes = await db.sql<{ dep: string; aca: string; annee: number; n: number }>(`
    select dep, aca, year(date_fermeture)::integer as annee, count(*)::integer as n
    from fermes
    where famille in (${enSql(FAMILLES_ECOLES)}) and date_fermeture >= date '2012-01-01'
      and uai not in (select uai from etablissements)
    group by all`);
  const horsContrat = await db.sql<{ dep: string; aca: string }>(
    "select dep, aca from classement where motif = 'prive_hors_contrat' and type_etablissement = 'Ecole'",
  );

  const deSecteur = (g: Fiche[], s: Secteur) => g.filter((f) => f.secteur === s);
  const elevesDe = (f: Fiche): number | null => {
    const m = valeur(f, "eleves");
    return m?.statut === "ok" && m.rentree === rentreeEleves ? m.valeur : null;
  };
  /** Classes de la rentrée des élèves ; 0 est une absence de donnée, comme sur la fiche. */
  const classesDe = (f: Fiche): number | null => f.classes?.historique.find(([r]) => r === rentreeEleves)?.[2] || null;
  const sommeEleves = (g: Fiche[]): number | null => {
    const v = g.map(elevesDe).filter((e) => e !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  /** Σ élèves ÷ Σ classes sur les écoles qui publient les deux (une école sans classes sort des deux sommes). */
  const parClasse = (g: Fiche[]): number | null => {
    let eleves = 0;
    let classes = 0;
    for (const f of g) {
      const e = elevesDe(f);
      const c = classesDe(f);
      if (e === null || c === null) continue;
      eleves += e;
      classes += c;
    }
    return classes > 0 ? arrondi1(eleves / classes) : null;
  };
  const ipsDe = (g: Fiche[]) => g.map((f) => ipsCourant(valeur(f, "ips"), rentreeIps)).filter((v) => v !== null);

  return (t) => {
    const g = ouvertes.filter((f) => t.contient(f));
    const [pub, priv] = [deSecteur(g, "public"), deSecteur(g, "prive_sous_contrat")];
    const point = ipsHistorique.serie(t.niveau, "maternelle", t.code).find((p) => p.rentree === rentreeIps);
    const parRentree = new Map<number, { ecoles: number; classes: number; inconnues: boolean }>();
    for (const s of series.filter((x) => t.contient(x))) {
      const x = parRentree.get(s.rentree) ?? { ecoles: 0, classes: 0, inconnues: false };
      x.ecoles += s.ecoles;
      x.classes += s.classes ?? 0;
      x.inconnues ||= s.sans_classes > 0;
      parRentree.set(s.rentree, x);
    }
    const parAnnee = new Map<number, number>();
    for (const l of fermes.filter((x) => t.contient(x))) parAnnee.set(l.annee, (parAnnee.get(l.annee) ?? 0) + l.n);
    return {
      compte: { public: pub.length, prive: priv.length },
      eleves: { public: sommeEleves(pub), prive: sommeEleves(priv) },
      elevesParClasse: { public: parClasse(pub), prive: parClasse(priv) },
      ipsMoyen: { public: point?.public ?? null, prive: point?.prive ?? null, calculee: point?.calculee ?? false },
      distributionIps: { public: distribution(ipsDe(pub)), prive: distribution(ipsDe(priv)), bornes: BORNES_IPS },
      rentrees: { eleves: rentreeEleves, ips: rentreeIps },
      historique: [...parRentree].sort((a, b) => a[0] - b[0])
        .map(([r, x]): [number, number, number | null] => [r, x.ecoles, x.inconnues || x.classes === 0 ? null : x.classes]),
      fermetures: [...parAnnee].sort((a, b) => a[0] - b[0]),
      horsContrat: horsContrat.filter((l) => t.contient(l)).length,
    };
  };
}

// --- Export ---

const FRANCE: RefTerritoire = { niveau: "france", code: "FR", libelle: "France" };
const SECTEURS: Secteur[] = ["public", "prive_sous_contrat"];
const parLibelle = (a: { libelle: string }, b: { libelle: string }) => a.libelle.localeCompare(b.libelle, "fr");
const refAcademie = (f: Fiche): RefTerritoire => ({ niveau: "academie", code: f.aca, libelle: f.acaLibelle });
const refRegion = (code: string): RefTerritoire => ({ niveau: "region", code, libelle: REGIONS.find((r) => r.code === code)!.libelle });
const refDepartement = (f: Fiche): RefTerritoire => ({ niveau: "departement", code: f.dep, libelle: f.depLibelle });

/** Libellé d'une commune : celui de Paris, Lyon ou Marseille, sinon le nom le plus fréquent parmi ses fiches. */
function libelleCommune(code: string, groupe: Fiche[]): string {
  if (code in LIBELLES_PLM) return LIBELLES_PLM[code as keyof typeof LIBELLES_PLM];
  const noms = [...Map.groupBy(groupe, (f) => f.commune)].map(([nom, g]) => ({ nom, n: g.length }));
  return noms.sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, "fr"))[0]!.nom;
}

/** Région d'un groupe de fiches : la plus fréquente ; null si aucune (Saint-Pierre-et-Miquelon). */
function regionDuGroupe(groupe: Fiche[]): string | null {
  const n = new Map<string, number>();
  for (const f of groupe) {
    const r = regionDe(f.dep);
    if (r) n.set(r, (n.get(r) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

const BUDGETS_VIDES: Budgets = { collectivites: new Map(), france: [] };

/**
 * Écrit `regions/<code>.json`, `departements/<dep>.json`, `academies/<aca>.json`, `communes/<insee>.json`
 * et `france.json` à partir des fiches actives. `rentree` : dernière rentrée des effectifs.
 * `budgets` : résultat de `calculerBudgets` sur toutes les fiches (actives et disparues).
 */
export async function exporterTerritoires(
  actives: Fiche[], db: Db, sortie: string, rentree: number | null, budgets: Budgets = BUDGETS_VIDES,
  corrections: EntreeCorrection[] = [], manifest?: Manifest,
): Promise<void> {
  // Écoles des communes (pages commune) et des départements (CSV), avant de ne garder que le second degré.
  const ecolesCommunes = await ecolesDesCommunes(db, actives);
  const ecolesParDep = Map.groupBy(actives.filter((f) => estEcole(f.famille)), (f) => f.dep);
  const lignesDep = lignesEcoles(new Map(actives.map((f) => [f.uai, f])), new Map(actives.map((f) => [f.uai, f.indicateurs])));
  const toutes = actives;
  const communesEcolesParDep = Map.groupBy(
    [...ecolesCommunes].map(([code, c]): [string, RefTerritoire] => [c.dep.code, { niveau: "commune", code, libelle: c.libelle }]),
    ([d]) => d,
  );
  const communesEcoles = (dep: string): RefTerritoire[] =>
    (communesEcolesParDep.get(dep) ?? []).map(([, r]) => r).sort((a, b) => parLibelle(a, b) || a.code.localeCompare(b.code));
  actives = secondDegre(actives); // aucune école dans les synthèses du second degré
  for (const d of ["regions", "departements", "academies", "communes"]) await mkdir(join(sortie, d), { recursive: true });
  const ipsHistorique = await calculerIpsHistorique(db);
  const premierDegre = await synthesesPremierDegre(db, toutes, ipsHistorique);
  const rentreeIps = await derniereRentreeIps(db);
  const sessions = await dernieresSessions(db);
  const segregation = await calculerSegregation(db);
  // Nuages IPS × réussite (départements et académies) : IPS de la rentrée de chaque dernière session moins un.
  const rentreesNuages = [...new Set(Object.values(sessions).map((x) => x! - 1))].sort();
  const ipsNuages = new Map<number, Map<string, IpsRentree>>();
  for (const r of rentreesNuages) {
    ipsNuages.set(r, new Map((await db.sql<{ uai: string; gt: number | null; pro: number | null; ips: number | null; source: SourceId }>(
      `select uai, ips_gt as gt, ips_pro as pro, ips, source from ips where rentree = ${r}`,
    )).map((l) => [l.uai, { gt: l.gt, pro: l.pro, ips: l.ips, source: l.source }] as const)));
  }
  const nuagesDe = (groupe: Fiche[]) => {
    const n = rentreesNuages.flatMap((r) => nuages(groupe, ipsNuages.get(r)!, r, sessions))
      .sort((a, b) => VOIES_NUAGE.indexOf(a.voie) - VOIES_NUAGE.indexOf(b.voie));
    return n.length ? { nuages: n } : {};
  };
  const ips = { dep: await ipsMoyens(db, "dep"), aca: await ipsMoyens(db, "aca"), nat: await ipsMoyens(db, "nat") };
  const horsContratLignes = await db.sql<{ dep: string; aca: string; code_commune: string }>(
    // collèges et lycées hors contrat seulement : les écoles hors contrat sont comptées dans le premier degré
    "select dep, aca, code_commune from classement where motif = 'prive_hors_contrat' and type_etablissement is distinct from 'Ecole'",
  );
  const horsContrat = (filtre: (l: { dep: string; aca: string; code_commune: string }) => boolean) =>
    horsContratLignes.filter(filtre).length;

  const secteur = (groupe: Fiche[], s: Secteur) => groupe.filter((f) => f.secteur === s);
  const compte = (groupe: Fiche[]): ParSecteur<number> => ({
    public: secteur(groupe, "public").length, prive: secteur(groupe, "prive_sous_contrat").length,
  });
  const elevesDe = (groupe: Fiche[]): number | null => {
    const v = groupe.map((f) => elevesALaRentree(f, rentree)).filter((e) => e !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const eleves = (groupe: Fiche[]): ParSecteur<number | null> => ({
    public: elevesDe(secteur(groupe, "public")), prive: elevesDe(secteur(groupe, "prive_sous_contrat")),
  });
  /** Part des élèves dans le privé sous contrat, en % ; null si les élèves d'un secteur présent ne sont pas connus. */
  const partPrive = (groupe: Fiche[]): number | null => {
    const c = compte(groupe);
    const e = eleves(groupe);
    if ((c.public > 0 && e.public === null) || (c.prive > 0 && e.prive === null)) return null;
    const total = (e.public ?? 0) + (e.prive ?? 0);
    return total > 0 ? arrondi1((100 * (e.prive ?? 0)) / total) : null;
  };
  /** Écart privé − public des moyennes d'IPS des collèges publiées par la DEPP. */
  const ecartColleges = (m: IpsMoyen | undefined): number | null =>
    m && m.pub !== null && m.priv !== null ? arrondi1(m.priv - m.pub) : null;
  const ligne = (ref: RefTerritoire, groupe: Fiche[], ipsColleges: IpsMoyen | undefined): LigneTerritoire => ({
    ref, compte: compte(groupe), eleves: eleves(groupe), partPrive: partPrive(groupe), ecartIpsColleges: ecartColleges(ipsColleges),
  });
  const valeursCarte = (groupe: Fiche[]): CarteDonnees => ({
    genre: "departements",
    valeurs: [...Map.groupBy(groupe, (f) => f.dep)]
      .map(([dep, g]): ValeurCarte => ({ dep, partPrive: partPrive(g), ecartIpsColleges: ecartColleges(ips.dep.get(`college|${dep}`)) }))
      .sort((a, b) => a.dep.localeCompare(b.dep)),
  });
  const points = (groupe: Fiche[]): CarteDonnees => ({
    genre: "points",
    points: groupe.flatMap((f) =>
      f.lat !== null && f.lon !== null
        ? [{ uai: f.uai, nom: f.nom, lat: f.lat, lon: f.lon, secteur: f.secteur, eleves: ok(valeur(f, "eleves")) }]
        : []),
  });
  const depp = (m: IpsMoyen | undefined): IpsMoyens => ({ public: m?.pub ?? null, prive: m?.priv ?? null, calculee: false });
  const calculee = (groupe: Fiche[]): IpsMoyens => {
    const [pub, priv] = SECTEURS.map((s) => pairesIps(secteur(groupe, s), rentree, rentreeIps));
    return { public: moyennePonderee(pub!), prive: moyennePonderee(priv!), calculee: true, n: { public: pub!.length, prive: priv!.length } };
  };

  /** Synthèses par famille. `niveaux` : comparaisons gardées dans les moyennes (null : aucune moyenne). */
  const familles = (
    groupe: Fiche[],
    ipsMoyen: (famille: Famille, g: Fiche[]) => IpsMoyens,
    options: { liste: boolean; niveaux: Niveau[] | null; territoire: [NiveauIps, string] },
  ): DonneesTerritoire["familles"] => {
    const resultat: DonneesTerritoire["familles"] = {};
    for (const [famille, g] of Map.groupBy(groupe, (f) => f.famille)) {
      const valeursIps = (s: Secteur) => secteur(g, s).map((f) => ipsCourant(valeur(f, "ips"), rentreeIps)).filter((v) => v !== null);
      const synthese: SyntheseFamille = {
        compte: compte(g),
        eleves: eleves(g),
        ipsMoyen: ipsMoyen(famille, g),
        ipsHistorique: ipsHistorique.serie(options.territoire[0], famille, options.territoire[1]),
        distributionIps: { public: distribution(valeursIps("public")), prive: distribution(valeursIps("prive_sous_contrat")), bornes: BORNES_IPS },
        moyennes: options.niveaux === null
          ? []
          : moyennesTerritoire(g)
              .map((m) => ({ ...m, comparaisons: m.comparaisons.filter((c) => options.niveaux!.includes(c.niveau)) }))
              .filter((m) => m.comparaisons.length),
        liste: options.liste ? g.map((f) => ligneListe(f, rentreeIps, sessions)).sort(parNom) : [],
      };
      resultat[famille] = synthese;
    }
    return resultat;
  };

  // Budget d'un territoire : les collectivités des collèges de ses fiches et celles des lycées de ses départements.
  const budgetDe = (groupe: Fiche[], deps: Iterable<string>): BudgetTerritoire => {
    const cles = new Set<string>();
    const ajouter = (niveau: NiveauBudget, id: string | null) => {
      if (id && budgets.collectivites.has(`${niveau}|${id}`)) cles.add(`${niveau}|${id}`);
    };
    for (const f of groupe) if (f.famille === "college") ajouter("colleges", collectiviteDe("colleges", f.dep, f.codeCommune));
    for (const dep of deps) ajouter("lycees", collectiviteDe("lycees", dep, ""));
    return { collectivites: collectivitesTriees(cles), france: budgets.france };
  };
  const collectivitesTriees = (cles: Iterable<string>): BudgetCollectivite[] =>
    [...cles].sort((a, b) => (a.startsWith("colleges") === b.startsWith("colleges") ? a.localeCompare(b) : a.startsWith("colleges") ? -1 : 1))
      .map((c) => budgets.collectivites.get(c)!);
  /** Corrections de ségrégation (clé = département brut de la source, « 044 », comparé au code canonique) et de budget (collectivité montrée par la page) d'un territoire. */
  const correctionsDe = (dep: string | null, collectivites: BudgetCollectivite[]): Pick<DonneesTerritoire, "corrections"> => {
    if (corrections.length && !manifest) throw new Error("exporterTerritoires : le manifeste est nécessaire pour résoudre les corrections");
    // Exercices montrés par la page, par collectivité.
    const exercices = new Map(collectivites.map((c) => [c.id as string, new Set(c.exercices.map((x) => x.exercice))]));
    const trouvees = corrections
      // Même règle que les fiches : une correction cesse si le portail revient à une version collectée avant elle.
      .filter((e) => correctionEnVigueur(manifest!, e))
      .filter((e) =>
        e.source === "segregation" ? dep !== null && e.cles.some((c) => depCanonique(c) === dep)
          : e.source.startsWith("budget_") && [...collectivitesCorrigees(e)].some((id) => exercices.get(id)?.has(e.millesime)))
      .map((e) => ({ source: e.source, ...resoudreCorrection(manifest!, e) }))
      .sort((a, b) => a.source.localeCompare(b.source) || a.le.localeCompare(b.le) || a.millesime - b.millesime);
    return trouvees.length ? { corrections: trouvees } : {};
  };
  const regionParent = (groupe: Fiche[]): RefTerritoire[] => {
    const r = regionDuGroupe(groupe);
    return r ? [refRegion(r)] : [];
  };
  const depsDe = (groupe: Fiche[]) => new Set(groupe.map((f) => f.dep));

  // Communes
  const communes = communesRetenues(actives);
  const communesParDep = new Map<string, RefTerritoire[]>();
  for (const [code, groupe] of communes) {
    const premier = groupe[0]!;
    const ref: RefTerritoire = { niveau: "commune", code, libelle: libelleCommune(code, groupe) };
    communesParDep.set(premier.dep, [...(communesParDep.get(premier.dep) ?? []), ref]);
    const donnees: DonneesTerritoire = {
      budget: { collectivites: [], france: [] }, // pas de bloc budget sur les pages commune
      ref, parents: [FRANCE, ...regionParent(groupe), refAcademie(premier), refDepartement(premier)], rentree,
      familles: familles(groupe, (_, g) => calculee(g), { liste: true, niveaux: null, territoire: ["commune", code] }),
      horsContrat: horsContrat((l) => communeDeRattachement(l.code_commune) === code),
      enfants: [], communes: [], carte: points(groupe),
      ...(ecolesCommunes.has(code) ? { ecoles: ecolesCommunes.get(code)!.ecoles } : {}),
    };
    await ecrireJson(join(sortie, "communes", `${code}.json`), donnees);
  }
  // Communes qui ont, ou ont eu depuis 2012, une école, sans page pour le second degré : page des écoles seulement.
  for (const [code, c] of ecolesCommunes) {
    if (communes.has(code)) continue;
    const region = regionDe(c.dep.code);
    const donnees: DonneesTerritoire = {
      budget: { collectivites: [], france: [] },
      ref: { niveau: "commune", code, libelle: c.libelle },
      parents: [
        FRANCE, ...(region ? [refRegion(region)] : []), { niveau: "academie", code: c.aca.code, libelle: c.aca.libelle },
        { niveau: "departement", code: c.dep.code, libelle: c.dep.libelle },
      ],
      rentree, familles: {}, horsContrat: 0, enfants: [], communes: [], carte: { genre: "points", points: [] },
      ecoles: c.ecoles,
    };
    await ecrireJson(join(sortie, "communes", `${code}.json`), donnees);
  }

  // Départements
  for (const [dep, groupe] of Map.groupBy(actives, (f) => f.dep)) {
    const premier = groupe[0]!;
    const donnees: DonneesTerritoire = {
      budget: budgetDe(groupe, [dep]),
      ...correctionsDe(dep, budgetDe(groupe, [dep]).collectivites),
      ref: refDepartement(premier), parents: [FRANCE, ...regionParent(groupe), refAcademie(premier)], rentree,
      familles: familles(groupe, (famille) => depp(ips.dep.get(`${famille}|${dep}`)), {
        liste: true, niveaux: ["departement", "academie", "france"], territoire: ["departement", dep],
      }),
      horsContrat: horsContrat((l) => l.dep === dep),
      enfants: [], communes: (communesParDep.get(dep) ?? []).sort(parLibelle), carte: points(groupe),
      ...nuagesDe(groupe),
      ...(segregation.has(dep) ? { segregation: segregation.get(dep)! } : {}),
      listeEcoles: (ecolesParDep.get(dep) ?? []).map((f) => ({ ...lignesDep.get(f.uai)!, ep: f.ep })).sort((a, b) => parNom(a, b) || a.uai.localeCompare(b.uai)),
      premierDegre: premierDegre({ niveau: "departement", code: dep, contient: (l) => l.dep === dep }),
      communesEcoles: communesEcoles(dep),
    };
    await ecrireJson(join(sortie, "departements", `${dep}.json`), donnees);
  }

  // Académies
  const parAcademie = Map.groupBy(actives, (f) => f.aca);
  for (const [aca, groupe] of parAcademie) {
    const donnees: DonneesTerritoire = {
      budget: budgetDe(groupe, depsDe(groupe)),
      ...correctionsDe(null, budgetDe(groupe, depsDe(groupe)).collectivites),
      ref: refAcademie(groupe[0]!), parents: [FRANCE, ...regionParent(groupe)], rentree,
      familles: familles(groupe, (famille) => depp(ips.aca.get(`${famille}|${aca}`)), { liste: false, niveaux: ["academie", "france"], territoire: ["academie", aca] }),
      horsContrat: horsContrat((l) => l.aca === aca),
      enfants: [...Map.groupBy(groupe, (f) => f.dep)]
        .map(([dep, g]) => ligne(refDepartement(g[0]!), g, ips.dep.get(`college|${dep}`)))
        .sort((a, b) => parLibelle(a.ref, b.ref)),
      communes: [], carte: valeursCarte(groupe),
      ...nuagesDe(groupe),
      premierDegre: premierDegre({ niveau: "academie", code: aca, contient: (l) => l.aca === aca }),
    };
    await ecrireJson(join(sortie, "academies", `${aca}.json`), donnees);
  }

  // Régions
  const regions: RefTerritoire[] = [];
  for (const region of REGIONS) {
    const groupe = actives.filter((f) => region.deps.includes(f.dep));
    if (!groupe.length) continue;
    const ref = refRegion(region.code);
    regions.push(ref);
    const donnees: DonneesTerritoire = {
      budget: budgetDe(groupe, region.deps),
      ...correctionsDe(null, budgetDe(groupe, region.deps).collectivites),
      ref, parents: [FRANCE], rentree,
      familles: familles(groupe, (_, g) => calculee(g), { liste: false, niveaux: ["france"], territoire: ["region", region.code] }),
      horsContrat: horsContrat((l) => region.deps.includes(l.dep)),
      enfants: [...Map.groupBy(groupe, (f) => f.dep)]
        .map(([dep, g]) => ligne(refDepartement(g[0]!), g, ips.dep.get(`college|${dep}`)))
        .sort((a, b) => parLibelle(a.ref, b.ref)),
      communes: [], carte: valeursCarte(groupe),
      academies: [...Map.groupBy(groupe, (f) => f.aca)].map(([, g]) => refAcademie(g[0]!)).sort(parLibelle),
      premierDegre: premierDegre({ niveau: "region", code: region.code, contient: (l) => region.deps.includes(l.dep) }),
    };
    await ecrireJson(join(sortie, "regions", `${region.code}.json`), donnees);
  }

  // France
  const academies = [...parAcademie]
    .map(([aca, groupe]) => ({
      aca,
      libelle: groupe[0]!.acaLibelle,
      departements: [...new Map(groupe.map((f) => [f.dep, f.depLibelle]))]
        .map(([d, libelle]) => ({ dep: d, libelle }))
        .sort(parLibelle),
    }))
    .sort(parLibelle);
  // Carte « budget » : une valeur par collectivité des collèges, avec les départements qu'elle couvre.
  const carteBudget: DonneesFrance["carteBudget"] = {
    genre: "collectivites",
    valeurs: [...budgets.collectivites.values()]
      .filter((c) => c.niveau === "colleges")
      .map((c) => {
        const deps = new Set(actives.filter((f) => f.famille === "college" && collectiviteDe("colleges", f.dep, f.codeCommune) === c.id).map((f) => f.dep));
        const montant = c.exercices.at(-1)?.public.horsPersonnel;
        return { id: c.id, deps: [...deps].sort(), budget: montant?.statut === "ok" ? montant.parEleve : null };
      })
      .filter((v) => v.deps.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  const france: DonneesFrance = {
    budget: { collectivites: collectivitesTriees(budgets.collectivites.keys()), france: budgets.france },
    ...correctionsDe(null, collectivitesTriees(budgets.collectivites.keys())),
    ref: FRANCE, parents: [], rentree,
    familles: familles(actives, (famille) => depp(ips.nat.get(`${famille}|FR`)), { liste: false, niveaux: ["france"], territoire: ["france", "FR"] }),
    horsContrat: horsContratLignes.length,
    enfants: [...parAcademie]
      .map(([aca, g]) => ligne(refAcademie(g[0]!), g, ips.aca.get(`college|${aca}`)))
      .sort((a, b) => parLibelle(a.ref, b.ref)),
    communes: [], carte: valeursCarte(actives),
    academiesEtDepartements: academies, regions, carteBudget,
    premierDegre: premierDegre({ niveau: "france", code: "FR", contient: () => true }),
  };
  await ecrireJson(join(sortie, "france.json"), france);
}
