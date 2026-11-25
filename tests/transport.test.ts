import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manifest } from "../pipeline/src/archive.ts";
import { EXERCICES_BUDGET, sourceTransport, toutesSources } from "../pipeline/src/sources.ts";

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
