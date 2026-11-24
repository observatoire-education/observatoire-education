import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Fiche } from "@obs/shared/types";
import { ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { assemblerFiches, type RapportSuccesseurs } from "../pipeline/src/fiches.ts";
import {
  appliquerManuels, attacherSuccesseurs, deduireSuccesseurs, type Lien, type Manuels, verifierCycles,
} from "../pipeline/src/successeurs.ts";
import { cheminsFixtures, dbTest, FIXTURES, identiteTest, manifestTest } from "./aide.ts";

const dossier = await mkdtemp(join(tmpdir(), "obs-successeurs-"));
afterAll(() => rm(dossier, { recursive: true, force: true }));

// Les scénarios ont leur propre annuaire et leurs propres fermés (chaque scénario a sa commune) :
// ils ne perturbent pas les autres tests, qui partagent la base des fixtures principales.
const chemins = await cheminsFixtures(dossier);
const duck = await connexion();
for (const id of ["annuaire", "fermes"] as const) {
  const dest = join(dossier, `${id}-successeurs.parquet`);
  await executer(duck, `copy (select * from read_csv(${litteral(join(FIXTURES, "successeurs", `${id}.csv`))}, header = true, all_varchar = true)) to ${litteral(dest)} (format parquet)`);
  chemins[id] = dest;
}
duck.closeSync();
const db = await ouvrir(chemins);
const { liens, ambigus } = await deduireSuccesseurs(db);
const vers = (de: string) => liens.filter((l) => l.de === de).map((l) => `${l.vers}:${l.regle}`);

describe("déduction", () => {
  test("règle 1 : LGT et LP → LPO", () => {
    expect(vers("0440101A")).toEqual(["0440103C:1"]);
    expect(vers("0440102B")).toEqual(["0440103C:1"]);
  });

  test("règle 2 : même adresse", () => {
    expect(vers("0440111A")).toEqual(["0440112B:2"]);
  });

  test("deux candidats : aucun lien, signalé ambigu", () => {
    expect(vers("0440121A")).toEqual([]);
    expect(ambigus).toEqual([{ de: "0440121A", candidats: ["0440122B", "0440123C"] }]);
  });

  test("secteur différent : pas de lien", () => {
    expect(vers("0440131A")).toEqual([]);
    expect(ambigus.map((a) => a.de)).not.toContain("0440131A");
  });

  test("chaîne : A pointe vers B seulement, B vers C", () => {
    expect(vers("0440141A")).toEqual(["0440142B:1"]);
    expect(vers("0440142B")).toEqual(["0440143C:1"]);
  });

  test("une maternelle fermée n'a jamais une élémentaire seule pour successeur", () => {
    expect(vers("0440151A")).toEqual([]);
    expect(ambigus.map((a) => a.de)).not.toContain("0440151A");
  });
});

describe("écoles fermées", () => {
  const maintenant = new Date("2026-11-23T02:17:00Z");

  test("famille d'après la nature, secteur d'après les sources des écoles", async () => {
    const lignes = await db.sql<{ uai: string; famille: string | null }>(
      "select uai, famille from fermes where uai in ('0440151A', '0440161A') order by uai");
    expect(lignes).toEqual([{ uai: "0440151A", famille: "maternelle" }, { uai: "0440161A", famille: "elementaire" }]);
    const base = await dbTest();
    // La liste des fermés ne donne pas le secteur des écoles (« - ») : effectifs_ecoles le donne en capitales.
    expect(await base.sql("select uai, secteur from secteur_cites where uai in ('0440106F', '0440107G', '0440109K') order by uai")).toEqual([
      { uai: "0440106F", secteur: "public" }, { uai: "0440107G", secteur: "public" }, { uai: "0440109K", secteur: "public" },
    ]);
  });

  test("fusion : la maternelle et l'élémentaire fermées ont pour successeur la primaire ouverte le même jour", async () => {
    const r = await deduireSuccesseurs(await dbTest());
    const de = (uai: string) => r.liens.filter((l) => l.de === uai).map((l) => `${l.vers}:${l.regle}`);
    expect(de("0440107G")).toEqual(["0440108H:1"]);
    expect(de("0440109K")).toEqual(["0440108H:1"]);
    expect(de("0440106F")).toEqual([]);
  });

  test("fiche historique d'une école citée par effectifs_ecoles ; prédécesseurs de la primaire", async () => {
    const fiches = await assemblerFiches(await dbTest(), manifestTest(dossier), {}, maintenant);
    const f = (uai: string) => fiches.find((x) => x.uai === uai);
    expect(f("0440106F")).toMatchObject({ famille: "elementaire", secteur: "public", fermeLe: "2016-07-05" });
    expect(f("0440107G")).toMatchObject({ famille: "maternelle", fermeLe: "2019-07-04" });
    expect(f("0440107G")!.successeurs.map((s) => s.uai)).toEqual(["0440108H"]);
    expect(f("0440108H")!.predecesseurs).toEqual([
      { uai: "0440107G", nom: "École maternelle des Tilleuls", fermeLe: "2019-07-04" },
      { uai: "0440109K", nom: "École élémentaire des Tilleuls", fermeLe: "2019-07-04" },
    ]);
  });

  test("école fermée citée par la seule éducation prioritaire : fiche, secteur d'après ecoles_ep", async () => {
    const base = await dbTest();
    expect(await base.sql("select secteur from fermes where uai = '0440110M'")).toEqual([{ secteur: "public" }]);
    const fiches = await assemblerFiches(base, manifestTest(dossier), {}, maintenant);
    expect(fiches.find((x) => x.uai === "0440110M")).toMatchObject({ famille: "maternelle", secteur: "public", fermeLe: "2013-07-05" });
  });

  test("ecoles_ignorees compte toute UAI sans fiche, fermée ou non", async () => {
    // Dans ce scénario, 0440107G est fermée mais hors périmètre (école de plein air) : sans fiche, elle est comptée.
    expect(await db.sql("select uai from fiches_etab where uai = '0440107G'")).toEqual([]);
    expect(await db.sql(`select
      (select n from ecoles_ignorees where source = 'effectifs_ecoles') as n,
      (select count(distinct (uai, rentree))::integer from ecoles_effectifs_brut where uai not in (select uai from fiches_etab)) as sans_fiche,
      (select count(*)::integer from ecoles_effectifs_brut where uai = '0440107G') as fermee`)).toEqual([{ n: 55, sans_fiche: 55, fermee: 5 }]);
  });

  test("une école fermée que rien ne cite n'a pas de fiche", async () => {
    const fiches = await assemblerFiches(db, manifestTest(dossier), {}, maintenant);
    expect(fiches.map((x) => x.uai)).not.toContain("0440161A");
    expect(fiches.map((x) => x.uai)).not.toContain("0440151A");
  });
});

const connues = new Set(["A", "B", "C", "D"]);
const manuels = (m: Partial<Manuels>): Manuels => ({ ajouter: [], retirer: [], ...m });
const motif = "test";

describe("fichier manuel", () => {
  const auto: Lien[] = [{ de: "A", vers: "B", regle: 1 }, { de: "C", vers: "D", regle: 2 }];

  test("ajout et retrait l'emportent", () => {
    const r = appliquerManuels(auto, manuels({ ajouter: [{ de: "A", vers: "C", motif }], retirer: [{ de: "C", vers: "D", motif }] }), connues);
    expect(r).toEqual([{ de: "A", vers: "B", regle: 1 }, { de: "A", vers: "C", regle: "manuel" }]);
  });

  test("un ajout remplace le même lien déduit", () => {
    const r = appliquerManuels(auto, manuels({ ajouter: [{ de: "A", vers: "B", motif }] }), connues);
    expect(r.filter((l) => l.de === "A")).toEqual([{ de: "A", vers: "B", regle: "manuel" }]);
  });

  test("UAI inconnue dans le fichier manuel : erreur", () => {
    expect(() => appliquerManuels([], manuels({ ajouter: [{ de: "A", vers: "Z", motif }] }), connues)).toThrow(/Z/);
    expect(() => appliquerManuels([], manuels({ retirer: [{ de: "Y", vers: "A", motif }] }), connues)).toThrow(/Y/);
  });
});

describe("cycles", () => {
  test("cycle : erreur qui cite les deux UAI", () => {
    expect(() => verifierCycles([{ de: "A", vers: "B", regle: 1 }, { de: "B", vers: "A", regle: "manuel" }])).toThrow(/A.*B|B.*A/);
  });

  test("chaîne et liens parallèles : pas d'erreur", () => {
    verifierCycles([{ de: "A", vers: "B", regle: 1 }, { de: "B", vers: "C", regle: 1 }, { de: "A", vers: "C", regle: "manuel" }]);
  });
});

describe("attacher", () => {
  test("chaîne maillon par maillon, noms et dates de fermeture", async () => {
    // Les fermés n'ont une fiche que cités par une source ou connus du registre : on les y met.
    const registre = Object.fromEntries(["0440141A", "0440142B"].map((u) => [u, { premiere: "2026-01-01", identite: identiteTest(`Collège ${u.at(-1)}`) }]));
    const rapport: RapportSuccesseurs = { regle1: 0, regle2: 0, manuels: 0, ambigus: 0, sansFiche: 0 };
    const fiches = await assemblerFiches(await ouvrir(chemins, { registre }), manifestTest(dossier), registre, new Date("2026-11-23T02:17:00Z"), { rapport });
    const f = (uai: string): Fiche => fiches.find((x) => x.uai === uai)!;
    expect(f("0440141A").successeurs).toEqual([{ uai: "0440142B", nom: "Collège B", fermeLe: "2019-08-31" }]);
    expect(f("0440142B").successeurs).toEqual([{ uai: "0440143C", nom: "Collège C", fermeLe: null }]);
    expect(f("0440142B").predecesseurs).toEqual([{ uai: "0440141A", nom: "Collège A", fermeLe: "2015-08-31" }]);
    expect(f("0440143C").predecesseurs.map((p) => p.uai)).toEqual(["0440142B"]);
    // 5 liens déduits, dont 2 vers le LPO (fermés cités par ival) ; sans fiche : le fermé de la règle 2
    expect(rapport).toEqual({ regle1: 4, regle2: 0, manuels: 0, ambigus: 1, sansFiche: 1 });
  });

  test("lien vers une UAI sans fiche : ignoré", () => {
    const fiche = { uai: "A", nom: "A", fermeLe: "2020-01-01", successeurs: [], predecesseurs: [] } as unknown as Fiche;
    attacherSuccesseurs([fiche], [{ de: "A", vers: "X", regle: 1 }]);
    expect(fiche.successeurs).toEqual([]);
  });
});
