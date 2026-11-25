import { beforeAll, describe, expect, test } from "bun:test";
import { formulaireActif, MOTIFS } from "@obs/shared/signalement";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseHTML } from "linkedom";
import { DIST_TEST, doc, siteTest, texte } from "./site.ts";

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

  test("sans JavaScript : bouton d'envoi masqué, aucune invitation à recharger", () => {
    const d = doc("contact");
    const styles = [...d.querySelectorAll("noscript")].map((n) => n.innerHTML).join(" ");
    expect(styles).toMatch(/#form-signalement button\[type="?submit"?\]\s*\{\s*display:\s*none/);
    expect(d.querySelector('[data-erreur="verification"]')!.textContent).not.toMatch(/[Rr]echarge/);
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

describe("lien de signalement sur les fiches", () => {
  const href = (chemin: string) => {
    const a = doc(chemin).querySelector(".actions a[data-signalement]");
    expect(a).not.toBeNull();
    expect(a!.textContent).toContain("Signaler une erreur ou compléter");
    const u = new URL(a!.getAttribute("href")!, "https://x.test");
    expect(u.pathname).toBe("/contact/");
    return u.searchParams;
  };

  test("établissement : page, code, nom", () => {
    const p = href("etablissement/0440001A");
    expect(p.get("page")).toBe("/etablissement/0440001A/");
    expect(p.get("code")).toBe("0440001A");
    expect(p.get("nom")).toBe(doc("etablissement/0440001A").querySelector("h1")!.textContent!.trim());
  });

  test.each([
    ["commune/35238", "35238"],
    ["departement/35", "35"],
    ["academie/14", "14"],
    ["region/11", "11"],
  ])("%s : code %s", (chemin, code) => {
    const p = href(chemin);
    expect(p.get("page")).toBe(`/${chemin}/`);
    expect(p.get("code")).toBe(code);
    expect(p.get("nom")).toBeTruthy();
  });

  test("France : sans code", () => {
    const p = href("france");
    expect(p.get("page")).toBe("/france/");
    expect(p.get("code")).toBeNull();
  });

  test("script chargé sur les fiches", () => {
    for (const c of ["etablissement/0440001A", "commune/35238"]) {
      expect(doc(c).querySelector('script[src="/js/signalement.js"]')).not.toBeNull();
    }
  });
});

describe("pied de page", () => {
  test("lien Contact sur toutes les pages", () => {
    const pages: string[] = [];
    const parcourir = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (f.endsWith(".html")) pages.push(relative(DIST_TEST, p));
      }
    };
    parcourir(DIST_TEST);
    for (const p of pages) {
      const a = parseHTML(readFileSync(join(DIST_TEST, p), "utf8")).document.querySelector('footer a[href="/contact/"]');
      expect(a ? a.textContent!.trim() : `${p} : absent`).toBe("Contact");
    }
  });
});

describe("signalement.js", () => {
  const SCRIPT = readFileSync("site/public/js/signalement.js", "utf8");
  const page = (onglet: boolean) => {
    const { window: w, document } = parseHTML(`<!doctype html><html><body>
      ${onglet ? '<div role="tablist"><a role="tab" aria-selected="false">Synthèse</a><a role="tab" aria-selected="true"> Résultats </a></div>' : ""}
      <a id="l" data-signalement href="/contact/?page=%2Fx%2F&amp;onglet=Ancien">x</a></body></html>`);
    new Function("window", SCRIPT)(w);
    const a = document.getElementById("l")!;
    a.dispatchEvent(new (w as any).Event("click", { bubbles: true, cancelable: true }));
    return new URL(a.getAttribute("href")!, "https://x.test");
  };

  test("ajoute l'onglet actif au clic", () => {
    const u = page(true);
    expect(u.pathname).toBe("/contact/");
    expect(u.searchParams.get("page")).toBe("/x/");
    expect(u.searchParams.get("onglet")).toBe("Résultats");
  });

  test("sans onglet : paramètre retiré", () => {
    expect(page(false).searchParams.get("onglet")).toBeNull();
  });
});

describe("mentions légales", () => {
  test("section sur le formulaire de contact", () => {
    const d = doc("mentions-legales");
    const h = [...d.querySelectorAll("h2")].find((x) => /formulaire/i.test(x.textContent ?? ""));
    expect(h).toBeDefined();
    const t = texte("mentions-legales");
    expect(t).toContain("Turnstile");
    expect(t).toMatch(/facultative?/);
    expect(t).toMatch(/ne (les )?conserve/);
    expect(t).not.toContain("ne collecte aucune donnée personnelle");
    expect(d.querySelector('a[href="/contact/"]')).not.toBeNull();
  });
});
