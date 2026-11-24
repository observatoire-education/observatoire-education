import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceId } from "@obs/shared/types";
import { centreCommune, chargerCommunes, type TableCommunes } from "../pipeline/src/communes.ts";
import { ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { dbTest } from "./aide.ts";

let table: TableCommunes;
beforeAll(async () => {
  table = await chargerCommunes(await dbTest());
});

describe("commune d'aujourd'hui (Code officiel géographique)", () => {
  test("une commune déléguée est rangée sous sa commune nouvelle", () => {
    expect(table.actuelle("44999")).toBe("44150");
  });

  test("une commune en vigueur garde son code", () => {
    expect(table.actuelle("44109")).toBe("44109");
    // chef-lieu d'une commune nouvelle : même code que sa commune déléguée
    expect(table.actuelle("44150")).toBe("44150");
  });

  test("chaîne de fusions : A → B en 2016, B → C en 2019, puis commune déléguée B supprimée", () => {
    expect(table.actuelle("44901")).toBe("44903");
    expect(table.actuelle("44902")).toBe("44903");
  });

  test("arrondissement municipal : la commune, comme les pages commune existantes", () => {
    expect(table.actuelle("75101")).toBe("75056");
  });

  test("code inconnu du Code officiel géographique : inchangé", () => {
    expect(table.actuelle("44777")).toBe("44777");
  });
});

/** Table construite sur un scénario propre (CSV en ligne), sans toucher aux fixtures partagées. */
async function scenario(communes: string, mouvements: string): Promise<TableCommunes> {
  const dossier = await mkdtemp(join(tmpdir(), "obs-cog-"));
  const duck = await connexion();
  const chemins: Record<string, string> = {};
  for (const [id, csv] of [["cog_communes", communes], ["cog_mouvements", mouvements]] as const) {
    await Bun.write(join(dossier, `${id}.csv`), csv);
    chemins[id] = join(dossier, `${id}.parquet`);
    await executer(duck, `copy (select * from read_csv(${litteral(join(dossier, `${id}.csv`))}, header = true, all_varchar = true))
      to ${litteral(chemins[id])} (format parquet)`);
  }
  duck.closeSync();
  const db = await ouvrir(chemins as Record<SourceId, string>, { etapes: [] });
  const t = await chargerCommunes(db);
  db.fermer();
  await rm(dossier, { recursive: true, force: true });
  return t;
}

const MVT = "mod,date_eff,typecom_av,com_av,libelle_av,typecom_ap,com_ap,libelle_ap";

describe("commune d'aujourd'hui : autres mouvements", () => {
  let t: TableCommunes;
  beforeAll(async () => {
    t = await scenario(
      [
        "typecom,com,libelle,comparent",
        "COM,01002,Deux,", "COM,01003,Trois,", "COM,01010,Dix,", "COM,01011,Onze,",
        "COM,01301,Bourg,", "COMA,01300,Hameau,01301",
        "COM,2A004,Ajaccio,",
        "COM,01021,Partie Nord,", "COM,01022,Partie Sud,",
      ].join("\n"),
      [
        MVT,
        // rétablissement : 01001 fusionnée dans 01002 en 2015, rétablie en 2020, puis fusionnée dans 01003 en 2022
        "31,2015-01-01,COM,01001,Un,COM,01002,Deux",
        "21,2020-01-01,COM,01002,Deux,COM,01001,Un",
        "31,2022-01-01,COM,01001,Un,COM,01003,Trois",
        // rétablie et toujours en vigueur : 01011 fusionnée dans 01010 en 2015, rétablie en 2020
        "31,2015-01-01,COM,01011,Onze,COM,01010,Dix",
        "21,2020-01-01,COM,01010,Dix,COM,01011,Onze",
        // changement de code dû à un changement de département (mod 41)
        "41,1976-01-01,COM,20004,Ajaccio,COM,2A004,Ajaccio",
        // code réattribué : 01051 a disparu dans 01052 en 2012 ; 01050 → 01051 en 2016 ne suit pas ce mouvement ancien
        "31,2012-01-01,COM,01051,Ancien,COM,01052,Absorbante",
        "31,2016-01-01,COM,01050,Cinquante,COM,01051,Nouveau",
        // données incohérentes : cycle 01060 → 01061 → 01060 à la même date
        "31,2016-01-01,COM,01060,Soixante,COM,01061,Soixante-et-un",
        "31,2016-01-01,COM,01061,Soixante-et-un,COM,01060,Soixante",
        // suppression avec partage du territoire (mod 30) : le plus petit code d'après
        "30,2017-01-01,COM,01020,Partagée,COM,01022,Partie Sud",
        "30,2017-01-01,COM,01020,Partagée,COM,01021,Partie Nord",
      ].join("\n"),
    );
  });

  test("commune fusionnée, rétablie puis refusionnée : la dernière commune", () => {
    expect(t.actuelle("01001")).toBe("01003");
    expect(t.actuelle("01002")).toBe("01002");
  });

  test("commune rétablie et en vigueur : elle-même", () => {
    expect(t.actuelle("01011")).toBe("01011");
    expect(t.actuelle("01010")).toBe("01010");
  });

  test("changement de département (mod 41) : nouveau code", () => {
    expect(t.actuelle("20004")).toBe("2A004");
  });

  test("commune associée (COMA) : sa commune parente", () => {
    expect(t.actuelle("01300")).toBe("01301");
  });

  test("code réattribué : un mouvement antérieur à l'arrivée n'est pas suivi", () => {
    expect(t.actuelle("01051")).toBe("01052");
    expect(t.actuelle("01050")).toBe("01051");
  });

  test("cycle : la recherche s'arrête", () => {
    expect(t.actuelle("01060")).toBe("01060");
  });

  test("partage du territoire : choix déterministe du plus petit code", () => {
    expect(t.actuelle("01020")).toBe("01021");
  });
});

describe("communes déléguées d'une commune nouvelle", () => {
  test("Saint-Aubin : ses communes déléguées, triées par nom", () => {
    expect(table.deleguees("44150")).toEqual([
      { code: "44999", nom: "Le Moulin" },
      { code: "44150", nom: "Saint-Aubin" },
    ]);
  });

  test("aucune pour une commune sans commune déléguée, ni pour un arrondissement", () => {
    expect(table.deleguees("44109")).toEqual([]);
    expect(table.deleguees("75056")).toEqual([]);
  });
});

describe("centre d'une commune", () => {
  test("centroïde du contour de Nantes", () => {
    const c = centreCommune("44109");
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(47.23, 1);
    expect(c!.lon).toBeCloseTo(-1.55, 1);
  });

  test("aucun contour : null", () => {
    expect(centreCommune("44999")).toBeNull();
    expect(centreCommune("99999")).toBeNull();
  });
});
