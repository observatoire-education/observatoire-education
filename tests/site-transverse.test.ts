import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { ecrireFichiersHebergement, verifierDist } from "../scripts/garde-fous.ts";
import { DIST_TEST, doc, octets, page, siteTest, texte, UMAMI_TEST } from "./site.ts";

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

  test("aucun « NaN », « Infinity » ni « undefined » dans le texte des pages", () => {
    for (const p of toutesLesPages()) {
      const m = texte(p).match(/\b(NaN|Infinity|undefined)\b/);
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
    expect(fiches.length).toBe(32);
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

  test("aucune ressource tierce chargée par les pages, hormis la mesure d'audience", () => {
    // seulement ce que le navigateur télécharge : scripts, styles, images, icônes
    // (la balise canonical déclare l'adresse de la page, sans rien charger) ;
    // seule exception : le script Umami auto-hébergé déclaré dans la configuration
    for (const p of toutesLesPages()) {
      const d = doc(p);
      const charges = [
        ...[...d.querySelectorAll("script[src], img[src], iframe[src]")].map((e) => e.getAttribute("src")!),
        ...[...d.querySelectorAll("link[href]")]
          .filter((l) => /stylesheet|icon|preload|modulepreload|manifest/.test(l.getAttribute("rel") ?? ""))
          .map((l) => l.getAttribute("href")!),
      ];
      for (const url of charges.filter((u) => u !== UMAMI_TEST.SCRIPT)) expect(`${p} : ${url}`).not.toMatch(/ : (https?:)?\/\//);
      expect(d.querySelector(`script[src="${UMAMI_TEST.SCRIPT}"]`)?.getAttribute("data-website-id")).toBe(UMAMI_TEST.ID);
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
      const robots = await Bun.file(join(d, "robots.txt")).text();
      expect(robots).toStartWith("User-agent: __usage_ai-training\nUser-agent: AI2Bot\n");
      for (const r of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "Applebot-Extended", "Meta-ExternalAgent", "MistralAI-Training"]) {
        expect(robots).toContain(`User-agent: ${r}\n`);
      }
      expect(robots).not.toContain("OAI-SearchBot");
      expect(robots).not.toContain("ExaSearchBot");
      expect(robots).toEndWith(
        "Disallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://observatoireeducation.fr/sitemap.xml\n",
      );
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});

describe("méthode et sources de la phase 4", () => {
  test("/methode/ porte les ancres de la phase 4 et les liens vers les notes de la DEPP", () => {
    const d = doc("methode");
    for (const a of ["valeur-ajoutee", "resultats-colleges", "rupture-bac", "successeurs", "corrections", "segregation", "ips-ancien"]) {
      expect(d.getElementById(a)).not.toBeNull();
    }
    const liens = [...d.querySelectorAll("a")].map((x) => x.getAttribute("href") ?? "");
    expect(liens.some((h) => h.includes("fr-en-indicateurs-valeur-ajoutee-colleges"))).toBe(true);
    expect(liens.some((h) => h.includes("fr-en-indicateur_segregation_sociale_colleges"))).toBe(true);
    expect(liens.some((h) => h.includes("fr-en-ips-colleges-ap2022"))).toBe(true);
    const t = texte("methode");
    expect(t).toContain("session 2025");
    expect(t).toContain("successeurs-manuels.json");
    // Le nuage date l'IPS de la rentrée session − 1, le tableau celui de la dernière rentrée.
    expect(t).not.toContain("le tableau des établissements donne les mêmes chiffres");
    expect(t).toContain("l'IPS de la dernière rentrée, qui peut différer de celui du nuage");
    // Sans élèves avant 2019, un fermé d'avant la rentrée 2019 ne compte pas dans les moyennes 2016-2018.
    expect(t).toContain("un établissement fermé avant la rentrée 2019 n'a pas d'élèves en 2019 et ne compte donc pas dans les moyennes calculées de ces rentrées");
    // Dénominateurs du budget : les fiches historiques comptent désormais.
    expect(t).not.toContain("seuls ceux fermés avant la mise en ligne de l'observatoire");
    expect(t).toContain("y compris ceux fermés depuis 2019 qui ont une page historique parce qu'une source les cite");
  });

  test("/sources/ liste les onze nouvelles sources avec leurs versions", () => {
    const d = doc("sources");
    const ids = ["fermes", "ips_colleges_2016", "ips_colleges_2022", "ips_lycees_2016", "ips_lycees_2022", "ips_erea_2016", "ips_erea", "ivac", "ival_gt", "ival_pro", "segregation"];
    for (const id of ids) {
      const s = d.getElementById(id);
      expect(s).not.toBeNull();
      expect(s!.textContent).toMatch(/\d\d\/\d\d\/\d{4}|Aucune version archivée/);
    }
  });

  test("la rupture de méthode de l'IPS est dite sous la courbe, avec renvoi vers la méthode", () => {
    const d = doc("etablissement/0440001A");
    expect(d.body.textContent).toContain("rupture de série dès la rentrée 2022");
    expect(d.querySelector('a[href="/methode/#ips-ancien"]')).not.toBeNull();
  });

  test("la rupture de l'IPS n'est dite que si la courbe traverse la rentrée 2022", () => {
    // 2016 → 2018 : la courbe s'arrête avant la rupture ; 2024 → 2024 : un seul point, pas de courbe
    expect(doc("etablissement/0440020P").body.textContent).not.toContain("rupture de série dès la rentrée 2022");
    expect(doc("etablissement/0440001A").body.textContent).toContain("rupture de série dès la rentrée 2022");
    expect(doc("departement/44").body.textContent).toContain("rupture de série dès la rentrée 2022");
  });
});

describe("logo", () => {
  test("favicon SVG et icône iOS déclarés et publiés", () => {
    const d = doc("sources");
    expect(d.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute("href")).toBe("/favicon.svg");
    expect(d.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")).toBe("/apple-touch-icon.png");
    const svg = page("favicon.svg");
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).not.toMatch(/\bid=/);
    expect(octets("apple-touch-icon.png")).toBeGreaterThan(500);
    expect(octets("logo.svg")).toBeGreaterThan(200);
  });

  test("le header porte le logo tableau noir, pas le carré bicolore", () => {
    const a = doc("sources").querySelector("header .brand")!;
    expect(a.querySelector("i")).toBeNull();
    // Image externe plutôt que SVG en ligne : mise en cache une fois, pas d'octets ajoutés à chaque page.
    const img = a.querySelector('img[src="/favicon.svg"]');
    expect(img).not.toBeNull();
    expect(img!.getAttribute("alt")).toBe("");
    expect(a.querySelector("svg")).toBeNull();
    expect(a.getAttribute("aria-label")).toBeTruthy();
  });
});
