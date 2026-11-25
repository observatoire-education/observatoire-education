import { describe, expect, test } from "bun:test";
import { LABEL_SOURCE, marqueur } from "../pipeline/src/alertes.ts";
import type { Lanceur } from "../pipeline/src/depot.ts";
import { executerAlertes } from "../scripts/alertes.ts";

const LIEN = "https://github.com/o/r/actions/runs/1";
const declarees = new Set(["source:annuaire"]);

/** Faux gh : enregistre les appels ; `issue list` rend les issues préparées, le reste réussit. */
function fauxGh(issues: unknown[] = [], echoue?: string) {
  const appels: string[][] = [];
  const lancer: Lanceur = async (args) => {
    appels.push(args);
    if (echoue && args.slice(0, 2).join(" ") === echoue) return { code: 1, sortie: "HTTP 403" };
    if (args[0] === "issue" && args[1] === "list") return { code: 0, sortie: JSON.stringify(issues) };
    return { code: 0, sortie: "" };
  };
  return { lancer, appels };
}

describe("alertes avec gh", () => {
  test("ouvre une issue pour une nouvelle source en échec", async () => {
    const gh = fauxGh();
    const actions = await executerAlertes(gh.lancer, "o/r", LABEL_SOURCE,
      [{ cle: "source:annuaire", enEchec: true, motif: "colonne manquante" }], declarees, LIEN);
    expect(actions.map((a) => a.type)).toEqual(["ouvrir"]);
    expect(gh.appels[0]).toEqual(expect.arrayContaining(["label", "create", LABEL_SOURCE, "--force"]));
    const creation = gh.appels.find((a) => a[0] === "issue" && a[1] === "create")!;
    expect(creation).toEqual(expect.arrayContaining(["--label", LABEL_SOURCE, "--title", "Source annuaire : collecte en échec", "--repo", "o/r"]));
  });

  test("motif lu dans le dernier commentaire : pas de doublon", async () => {
    const gh = fauxGh([{
      number: 4, body: marqueur("source:annuaire", "ancien"),
      comments: [{ body: marqueur("source:annuaire", "colonne manquante") }],
    }]);
    const actions = await executerAlertes(gh.lancer, "o/r", LABEL_SOURCE,
      [{ cle: "source:annuaire", enEchec: true, motif: "colonne manquante" }], declarees, LIEN);
    expect(actions).toEqual([]);
    expect(gh.appels.some((a) => a[1] === "comment" || a[1] === "create" && a[0] === "issue")).toBe(false);
  });

  test("ferme l'issue d'une source revenue à la normale", async () => {
    const gh = fauxGh([{ number: 4, body: marqueur("source:annuaire", "x"), comments: [] }]);
    await executerAlertes(gh.lancer, "o/r", LABEL_SOURCE, [{ cle: "source:annuaire", enEchec: false }], declarees, LIEN);
    expect(gh.appels).toContainEqual(["issue", "close", "4", "--comment", `Revenu à la normale : ${LIEN}`, "--repo", "o/r"]);
  });

  test("issue sans marqueur : ignorée", async () => {
    const gh = fauxGh([{ number: 9, body: "écrite à la main", comments: [] }]);
    expect(await executerAlertes(gh.lancer, "o/r", LABEL_SOURCE, [], declarees, LIEN)).toEqual([]);
  });

  test("gh en erreur : exception explicite", async () => {
    const gh = fauxGh([], "issue create");
    await expect(executerAlertes(gh.lancer, "o/r", LABEL_SOURCE,
      [{ cle: "source:annuaire", enEchec: true, motif: "m" }], declarees, LIEN)).rejects.toThrow("gh issue create a échoué : HTTP 403");
  });
});
