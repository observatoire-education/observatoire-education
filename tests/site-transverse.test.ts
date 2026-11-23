import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { ecrireFichiersHebergement, verifierDist } from "../scripts/garde-fous.ts";
import { DIST_TEST, doc, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

/** Chemins (relatifs à dist) de toutes les pages HTML générées. */
function toutesLesPages(): string[] {
  const pages: string[] = [];
  const parcourir = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (f.endsWith(".html")) pages.push(relative(DIST_TEST, p));
    }
  };
  parcourir(DIST_TEST);
  return pages;
}

describe("contrôles transverses du HTML", () => {
  test("anti-palmarès sur toutes les pages", () => {
    const interdit = /\b(rang|classement|top|meilleur|meilleure|meilleurs|meilleures|pire|pires)\b/i;
    const pages = toutesLesPages();
    expect(pages.length).toBeGreaterThan(10);
    for (const p of pages) {
      const t = texte(p);
      const m = t.match(interdit);
      expect(m ? `${p} : « ${m[0]} »` : null).toBeNull();
    }
  });

  test("aucun zéro à la place d'une absence (vie scolaire)", () => {
    for (const uai of ["0440002B", "0440005E"]) {
      const d = doc(`etablissement/${uai}`);
      const kpi = [...d.querySelectorAll(".kpis > div")].find((x) => x.querySelector(".k")?.textContent?.includes("vie scolaire"))!;
      expect(kpi.querySelector(".v")).toBeNull(); // absence dite, pas de valeur
      expect(kpi.querySelector(".na")!.textContent).toMatch(/non publié pour le privé|non disponible/);
      for (const cellule of d.querySelectorAll("#vs .val, #vs td, .a4 td")) {
        // le ratio élèves / ETP de vie scolaire (un volume d'ETP publié à 0 est une vraie valeur)
        if (cellule.closest("tr")?.textContent?.includes("Élèves par ETP de vie scolaire") || cellule.classList.contains("val")) {
          expect(cellule.textContent!.trim()).not.toMatch(/^0(,0)?$/);
        }
      }
    }
  });

  test("chaque fiche porte ses sources datées", () => {
    const fiches = toutesLesPages().filter((p) => p.startsWith("etablissement/"));
    expect(fiches.length).toBe(8);
    for (const p of fiches) {
      const sources = [...doc(p).querySelectorAll("#sources li")];
      expect(sources.length).toBeGreaterThan(0);
      for (const li of sources) expect(li.textContent).toMatch(/collecté le \d\d\/\d\d\/\d{4}/);
    }
  });

  test("chaque page a un titre, la langue française et le pied de page des licences", () => {
    for (const p of toutesLesPages()) {
      const d = doc(p);
      expect(d.documentElement.getAttribute("lang")).toBe("fr");
      expect(d.querySelector("title")!.textContent).toContain("Observatoire citoyen de l'éducation en France");
      expect(texte(p)).toContain("Licence Ouverte 2.0");
    }
  });

  test("aucune ressource tierce chargée par les pages", () => {
    for (const p of toutesLesPages()) {
      const h = page(p);
      for (const m of h.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="(https?:)?\/\/[^"]+"/g)) {
        expect(m[0]).toBeUndefined();
      }
    }
  });
});

describe("garde-fous du build", () => {
  test("garde-fou de volume", () => {
    expect(() => verifierDist(DIST_TEST, { octets: 10, fichiers: 50_000 })).toThrow(/octets/);
    expect(() => verifierDist(DIST_TEST, { octets: 900e6, fichiers: 3 })).toThrow(/fichiers/);
    const r = verifierDist(DIST_TEST);
    expect(r.fichiers).toBeGreaterThan(10);
    expect(r.octets).toBeGreaterThan(1000);
  });

  test("CNAME et noindex", async () => {
    const d = await mkdtemp(join(tmpdir(), "obs-dist-"));
    try {
      ecrireFichiersHebergement(d, { SITE_URL: "", DOMAINE: "", DEPOT: "org/depot", INDEXABLE: false });
      expect(await Bun.file(join(d, "CNAME")).exists()).toBe(false);
      expect(await Bun.file(join(d, "robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
      expect(page("etablissement/0440001A")).toContain('<meta name="robots" content="noindex">');

      ecrireFichiersHebergement(d, {
        SITE_URL: "https://observatoireeducation.fr", DOMAINE: "observatoireeducation.fr", DEPOT: "org/depot", INDEXABLE: true,
      });
      expect(await Bun.file(join(d, "CNAME")).text()).toBe("observatoireeducation.fr\n");
      expect(await Bun.file(join(d, "robots.txt")).text()).toBe(
        "User-agent: *\nAllow: /\nSitemap: https://observatoireeducation.fr/sitemap.xml\n",
      );
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});
