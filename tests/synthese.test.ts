// Chiffres de Synthèse : fonctions pures sur des objets construits à la main.
import { describe, expect, test } from "bun:test";
import { entier } from "../shared/src/format.ts";
import { LIBELLES_SYNTHESE } from "../shared/src/libelles.ts";
import { absenceBudget } from "../site/src/lib/budget.ts";
import { tauxEntier, vaSignee } from "../site/src/lib/resultats.ts";
import { moyensSynthese, moyensTerritoire, resultatsSynthese, totalSecondDegre } from "../site/src/lib/synthese.ts";

const val = (o: object) => ({ code: "taux_reussite", valeur: 91.2, statut: "ok", va: 2, statutVa: "ok", comparaisons: [], ...o });
const voie = (v: string, valeurs: object[]) => ({ voie: v, source: "x", session: 2025, effectif: 100, valeurs, mentions: null, historique: [], rupture: null });
const fiche = (...r: object[]) => ({ resultats: r }) as any;

describe("resultatsSynthese", () => {
  test("taux et valeur ajoutée", () => {
    expect(resultatsSynthese(fiche(voie("brevet_general", [val({})])))).toEqual([
      { voie: LIBELLES_SYNTHESE.voies.brevet_general, session: 2025, taux: tauxEntier(91.2), va: vaSignee(2) },
    ]);
  });
  test("VA sans objet : null", () => {
    expect(resultatsSynthese(fiche(voie("brevet_general", [val({ statutVa: "sans_objet", va: null })])))[0]!.va).toBeNull();
  });
  test("taux non publié : null", () => {
    expect(resultatsSynthese(fiche(voie("brevet_general", [val({ statut: "non_publie", valeur: null })])))[0]!.taux).toBeNull();
  });
  test("deux voies dans l'ordre, aucune voie", () => {
    const r = resultatsSynthese(fiche(voie("bac_gt", [val({})]), voie("bac_pro", [val({})])));
    expect(r.map((x) => x.voie)).toEqual([LIBELLES_SYNTHESE.voies.bac_gt, LIBELLES_SYNTHESE.voies.bac_pro]);
    expect(resultatsSynthese(fiche())).toEqual([]);
  });
});

const montant = (parEleve: number | null, statut = "ok") => ({ total: null, parEleve, statut });
const exo = (exercice: number, hp: any, pf: any = montant(300)) => ({
  exercice, rentree: exercice - 1, source: "s", eleves: { public: 1, prive: 1 },
  public: { horsPersonnel: hp, avecPersonnel: montant(1), investissement: montant(1) },
  prive: { fonctionnement: pf, investissement: montant(1) }, citesScolaires: null,
});
const moy = (v: number | null) => ({ valeur: v, n: 3 });
const franceBudget = (niveau: string) => ({
  niveau,
  exercices: [{ exercice: 2024, public: { horsPersonnel: moy(1100), avecPersonnel: moy(1), investissement: moy(1) }, prive: { fonctionnement: moy(250), investissement: moy(1) } }],
}) as any;
const coll = (niveau: string, hp: any, pf?: any) => ({ id: "c", libelle: "C", niveau, exercices: [exo(2023, montant(1)), exo(2024, hp, pf)], mentions: [] }) as any;

describe("moyensSynthese", () => {
  test("public : dernier exercice et moyenne France", () => {
    expect(moyensSynthese(coll("colleges", montant(1280)), franceBudget("colleges"), "public", "colleges"))
      .toEqual({ exercice: 2024, texte: entier(1280), absent: false, france: entier(1100) });
  });
  test("montant absent : motif en toutes lettres", () => {
    const r = moyensSynthese(coll("colleges", montant(null, "personnel_non_rattache")), franceBudget("colleges"), "public", "colleges");
    expect(r).toMatchObject({ absent: true, texte: absenceBudget("personnel_non_rattache", "colleges") });
  });
  test("privé : poste fonctionnement", () => {
    expect(moyensSynthese(coll("colleges", montant(1280), montant(320)), franceBudget("colleges"), "prive", "colleges"))
      .toEqual({ exercice: 2024, texte: entier(320), absent: false, france: entier(250) });
  });
  test("pas de moyenne France : null ; pas de budget : null", () => {
    expect(moyensSynthese(coll("colleges", montant(1280)), undefined, "public", "colleges")!.france).toBeNull();
    expect(moyensSynthese(null, undefined, "public", "colleges")).toBeNull();
  });
});

const fam = (cp: number, cv: number, ep: number | null, ev: number | null) => ({ compte: { public: cp, prive: cv }, eleves: { public: ep, prive: ev } }) as any;

describe("totalSecondDegre", () => {
  test("collèges et lycées", () => {
    expect(totalSecondDegre([["college", fam(5, 2, 600, 200)], ["legt", fam(3, 1, 400, 100)]]))
      .toEqual({ eleves: 1300, prive: 300, partPrive: 300 / 1300, nonPubliees: [] });
  });
  test("effectif privé non publié : exclu et signalé", () => {
    const r = totalSecondDegre([["college", fam(5, 2, 600, 200)], ["lp", fam(2, 2, 100, null)]]);
    expect(r).toMatchObject({ eleves: 900, prive: 200, nonPubliees: ["lp"] });
  });
  test("aucun établissement privé : pas signalé", () => {
    expect(totalSecondDegre([["lp", fam(2, 0, 100, null)]]).nonPubliees).toEqual([]);
  });
  test("aucun effectif : null", () => {
    expect(totalSecondDegre([])).toEqual({ eleves: null, prive: null, partPrive: null, nonPubliees: [] });
  });
});

const terr = (niveau: string) => ({
  ref: { niveau, code: "x", libelle: "X" },
  budget: { collectivites: [coll("colleges", montant(1280)), coll("lycees", montant(1900))], france: [franceBudget("colleges"), franceBudget("lycees")] },
}) as any;

describe("moyensTerritoire", () => {
  test("département : collèges", () => {
    expect(moyensTerritoire(terr("departement"))).toEqual({ exercice: 2024, texte: entier(1280), absent: false, france: entier(1100), libelle: LIBELLES_SYNTHESE.moyens });
  });
  test("région : lycées", () => {
    expect(moyensTerritoire(terr("region"))!.texte).toBe(entier(1900));
  });
  test("France : moyenne collèges", () => {
    expect(moyensTerritoire(terr("france"))).toEqual({ exercice: 2024, texte: entier(1100), absent: false, france: null, libelle: LIBELLES_SYNTHESE.moyens });
  });
  test("académie et commune : null", () => {
    expect(moyensTerritoire(terr("academie"))).toBeNull();
    expect(moyensTerritoire(terr("commune"))).toBeNull();
  });
});
