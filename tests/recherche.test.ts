import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";

const SCRIPT = await Bun.file(new URL("../site/public/js/recherche.js", import.meta.url)).text();

/** Exécute le vrai recherche.js dans un document linkedom, avec un index fourni. */
async function rechercher(index: unknown[], saisie: string, deps: unknown[] = []) {
  const { document } = parseHTML(`<!doctype html><html><body>
    <input id="q"><div id="res"></div>
    <script type="application/json" id="departements">${JSON.stringify(deps)}</script></body></html>`);
  const fetchFaux = async () => ({ json: async () => structuredClone(index) });
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
});
