import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";

const SCRIPT = await Bun.file(new URL("../site/public/js/recherche.js", import.meta.url)).text();

/** Exécute le vrai recherche.js dans un document linkedom, avec un index et une liste de communes servis par `fetch`. */
async function rechercher(index: unknown[], saisie: string, deps: unknown[] = [], communes: unknown[] = []) {
  const { document } = parseHTML(`<!doctype html><html><body>
    <input id="q"><div id="res"></div>
    <script type="application/json" id="departements">${JSON.stringify(deps)}</script></body></html>`);
  const servis: Record<string, unknown[]> = { "/recherche.json": index, "/recherche-communes.json": communes };
  const fetchFaux = async (url: string) => {
    if (!(url in servis)) throw new Error(`adresse inattendue : ${url}`);
    return { json: async () => structuredClone(servis[url]) };
  };
  new Function("document", "location", "fetch", "URLSearchParams", SCRIPT)(
    document, { search: "", href: "" }, fetchFaux, URLSearchParams,
  );
  const q = document.getElementById("q") as unknown as HTMLInputElement;
  const Evenement = document.defaultView!.Event;
  q.dispatchEvent(new Evenement("focus"));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  q.value = saisie;
  q.dispatchEvent(new Evenement("input"));
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
