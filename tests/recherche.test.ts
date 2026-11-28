import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";

const SCRIPT = await Bun.file(new URL("../site/public/js/recherche.js", import.meta.url)).text();

/** Monte le vrai recherche.js dans un document linkedom (champ de l'accueil et champ de l'en-tête), avec les index servis par `fetch`. */
function monter(index: unknown[], deps: unknown[] = [], communes: unknown[] = [], regions: unknown[] = []) {
  const { document } = parseHTML(`<!doctype html><html><body>
    <header><input id="q-entete"><div id="res-entete"></div></header>
    <input id="q"><div id="res"></div></body></html>`);
  const servis: Record<string, unknown> = {
    "/recherche.json": index, "/recherche-communes.json": communes, "/recherche-territoires.json": { regions, departements: deps },
  };
  const demandes: string[] = [];
  const fetchFaux = async (url: string) => {
    if (!(url in servis)) throw new Error(`adresse inattendue : ${url}`);
    demandes.push(url);
    return { ok: true, json: async () => structuredClone(servis[url]) };
  };
  new Function("document", "location", "fetch", "URLSearchParams", SCRIPT)(
    document, { search: "", href: "" }, fetchFaux, URLSearchParams,
  );
  const Evenement = document.defaultView!.Event;
  const saisir = (id: string, saisie: string) => {
    const q = document.getElementById(id) as unknown as HTMLInputElement;
    q.value = saisie;
    q.dispatchEvent(new Evenement("input"));
  };
  return { document, demandes, saisir };
}

const attendre = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** Saisie dans le champ de l'accueil, une fois les index chargés. */
async function rechercher(index: unknown[], saisie: string, deps: unknown[] = [], communes: unknown[] = []) {
  const { document, saisir } = monter(index, deps, communes);
  saisir("q", saisie);
  await attendre();
  return document.getElementById("res")!;
}

const entree = (n: string, u = "0440001A", c = "Nantes") => ({ u, n, c, d: "44", f: "college", s: "public" });

describe("recherche de l'accueil", () => {
  test("accents et casse ignorés, nom surligné", async () => {
    const res = await rechercher([entree("Collège Jules-Verne")], "college JULES");
    expect(res.querySelectorAll("a")).toHaveLength(1);
    expect(res.querySelector("mark")!.textContent).toBe("Collège");
  });

  test("aucune balise injectée par les données (nom, commune, UAI, département)", async () => {
    const res = await rechercher(
      [entree('<img src=x onerror="alert(1)"> Collège', '0440001A"><script>alert(2)</script>', "<b>Nantes</b>")],
      "college",
      [{ d: '44"><img src=y>', l: "<i>Collège</i>-Atlantique", a: "Académie <u>de</u> Nantes" }],
    );
    expect(res.querySelector("img, script, b, i, u")).toBeNull();
    expect(res.textContent).toContain('<img src=x onerror="alert(1)"> Collège');
    for (const a of res.querySelectorAll("a")) expect(a.getAttribute("href")).not.toContain('"');
  });

  test("surlignage correct avec une esperluette (entités non coupées)", async () => {
    const res = await rechercher([entree("Lycée Arts & Métiers")], "metiers");
    expect(res.querySelector("a span")!.textContent).toBe("Lycée Arts & Métiers");
    expect(res.querySelector("mark")!.textContent).toBe("Métiers");
  });

  test("communes : groupe entre départements et établissements, accents et casse ignorés", async () => {
    const res = await rechercher(
      [entree("Collège Jules-Verne")], "NANTES",
      [{ d: "44", l: "Loire-Atlantique", a: "Académie de Nantes" }],
      [{ i: "44109", l: "Nantes", d: "44" }],
    );
    const titres = [...res.querySelectorAll(".grp")].map((g) => g.textContent);
    expect(titres).toEqual(["Départements", "Communes", "Établissements"]);
    const lien = res.querySelector("a[href='/commune/44109/']");
    expect(lien).not.toBeNull();
    expect(lien!.textContent).toContain("Nantes");
    const sans = await rechercher([], "nante", [], [{ i: "44109", l: "Nantès", d: "44" }]);
    expect(sans.querySelector("a[href='/commune/44109/']")).not.toBeNull();
  });

  test("établissement fermé sans nom ni commune publiés : pas de plantage, communes et départements trouvés", async () => {
    const res = await rechercher(
      [
        { u: "0440099Z", n: null, c: "Saint-Nazaire", d: "44", f: "lp", s: "public", x: 1 },
        { u: "0440098Y", n: null, c: null, d: "44", f: "lp", s: "public", x: 1 },
        entree("Lycée Aristide-Briand", "0440069A", "Saint-Nazaire"),
      ],
      "Saint-Nazaire",
      [{ d: "44", l: "Loire-Atlantique", a: "Académie de Nantes" }],
      [{ i: "44184", l: "Saint-Nazaire", d: "44" }],
    );
    expect([...res.querySelectorAll(".grp")].map((g) => g.textContent)).toEqual(["Communes", "Établissements"]);
    expect(res.querySelector("a[href='/etablissement/0440099Z/']")!.textContent).toContain("0440099Z");
    expect(res.querySelector("a[href='/commune/44184/']")).not.toBeNull();
    expect(res.textContent).not.toContain("null");
    const exacte = await rechercher([], "saint-nazaire", [], [
      { i: "62001", l: "Ablain-Saint-Nazaire", d: "62" }, { i: "44184", l: "Saint-Nazaire", d: "44" },
    ]);
    expect(exacte.querySelector("a[href^='/commune/']")!.getAttribute("href")).toBe("/commune/44184/");
    const homonymes = await rechercher(
      [entree("Lycée A", "0440001A", "Saint-Nazaire"), entree("Lycée B", "0440002B", "Saint-Nazaire")],
      "saint-nazaire", [], [{ i: "30288", l: "Saint-Nazaire", d: "30" }, { i: "44184", l: "Saint-Nazaire", d: "44" }],
    );
    expect(homonymes.querySelector("a[href^='/commune/']")!.getAttribute("href")).toBe("/commune/44184/");
    const ordre = await rechercher([
      { u: "0440098Y", n: null, c: "Nantes", d: "44", f: "lp", s: "public", x: 1 }, entree("Collège Jules-Verne"),
    ], "nantes");
    expect([...ordre.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/etablissement/0440001A/", "/etablissement/0440098Y/"]);
    const dep = await rechercher(
      [{ u: "0440098Y", n: null, c: null, d: "44", f: "lp", s: "public", x: 1 }, entree("Collège Jules-Verne")],
      "Loire-Atlantique",
      [{ d: "44", l: "Loire-Atlantique", a: "Académie de Nantes" }],
    );
    expect(dep.querySelector("a[href='/departement/44/']")).not.toBeNull();
  });

  test("écoles : libellé de la famille", async () => {
    const e = (u: string, n: string, f: string) => ({ u, n, c: "Nantes", d: "44", f, s: "public" });
    const res = await rechercher([
      e("0440201A", "École maternelle Les Lilas", "maternelle"),
      e("0440202B", "École élémentaire Jules-Ferry", "elementaire"),
      e("0440203C", "École primaire Sainte-Marie", "primaire"),
    ], "ecole");
    const lignes = [...res.querySelectorAll("a .s")].map((x) => x.textContent);
    expect(lignes).toEqual([
      "Public · École élémentaire · Nantes",
      "Public · École maternelle · Nantes",
      "Public · École primaire · Nantes",
    ]);
  });
});

describe("recherche de l'en-tête", () => {
  test("index chargés à la première saisie seulement, squelette pendant le chargement", async () => {
    const { document, demandes, saisir } = monter([entree("Collège Jules-Verne")]);
    const q = document.getElementById("q-entete")!;
    q.dispatchEvent(new (document.defaultView!.Event)("focus"));
    await attendre();
    expect(demandes).toEqual([]);
    saisir("q-entete", "jules");
    const res = document.getElementById("res-entete")!;
    expect(res.classList.contains("open")).toBe(true);
    expect(res.querySelectorAll(".sq").length).toBeGreaterThan(0);
    expect(q.getAttribute("aria-expanded")).toBe("true");
    await attendre();
    expect(demandes.sort()).toEqual(["/recherche-communes.json", "/recherche-territoires.json", "/recherche.json"]);
    expect(res.querySelector(".sq")).toBeNull();
    expect(res.querySelector("a[href='/etablissement/0440001A/']")).not.toBeNull();
    saisir("q-entete", "college");
    await attendre();
    expect(demandes).toHaveLength(3);
  });

  test("panneau en deux colonnes : territoires puis établissements", async () => {
    const { document, saisir } = monter([entree("Collège Jules-Verne")], [], [{ i: "44109", l: "Nantes", d: "44" }]);
    saisir("q-entete", "nantes");
    await attendre();
    const cols = document.querySelectorAll("#res-entete > .col");
    expect(cols).toHaveLength(2);
    expect(cols[0]!.querySelector("a[href='/commune/44109/']")).not.toBeNull();
    expect(cols[1]!.querySelector("a[href='/etablissement/0440001A/']")).not.toBeNull();
    // Le champ de l'accueil garde une seule colonne.
    saisir("q", "nantes");
    await attendre();
    expect(document.querySelectorAll("#res > .col")).toHaveLength(0);
  });

  test("flèches pour parcourir les résultats, Échap pour fermer", async () => {
    const { document, saisir } = monter([entree("Collège A", "0440001A"), entree("Collège B", "0440002B")]);
    saisir("q-entete", "college");
    await attendre();
    const q = document.getElementById("q-entete")!;
    // linkedom n'a pas de KeyboardEvent : un Event portant la touche suffit au script.
    const touche = (key: string) => q.dispatchEvent(Object.assign(new (document.defaultView!.Event)("keydown", { cancelable: true }), { key }));
    touche("ArrowDown");
    touche("ArrowDown");
    const actif = document.querySelector("#res-entete a.actif")!;
    expect(actif.getAttribute("href")).toBe("/etablissement/0440002B/");
    expect(q.getAttribute("aria-activedescendant")).toBe(actif.id);
    touche("ArrowDown");
    expect(document.querySelector("#res-entete a.actif")!.getAttribute("href")).toBe("/etablissement/0440001A/");
    touche("Escape");
    expect(q.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("#res-entete a.actif")).toBeNull();
  });
});
