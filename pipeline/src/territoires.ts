// Synthèses des territoires (France, académie, département, commune) et export de leurs fichiers de données.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  BudgetCollectivite, BudgetTerritoire, CarteDonnees, DonneesFrance, DonneesTerritoire, IpsMoyens, LigneListe, LigneTerritoire, MoyenneTerritoire,
  ParSecteur, RefTerritoire, SyntheseFamille, ValeurCarte,
} from "@obs/shared/donnees";
import { collectiviteDe, type NiveauBudget, REGIONS, regionDe } from "@obs/shared/collectivites";
import { CODES_INDICATEURS, INDICATEURS } from "@obs/shared/libelles";
import { communeDeRattachement, LIBELLES_PLM, SEUIL_COMMUNE } from "@obs/shared/territoires";
import type { Famille, Fiche, Indicateur, Mesure, Niveau, Secteur, SourceId } from "@obs/shared/types";
import type { Manifest } from "./archive.ts";
import type { Budgets } from "./budget-eleves.ts";
import { collectivitesCorrigees, type EntreeCorrection, resoudreCorrection } from "./corrections.ts";
import type { Db } from "./db.ts";
import { dernieresSessions, type DernieresSessions, type IpsRentree, nuages, resume, VOIES_NUAGE } from "./resultats.ts";
import { calculerIpsHistorique, derniereRentreeIps, ipsCourant, type NiveauIps } from "./ips-historique.ts";

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
    where i.rentree = (select max(rentree) from ips)
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

/** Communes (arrondissements rattachés) qui comptent au moins SEUIL_COMMUNE établissements actifs distincts. */
export function communesRetenues(actives: Fiche[]): Map<string, Fiche[]> {
  const groupes = Map.groupBy(actives.filter((f) => f.disparuLe === null), (f) => communeDeRattachement(f.codeCommune));
  return new Map([...groupes].filter(([, g]) => new Set(g.map((f) => f.uai)).size >= SEUIL_COMMUNE));
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
  for (const [cle, groupe] of Map.groupBy(actives, (f) => `${f.famille}|${f.dep}`)) {
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
  for (const d of ["regions", "departements", "academies", "communes"]) await mkdir(join(sortie, d), { recursive: true });
  const ipsHistorique = await calculerIpsHistorique(db);
  const rentreeIps = await derniereRentreeIps(db);
  const sessions = await dernieresSessions(db);
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
    "select dep, aca, code_commune from classement where motif = 'prive_hors_contrat'",
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
  /** Corrections de ségrégation (clé = département) et de budget (collectivité montrée par la page) d'un territoire. */
  const correctionsDe = (dep: string | null, collectivites: BudgetCollectivite[]): Pick<DonneesTerritoire, "corrections"> => {
    if (corrections.length && !manifest) throw new Error("exporterTerritoires : le manifeste est nécessaire pour résoudre les corrections");
    // Exercices montrés par la page, par collectivité.
    const exercices = new Map(collectivites.map((c) => [c.id as string, new Set(c.exercices.map((x) => x.exercice))]));
    const trouvees = corrections
      .filter((e) =>
        e.source === "segregation" ? dep !== null && e.cles.includes(dep)
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
  };
  await ecrireJson(join(sortie, "france.json"), france);
}
