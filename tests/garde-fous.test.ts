import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ecrireFichiersHebergement, LIMITES, verifierDist } from "../scripts/garde-fous.ts";

async function dossierTemp<T>(f: (d: string) => Promise<T> | T): Promise<T> {
  const d = await mkdtemp(join(tmpdir(), "obs-gf-"));
  try {
    return await f(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}

describe("garde-fous de dist/ (Cloudflare Workers)", () => {
  test("limites : 95 000 fichiers, 25 Mio par fichier", () => {
    expect(LIMITES).toEqual({ fichiers: 95_000, octetsParFichier: 25 * 1024 * 1024 });
  });

  test("trop de fichiers", () =>
    dossierTemp(async (d) => {
      for (const n of ["a", "b", "c"]) await writeFile(join(d, n), "x");
      expect(() => verifierDist(d, { fichiers: 2, octetsParFichier: 10 })).toThrow("dist/ contient trop de fichiers : 3 > 2");
    }));

  test("fichier trop gros : l'erreur le nomme", () =>
    dossierTemp(async (d) => {
      await writeFile(join(d, "gros.json"), "x".repeat(11));
      expect(() => verifierDist(d, { fichiers: 10, octetsParFichier: 10 })).toThrow(/gros\.json/);
    }));

  test("aucun plafond sur le poids total", () =>
    dossierTemp(async (d) => {
      // 1 Go de poids total en 41 fichiers de 24 Mio.
      const taille = 24 * 1024 * 1024;
      for (let i = 0; i < 41; i++) await Bun.write(join(d, `f${i}.bin`), new Uint8Array(taille));
      const r = verifierDist(d);
      expect(r.fichiers).toBe(41);
      expect(r.octets).toBeGreaterThan(1e9);
    }));

  test("ecrireFichiersHebergement n'écrit plus CNAME et supprime l'existant", () =>
    dossierTemp(async (d) => {
      await writeFile(join(d, "CNAME"), "ancien.example\n");
      ecrireFichiersHebergement(d, { SITE_URL: "https://x.fr", DOMAINE: "x.fr", DEPOT: "o/d", INDEXABLE: true });
      expect(existsSync(join(d, "CNAME"))).toBe(false);
      expect(existsSync(join(d, "robots.txt"))).toBe(true);
    }));
});
