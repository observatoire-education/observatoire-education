import { describe, expect, test } from "bun:test";
import {
  type Etat,
  etatPublication,
  etatsSources,
  type IssueOuverte,
  LABEL_PUBLICATION,
  LABEL_SOURCE,
  lignesDerniereExecution,
  lireMarqueur,
  marqueur,
  planifier,
} from "../pipeline/src/alertes.ts";
import type { LigneJournal } from "../pipeline/src/collect.ts";

const maintenant = new Date("2026-11-26T02:17:00Z");
const D1 = "2026-11-25T02:17:00.000Z";
const D2 = "2026-11-26T02:17:00.000Z";
const ligne = (source: string, action: LigneJournal["action"], motif?: string, date = D2): LigneJournal =>
  ({ date, source, action, ...(motif ? { motif } : {}) }) as LigneJournal;
const sources = [{ id: "annuaire" }, { id: "budget_2025" }, { id: "bzh_batiments", collecteLocale: true }] as never;
const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * 86_400_000).toISOString();
const LIEN = "https://github.com/o/r/actions/runs/1";

describe("journal", () => {
  test("seule la dernière exécution compte", () => {
    const j = [ligne("annuaire", "erreur", "vieux", D1), ligne("annuaire", "inchange"), ligne("budget_2025", "inchange")];
    expect(lignesDerniereExecution(j)).toEqual([ligne("annuaire", "inchange"), ligne("budget_2025", "inchange")]);
  });
  test("journal vide", () => {
    expect(lignesDerniereExecution([])).toEqual([]);
  });
});

describe("états des sources", () => {
  test("téléchargée puis en erreur : échec, motifs joints", () => {
    const e = etatsSources(
      [ligne("budget_2025", "telecharge"), ligne("budget_2025", "erreur", "a"), ligne("budget_2025", "erreur", "b")],
      sources, {}, maintenant,
    );
    expect(e).toEqual([{ cle: "source:budget_2025", enEchec: true, motif: "a ; b" }]);
  });
  test("rejetée : échec", () => {
    expect(etatsSources([ligne("annuaire", "rejete", "colonne manquante")], sources, {}, maintenant))
      .toEqual([{ cle: "source:annuaire", enEchec: true, motif: "colonne manquante" }]);
  });
  test("inchangée : pas d'échec", () => {
    expect(etatsSources([ligne("annuaire", "inchange", "contenu identique")], sources, {}, maintenant))
      .toEqual([{ cle: "source:annuaire", enEchec: false }]);
  });
  test("source absente du journal : aucun état", () => {
    expect(etatsSources([ligne("annuaire", "inchange")], sources, {}, maintenant).map((e) => e.cle)).toEqual(["source:annuaire"]);
  });
  test("collecte locale de 89 jours : pas d'échec", () => {
    const e = etatsSources([ligne("bzh_batiments", "local", "m")], sources, { bzh_batiments: ilYa(89) } as never, maintenant);
    expect(e).toEqual([{ cle: "source:bzh_batiments", enEchec: false }]);
  });
  test("collecte locale de 91 jours : échec", () => {
    const e = etatsSources([ligne("bzh_batiments", "local", "m")], sources, { bzh_batiments: ilYa(91) } as never, maintenant);
    expect(e[0]!.enEchec).toBe(true);
    expect(e[0]!.motif).toBe(
      `dernière collecte manuelle le ${ilYa(91).slice(0, 10)}, il y a 91 jours : lancer bun run collect depuis un poste`,
    );
  });
  test("collecte locale jamais faite : échec", () => {
    const e = etatsSources([ligne("bzh_batiments", "local", "m")], sources, {}, maintenant);
    expect(e[0]).toEqual({
      cle: "source:bzh_batiments", enEchec: true, motif: "aucune collecte manuelle : lancer bun run collect depuis un poste",
    });
  });
});

describe("publication", () => {
  test("échec et réussite", () => {
    expect(etatPublication(false, LIEN)).toEqual({ cle: "publication", enEchec: true, motif: `publication en échec : ${LIEN}` });
    expect(etatPublication(true, LIEN)).toEqual({ cle: "publication", enEchec: false });
  });
});

describe("plan d'actions", () => {
  const echec: Etat = { cle: "source:annuaire", enEchec: true, motif: "colonne manquante" };
  const declarees = new Set(["source:annuaire", "source:budget_2025", "publication"]);
  const ouverte = (motif: string, cle = "source:annuaire"): IssueOuverte => ({ numero: 7, cle, motif });

  test("échec sans issue : ouvrir", () => {
    const [a, ...reste] = planifier([echec], [], declarees, LIEN);
    expect(reste).toEqual([]);
    expect(a).toMatchObject({ type: "ouvrir", cle: "source:annuaire", label: LABEL_SOURCE, titre: "Source annuaire : collecte en échec" });
    if (a?.type !== "ouvrir") throw new Error();
    expect(a.corps).toContain("colonne manquante");
    expect(a.corps).toContain(LIEN);
    expect(lireMarqueur(a.corps)).toEqual({ cle: "source:annuaire", motif: "colonne manquante" });
  });
  test("publication en échec : titre et label propres", () => {
    const [a] = planifier([etatPublication(false, LIEN)], [], declarees, LIEN);
    expect(a).toMatchObject({ type: "ouvrir", label: LABEL_PUBLICATION, titre: "Publication en échec" });
  });
  test("échec au même motif : rien", () => {
    expect(planifier([echec], [ouverte("colonne manquante")], declarees, LIEN)).toEqual([]);
  });
  test("échec au motif différent : commenter", () => {
    const [a] = planifier([echec], [ouverte("autre")], declarees, LIEN);
    expect(a).toMatchObject({ type: "commenter", numero: 7 });
    if (a?.type !== "commenter") throw new Error();
    expect(lireMarqueur(a.corps)).toEqual({ cle: "source:annuaire", motif: "colonne manquante" });
  });
  test("réussite avec issue ouverte : fermer", () => {
    expect(planifier([{ cle: "source:annuaire", enEchec: false }], [ouverte("x")], declarees, LIEN))
      .toEqual([{ type: "fermer", numero: 7, commentaire: `Revenu à la normale : ${LIEN}` }]);
  });
  test("réussite sans issue : rien", () => {
    expect(planifier([{ cle: "source:annuaire", enEchec: false }], [], declarees, LIEN)).toEqual([]);
  });
  test("issue d'une source retirée du code : fermer", () => {
    expect(planifier([], [ouverte("x", "source:budget_2019")], declarees, LIEN))
      .toEqual([{ type: "fermer", numero: 7, commentaire: "source retirée du code" }]);
  });
  test("issue sans état cette nuit : rien", () => {
    expect(planifier([], [ouverte("x", "source:budget_2025")], declarees, LIEN)).toEqual([]);
  });
});

describe("marqueur", () => {
  test("aller-retour, même avec --> et guillemets", () => {
    const motif = 'fin --> "piège" <!-- encore';
    const m = marqueur("source:annuaire", motif);
    expect(m.indexOf("-->")).toBe(m.length - 3);
    expect(lireMarqueur(`texte\n${m}`)).toEqual({ cle: "source:annuaire", motif });
  });
  test("le dernier marqueur l'emporte", () => {
    expect(lireMarqueur(`${marqueur("publication", "a")}\n${marqueur("publication", "b")}`)?.motif).toBe("b");
  });
  test("pas de marqueur", () => {
    expect(lireMarqueur("rien")).toBeNull();
  });
});
