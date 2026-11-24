// Synthèses des territoires (France, académie, département, commune) et export de leurs fichiers de données.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CarteDonnees, DonneesFrance, DonneesTerritoire, IpsMoyens, LigneListe, LigneTerritoire, MoyenneTerritoire,
  ParSecteur, RefTerritoire, SyntheseFamille, ValeurCarte,
} from "@obs/shared/donnees";
import { CODES_INDICATEURS, INDICATEURS } from "@obs/shared/libelles";
import { communeDeRattachement, LIBELLES_PLM, SEUIL_COMMUNE } from "@obs/shared/territoires";
import type { Famille, Fiche, Indicateur, Mesure, Niveau, Secteur } from "@obs/shared/types";
import type { Db } from "./db.ts";

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

export function ligneListe(f: Fiche): LigneListe {
  const vs = valeur(f, "eleves_par_etp_vs");
  return {
    uai: f.uai, nom: f.nom, secteur: f.secteur, commune: f.commune, ep: f.ep,
    eleves: ok(valeur(f, "eleves")),
    elevesParEtpEns: ok(valeur(f, "eleves_par_etp_ens")),
    elevesParEtpVs: ok(vs),
    statutVs: vs?.statut ?? "non_disponible",
    partEnseignantes: ok(valeur(f, "part_enseignantes")),
    ips: ok(valeur(f, "ips")),
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
const pairesIps = (groupe: Fiche[], rentree: number | null): Paire[] =>
  groupe.flatMap((f) => {
    const ips = ok(valeur(f, "ips"));
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
): ControlePonderation {
  const ecarts: number[] = [];
  for (const [cle, groupe] of Map.groupBy(actives, (f) => `${f.famille}|${f.dep}`)) {
    const depp = ipsDep.get(cle);
    if (!depp) continue;
    for (const [secteur, publiee] of [["public", depp.pub], ["prive_sous_contrat", depp.priv]] as const) {
      if (publiee === null) continue;
      const calculee = moyennePondereeBrute(pairesIps(groupe.filter((f) => f.secteur === secteur), rentree));
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
const refDepartement = (f: Fiche): RefTerritoire => ({ niveau: "departement", code: f.dep, libelle: f.depLibelle });

/** Libellé d'une commune : celui de Paris, Lyon ou Marseille, sinon le nom le plus fréquent parmi ses fiches. */
function libelleCommune(code: string, groupe: Fiche[]): string {
  if (code in LIBELLES_PLM) return LIBELLES_PLM[code as keyof typeof LIBELLES_PLM];
  const noms = [...Map.groupBy(groupe, (f) => f.commune)].map(([nom, g]) => ({ nom, n: g.length }));
  return noms.sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, "fr"))[0]!.nom;
}

/**
 * Écrit `departements/<dep>.json`, `academies/<aca>.json`, `communes/<insee>.json` et `france.json`
 * à partir des fiches actives. `rentree` : dernière rentrée des effectifs.
 */
export async function exporterTerritoires(actives: Fiche[], db: Db, sortie: string, rentree: number | null): Promise<void> {
  for (const d of ["departements", "academies", "communes"]) await mkdir(join(sortie, d), { recursive: true });
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
    const [pub, priv] = SECTEURS.map((s) => pairesIps(secteur(groupe, s), rentree));
    return { public: moyennePonderee(pub!), prive: moyennePonderee(priv!), calculee: true, n: { public: pub!.length, prive: priv!.length } };
  };

  /** Synthèses par famille. `niveaux` : comparaisons gardées dans les moyennes (null : aucune moyenne). */
  const familles = (
    groupe: Fiche[],
    ipsMoyen: (famille: Famille, g: Fiche[]) => IpsMoyens,
    options: { liste: boolean; niveaux: Niveau[] | null },
  ): DonneesTerritoire["familles"] => {
    const resultat: DonneesTerritoire["familles"] = {};
    for (const [famille, g] of Map.groupBy(groupe, (f) => f.famille)) {
      const valeursIps = (s: Secteur) => secteur(g, s).map((f) => ok(valeur(f, "ips"))).filter((v) => v !== null);
      const synthese: SyntheseFamille = {
        compte: compte(g),
        eleves: eleves(g),
        ipsMoyen: ipsMoyen(famille, g),
        distributionIps: { public: distribution(valeursIps("public")), prive: distribution(valeursIps("prive_sous_contrat")), bornes: BORNES_IPS },
        moyennes: options.niveaux === null
          ? []
          : moyennesTerritoire(g)
              .map((m) => ({ ...m, comparaisons: m.comparaisons.filter((c) => options.niveaux!.includes(c.niveau)) }))
              .filter((m) => m.comparaisons.length),
        liste: options.liste ? g.map(ligneListe).sort(parNom) : [],
      };
      resultat[famille] = synthese;
    }
    return resultat;
  };

  // Communes
  const communes = communesRetenues(actives);
  const communesParDep = new Map<string, RefTerritoire[]>();
  for (const [code, groupe] of communes) {
    const premier = groupe[0]!;
    const ref: RefTerritoire = { niveau: "commune", code, libelle: libelleCommune(code, groupe) };
    communesParDep.set(premier.dep, [...(communesParDep.get(premier.dep) ?? []), ref]);
    const donnees: DonneesTerritoire = {
      ref, parents: [FRANCE, refAcademie(premier), refDepartement(premier)], rentree,
      familles: familles(groupe, (_, g) => calculee(g), { liste: true, niveaux: null }),
      horsContrat: horsContrat((l) => communeDeRattachement(l.code_commune) === code),
      enfants: [], communes: [], carte: points(groupe),
    };
    await ecrireJson(join(sortie, "communes", `${code}.json`), donnees);
  }

  // Départements
  for (const [dep, groupe] of Map.groupBy(actives, (f) => f.dep)) {
    const premier = groupe[0]!;
    const donnees: DonneesTerritoire = {
      ref: refDepartement(premier), parents: [FRANCE, refAcademie(premier)], rentree,
      familles: familles(groupe, (famille) => depp(ips.dep.get(`${famille}|${dep}`)), {
        liste: true, niveaux: ["departement", "academie", "france"],
      }),
      horsContrat: horsContrat((l) => l.dep === dep),
      enfants: [], communes: (communesParDep.get(dep) ?? []).sort(parLibelle), carte: points(groupe),
    };
    await ecrireJson(join(sortie, "departements", `${dep}.json`), donnees);
  }

  // Académies
  const parAcademie = Map.groupBy(actives, (f) => f.aca);
  for (const [aca, groupe] of parAcademie) {
    const donnees: DonneesTerritoire = {
      ref: refAcademie(groupe[0]!), parents: [FRANCE], rentree,
      familles: familles(groupe, (famille) => depp(ips.aca.get(`${famille}|${aca}`)), { liste: false, niveaux: ["academie", "france"] }),
      horsContrat: horsContrat((l) => l.aca === aca),
      enfants: [...Map.groupBy(groupe, (f) => f.dep)]
        .map(([dep, g]) => ligne(refDepartement(g[0]!), g, ips.dep.get(`college|${dep}`)))
        .sort((a, b) => parLibelle(a.ref, b.ref)),
      communes: [], carte: valeursCarte(groupe),
    };
    await ecrireJson(join(sortie, "academies", `${aca}.json`), donnees);
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
  const france: DonneesFrance = {
    ref: FRANCE, parents: [], rentree,
    familles: familles(actives, (famille) => depp(ips.nat.get(`${famille}|FR`)), { liste: false, niveaux: ["france"] }),
    horsContrat: horsContratLignes.length,
    enfants: [...parAcademie]
      .map(([aca, g]) => ligne(refAcademie(g[0]!), g, ips.aca.get(`college|${aca}`)))
      .sort((a, b) => parLibelle(a.ref, b.ref)),
    communes: [], carte: valeursCarte(actives),
    academies,
  };
  await ecrireJson(join(sortie, "france.json"), france);
}
