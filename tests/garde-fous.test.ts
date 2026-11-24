import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comparer, echantillonUrls, normaliserCorps } from "../scripts/comparer-hebergements.ts";
import {
  ecrireFichiersHebergement, LIMITES, OCTETS_PAGE_MAX, OCTETS_RECHERCHE_MAX, poidsPages, verifierDist,
} from "../scripts/garde-fous.ts";

async function dossierTemp<T>(f: (d: string) => Promise<T> | T): Promise<T> {
  const d = await mkdtemp(join(tmpdir(), "obs-gf-"));
  try {
    return await f(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}

describe("garde-fous de dist/ (Cloudflare Workers)", () => {
  test("limites : 95 000 fichiers, 25 Mio par fichier", () => {
    expect(LIMITES).toEqual({ fichiers: 95_000, octetsParFichier: 25 * 1024 * 1024 });
  });

  test("recherche.json : au plus 10 000 000 octets", () =>
    dossierTemp(async (d) => {
      expect(OCTETS_RECHERCHE_MAX).toBe(10_000_000);
      await writeFile(join(d, "recherche.json"), "x".repeat(10_000_000));
      expect(verifierDist(d).fichiers).toBe(1);
      await writeFile(join(d, "recherche.json"), "x".repeat(10_000_001));
      expect(() => verifierDist(d)).toThrow(/recherche\.json.*10000001 octets.*10000000/);
    }));

  test("recherche.json et recherche-communes.json, chargés ensemble : au plus 10 000 000 octets à eux deux", () =>
    dossierTemp(async (d) => {
      await writeFile(join(d, "recherche.json"), "x".repeat(9_000_000));
      await writeFile(join(d, "recherche-communes.json"), "x".repeat(1_000_000));
      expect(verifierDist(d).fichiers).toBe(2);
      await writeFile(join(d, "recherche-communes.json"), "x".repeat(1_000_001));
      expect(() => verifierDist(d)).toThrow(/recherche\.json et recherche-communes\.json pèsent 10000001 octets.*10000000/);
    }));

  test("trop de fichiers", () =>
    dossierTemp(async (d) => {
      for (const n of ["a", "b", "c"]) await writeFile(join(d, n), "x");
      expect(() => verifierDist(d, { fichiers: 2, octetsParFichier: 10 })).toThrow("dist/ contient trop de fichiers : 3 > 2");
    }));

  test("fichier trop gros : l'erreur le nomme", () =>
    dossierTemp(async (d) => {
      await writeFile(join(d, "gros.json"), "x".repeat(11));
      expect(() => verifierDist(d, { fichiers: 10, octetsParFichier: 10 })).toThrow(/gros\.json/);
    }));

  test("aucun plafond sur le poids total", () =>
    dossierTemp(async (d) => {
      // Limites réduites : 41 fichiers de 24 octets, chacun sous les 25 octets par fichier, en pèsent 984 au total.
      for (let i = 0; i < 41; i++) await writeFile(join(d, `f${i}.bin`), "x".repeat(24));
      const r = verifierDist(d, { fichiers: 100, octetsParFichier: 25 });
      expect(r.fichiers).toBe(41);
      expect(r.octets).toBe(41 * 24);
    }));

  test("poids des pages : médiane, 95e centile et maximum (avec le fichier) des fiches et des pages commune", () =>
    dossierTemp(async (d) => {
      for (let i = 1; i <= 20; i++) {
        await mkdir(join(d, "etablissement", `E${i}`), { recursive: true });
        await writeFile(join(d, "etablissement", `E${i}`, "index.html"), "x".repeat(i * 100));
      }
      await mkdir(join(d, "commune", "44109"), { recursive: true });
      await writeFile(join(d, "commune", "44109", "index.html"), "x".repeat(500));
      // Hors du rapport : le CSV d'une commune, la page d'un autre niveau.
      await writeFile(join(d, "commune", "44109", "etablissements.csv"), "x".repeat(900_000));
      await mkdir(join(d, "departement", "44"), { recursive: true });
      await writeFile(join(d, "departement", "44", "index.html"), "x".repeat(900_000));
      const p = poidsPages(d);
      expect(p.etablissement).toEqual({ pages: 20, mediane: 1000, centile95: 1900, max: 2000, fichier: join(d, "etablissement", "E20", "index.html") });
      expect(p.commune).toEqual({ pages: 1, mediane: 500, centile95: 500, max: 500, fichier: join(d, "commune", "44109", "index.html") });
      expect(() => verifierDist(d)).not.toThrow();
    }));

  test("poids des pages : au plus 150 000 octets par fiche ou page commune, l'erreur nomme le fichier", () =>
    dossierTemp(async (d) => {
      expect(OCTETS_PAGE_MAX).toBe(150_000);
      for (const p of ["etablissement/0440001A", "commune/44109"]) {
        await mkdir(join(d, p), { recursive: true });
        await writeFile(join(d, p, "index.html"), "x".repeat(150_000));
      }
      expect(() => verifierDist(d)).not.toThrow();
      await writeFile(join(d, "commune", "44109", "index.html"), "x".repeat(150_001));
      expect(() => verifierDist(d)).toThrow(/commune\/44109\/index\.html pèse 150001 octets, au-delà de 150000/);
      await writeFile(join(d, "commune", "44109", "index.html"), "x");
      await writeFile(join(d, "etablissement", "0440001A", "index.html"), "x".repeat(150_001));
      expect(() => verifierDist(d)).toThrow(/etablissement\/0440001A\/index\.html pèse 150001 octets/);
    }));

  test("ecrireFichiersHebergement n'écrit plus CNAME et supprime l'existant", () =>
    dossierTemp(async (d) => {
      await writeFile(join(d, "CNAME"), "ancien.example\n");
      ecrireFichiersHebergement(d, { SITE_URL: "https://x.fr", DOMAINE: "x.fr", DEPOT: "o/d", INDEXABLE: true });
      expect(existsSync(join(d, "CNAME"))).toBe(false);
      expect(existsSync(join(d, "robots.txt"))).toBe(true);
    }));

  test("echantillonUrls prend le premier, le dernier et un pas régulier (chemins seulement)", () => {
    const sitemap =
      '<?xml version="1.0"?><urlset>' +
      Array.from({ length: 10 }, (_, i) => `<url><loc>https://observatoireeducation.fr/p${i + 1}/</loc></url>`).join("") +
      "</urlset>";
    expect(echantillonUrls(sitemap, 4)).toEqual(["/p1/", "/p4/", "/p7/", "/p10/"]);
    expect(echantillonUrls(sitemap, 50)).toHaveLength(10);
    expect(echantillonUrls(sitemap, 1)).toEqual(["/p1/"]);
  });

  test("normaliserCorps retire le script Umami et les dates de génération", () => {
    const html =
      '<head><script is:inline defer src="https://u.example/s.js" data-website-id="x"></script></head>' +
      '<div>Page générée le 24 novembre 2026. Lien</div><div>Fiche éditée le 24 novembre 2026<br></div>';
    expect(normaliserCorps(html)).toBe(normaliserCorps(html.replace(/24 novembre/g, "25 novembre").replace(/<script.*?<\/script>/, "")));
  });

  test("normaliserCorps garde les vraies différences", () => {
    expect(normaliserCorps("<p>a</p>")).not.toBe(normaliserCorps("<p>b</p>"));
  });

  test("echantillonUrls déséchappe les entités XML des <loc>", () => {
    const sitemap = "<urlset><url><loc>https://x.fr/a?b=1&amp;c=2</loc></url></urlset>";
    expect(echantillonUrls(sitemap, 1)).toEqual(["/a?b=1&c=2"]);
  });

  test("comparer signale erreur réseau, statut, redirection et corps", async () => {
    const reponses: Record<string, () => Response> = {
      "https://a.test/reseau": () => new Response("ok"),
      "https://a.test/statut": () => new Response("x", { status: 200 }),
      "https://b.test/statut": () => new Response("x", { status: 404 }),
      "https://a.test/redir": () => new Response(null, { status: 301, headers: { location: "/un/" } }),
      "https://b.test/redir": () => new Response(null, { status: 301, headers: { location: "/deux/" } }),
      "https://a.test/corps": () => new Response("a"),
      "https://b.test/corps": () => new Response("b"),
      "https://a.test/ok": () => new Response("pareil"),
      "https://b.test/ok": () => new Response("pareil"),
    };
    const stub = async (url: URL) => {
      const f = reponses[url.href];
      if (!f) throw new Error("injoignable");
      return f();
    };
    const ecarts = await comparer("https://a.test", "https://b.test", ["/reseau", "/statut", "/redir", "/corps", "/ok"], stub);
    expect(ecarts.map((e) => e.chemin)).toEqual(["/reseau", "/statut", "/redir", "/corps"]);
    expect(ecarts[0]!.ecart).toContain("erreur réseau");
    expect(ecarts[1]!.ecart).toContain("404");
    expect(ecarts[2]!.ecart).toContain("/deux/");
  });
});
