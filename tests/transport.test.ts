import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manifest } from "../pipeline/src/archive.ts";
import { EXERCICES_BUDGET, sourceTransport, toutesSources } from "../pipeline/src/sources.ts";
import { collectiviteTransport } from "../pipeline/src/transport.ts";
import { lireTransport, type TableTransport, transportDepartement, transportRegion, transportRegions } from "../pipeline/src/transport-export.ts";
import { dbTest } from "./aide.ts";

describe("sources transport", () => {
  test("une source transport par exercice du budget, même jeu, filtre propre à chaque nomenclature", () => {
    const s = sourceTransport(2024, EXERCICES_BUDGET[2024]!);
    expect(s.id).toBe("transport_2024");
    expect(s.datasetId).toBe(EXERCICES_BUDGET[2024]!);
    expect(s.filtre).toContain(`"9381"`);
    expect(s.filtre).toContain(`"GFP"`);
    expect(s.filtre).toContain(`nomen = "M14"`);
    expect(s.filtre).not.toContain(`"93821"`);
    expect(s.filtre).not.toContain(`"812"`);
    expect(s.filtre).not.toContain(`"Commune"`);
  });

  test("toutesSources contient transport_2020 à transport_2025", async () => {
    const m = Manifest.lire(join(await mkdtemp(join(tmpdir(), "obs-transport-")), "manifest.json"));
    const ids = toutesSources(m).map((s) => s.id);
    for (const e of [2020, 2021, 2022, 2023, 2024, 2025]) expect(ids).toContain(`transport_${e}`);
  });
});

describe("collectiviteTransport", () => {
  const l = (categ: string, ndept: string | null, siren: string | null, cregi: string | null = null, lbudg = "X") =>
    ({ categ, ndept, cregi, lbudg, siren });
  test("collectivités du budget inchangées ; groupements rattachés au département de leur siège", () => {
    expect(collectiviteTransport(l("REG", "044", null, "052"))).toBe("reg-52");
    expect(collectiviteTransport(l("ML", "069", null))).toBe("ml-lyon");
    expect(collectiviteTransport(l("DEPT", "067", null, "044", "COLLECTIVITE EUROPEENNE D'ALSACE"))).toBe("cea");
    expect(collectiviteTransport(l("PARIS", "075", null))).toBe("paris");
    expect(collectiviteTransport(l("CTU", "02A", null, "094", "COLLECTIVITE DE CORSE"))).toBe("ctu-corse");
    expect(collectiviteTransport(l("GFP", "044", "244400404"))).toBe("grp-44-244400404");
    expect(collectiviteTransport(l("SYND", "02A", "252000001"))).toBe("grp-2A-252000001");
    expect(collectiviteTransport(l("SYND", "101", "252000002"))).toBe("grp-971-252000002");
  });
  test("groupement sans département reconnu ou sans SIREN : null", () => {
    expect(collectiviteTransport(l("GFP", null, "200000001"))).toBeNull();
    expect(collectiviteTransport(l("GFP", "", "200000001"))).toBeNull();
    expect(collectiviteTransport(l("GFP", "044", null))).toBeNull();
  });
});

describe("etapeTransport", () => {
  type M = { exercice: number; collectivite: string; libelle: string; poste: string; montant: number };
  const montants = async () => (await dbTest()).sql<M>("select * from transport_montants order by all");
  const m = async (collectivite: string, exercice: number, poste: string) =>
    (await montants()).find((x) => x.collectivite === collectivite && x.exercice === exercice && x.poste === poste)?.montant;

  test("fonctionnement : 9381 + 93252, classe 6 hors 68 ; investissement : 2317 ; produits : comptes 70", async () => {
    expect(await m("reg-52", 2024, "fonctionnement")).toBe(156_000_000);
    expect(await m("reg-52", 2024, "investissement")).toBe(1_000_000);
    expect(await m("reg-52", 2024, "produits_services")).toBe(20_000_000);
    expect(await m("reg-52", 2023, "fonctionnement")).toBe(140_000_000);
  });

  test("collectivités particulières et groupements", async () => {
    expect(await m("ctu-corse", 2024, "fonctionnement")).toBe(50_000_000);
    expect(await m("ml-lyon", 2024, "fonctionnement")).toBe(11_000_000);
    expect(await m("cea", 2024, "fonctionnement")).toBe(9_000_000);
    expect(await m("paris", 2023, "fonctionnement")).toBe(6_500_000);
    expect(await m("grp-44-244400404", 2024, "fonctionnement")).toBe(2_000_000);
    expect((await montants()).find((x) => x.collectivite === "grp-44-254400001")!.libelle)
      .toBe("SYNDICAT TRANSPORTS SCOLAIRES DU PAYS DE RETZ");
  });

  test("M14 : 252 seulement, jamais 81 (services urbains)", async () => {
    expect(await m("grp-44-244400503", 2023, "fonctionnement")).toBe(400_000);
  });

  test("montant net négatif conservé", async () => {
    expect(await m("grp-44-244400602", 2024, "fonctionnement")).toBe(-50_000);
  });

  test("exercice absent : aucune ligne, pas de zéro", async () => {
    expect((await montants()).filter((x) => x.collectivite === "grp-44-254400001" && x.exercice === 2023)).toHaveLength(0);
    expect((await montants()).some((x) => x.collectivite === "reg-11")).toBe(false);
  });

  test("régions en M71 : aucun montant, exercice signalé", async () => {
    expect(await m("reg-53", 2023, "fonctionnement")).toBeUndefined();
    const n = await (await dbTest()).sql<{ exercice: number; collectivite: string }>("select * from transport_m71");
    expect(n).toEqual([{ exercice: 2023, collectivite: "reg-53" }]);
  });

  test("groupement sans département : listé dans transport_inconnus", async () => {
    const inc = await (await dbTest()).sql<{ lbudg: string }>("select * from transport_inconnus");
    expect(inc.map((x) => x.lbudg)).toEqual(["CC SANS DEPARTEMENT"]);
  });
});

describe("données des pages", () => {
  const table = async () => lireTransport(await dbTest());

  test("région : la Région, série complète des exercices, null pour un poste absent", async () => {
    const t = transportRegion(await table(), "52");
    expect(t.exercices).toEqual([2023, 2024]);
    expect(t.collectivites.map((c) => c.id)).toEqual(["reg-52"]);
    expect(t.collectivites[0]!.libelle).toBe("Région Pays de la Loire");
    expect(t.collectivites[0]!.serie).toEqual([
      { exercice: 2023, fonctionnement: 140_000_000, investissement: null, produitsServices: null },
      { exercice: 2024, fonctionnement: 156_000_000, investissement: 1_000_000, produitsServices: 20_000_000 },
    ]);
    expect(t.absence).toBeUndefined();
  });

  test("région sans ligne : absence ; région en M71 : exercice signalé, pas d'absence", async () => {
    const idf = transportRegion(await table(), "11");
    expect(idf.collectivites).toEqual([]);
    expect(idf.absence).toBe("region_sans_ligne");
    const bzh = transportRegion(await table(), "53");
    expect(bzh.absence).toBeUndefined();
    expect(bzh.collectivites[0]!.serie[0]).toEqual(
      { exercice: 2023, fonctionnement: null, investissement: null, produitsServices: null, nomenclatureM71: true });
  });

  test("CTU sur la page de sa région", async () => {
    expect(transportRegion(await table(), "94").collectivites.map((c) => c.id)).toEqual(["ctu-corse"]);
  });

  test("département : le Département et ses groupements triés par libellé, total par exercice", async () => {
    const t = transportDepartement(await table(), "44");
    expect(t.collectivites.map((c) => c.id)).toEqual(["dep-44"]);
    const g = t.groupements!;
    expect(g.liste.map((c) => c.libelle)).toEqual([
      "CA PORNIC AGGLO PAYS DE RETZ", "CC DE GRAND LIEU", "CC SUD ESTUAIRE", "SYNDICAT TRANSPORTS SCOLAIRES DU PAYS DE RETZ",
    ]);
    expect(g.liste.at(-1)!.serie[0]!.fonctionnement).toBeNull(); // syndicat absent en 2023
    expect(g.total.map((e) => e.fonctionnement)).toEqual([2_600_000, 3_250_000]);
  });

  test("Métropole de Lyon, Alsace, Paris sur leur page département", async () => {
    expect(transportDepartement(await table(), "69").collectivites.map((c) => c.id)).toEqual(["ml-lyon"]);
    expect(transportDepartement(await table(), "67").collectivites.map((c) => c.id)).toEqual(["cea"]);
    expect(transportDepartement(await table(), "68").collectivites.map((c) => c.id)).toEqual(["cea"]);
    expect(transportDepartement(await table(), "75").collectivites.map((c) => c.id)).toEqual(["paris"]);
  });

  test("France : régions et CTU dans l'ordre du budget (nom sans article)", async () => {
    expect(transportRegions(await table()).map((c) => c.id)).toEqual(["reg-53", "ctu-corse", "reg-52"]);
  });
});

describe("collectivités uniques et départements sans ligne (relecture finale)", () => {
  const serie = [{ exercice: 2024, fonctionnement: 5_000_000, investissement: null, produitsServices: null }];
  const t: TableTransport = {
    exercices: [2024],
    collectivites: new Map([
      ["ctu-corse", { id: "ctu-corse", libelle: "Collectivité de Corse", serie }],
      ["ctu-martinique", { id: "ctu-martinique", libelle: "Collectivité territoriale de Martinique", serie }],
      ["dep-976", { id: "dep-976", libelle: "Département de Mayotte", serie }],
    ]),
  };
  test("la CTU sur les pages de ses départements", () => {
    expect(transportDepartement(t, "2A").collectivites.map((c) => c.id)).toEqual(["ctu-corse"]);
    expect(transportDepartement(t, "2B").collectivites.map((c) => c.id)).toEqual(["ctu-corse"]);
    expect(transportDepartement(t, "972").collectivites.map((c) => c.id)).toEqual(["ctu-martinique"]);
  });
  test("Mayotte : le Département sur la page région, pas d'absence", () => {
    const r = transportRegion(t, "06");
    expect(r.collectivites.map((c) => c.id)).toEqual(["dep-976"]);
    expect(r.absence).toBeUndefined();
  });
  test("département sans collectivité ni groupement : absence dite", () => {
    expect(transportDepartement(t, "973").absence).toBe("departement_sans_ligne");
    expect(transportDepartement(t, "2A").absence).toBeUndefined();
  });
});
