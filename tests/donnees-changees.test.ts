import { describe, expect, test } from "bun:test";
import { contenuUtile, donneesChangees } from "../pipeline/src/archive.ts";
import type { Lanceur } from "../pipeline/src/depot.ts";
import { verifier } from "../scripts/donnees-changees.ts";

const v = (sha: string) => ({ sha256: sha, tag: "t", fichier: "f", url: "u", modified: "m", collecteLe: "c", lignes: 1 });
const base = { versions: { annuaire: [v("a")] }, vus: { annuaire: "M1" }, actuelles: { annuaire: "a" }, jeux: {} };
const json = (o: unknown) => JSON.stringify(o, null, 2);

describe("changement utile du manifeste", () => {
  test("seule la date vue change : pas de publication", () => {
    expect(donneesChangees(json(base), json({ ...base, vus: { annuaire: "M2" } }))).toBe(false);
  });
  test("nouvelle version de l'annuaire : publication", () => {
    expect(donneesChangees(json(base), json({ ...base, versions: { annuaire: [v("a"), v("b")] } }))).toBe(true);
  });
  test("version actuelle changée : publication", () => {
    expect(donneesChangees(json(base), json({ ...base, actuelles: { annuaire: "b" } }))).toBe(true);
  });
  test("aucune publication précédente : publication", () => {
    expect(donneesChangees(null, json(base))).toBe(true);
  });
  test("ordre des clés sans effet", () => {
    const inverse = { jeux: {}, actuelles: base.actuelles, vus: base.vus, versions: base.versions };
    expect(contenuUtile(json(inverse))).toBe(contenuUtile(json(base)));
  });
});

describe("script", () => {
  const lanceur = (sha: string | null, manifesteAvant: string | null): { lancer: Lanceur; appels: string[][] } => {
    const appels: string[][] = [];
    return {
      appels,
      lancer: async (args) => {
        appels.push(args);
        if (args[0] === "run") return { code: 0, sortie: JSON.stringify(sha ? [{ headSha: sha }] : []) };
        if (args[0] === "show") return manifesteAvant === null ? { code: 128, sortie: "fatal" } : { code: 0, sortie: manifesteAvant };
        return { code: 1, sortie: "?" };
      },
    };
  };
  test("compare au manifeste de la dernière publication réussie", async () => {
    const l = lanceur("abc", json(base));
    expect(await verifier(l.lancer, l.lancer, json({ ...base, vus: { annuaire: "M9" } }))).toBe(false);
    expect(l.appels).toContainEqual(["show", "abc:archives/manifest.json"]);
  });
  test("aucune publication réussie : publication", async () => {
    const l = lanceur(null, null);
    expect(await verifier(l.lancer, l.lancer, json(base))).toBe(true);
  });
  test("commit introuvable : publication", async () => {
    const l = lanceur("abc", null);
    expect(await verifier(l.lancer, l.lancer, json(base))).toBe(true);
  });
});
