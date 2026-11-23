// Voisinage, assemblage des fiches et export des fichiers de données du site (site/data/).
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
  DonneesDepartement, DonneesFrance, DonneesSource, EntreeIndex, LigneListe, MoyenneTerritoire, SyntheseFamille,
} from "@obs/shared/donnees";
import { CODES_INDICATEURS, INDICATEURS } from "@obs/shared/libelles";
import type {
  Famille, Fiche, Identite, Indicateur, Mesure, Repartition, Secteur, Site, SourceId, SourceRef, Voisin,
} from "@obs/shared/types";
import type { Manifest } from "./archive.ts";
import type { Db } from "./db.ts";
import { calculerEleves } from "./eleves.ts";
import { calculerIndicateurs, calculerRepartitions } from "./indicateurs.ts";
import type { Registre } from "./registre.ts";
import { SOURCES } from "./sources.ts";

// --- Voisinage ---

const RAYON_TERRE_KM = 6371.0;

/** Distance haversine en kilomètres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(a));
}

/** Familles comparables pour le voisinage (publié sur /methode/). */
export const FAMILLES_VOISINES: Record<Famille, Famille[]> = {
  college: ["college"],
  legt: ["legt", "lpo"],
  lpo: ["legt", "lpo", "lp"],
  lp: ["lp", "lpo"],
  erea: ["erea"],
};

const HAVERSINE_SQL = `2 * ${RAYON_TERRE_KM} * asin(sqrt(
  pow(sin(radians(b.lat - a.lat) / 2), 2) + cos(radians(a.lat)) * cos(radians(b.lat)) * pow(sin(radians(b.lon - a.lon) / 2), 2)))`;

/**
 * Les k plus proches établissements actifs de familles compatibles, publics et privés sous contrat,
 * dans le rayon. null si l'établissement n'a pas de coordonnées. Les pages disparues n'ont pas de voisins
 * et ne sont voisines de personne.
 */
export async function calculerVoisins(
  db: Db,
  k = 6,
  rayonKm = 30,
  indicateurs?: Map<string, Indicateur[]>,
): Promise<Map<string, Voisin[] | null>> {
  const ind = indicateurs ?? (await calculerIndicateurs(db));
  const compat = Object.entries(FAMILLES_VOISINES)
    .flatMap(([a, bs]) => bs.map((b) => `('${a}', '${b}')`))
    .join(", ");
  const paires = await db.sql<{
    uai: string; voisin: string; d: number; nom: string; famille: Famille; secteur: Secteur; commune: string;
  }>(`
    with e as (select uai, nom, famille, secteur, commune, lat, lon from etablissements where lat is not null and lon is not null),
    compat(a, b) as (values ${compat}),
    p as (
      select a.uai, b.uai as voisin, ${HAVERSINE_SQL} as d, b.nom, b.famille, b.secteur, b.commune
      from e a
      join compat c on c.a = a.famille
      join e b on b.famille = c.b and b.uai <> a.uai
        and abs(b.lat - a.lat) <= 0.3 and abs(b.lon - a.lon) <= 0.45
    )
    select * from p where d <= ${Number(rayonKm)}
    qualify row_number() over (partition by uai order by d, voisin) <= ${Number(k)}
    order by uai, d, voisin`);
  const parUai = Map.groupBy(paires, (p) => p.uai);
  const avecCoordonnees = await db.sql<{ uai: string; gps: boolean }>(
    "select uai, lat is not null and lon is not null as gps from etablissements",
  );
  const mesure = (uai: string, code: string): Mesure =>
    ind.get(uai)?.find((i) => i.code === code)?.mesure ?? { valeur: null, statut: "non_disponible", source: null, rentree: null };

  const resultat = new Map<string, Voisin[] | null>();
  for (const { uai, gps } of avecCoordonnees) {
    resultat.set(
      uai,
      gps
        ? (parUai.get(uai) ?? []).map((p) => ({
            uai: p.voisin, nom: p.nom, famille: p.famille, secteur: p.secteur, commune: p.commune, distanceKm: p.d,
            eleves: mesure(p.voisin, "eleves"),
            elevesParEtpEns: mesure(p.voisin, "eleves_par_etp_ens"),
            ips: mesure(p.voisin, "ips"),
          }))
        : null,
    );
  }
  return resultat;
}

// --- Fiches ---

interface LigneIdentite {
  uai: string; nom: string; famille: Famille; secteur: Secteur; contrat: string | null; adresse: string;
  code_postal: string; commune: string; code_commune: string; dep: string; dep_libelle: string; aca: string;
  aca_libelle: string; ep: "REP+" | "REP" | null; segpa: boolean; ulis: boolean; internat: boolean;
  lat: number | null; lon: number | null;
}

async function identitesActives(db: Db): Promise<Map<string, Identite>> {
  const lignes = await db.sql<LigneIdentite>("select * from etablissements order by uai");
  const sites = Map.groupBy(
    await db.sql<{ uai: string; nom: string; adresse: string; code_postal: string; commune: string }>(
      "select uai, nom, adresse, code_postal, commune from sites where not principal order by uai, rang",
    ),
    (s) => s.uai,
  );
  return new Map(
    lignes.map((l) => [
      l.uai,
      {
        nom: l.nom, famille: l.famille, secteur: l.secteur, contrat: l.contrat, adresse: l.adresse,
        codePostal: l.code_postal, commune: l.commune, codeCommune: l.code_commune, dep: l.dep, depLibelle: l.dep_libelle,
        aca: l.aca, acaLibelle: l.aca_libelle, ep: l.ep, segpa: l.segpa, ulis: l.ulis, internat: l.internat,
        lat: l.lat, lon: l.lon,
        autresSites: (sites.get(l.uai) ?? []).map(
          (s): Site => ({ nom: s.nom, adresse: s.adresse, codePostal: s.code_postal, commune: s.commune }),
        ),
      },
    ]),
  );
}

/** Les sources effectivement utilisées par la fiche, dans l'ordre du registre, avec le millésime le plus récent. */
function sourcesUtilisees(
  manifest: Manifest, indicateurs: Indicateur[], repartitions: Repartition[], eleves: Fiche["eleves"],
): SourceRef[] {
  const rentrees = new Map<SourceId, number | null>([["annuaire", null]]);
  const noter = (id: SourceId | null, rentree: number | null) => {
    if (!id) return;
    const r = rentrees.get(id);
    rentrees.set(id, r === undefined || r === null ? rentree : rentree === null ? r : Math.max(r, rentree));
  };
  for (const i of indicateurs) if (i.mesure.statut === "ok") noter(i.mesure.source, i.mesure.rentree);
  for (const r of repartitions) if (r.statut === "ok") noter(r.source, r.rentree);
  for (const s of eleves?.source ?? []) noter(s, eleves!.rentree);

  return Object.values(SOURCES)
    .filter((s) => rentrees.has(s.id))
    .map((s) => {
      const v = manifest.derniere(s.id);
      if (!v) throw new Error(`aucune version archivée pour ${s.id}`);
      return {
        id: s.id, producteur: s.producteur, titre: s.titre, pageUrl: s.pageUrl,
        rentree: rentrees.get(s.id) ?? null, collecteLe: v.collecteLe, brutUrl: v.url,
      };
    });
}

/**
 * Une fiche par établissement actif, et une par page conservée (UAI du registre sortie du périmètre).
 * `registre` doit être celui avec lequel `db` a été ouverte.
 */
export async function assemblerFiches(db: Db, manifest: Manifest, registre: Registre, maintenant: Date): Promise<Fiche[]> {
  const indicateurs = await calculerIndicateurs(db);
  const repartitions = await calculerRepartitions(db);
  const eleves = await calculerEleves(db);
  const voisins = await calculerVoisins(db, 6, 30, indicateurs);
  const actives = await identitesActives(db);
  const disparus = await db.sql<{ uai: string }>("select uai from disparus order by uai");
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  const fiche = (uai: string, identite: Identite, disparuLe: string | null): Fiche => {
    const ind = indicateurs.get(uai) ?? [];
    const rep = repartitions.get(uai) ?? [];
    const el = eleves.get(uai) ?? null;
    return {
      uai, ...identite, disparuLe,
      indicateurs: ind, repartitions: rep, eleves: el,
      voisins: disparuLe === null ? (voisins.get(uai) ?? null) : null,
      sources: sourcesUtilisees(manifest, ind, rep, el),
    };
  };

  const fiches = [...actives].map(([uai, identite]) => fiche(uai, identite, null));
  for (const { uai } of disparus) {
    const entree = registre[uai];
    if (!entree) continue;
    fiches.push(fiche(uai, entree.identite, entree.disparuLe ?? aujourdhui));
  }
  return fiches.sort((a, b) => a.uai.localeCompare(b.uai));
}

// --- Export ---

const BORNES_IPS = Array.from({ length: 21 }, (_, i) => 60 + 5 * i);

function distribution(valeurs: number[]): number[] {
  const comptes = new Array<number>(BORNES_IPS.length - 1).fill(0);
  for (const v of valeurs) {
    const i = Math.min(comptes.length - 1, Math.max(0, Math.floor((v - 60) / 5)));
    comptes[i]!++;
  }
  return comptes;
}

const valeur = (f: Fiche, code: string): Mesure | undefined => f.indicateurs.find((i) => i.code === code)?.mesure;
const ok = (m: Mesure | undefined): number | null => (m?.statut === "ok" ? m.valeur : null);
const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, "fr");

function ligneListe(f: Fiche): LigneListe {
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
function moyennesTerritoire(groupe: Fiche[]): MoyenneTerritoire[] {
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

type IpsMoyen = { famille: Famille; territoire: string; pub: number | null; priv: number | null };

async function ipsMoyens(db: Db, niveau: "dep" | "nat"): Promise<Map<string, IpsMoyen>> {
  const lignes = await db.sql<IpsMoyen>(`
    select e.famille, ${niveau === "dep" ? "e.dep" : "'FR'"} as territoire,
      any_value(i.${niveau}_public) as pub, any_value(i.${niveau}_prive) as priv
    from ips i join etablissements e using (uai)
    where i.rentree = (select max(rentree) from ips)
    group by all`);
  return new Map(lignes.map((l) => [`${l.famille}|${l.territoire}`, l]));
}

async function ecrireJson(chemin: string, donnees: unknown): Promise<void> {
  await Bun.write(chemin, JSON.stringify(donnees));
}

export async function exporter(fiches: Fiche[], db: Db, manifest: Manifest, sortie = "site/data"): Promise<void> {
  await rm(sortie, { recursive: true, force: true });
  await mkdir(join(sortie, "fiches"), { recursive: true });
  await mkdir(join(sortie, "departements"), { recursive: true });

  for (const f of fiches) await ecrireJson(join(sortie, "fiches", `${f.uai}.json`), f);

  const index: EntreeIndex[] = fiches.map((f) => ({
    u: f.uai, n: f.nom, c: f.commune, d: f.dep, f: f.famille, s: f.secteur, ...(f.disparuLe ? { x: 1 as const } : {}),
  }));
  await ecrireJson(join(sortie, "index.json"), index);

  const actives = fiches.filter((f) => f.disparuLe === null);
  const [{ r: rentree } = { r: null }] = await db.sql<{ r: number | null }>("select max(rentree) as r from effectifs");
  const horsContrat = new Map(
    (await db.sql<{ dep: string; n: number }>(
      "select dep, count(*)::integer as n from classement where motif = 'prive_hors_contrat' group by dep",
    )).map((l) => [l.dep, l.n]),
  );
  const ipsDep = await ipsMoyens(db, "dep");
  const ipsNat = await ipsMoyens(db, "nat");

  const eleves = (groupe: Fiche[], secteur: Secteur) => {
    const v = groupe
      .filter((f) => f.secteur === secteur)
      .map((f) => valeur(f, "eleves"))
      .filter((m) => m?.statut === "ok" && m.rentree === rentree)
      .map((m) => m!.valeur!);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const compte = (groupe: Fiche[]) => ({
    public: groupe.filter((f) => f.secteur === "public").length,
    prive: groupe.filter((f) => f.secteur === "prive_sous_contrat").length,
  });

  for (const [dep, groupeDep] of Map.groupBy(actives, (f) => f.dep)) {
    const premier = groupeDep[0]!;
    const familles: DonneesDepartement["familles"] = {};
    for (const [famille, groupe] of Map.groupBy(groupeDep, (f) => f.famille)) {
      const ips = (secteur: Secteur) =>
        groupe
          .filter((f) => f.secteur === secteur)
          .map((f) => valeur(f, "ips"))
          .filter((m) => m?.statut === "ok" && m.valeur !== null)
          .map((m) => m!.valeur!);
      const moyen = ipsDep.get(`${famille}|${dep}`);
      const synthese: SyntheseFamille = {
        compte: compte(groupe),
        eleves: { public: eleves(groupe, "public"), prive: eleves(groupe, "prive_sous_contrat") },
        ipsMoyen: { public: moyen?.pub ?? null, prive: moyen?.priv ?? null },
        distributionIps: { public: distribution(ips("public")), prive: distribution(ips("prive_sous_contrat")), bornes: BORNES_IPS },
        moyennes: moyennesTerritoire(groupe),
        liste: groupe.map(ligneListe).sort(parNom),
      };
      familles[famille] = synthese;
    }
    const donnees: DonneesDepartement = {
      dep, libelle: premier.depLibelle, aca: premier.aca, acaLibelle: premier.acaLibelle, rentree,
      familles, horsContrat: horsContrat.get(dep) ?? 0,
    };
    await ecrireJson(join(sortie, "departements", `${dep}.json`), donnees);
  }

  const academies = [...Map.groupBy(actives, (f) => f.aca)]
    .map(([aca, groupe]) => ({
      aca,
      libelle: groupe[0]!.acaLibelle,
      departements: [...new Map(groupe.map((f) => [f.dep, f.depLibelle]))]
        .map(([d, libelle]) => ({ dep: d, libelle }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
    }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  const france: DonneesFrance = {
    rentree,
    familles: Object.fromEntries(
      [...Map.groupBy(actives, (f) => f.famille)].map(([famille, groupe]) => {
        const moyen = ipsNat.get(`${famille}|FR`);
        return [famille, {
          compte: compte(groupe),
          eleves: { public: eleves(groupe, "public"), prive: eleves(groupe, "prive_sous_contrat") },
          ipsMoyen: { public: moyen?.pub ?? null, prive: moyen?.priv ?? null },
        }];
      }),
    ),
    horsContrat: [...horsContrat.values()].reduce((a, b) => a + b, 0),
    academies,
  };
  await ecrireJson(join(sortie, "france.json"), france);

  const sources: Record<string, DonneesSource> = Object.fromEntries(
    Object.values(SOURCES).map((s) => [s.id, {
      id: s.id, titre: s.titre, producteur: s.producteur, pageUrl: s.pageUrl,
      actuelle: manifest.derniere(s.id) ?? null, versions: manifest.versions(s.id),
    }]),
  );
  await ecrireJson(join(sortie, "sources.json"), sources);
}
