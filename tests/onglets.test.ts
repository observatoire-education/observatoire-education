import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const SCRIPT = readFileSync("site/public/js/onglets.js", "utf8");

/** Page minimale à trois onglets ; exécute le vrai onglets.js dans une fenêtre linkedom. */
function page(o: { hash?: string; beforematch?: boolean; sansOnglets?: boolean } = {}) {
  const { window: w, document } = parseHTML(`<!doctype html><html class="js"><body>
    ${o.sansOnglets ? "<p>Rien</p>" : `
    <nav class="onglets"><div role="tablist">
      <a role="tab" id="tab-o-a" href="#o-a" aria-controls="o-a">A</a>
      <a role="tab" id="tab-o-b" href="#o-b" aria-controls="o-b">B</a>
      <a role="tab" id="tab-o-c" href="#o-c" aria-controls="o-c">C</a>
    </div></nav>
    <a id="lien" href="#o-b">vers B</a>
    <div id="o-a" role="tabpanel" data-onglet><p>a</p></div>
    <div id="o-b" role="tabpanel" data-onglet><p>b</p></div>
    <div id="o-c" role="tabpanel" data-onglet><section id="profond">c</section></div>`}
  </body></html>`);
  const win = w as any;
  win.location = { hash: o.hash ?? "" };
  win.history = { replaceState: mock(() => {}) };
  win.scrollTo = mock(() => {});
  const defiler = mock(() => {});
  win.Element.prototype.scrollIntoView = defiler;
  if (o.beforematch) win.HTMLElement.prototype.onbeforematch = null;
  new Function("window", SCRIPT)(win);
  document.dispatchEvent(new win.Event("DOMContentLoaded"));
  const $ = (id: string) => document.getElementById(id)!;
  const visibles = () => ["o-a", "o-b", "o-c"].filter((id) => !$(id).hasAttribute("hidden"));
  return { win, document, $, visibles, defiler };
}

/** linkedom n'a pas MouseEvent ni KeyboardEvent : un Event qui remonte, avec les propriétés utiles. */
const evt = (win: any, type: string, props: object = {}) => Object.assign(new win.Event(type, { bubbles: true, cancelable: true }), props);

describe("onglets.js", () => {
  test("sans ancre : premier onglet actif", () => {
    const { $, visibles, document } = page();
    expect($("tab-o-a").getAttribute("aria-selected")).toBe("true");
    expect($("o-b").hasAttribute("hidden")).toBe(true);
    expect($("o-c").hasAttribute("hidden")).toBe(true);
    expect($("o-a").hasAttribute("hidden")).toBe(false);
    expect(visibles()).toEqual(["o-a"]);
    expect(document.documentElement.classList.contains("onglets-prets")).toBe(true);
  });

  test("ancre d'onglet", () => {
    const { visibles } = page({ hash: "#o-b" });
    expect(visibles()).toEqual(["o-b"]);
  });

  test("ancre interne : ouvre le panneau et défile vers l'élément", () => {
    const { visibles, $, defiler } = page({ hash: "#profond" });
    expect(visibles()).toEqual(["o-c"]);
    expect((defiler.mock.contexts as unknown[]).includes($("profond"))).toBe(true);
  });

  test("clic sur un onglet", () => {
    const { $, visibles, win } = page();
    $("tab-o-c").dispatchEvent(evt(win, "click"));
    expect(visibles()).toEqual(["o-c"]);
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "#o-c");
    expect($("tab-o-c").getAttribute("aria-selected")).toBe("true");
    expect($("tab-o-a").getAttribute("aria-selected")).toBe("false");
    expect($("tab-o-a").getAttribute("tabindex")).toBe("-1");
    expect($("tab-o-b").getAttribute("tabindex")).toBe("-1");
    expect($("tab-o-c").getAttribute("tabindex")).toBe("0");
  });

  test("clavier : flèche droite, fin, début", () => {
    const { $, visibles, win } = page();
    const touche = (cible: string, key: string) => $(cible).dispatchEvent(evt(win, "keydown", { key }));
    // linkedom ne gère pas le focus : on espionne l'appel.
    const focus = mock(() => {});
    $("tab-o-b").focus = focus;
    touche("tab-o-a", "ArrowRight");
    expect(visibles()).toEqual(["o-b"]);
    expect(focus).toHaveBeenCalled();
    touche("tab-o-b", "End");
    expect(visibles()).toEqual(["o-c"]);
    touche("tab-o-c", "Home");
    expect(visibles()).toEqual(["o-a"]);
  });

  test("hashchange", () => {
    const { win, visibles } = page();
    win.location.hash = "#o-c";
    win.dispatchEvent(new win.Event("hashchange"));
    expect(visibles()).toEqual(["o-c"]);
  });

  test("lien interne hors barre", () => {
    const { $, win, visibles } = page();
    $("lien").dispatchEvent(evt(win, "click"));
    expect(visibles()).toEqual(["o-b"]);
  });

  test("beforematch ouvre le panneau", () => {
    const { $, win, visibles } = page();
    $("o-c").dispatchEvent(new win.Event("beforematch"));
    expect(visibles()).toEqual(["o-c"]);
  });

  test("repli hidden selon la prise en charge de beforematch", () => {
    expect(page().$("o-b").getAttribute("hidden")).toBe("");
    expect(page({ beforematch: true }).$("o-b").getAttribute("hidden")).toBe("until-found");
  });

  test("page sans onglets : ne fait rien", () => {
    expect(() => page({ sansOnglets: true })).not.toThrow();
    expect(page({ sansOnglets: true }).document.documentElement.classList.contains("onglets-prets")).toBe(false);
  });

  test("hash mal formé : pas d'exception, page prête, premier onglet actif", () => {
    const { visibles, document } = page({ hash: "#%E0%A4%A" });
    expect(visibles()).toEqual(["o-a"]);
    expect(document.documentElement.classList.contains("onglets-prets")).toBe(true);
  });

  test("hashchange vers une ancre hors panneaux : l'onglet courant reste", () => {
    const { win, visibles } = page({ hash: "#o-b" });
    win.location.hash = "#ailleurs";
    win.dispatchEvent(new win.Event("hashchange"));
    expect(visibles()).toEqual(["o-b"]);
  });

  test("hashchange décode l'ancre", () => {
    const { win, visibles } = page();
    win.location.hash = "#%6F-c";
    win.dispatchEvent(new win.Event("hashchange"));
    expect(visibles()).toEqual(["o-c"]);
  });

  test("chargement sans ancre : scrollIntoView non appelé sur l'onglet", () => {
    const { defiler } = page();
    expect(defiler).not.toHaveBeenCalled();
  });
});

describe("CSS d'impression", () => {
  const css = readFileSync("site/src/styles/obs.css", "utf8");
  const print = [...css.matchAll(/@media print \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");

  test("panneaux masqués imprimés, barre masquée, titres affichés, cartes insécables", () => {
    expect(print).toMatch(/\[data-onglet\]\[hidden\][^{]*\{[^}]*display:\s*block !important[^}]*content-visibility:\s*visible/);
    expect(print).toMatch(/\.onglets[^{]*\{[^}]*display:\s*none/);
    expect(print).toMatch(/\.titre-impression[^{]*\{[^}]*display:\s*block/);
    expect(print).toMatch(/\.card[^{]*\{[^}]*break-inside:\s*avoid/);
  });

  test("ancres internes sous la barre collante : scroll-margin-top hors impression", () => {
    const hors = css.replace(/@media print \{[\s\S]*?\n\}/g, "");
    const m = hors.match(/\[data-onglet\] \[id\][^{]*\{[^}]*scroll-margin-top:\s*(\d+)px/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(56 + 44);
  });

  test("masquage de tout sauf la fiche A4 : sauf impression complète", () => {
    expect(print).toMatch(/html:not\(\.impression-complete\)[^{]*:not\(\.a4\)[^{]*\{[^}]*display:\s*none/);
    expect(print).toMatch(/html\.impression-complete \.a4\s*\{\s*display:\s*none !important/);
  });
});

describe("tout imprimer (fiche.js)", () => {
  const FICHE = readFileSync("site/public/js/fiche.js", "utf8");
  test("la classe est posée pendant l'impression puis retirée à afterprint", () => {
    const { window: w, document } = parseHTML(`<!doctype html><html><body><button id="imprimer-tout">x</button></body></html>`);
    const win = w as any;
    let pendant: boolean | undefined;
    win.print = mock(() => { pendant = document.documentElement.classList.contains("impression-complete"); });
    new Function("window", "document", FICHE)(win, document);
    document.getElementById("imprimer-tout")!.dispatchEvent(new win.Event("click", { bubbles: true }));
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(pendant).toBe(true);
    win.dispatchEvent(new win.Event("afterprint"));
    expect(document.documentElement.classList.contains("impression-complete")).toBe(false);
  });
});
