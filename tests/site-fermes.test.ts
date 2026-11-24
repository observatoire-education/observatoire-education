import { beforeAll, describe, expect, test } from "bun:test";
import { doc, siteTest } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const entete = (uai: string) => doc(`etablissement/${uai}`);
const lignes = (uai: string) => (entete(uai).querySelector(".fermeture:not(.m)")?.textContent ?? "").replace(/\s+/g, " ").trim();
const a4 = (uai: string) => (entete(uai).querySelector(".a4")!.textContent ?? "").replace(/\s+/g, " ");

describe("fermetures et successeurs", () => {
  test("fiche fermée : « Fermé le 31/08/2020 » et lien vers le successeur", () => {
    const t = lignes("0440101A");
    expect(t).toContain("Fermé le 31/08/2020");
    expect(t).toContain("Successeur : Lycée polyvalent du Port (0440103C)");
    const a = entete("0440101A").querySelector(".fermeture:not(.m) a[href='/etablissement/0440103C/']");
    expect(a?.textContent).toBe("Lycée polyvalent du Port (0440103C)");
    expect(entete("0440101A").body.textContent).not.toContain("n'apparaît plus dans l'Annuaire");
  });

  test("fiche fermée sans successeur : « Fermé le … » sans « Successeur »", () => {
    const t = lignes("0440099Z");
    expect(t).toContain("Fermé le 31/08/2020");
    expect(t).not.toContain("Successeur");
  });

  test("fiche du LPO : deux lignes « Succède à … »", () => {
    const d = entete("0440103C");
    const l = [...d.querySelectorAll(".fermeture:not(.m) .predecesseur")].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(l).toEqual([
      "Succède à Lycée général du Port (0440101A), fermé le 31/08/2020",
      "Succède à Lycée professionnel du Port (0440102B), fermé le 31/08/2020",
    ]);
    expect(d.querySelector(".fermeture:not(.m) a[href='/etablissement/0440101A/']")).not.toBeNull();
    expect(lignes("0440103C")).not.toContain("Fermé le");
  });

  test("fiche disparue sans date officielle : mention de disparition actuelle inchangée", () => {
    const t = (entete("0440098Y").querySelector(".disparu")?.textContent ?? "").trim();
    expect(t).toMatch(/^Cet établissement n'apparaît plus dans l'Annuaire de l'éducation depuis le \d\d\/\d\d\/\d{4}\.$/);
    expect(entete("0440098Y").body.textContent).not.toContain("Fermé le");
  });

  test("fiche A4 fermée : « Fermé le … » dans l'en-tête imprimé", () => {
    expect(a4("0440101A")).toContain("Fermé le 31/08/2020");
    expect(a4("0440101A")).not.toContain("n'apparaît plus");
    expect(a4("0440103C")).toContain("Succède à Lycée général du Port (0440101A), fermé le 31/08/2020");
  });
});
