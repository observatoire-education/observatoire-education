import { beforeAll, describe, expect, test } from "bun:test";
import { formulaireActif, MOTIFS } from "@obs/shared/signalement";
import { doc, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const SITEKEY_TEST = "1x00000000000000000000AA";

describe("page /contact/", () => {
  test("formulaire : action, motifs, message, e-mail, contexte, Turnstile", () => {
    const d = doc("contact");
    const f = d.querySelector("form#form-signalement")!;
    expect(f.getAttribute("action")).toBe("/api/signalement");
    expect(f.getAttribute("method")).toBe("post");
    const radios = [...f.querySelectorAll('input[type="radio"][name="motif"]')];
    expect(radios.map((r) => r.getAttribute("value"))).toEqual(MOTIFS.map((m) => m.code));
    for (const m of MOTIFS) expect(f.textContent).toContain(m.libelle);
    const msg = f.querySelector('textarea[name="message"]')!;
    expect(msg.hasAttribute("required")).toBe(true);
    expect(msg.getAttribute("maxlength")).toBe("5000");
    const email = f.querySelector('input[name="email"]')!;
    expect(email.getAttribute("type")).toBe("email");
    expect(email.hasAttribute("required")).toBe(false);
    for (const c of ["page", "nom", "code", "onglet"]) {
      expect(f.querySelector(`input[type="hidden"][name="${c}"]`)).not.toBeNull();
    }
    expect(d.querySelector(`.cf-turnstile[data-sitekey="${SITEKEY_TEST}"]`)).not.toBeNull();
    expect(d.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]')).not.toBeNull();
    expect(d.querySelector("#contexte")!.hasAttribute("hidden")).toBe(true);
    expect(d.querySelector("#lien-github")).not.toBeNull();
    expect(d.querySelector('#etat[role="status"]')).not.toBeNull();
  });

  test("usage des données et lien vers les mentions légales", () => {
    const d = doc("contact");
    expect(texte("contact")).toMatch(/données/);
    expect(d.querySelector('main a[href="/mentions-legales/"]')).not.toBeNull();
  });

  test("sans JavaScript : message explicite", () => {
    const d = doc("contact");
    expect(d.querySelector("noscript")!.textContent).toContain("JavaScript");
  });

  test("un message masqué par code d'erreur du Worker", () => {
    const d = doc("contact");
    for (const code of ["champs", "verification", "configuration", "envoi"]) {
      const e = d.querySelector(`[data-erreur="${code}"]`);
      expect(e).not.toBeNull();
      expect(e!.hasAttribute("hidden")).toBe(true);
    }
  });

  test("page de confirmation", () => {
    const d = doc("contact/merci");
    expect(d.querySelector('main a[href="/"]')).not.toBeNull();
    expect(texte("contact/merci")).toContain("Merci");
  });
});

describe("formulaireActif", () => {
  test("absent ou inactif : faux ; actif avec clé : vrai", () => {
    expect(formulaireActif(undefined)).toBe(false);
    expect(formulaireActif({ ACTIF: false, TURNSTILE_SITEKEY: "k" })).toBe(false);
    expect(formulaireActif({ ACTIF: true, TURNSTILE_SITEKEY: "" })).toBe(false);
    expect(formulaireActif({ ACTIF: true, TURNSTILE_SITEKEY: "k" })).toBe(true);
  });
});
