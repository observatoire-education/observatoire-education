import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceId } from "@obs/shared/types";
import { empreinte, Manifest } from "../pipeline/src/archive.ts";
import { assurerCache, collecter, type ClientSources } from "../pipeline/src/collect.ts";
import { DepotGithub, DepotLocal, type Lanceur } from "../pipeline/src/depot.ts";
import { connexion, executer, lignes, litteral } from "../pipeline/src/duck.ts";
import { ErreurParquetInvalide } from "../pipeline/src/ods.ts";
import { FILTRE_FERMES, SOURCES, type Source, sourceBudget, toutesSources } from "../pipeline/src/sources.ts";

// --- Faux client : fabrique des Parquet avec DuckDB, sans réseau ---

interface Reglage {
  modified: string;
  lignes: number;
  sansColonne?: string;
  leve?: "metadata" | "tronque";
  /** Annuaire : ordre des lignes et valeur d'une colonne non requise (ne doivent pas changer l'empreinte). */
  inverse?: boolean;
  bruit?: string;
}

const duck = await connexion();

async function fabriquer(s: Source, r: Reglage, dest: string): Promise<void> {
  const id = s.id;
  const colonnes = s.colonnesRequises.filter((c) => c !== r.sansColonne);
  const expr = (c: string) => {
    if (c === "identifiant_de_l_etablissement" || c === "uai") return `'044' || lpad(i::varchar, 4, '0') || 'A'`;
    if (c === "type_etablissement") return `'Collège'`;
    if (c === "fonction") return `'221'`;
    return `(i % 7)::varchar`;
  };
  let select = `select ${colonnes.map((c) => `${expr(c)} as "${c}"`).join(", ")} from range(${r.lignes}) t(i)`;
  if (id === "annuaire") {
    // colonne non requise + lignes hors périmètre (écoles), qui doivent disparaître à la réduction
    select = `select *, ${litteral(r.bruit ?? "a")} as fax from (${select}
      union all select ${colonnes.map((c) => (c === "type_etablissement" ? `'Ecole'` : `'E' || i::varchar`) + ` as "${c}"`).join(", ")} from range(3) t(i))
      order by 1 ${r.inverse ? "desc" : "asc"}`;
  } else if (id === "carte_scolaire") {
    // colonne non requise (libellé de la commune), ordre des lignes variable
    select = `select *, ${litteral(r.bruit ?? "a")} as libelle_commune from (${select}) order by 1 ${r.inverse ? "desc" : "asc"}`;
  } else if (s.filtre) {
    // extrait filtré : le portail peut renvoyer les mêmes lignes dans un autre ordre
    select = `select * from (${select}) order by 1 ${r.inverse ? "desc" : "asc"}`;
  }
  await executer(duck, `copy (${select}) to ${litteral(dest)} (format parquet)`);
}

function fauxClient(
  reglages: Partial<Record<SourceId, Partial<Reglage>>>,
  /** Catalogue simulé : identifiants renvoyés pour une recherche de titre. */
  catalogue: Record<string, string[]> = {},
) {
  const telechargements: SourceId[] = [];
  const recherches: string[] = [];
  const regle = (id: SourceId): Reglage => ({ modified: "M1", lignes: 10, ...reglages[id] });
  const client: ClientSources = {
    async metadata(s) {
      const r = regle(s.id);
      if (r.leve === "metadata") throw new Error("ECONNRESET");
      return { modified: r.modified, recordsCount: r.lignes };
    },
    async telechargerParquet(s, dest) {
      telechargements.push(s.id);
      const r = regle(s.id);
      if (r.leve === "tronque") throw new ErreurParquetInvalide(`fichier Parquet tronqué ou invalide pour ${s.datasetId}`);
      await fabriquer(s, r, dest);
      const url = `${s.api}/${s.datasetId}/exports/parquet${s.filtre ? `?where=${encodeURIComponent(s.filtre)}` : ""}`;
      return { chemin: dest, url };
    },
    async chercherJeu(_api, titre) {
      recherches.push(titre);
      return catalogue[titre] ?? [];
    },
  };
  return { client, telechargements, recherches, reglages };
}

// --- Bac à sable ---

const dossiers: string[] = [];
let racine: string;
let manifest: Manifest;
let depot: DepotLocal;
const maintenant = new Date("2026-11-23T02:17:00Z");

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), "obs-collect-"));
  dossiers.push(racine);
  manifest = Manifest.lire(join(racine, "manifest.json"));
  depot = new DepotLocal(join(racine, "depot"));
});
afterAll(async () => {
  for (const d of dossiers) await rm(d, { recursive: true, force: true });
});

const opts = (client: ClientSources, extra: { journal?: string } = {}) => ({
  manifest,
  client,
  depot,
  maintenant,
  tmp: join(racine, "tmp"),
  ...extra,
});
const ligne = (journal: Awaited<ReturnType<typeof collecter>>, id: SourceId) => journal.find((l) => l.source === id)!;

describe("collecte", () => {
  test("inchangé : aucun téléchargement", async () => {
    const f = fauxClient({});
    await collecter(opts(f.client));
    const avant = f.telechargements.filter((s) => s === "ips_colleges").length;
    const j = await collecter(opts(f.client));
    expect(ligne(j, "ips_colleges").action).toBe("inchange");
    expect(f.telechargements.filter((s) => s === "ips_colleges").length).toBe(avant);
  });

  test("nouvelle version publiée et dédupliquée", async () => {
    const f = fauxClient({});
    const j1 = await collecter(opts(f.client));
    expect(ligne(j1, "ips_colleges")).toMatchObject({ action: "telecharge", lignes: 10, modified: "M1" });
    f.reglages.ips_colleges = { modified: "M2" }; // nouvelle date, même contenu
    const j2 = await collecter(opts(f.client));
    expect(ligne(j2, "ips_colleges")).toMatchObject({ action: "inchange", motif: "contenu identique" });
    const v = manifest.versions("ips_colleges");
    expect(v).toHaveLength(1);
    expect(v[0]!.tag).toBe("archives-ips_colleges-2026");
    expect(v[0]!.fichier).toBe(`${v[0]!.sha256.slice(0, 16)}.parquet`);
    // M2 a été vue : pas de nouveau téléchargement la nuit suivante
    const n = f.telechargements.length;
    await collecter(opts(f.client));
    expect(f.telechargements.filter((s) => s === "ips_colleges").length).toBe(2);
    expect(f.telechargements.length).toBe(n + 2); // seuls les référentiels (annuaire, carte scolaire) sont retéléchargés
  });

  test("retour à un contenu déjà archivé : il redevient la version actuelle", async () => {
    // observé sur l'annuaire réel : le portail alterne entre deux états sous la même date « modified »
    const f = fauxClient({ annuaire: { lignes: 10 } });
    await collecter(opts(f.client));
    const a = manifest.derniere("annuaire")!.sha256;
    f.reglages.annuaire = { lignes: 9 };
    await collecter(opts(f.client));
    expect(manifest.derniere("annuaire")!.lignes).toBe(9);
    f.reglages.annuaire = { lignes: 10 };
    const j = await collecter(opts(f.client));
    expect(ligne(j, "annuaire")).toMatchObject({ action: "inchange", motif: "contenu identique" });
    expect(manifest.versions("annuaire")).toHaveLength(2);
    expect(manifest.derniere("annuaire")!.sha256).toBe(a);
    expect(Manifest.lire(manifest.chemin).derniere("annuaire")!.sha256).toBe(a);
  });

  test("colonne manquante rejetée", async () => {
    const f = fauxClient({ ips_colleges: { sansColonne: "uai" } });
    const j = await collecter(opts(f.client));
    expect(ligne(j, "ips_colleges").action).toBe("rejete");
    expect(ligne(j, "ips_colleges").motif).toBe("colonne manquante : uai");
    expect(manifest.versions("ips_colleges")).toHaveLength(0);
  });

  test("une version de ivac sans la colonne va_du_taux_de_reussite_g est rejetée", async () => {
    const f = fauxClient({ ivac: { sansColonne: "va_du_taux_de_reussite_g" } });
    const j = await collecter(opts(f.client));
    expect(ligne(j, "ivac").action).toBe("rejete");
    expect(ligne(j, "ivac").motif).toBe("colonne manquante : va_du_taux_de_reussite_g");
  });

  test("chaque source millésimée déclare une colonne de millésime présente dans ses colonnes requises", () => {
    const millesimees = [...Object.values(SOURCES), sourceBudget(2024, "x")].filter((s) => s.millesime);
    expect(millesimees.length).toBeGreaterThanOrEqual(17);
    for (const s of millesimees) {
      expect(s.colonnesRequises).toContain(s.millesime!.colonne);
      for (const c of s.millesime!.cles) expect(s.colonnesRequises).toContain(c);
    }
    expect(SOURCES.fermes.millesime).toBeUndefined();
    expect(SOURCES.annuaire.millesime).toBeUndefined();
  });

  test("baisse de lignes rejetée, version précédente conservée", async () => {
    const f = fauxClient({ ips_colleges: { lignes: 100 } });
    await collecter(opts(f.client));
    f.reglages.ips_colleges = { lignes: 70, modified: "M2" };
    const j = await collecter(opts(f.client));
    expect(ligne(j, "ips_colleges")).toMatchObject({ action: "rejete", motif: "70 lignes < 80 % de 100" });
    expect(manifest.derniere("ips_colleges")!.lignes).toBe(100);
    // une version rejetée est retentée la nuit suivante
    const n = f.telechargements.filter((s) => s === "ips_colleges").length;
    await collecter(opts(f.client));
    expect(f.telechargements.filter((s) => s === "ips_colleges").length).toBe(n + 1);
  });

  test("parquet tronqué rejeté", async () => {
    const j = await collecter(opts(fauxClient({ personnels: { leve: "tronque" } }).client));
    expect(ligne(j, "personnels").action).toBe("rejete");
    expect(ligne(j, "personnels").motif).toContain("tronqué");
  });

  test("erreur réseau isolée", async () => {
    const j = await collecter(opts(fauxClient({ ips_colleges: { leve: "metadata" } }).client));
    expect(ligne(j, "ips_colleges")).toMatchObject({ action: "erreur", motif: "ECONNRESET" });
    expect(ligne(j, "ips_lycees").action).toBe("telecharge");
  });

  test("annuaire réduit puis dédupliqué", async () => {
    const f = fauxClient({ annuaire: { modified: "A1" } });
    const j1 = await collecter(opts(f.client));
    expect(ligne(j1, "annuaire")).toMatchObject({ action: "telecharge", lignes: 10 }); // écoles retirées
    f.reglages.annuaire = { modified: "A2", inverse: true, bruit: "b" };
    const j2 = await collecter(opts(f.client));
    expect(ligne(j2, "annuaire").action).toBe("inchange");
    expect(manifest.versions("annuaire")).toHaveLength(1);
    const chemin = (await assurerCache(manifest, depot, join(racine, "cache"))).annuaire;
    const cols = await lignes<{ column_name: string }>(duck, `describe select * from read_parquet(${litteral(chemin)})`);
    expect(cols.map((c) => c.column_name)).toEqual(SOURCES.annuaire.colonnesRequises);
  });

  test("carte scolaire : référentiel réduit à ses colonnes requises, toutes ses lignes gardées, puis dédupliqué", async () => {
    const f = fauxClient({ carte_scolaire: { modified: "C1" } });
    const j1 = await collecter(opts(f.client));
    expect(ligne(j1, "carte_scolaire")).toMatchObject({ action: "telecharge", lignes: 10 });
    f.reglages.carte_scolaire = { modified: "C1", inverse: true, bruit: "b" };
    const j2 = await collecter(opts(f.client));
    expect(ligne(j2, "carte_scolaire")).toMatchObject({ action: "inchange", motif: "contenu identique" });
    const chemin = (await assurerCache(manifest, depot, join(racine, "cache"))).carte_scolaire;
    const cols = await lignes<{ column_name: string }>(duck, `describe select * from read_parquet(${litteral(chemin)})`);
    expect(cols.map((c) => c.column_name)).toEqual(SOURCES.carte_scolaire.colonnesRequises);
  });

  test("journal : une ligne par source", async () => {
    const journal = join(racine, "journal.jsonl");
    await collecter(opts(fauxClient({}).client, { journal }));
    await collecter(opts(fauxClient({}).client, { journal }));
    const l = (await Bun.file(journal).text()).trim().split("\n").map((x) => JSON.parse(x));
    expect(l).toHaveLength(62); // vingt-cinq sources et six exercices du budget, deux fois
    expect(l[0]).toMatchObject({ date: "2026-11-23T02:17:00.000Z", source: "annuaire" });
  });

  test("premier lancement : dossiers du manifest et du journal créés", async () => {
    manifest = Manifest.lire(join(racine, "archives", "manifest.json"));
    const journal = join(racine, "archives", "journal.jsonl");
    const j = await collecter(opts(fauxClient({}).client, { journal }));
    expect(j.every((l) => l.action === "telecharge")).toBe(true);
    expect(await Bun.file(join(racine, "archives", "manifest.json")).exists()).toBe(true);
  });

  test("manifest : écriture atomique et relecture", async () => {
    await collecter(opts(fauxClient({}).client));
    expect((await readdir(racine)).filter((f) => f.includes(".tmp"))).toEqual([]);
    const relu = Manifest.lire(join(racine, "manifest.json"));
    expect(relu.versions("personnels")).toEqual(manifest.versions("personnels"));
  });
});

describe("budget : exercices et découverte", () => {
  const titre2026 = "nature-fonction 2026";

  test("les extraits budget sont collectés avec leur requête", async () => {
    await collecter(opts(fauxClient({}).client));
    const v = manifest.derniere("budget_2024")!;
    expect(v.requete).toContain("exports/parquet?where=");
    expect(manifest.derniere("annuaire")!.requete).toBeUndefined();
  });

  test("extrait budget réordonné par le portail : même empreinte, aucune nouvelle version", async () => {
    const f = fauxClient({});
    await collecter(opts(f.client));
    f.reglages.budget_2024 = { modified: "M2", inverse: true }; // nouvelle date, mêmes lignes dans un autre ordre
    const j = await collecter(opts(f.client));
    expect(ligne(j, "budget_2024")).toMatchObject({ action: "inchange", motif: "contenu identique" });
    expect(manifest.versions("budget_2024")).toHaveLength(1);
  });

  test("filtre changé : requête archivée différente, même « modified » → retéléchargé ; identique → inchangé", async () => {
    const f = fauxClient({});
    await collecter(opts(f.client));
    const avant = f.telechargements.filter((x) => x === "budget_2024").length;
    // même requête, même modified : inchangé, aucun téléchargement
    const j1 = await collecter(opts(f.client));
    expect(ligne(j1, "budget_2024").action).toBe("inchange");
    expect(f.telechargements.filter((x) => x === "budget_2024")).toHaveLength(avant);
    // requête archivée avec un autre filtre : on retélécharge malgré le « modified » identique
    manifest.derniere("budget_2024")!.requete = "https://exemple.test/ancien-filtre";
    const j2 = await collecter(opts(f.client));
    expect(f.telechargements.filter((x) => x === "budget_2024")).toHaveLength(avant + 1);
    expect(ligne(j2, "budget_2024").action).toBe("inchange"); // contenu identique
    expect(manifest.derniere("budget_2024")!.requete).toContain("where=");
    // et la nuit suivante, plus de retéléchargement
    await collecter(opts(f.client));
    expect(f.telechargements.filter((x) => x === "budget_2024")).toHaveLength(avant + 1);
  });

  test("filtre changé : la baisse du nombre de lignes n'est pas un motif de rejet, les colonnes le restent", async () => {
    const f = fauxClient({});
    await collecter(opts(f.client));
    manifest.derniere("budget_2024")!.requete = "https://exemple.test/ancien-filtre";
    f.reglages.budget_2024 = { lignes: 3, modified: "M1" };
    const j = await collecter(opts(f.client));
    expect(ligne(j, "budget_2024").action).toBe("telecharge");
    manifest.derniere("budget_2024")!.requete = "https://exemple.test/ancien-filtre";
    f.reglages.budget_2024 = { lignes: 3, modified: "M1", sansColonne: "fonction" };
    const j2 = await collecter(opts(f.client));
    expect(ligne(j2, "budget_2024").action).toBe("rejete");
  });

  test("un exercice nouveau trouvé est collecté et archivé avec sa requête", async () => {
    const f = fauxClient({}, { [titre2026]: ["jeu-2026"] });
    const j = await collecter(opts(f.client));
    expect(f.recherches).toEqual([titre2026]);
    expect(ligne(j, "budget_2026")).toMatchObject({ action: "telecharge", lignes: 10 });
    expect(manifest.jeuDecouvert("budget_2026")).toBe("jeu-2026");
    expect(manifest.derniere("budget_2026")!.requete).toContain("where=");
    expect(Manifest.lire(manifest.chemin).jeuDecouvert("budget_2026")).toBe("jeu-2026");
    // la nuit suivante : le jeu découvert est une source connue, on cherche 2027
    const j2 = await collecter(opts(f.client));
    expect(ligne(j2, "budget_2026").action).toBe("inchange");
    expect(f.recherches.at(-1)).toBe("nature-fonction 2027");
    expect(toutesSources(manifest).map((s) => s.id)).toContain("budget_2026");
    const chemins = await assurerCache(manifest, depot, join(racine, "cache"));
    expect(chemins.budget_2026).toBeDefined();
  });

  test("deux jeux pour un exercice : erreur au journal, rien de collecté", async () => {
    const f = fauxClient({}, { [titre2026]: ["jeu-a", "jeu-b"] });
    const j = await collecter(opts(f.client));
    expect(ligne(j, "budget_2026")).toEqual({
      date: maintenant.toISOString(),
      source: "budget_2026",
      action: "erreur",
      motif: "plusieurs jeux pour l'exercice 2026 : jeu-a, jeu-b",
    });
    expect(manifest.jeuDecouvert("budget_2026")).toBeUndefined();
    expect(manifest.versions("budget_2026")).toHaveLength(0);
  });

  test("aucun jeu : aucune ligne de journal pour l'exercice", async () => {
    const j = await collecter(opts(fauxClient({}).client));
    expect(j.filter((l) => l.source === "budget_2026")).toEqual([]);
    expect(j).toHaveLength(31);
  });

  test("un extrait budget sans la colonne fonction est rejeté", async () => {
    const j = await collecter(opts(fauxClient({ budget_2024: { sansColonne: "fonction" } }).client));
    expect(ligne(j, "budget_2024")).toMatchObject({ action: "rejete", motif: "colonne manquante : fonction" });
    expect(manifest.versions("budget_2024")).toHaveLength(0);
    expect(ligne(j, "budget_2023").action).toBe("telecharge");
  });

  test("sourceBudget : identifiant, titre et API", () => {
    const s = sourceBudget(2026, "x");
    expect(s).toMatchObject({ id: "budget_2026", producteur: "DGFiP", referentiel: false });
    expect(s.titre).toBe("Balances comptables des collectivités, présentation croisée nature-fonction 2026");
    expect(s.pageUrl).toBe("https://data.economie.gouv.fr/explore/dataset/x/information/");
  });
});

describe("cache local", () => {
  test("assurerCache vérifie l'empreinte", async () => {
    await collecter(opts(fauxClient({}).client));
    const cache = join(racine, "cache");
    const chemins = await assurerCache(manifest, depot, cache);
    expect(Object.keys(chemins)).toHaveLength(31);
    await Bun.write(chemins.ips_lycees, "corrompu");
    const encore = await assurerCache(manifest, depot, cache);
    expect(await empreinte(encore.ips_lycees)).toBe(manifest.derniere("ips_lycees")!.sha256);
  });

  test("source jamais archivée : erreur explicite", async () => {
    await expect(assurerCache(manifest, depot, join(racine, "cache"))).rejects.toThrow(/aucune version archivée/);
  });
});

describe("dépôt GitHub", () => {
  test("crée la release si besoin, téléverse, renvoie l'URL permanente", async () => {
    const appels: string[][] = [];
    const lanceur: Lanceur = async (args) => {
      appels.push(args);
      return args[1] === "view" ? { code: 1, sortie: "release not found" } : { code: 0, sortie: "" };
    };
    const d = new DepotGithub("org/depot", lanceur);
    const url = await d.publier("archives-annuaire-2026", "/tmp/x/0123456789abcdef.parquet");
    expect(url).toBe("https://github.com/org/depot/releases/download/archives-annuaire-2026/0123456789abcdef.parquet");
    expect(appels.map((a) => a.slice(0, 2).join(" "))).toEqual(["release view", "release create", "release upload"]);
    expect(appels[2]).toContain("--repo");
  });

  test("échec de téléversement : erreur", async () => {
    const lanceur: Lanceur = async (args) => (args[1] === "upload" ? { code: 1, sortie: "HTTP 403" } : { code: 0, sortie: "" });
    await expect(new DepotGithub("org/depot", lanceur).publier("t", "/tmp/f.parquet")).rejects.toThrow(/403/);
  });
});

describe("sources du premier degré", () => {
  test("effectifs des écoles : millésime par rentrée, clé numero_ecole", () => {
    expect(SOURCES.effectifs_ecoles.millesime).toEqual({ colonne: "rentree_scolaire", cles: ["numero_ecole"] });
    expect(SOURCES.classes_ecoles.millesime).toEqual({ colonne: "annee", cles: ["uai", "type_classe"] });
    expect(SOURCES.ecoles_ep.millesime).toEqual({ colonne: "rs", cles: ["uai"] });
  });

  test("le filtre des fermés couvre les écoles", () => {
    expect(FILTRE_FERMES).toContain('nature_uai_libe like "ECOLE%"');
  });
});
