import { describe, expect, test } from "bun:test";
import {
  composerMail,
  lienContact,
  lienIssueGitHub,
  MOTIFS,
  objetMail,
  type Signalement,
  validerSignalement,
} from "../shared/src/signalement.ts";

const SITE = "https://observatoireeducation.fr";

describe("validerSignalement", () => {
  test("cas nominal : message rogné, sans e-mail ni contexte", () => {
    const v = validerSignalement({ motif: "erreur", message: " Bonjour " });
    expect(v).toEqual({ ok: true, signalement: { motif: "erreur", message: "Bonjour", contexte: {} } });
  });

  test("chaînes vides traitées comme absentes", () => {
    const v = validerSignalement({ motif: "question", message: "x", email: "", nom: "", page: "" });
    expect(v.ok && v.signalement).toEqual({ motif: "question", message: "x", contexte: {} });
  });

  test("e-mail et contexte conservés", () => {
    const v = validerSignalement({
      motif: "complement", message: "m", email: "a@b.fr",
      page: "/etablissement/0440001A/", nom: "Collège A", code: "0440001A", onglet: "Résultats",
    });
    expect(v.ok && v.signalement).toEqual({
      motif: "complement", message: "m", email: "a@b.fr",
      contexte: { page: "/etablissement/0440001A/", nom: "Collège A", code: "0440001A", onglet: "Résultats" },
    });
  });

  test.each([
    ["motif inconnu", { motif: "spam", message: "x" }],
    ["motif absent", { message: "x" }],
    ["message vide", { motif: "erreur", message: "   " }],
    ["message trop long", { motif: "erreur", message: "a".repeat(5001) }],
    ["e-mail invalide", { motif: "erreur", message: "x", email: "pas-un-mail" }],
    ["e-mail trop long", { motif: "erreur", message: "x", email: `${"a".repeat(245)}@exemple.fr` }],
    ["nom trop long", { motif: "erreur", message: "x", nom: "n".repeat(201) }],
  ])("%s : rejeté", (_, champs) => {
    const v = validerSignalement(champs as Record<string, string>);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.erreurs.length).toBeGreaterThan(0);
  });

  test("message de 5 000 caractères accepté", () => {
    expect(validerSignalement({ motif: "erreur", message: "a".repeat(5000) }).ok).toBe(true);
  });

  test("page externe ou protocole relatif ignorée, chemin interne conservé", () => {
    for (const page of ["https://evil.test/x", "//evil.test", "javascript:alert(1)"]) {
      const v = validerSignalement({ motif: "erreur", message: "x", page });
      expect(v.ok && v.signalement.contexte.page).toBeUndefined();
    }
    const v = validerSignalement({ motif: "erreur", message: "x", page: "/etablissement/0440001A/" });
    expect(v.ok && v.signalement.contexte.page).toBe("/etablissement/0440001A/");
  });
});

describe("objetMail", () => {
  const s = (contexte: Signalement["contexte"], motif: Signalement["motif"] = "erreur"): Signalement =>
    ({ motif, message: "m", contexte });

  test("avec contexte complet", () => {
    expect(objetMail(s({ nom: "Collège Jules Verne", code: "0441234X", onglet: "Résultats" })))
      .toBe("[Erreur] Collège Jules Verne (0441234X) – Résultats");
  });

  test("sans contexte", () => {
    expect(objetMail(s({}, "question"))).toBe("[Question] Contact");
  });

  test("préfixes des motifs", () => {
    expect(MOTIFS.map((m) => [m.code, m.libelle, m.prefixe])).toEqual([
      ["erreur", "Une erreur dans les données", "[Erreur]"],
      ["complement", "Une information complémentaire", "[Complément]"],
      ["question", "Une question", "[Question]"],
      ["autre", "Autre", "[Autre]"],
    ]);
  });

  test("aucun retour à la ligne (injection d'en-têtes)", () => {
    const o = objetMail(s({ nom: "A\r\nBcc: x@y.z" }));
    expect(o).not.toMatch(/[\r\n]/);
  });
});

describe("composerMail", () => {
  const sig: Signalement = {
    motif: "erreur", message: "Le taux est faux.", email: "parent@exemple.fr",
    contexte: { page: "/etablissement/0440001A/", nom: "<img src=x>", code: "0440001A" },
  };
  const m = composerMail(sig, SITE, new Date("2026-11-25T10:00:00Z"));

  test("HTML échappé", () => {
    expect(m.html).toContain("&lt;img");
    expect(m.html).not.toContain("<img");
  });

  test("texte et HTML contiennent message, lien, date et e-mail", () => {
    for (const corps of [m.text, m.html]) {
      expect(corps).toContain("Le taux est faux.");
      expect(corps).toContain("https://observatoireeducation.fr/etablissement/0440001A/");
      expect(corps).toContain("25/11/2026");
      expect(corps).toContain("parent@exemple.fr");
    }
    expect(m.subject).toBe(objetMail(sig));
  });
});

describe("liens", () => {
  test("lienIssueGitHub", () => {
    const l = lienIssueGitHub("o/r", "erreur", { page: "/x/", nom: "N" }, "https://s.fr");
    expect(l.startsWith("https://github.com/o/r/issues/new?")).toBe(true);
    const p = new URL(l).searchParams;
    expect(p.get("title")).toBe("N");
    expect(p.get("body")).toContain("https://s.fr/x/");
  });

  test("lienContact", () => {
    expect(lienContact({ page: "/x/", nom: "Jules & Verne" })).toBe("/contact/?page=%2Fx%2F&nom=Jules+%26+Verne");
    expect(lienContact({})).toBe("/contact/");
  });
});
