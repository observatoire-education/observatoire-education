import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LIBELLES_RATTACHEMENTS as LR } from "@obs/shared/libelles";
import { mentionMoyennesA4 } from "../site/src/lib/affichage.ts";
import { svgElevesClasses } from "../site/src/lib/plot.ts";
import { DIST_TEST, doc, octets, page, siteTest, texte } from "./site.ts";

beforeAll(async () => {
  await siteTest();
}, 180_000);

const ECOLES = ["0440104D", "0440105E", "0440106F", "0440107G", "0440108H", "0440109K", "0440110M", "0440201A", "0440202B", "0440203C"];
const fiche = (uai: string) => `etablissement/${uai}`;
const propre = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

describe("fiche école", () => {
  test("école à classe unique : dernière rentrée en évidence, élèves par classe, classe à plusieurs niveaux", () => {
    const t = texte(fiche("0440104D"));
    expect(t).toContain("Rentrée 2025, dernière publiée");
    expect(t).toContain("Élèves par classe");
    expect(t).toContain("Classes à plusieurs niveaux");
    expect(t).toContain("CP-CE1-CE2-CM1-CM2");
  });

  test("maternelle : « IPS non publié pour cette école », aucun 0 dans le bloc de l'IPS", () => {
    const social = doc(fiche("0440201A")).querySelector("#social")!;
    const t = propre(social.textContent);
    expect(t).toContain("IPS non publié pour cette école");
    expect(t).not.toMatch(/(^|[\s(])0([\s,)]|$)/);
    expect(social.querySelector("svg")).toBeNull();
  });

  test("aucune fiche école ne montre les blocs des lots à venir ni les données sans objet", () => {
    for (const uai of ECOLES) {
      const t = texte(fiche(uai)).toLowerCase();
      for (const mot of ["Budget", "Vie scolaire", "agrégés"]) {
        expect(`${uai} : ${mot} ${t.includes(mot.toLowerCase())}`).toBe(`${uai} : ${mot} false`);
      }
      expect(t).not.toContain("Voisins");
      expect(t).not.toContain("Moyens de la collectivité");
    }
  });

  test("école fermée : « Fermée le 05/07/2016 », au féminin", () => {
    const t = texte(fiche("0440106F"));
    expect(t).toContain("Fermée le 05/07/2016");
    expect(t).not.toContain("Fermé le");
  });

  test("école issue d'une fusion : deux prédécesseurs, « fermée le » au féminin", () => {
    const l = [...doc(fiche("0440108H")).querySelectorAll(".fermeture:not(.m) .predecesseur")].map((e) => propre(e.textContent));
    expect(l).toEqual([
      "Succède à École maternelle des Tilleuls (0440107G), fermée le 04/07/2019",
      "Succède à École élémentaire des Tilleuls (0440109K), fermée le 04/07/2019",
    ]);
    expect(texte(fiche("0440107G"))).toContain("Successeur : École primaire des Tilleuls (0440108H)");
  });

  test("élèves par classe non disponible quand la dernière rentrée n'a pas de classe, jamais 0", () => {
    const d = doc(fiche("0440105E"));
    const cle = new Map([...d.querySelectorAll("#eleves .chiffres > div")].map((x) => [propre(x.querySelector(".k")?.textContent), x]));
    for (const k of ["Élèves par classe", "Classes"]) {
      expect(cle.get(k)!.querySelector(".v")).toBeNull();
      expect(propre(cle.get(k)!.querySelector(".na")?.textContent)).toBe("non disponible");
    }
    expect(propre(cle.get("Élèves")!.querySelector(".v")?.textContent)).toBe("45");
  });

  test("répartition par niveau : « Préélémentaire » ; types de classes « Préélémentaire-CP »", () => {
    const t = texte(fiche("0440203C"));
    expect(t).toContain("Préélémentaire-CP");
    expect(t).toContain("Classes à un niveau");
    expect(t).not.toMatch(/\bPreel\b/);
    expect(texte(fiche("0440202B"))).toContain("ULIS");
  });

  test("IPS d'une école : rentrée de l'école, écart à la moyenne publiée par la DEPP", () => {
    const t = propre(doc(fiche("0440202B")).querySelector("#social")!.textContent);
    expect(t).toContain("2024-2025");
    expect(t).toContain("96,0");
    expect(t).toContain("−3,9 (99,9)");
    expect(t).toContain("moyennes publiées par la DEPP");
  });

  test("une seule courbe : élèves et classes, deux axes", () => {
    const svgs = [...doc(fiche("0440202B")).querySelectorAll("main svg")].filter((s) => !s.closest(".a4") && !s.closest(".brand"));
    expect(svgs.length).toBe(1);
    expect(svgs[0]!.getAttribute("aria-label")).toStartWith("Élèves : 2011 180, 2012 181,");
    expect(svgs[0]!.getAttribute("aria-label")).toEndWith(". Classes : 8 de 2011 à 2025");
  });

  // 25 000 octets jusqu'au lot 1 ; relevé à 26 000 par le bloc des rattachements, puis à 27 500 par le bloc
  // « Autour de l'école » (plafond permis : 30 000).
  test("poids : la fiche 0440202B fait 27 500 octets au plus", () => {
    expect(octets(fiche("0440202B"))).toBeLessThanOrEqual(27_500);
  });

  test("fiche A4 d'une école : « Fiche pour le conseil d'école »", () => {
    for (const uai of ["0440202B", "0440201A"]) {
      const a4 = propre(doc(fiche(uai)).querySelector(".a4")!.textContent);
      expect(a4).toContain("Fiche pour le conseil d'école");
      expect(a4).toContain("Élèves par classe");
    }
    expect(propre(doc(fiche("0440001A")).querySelector(".a4")!.textContent)).not.toContain("conseil d'école");
    expect(propre(doc(fiche("0440106F")).querySelector(".a4")!.textContent)).toContain("Fermée le 05/07/2016");
  });

  test("les pages des écoles sont dans le sitemap", () => {
    for (const uai of ECOLES) expect(page("sitemap.xml")).toContain(`/etablissement/${uai}/</loc>`);
  });
});

describe("mentions des sources des écoles sur la fiche A4", () => {
  test("IPS des écoles publié par la DEPP ; typologie des classes et éducation prioritaire sans moyenne", () => {
    expect(mentionMoyennesA4("ips_ecoles", false)).toBe(" · moyennes publiées par la DEPP");
    expect(mentionMoyennesA4("ips_ecoles", true)).toBe("");
    expect(mentionMoyennesA4("ips_ecoles_2016", false)).toBe("");
    expect(mentionMoyennesA4("classes_ecoles", false)).toBe("");
    expect(mentionMoyennesA4("ecoles_ep", false)).toBe("");
    expect(mentionMoyennesA4("effectifs_ecoles", false)).toBe(" · moyennes calculées (Σ / Σ)");
  });
});

describe("svgElevesClasses", () => {
  test("deux séries ; une classe absente ou à 0 fait un trou, jamais un zéro", () => {
    const s = svgElevesClasses([[2023, 45, 2], [2024, 45, 2], [2025, 45, 0]]);
    expect(s).toStartWith("<svg");
    expect(s).toContain('aria-label="Élèves : 2023 45, 2024 45, 2025 45. Classes : 2 de 2023 à 2024, non disponible en 2025"');
    expect(svgElevesClasses([[2025, null, null]])).toBe("");
  });

  test("classes sans aucun nombre d'élèves : ni axe ni ligne des élèves (pas d'axe 0–1)", () => {
    const s = svgElevesClasses([[2023, null, 2], [2024, null, 3]]);
    expect(s).not.toContain('stroke="var(--me)"');
    expect(s).not.toContain('fill="var(--me)"');
    expect(s).not.toContain('text-anchor="end"'); // axe de gauche (élèves)
    expect(s).toContain('stroke="var(--ink)"');
    expect(s).toContain('text-anchor="start"'); // axe de droite (classes)
    const e = svgElevesClasses([[2023, 40, null], [2024, 42, 0]]);
    expect(e).toContain('stroke="var(--me)"');
    expect(e).not.toContain('stroke="var(--ink)"');
    expect(e).not.toContain('text-anchor="start"');
  });
});

const NOTE_SECTEUR = "Le secteur de collège dépend de l'adresse de chaque famille, pas de l'école fréquentée. Source : carte scolaire des collèges publics, définie par le conseil départemental.";
const NOTE_PRIVE = "Les écoles privées ne sont pas soumises à la carte scolaire. Le collège public de secteur d'un élève dépend de l'adresse de sa famille.";
const DEFINITION_PIAL = "Le PIAL (pôle inclusif d'accompagnement localisé) organise l'accompagnement des élèves en situation de handicap.";
const liens = (e: Element | null | undefined) => [...(e?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));

describe("rattachements d'une école", () => {
  test("école publique : collège de secteur à l'adresse de l'école, avec lien, et la note du secteur", () => {
    const r = doc(fiche("0440201A")).querySelector("#rattachements")!;
    expect(propre(r.querySelector("h2")?.textContent)).toBe("Rattachements");
    const t = propre(r.textContent);
    expect(t).toContain("Collège de secteur à l'adresse de l'école : Collège Jules-Verne (0440001A)");
    expect(r.querySelector('.secteur-college a[href="/etablissement/0440001A/"]')).not.toBeNull();
    expect(t).toContain(NOTE_SECTEUR);
    expect(t).not.toContain(NOTE_PRIVE);
    expect(t).toContain("Circonscription : NANTES 1");
  });

  test("les rattachements viennent juste après l'en-tête, en tête du sommaire", () => {
    const d = doc(fiche("0440201A"));
    expect(d.querySelector("main section")?.id).toBe("rattachements");
    expect(liens(d.querySelector("nav.toc"))[0]).toBe("#rattachements");
  });

  test("école privée sous contrat non rapprochée : absence dite, note du privé", () => {
    const r = doc(fiche("0440203C")).querySelector("#rattachements")!;
    const t = propre(r.textContent);
    expect(propre(r.querySelector(".na")?.textContent)).toBe("Adresse de l'école non rapprochée de la carte scolaire");
    expect(t).toContain(NOTE_PRIVE);
    expect(t).not.toContain(NOTE_SECTEUR);
    expect(t).not.toContain("Collège de secteur");
  });

  test("secteur multi-collèges : tous les collèges, séparés par « , »", () => {
    const t = propre(doc(fiche("0440108H")).querySelector("#rattachements .secteur-college")!.textContent);
    expect(t).toBe("Collège de secteur à l'adresse de l'école : Collège Saint-Exemple (0440002B), Collège Sans GPS (0440005E)");
  });

  test("PIAL : tête liée, membres liés sans la page elle-même, définition et lien vers la méthode", () => {
    const p = doc(fiche("0440202B")).querySelector("#rattachements .pial")!;
    const t = propre(p.textContent);
    expect(t).toContain("PIAL du collège Jules-Verne");
    expect(t).toContain(DEFINITION_PIAL);
    expect(liens(p)).toEqual(["/etablissement/0440001A/", "/etablissement/0440104D/", "/etablissement/0440201A/", "/methode/#pial"]);
    expect(propre(p.querySelector('a[href="/methode/#pial"]')?.textContent)).toBe("En savoir plus");
    expect(t).not.toContain("Jules-Ferry");
  });

  test("école sans PIAL : pas de ligne PIAL ; école fermée : pas de rattachements", () => {
    expect(doc(fiche("0440105E")).querySelector("#rattachements .pial")).toBeNull();
    expect(texte(fiche("0440105E"))).toContain("Collège de secteur à l'adresse de l'école : Collège Jules-Verne (0440001A)");
    for (const uai of ["0440106F", "0440107G", "0440109K", "0440110M"]) {
      expect(doc(fiche(uai)).querySelector("#rattachements")).toBeNull();
      expect(texte(fiche(uai))).not.toContain("Rattachements");
    }
  });
});

describe("collège : écoles de son secteur et PIAL", () => {
  test("écoles de son secteur : décompte, tableau trié par nom, rentrées en titre de colonne, absences en toutes lettres", () => {
    const b = doc(fiche("0440001A")).querySelector("#ecoles-secteur")!;
    expect(propre(b.querySelector("h2")?.textContent)).toBe("Écoles de son secteur");
    const t = propre(b.textContent);
    expect(t).toContain("3 écoles publiques, 0 privée sous contrat");
    expect([...b.querySelectorAll("thead th")].map((x) => propre(x.textContent))).toEqual(["École", "Nature", "Secteur", "Commune", "Élèves 2025", "IPS 2024"]);
    const lignes = [...b.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((x) => propre(x.textContent)));
    expect(lignes).toEqual([
      ["École élémentaire du Bourg", "École élémentaire", "Public", "Saint-Aubin", "10", "non publié"],
      ["École maternelle des Prés", "École maternelle", "Public", "Saint-Aubin", "45", "non publié"],
      ["École maternelle Les Lilas", "École maternelle", "Public", "Nantes", "102", "non publié"],
    ]);
    expect(liens(b.querySelector("tbody"))).toEqual(["/etablissement/0440104D/", "/etablissement/0440105E/", "/etablissement/0440201A/"]);
    expect(t).toContain("Seules les écoles dont l'adresse a pu être rapprochée de la carte scolaire sont listées.");
    expect(propre(b.querySelector('a[href="/methode/#secteur-ecole"]')?.textContent)).toBe("Méthode");
    expect(t).toContain(NOTE_SECTEUR);
  });

  test("collège tête de PIAL : « PIAL du collège Jules-Verne », membres liés", () => {
    const d = doc(fiche("0440001A"));
    const p = d.querySelector("#pial")!;
    expect(propre(p.querySelector("h2")?.textContent)).toBe("PIAL");
    const t = propre(p.textContent);
    expect(t).toContain("PIAL du collège Jules-Verne");
    expect(t).toContain(DEFINITION_PIAL);
    expect(liens(p)).toEqual(["/etablissement/0440104D/", "/etablissement/0440202B/", "/etablissement/0440201A/", "/methode/#pial"]);
    expect(liens(d.querySelector("nav.toc"))).toContain("#ecoles-secteur");
    expect(liens(d.querySelector("nav.toc"))).toContain("#pial");
  });

  test("sources des écoles listées : dans les sources de la page, pas sur la fiche A4 (qui ne reprend pas la liste)", () => {
    const d = doc(fiche("0440001A"));
    expect(propre(d.querySelector("#sources")!.textContent)).toContain("Effectifs d’élèves par école · rentrée 2025-2026");
    expect(propre(d.querySelector("#sources")!.textContent)).toContain("Indices de position sociale des écoles (à partir de 2022) · rentrée 2024-2025");
    const a4 = propre(d.querySelector(".a4")!.textContent);
    expect(a4).not.toContain("Effectifs d’élèves par école");
    expect(a4).not.toContain("Indices de position sociale des écoles");
  });

  test("collège de la carte sans école rapprochée : bloc présent, absence factuelle", () => {
    const b = doc(fiche("0350001A")).querySelector("#ecoles-secteur")!;
    expect(propre(b.querySelector(".na")?.textContent)).toBe("Aucune école rapprochée de la carte scolaire");
    expect(b.querySelector("table")).toBeNull();
  });

  test("collège privé, lycée : ni écoles du secteur ni PIAL", () => {
    for (const uai of ["0440002B", "0440003C"]) {
      const d = doc(fiche(uai));
      expect(d.querySelector("#ecoles-secteur")).toBeNull();
      expect(d.querySelector("#pial")).toBeNull();
      expect(texte(fiche(uai))).not.toContain("Écoles de son secteur");
    }
  });
});

const NOTE_DISTANCES = "Distances à vol d'oiseau, sans tenir compte du relief ni des routes.";

describe("autour de l'école", () => {
  test("juste après les rattachements, dans le sommaire", () => {
    const d = doc(fiche("0440104D"));
    expect([...d.querySelectorAll("main section")].slice(0, 2).map((s) => s.id)).toEqual(["rattachements", "autour"]);
    expect(liens(d.querySelector("nav.toc")).slice(0, 2)).toEqual(["#rattachements", "#autour"]);
    expect(propre(d.querySelector("#autour h2")?.textContent)).toBe("Autour de l'école");
  });

  test("école isolée : phrase « Aucune autre école à moins de 10 km », plus proches par niveau, tableau, note", () => {
    const b = doc(fiche("0440104D")).querySelector("#autour")!;
    const t = propre(b.textContent);
    expect(t).toContain("Aucune autre école à moins de 10 km");
    expect(t).toMatch(/École maternelle ou primaire la plus proche : École primaire des Tilleuls, \d+,\d km/);
    expect(t).toMatch(/École élémentaire ou primaire la plus proche : École primaire des Tilleuls, \d+,\d km/);
    expect([...b.querySelectorAll("thead th")].map((x) => propre(x.textContent))).toEqual(["École", "Distance", "Nature", "Secteur", "Élèves 2025", "Classes 2025"]);
    const lignes = [...b.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((x) => propre(x.textContent)));
    expect(lignes.map((l) => l[0])).toEqual(["École primaire des Tilleuls", "École primaire Sainte-Marie", "École élémentaire Jules-Ferry"]);
    expect(lignes[1]!.slice(2)).toEqual(["École primaire", "Privé s. c.", "166", "7"]);
    expect(lignes[0]![1]).toMatch(/^\d+,\d km$/);
    expect(liens(b.querySelector("tbody"))).toEqual(["/etablissement/0440108H/", "/etablissement/0440203C/", "/etablissement/0440202B/"]);
    expect(t).toContain(NOTE_DISTANCES);
    expect(b.querySelector('a[href="/methode/#ecoles-proches"]')).not.toBeNull();
  });

  test("école compatible à moins de 2 km : pas de phrase ; maternelle : élémentaire ou primaire la plus proche", () => {
    const t = propre(doc(fiche("0440201A")).querySelector("#autour")!.textContent);
    expect(t).not.toContain("Aucune autre école");
    expect(t).toMatch(/École élémentaire ou primaire la plus proche : École primaire Sainte-Marie, 0,1 km/);
  });

  test("école sans coordonnées : « Coordonnées de l'école non publiées » ; école fermée : pas de bloc", () => {
    const b = doc(fiche("0440105E")).querySelector("#autour")!;
    expect(propre(b.querySelector(".na")?.textContent)).toBe("Coordonnées de l'école non publiées");
    expect(b.querySelector("table")).toBeNull();
    for (const uai of ["0440106F", "0440107G", "0440109K", "0440110M"]) {
      expect(doc(fiche(uai)).querySelector("#autour")).toBeNull();
      expect(texte(fiche(uai))).not.toContain("Autour de l'école");
    }
  });
});

describe("méthode : secteur de collège d'une école et PIAL", () => {
  test("ancres #secteur-ecole et #pial", () => {
    const d = doc("methode");
    expect(d.querySelector("#secteur-ecole")).not.toBeNull();
    expect(propre(d.querySelector("#pial")?.textContent)).toBe("PIAL");
  });

  test("écoles les plus proches : vol d'oiseau, seuils, compatibilité, 50 km, temps de trajet à venir", () => {
    const t = propre(doc("methode").querySelector("#ecoles-proches")?.nextElementSibling?.textContent);
    for (const s of ["vol d'oiseau", "6 écoles", "50 km", "2, 5 ou 10 km", "maternelles et primaires", "temps de trajet", "Aucune autre école à moins de 50 km"]) expect(t).toContain(s);
  });
});

describe("libellés des rattachements", () => {
  test("décompte des écoles, accord au pluriel", () => {
    expect(LR.decompte(3, 0)).toBe("3 écoles publiques, 0 privée sous contrat");
    expect(LR.decompte(1, 1)).toBe("1 école publique, 1 privée sous contrat");
    expect(LR.decompte(6, 2)).toBe("6 écoles publiques, 2 privées sous contrat");
  });

  test("secteur d'une école privée sous contrat ; d'une école publique", () => {
    expect(LR.introSecteur(true)).toBe("Située dans le secteur du collège public");
    expect(LR.introSecteur(false)).toBe("Collège de secteur à l'adresse de l'école :");
  });

  test("PIAL du {famille} {nom} : élision, nom sans la famille répétée", () => {
    expect(LR.titrePial("college", "Collège Jules-Verne")).toBe("PIAL du collège Jules-Verne");
    expect(LR.titrePial("lpo", "Lycée polyvalent Clemenceau")).toBe("PIAL du lycée polyvalent Clemenceau");
    expect(LR.titrePial("legt", "Lycée Guist'hau")).toBe("PIAL du lycée général et technologique Lycée Guist'hau");
    expect(LR.titrePial("elementaire", "École élémentaire du Bourg")).toBe("PIAL de l'école élémentaire du Bourg");
    expect(LR.titrePial("erea", "EREA Les Pins")).toBe("PIAL de l'EREA Les Pins");
  });
});

const existe = (chemin: string) => existsSync(join(DIST_TEST, chemin));

describe("pages commune étendues", () => {
  test("une page pour chaque commune d'aujourd'hui qui a ou a eu une école ; aucune pour le code disparu 44999", () => {
    expect(existe("commune/44150/index.html")).toBe(true); // écoles ouvertes
    expect(existe("commune/44903/index.html")).toBe(true); // seulement une école fermée (ancienne commune 44901)
    expect(existe("commune/44999/index.html")).toBe(false);
    expect(existe("commune/44901/index.html")).toBe(false);
    for (const c of ["44150", "44903"]) expect(page("sitemap.xml")).toContain(`/commune/${c}/</loc>`);
  });

  test("Saint-Aubin (44150) : ses écoles, jamais « Plus d'école dans la commune », les écoles fermées de Le Moulin", () => {
    const d = doc("commune/44150");
    const t = texte("commune/44150");
    expect(t).not.toContain("Plus d'école dans la commune");
    // écoles ouvertes de la commune nouvelle non rattachables à leur commune déléguée : rien n'est affirmé pour Le Moulin
    expect(t).not.toContain("Plus d'école à");
    const b = d.querySelector("#ecoles")!;
    expect(propre(b.querySelector("h2")?.textContent)).toBe("Écoles de la commune");
    expect(propre(b.textContent)).toContain("2 écoles publiques, 0 privée sous contrat");
    expect([...b.querySelectorAll("thead th")].map((x) => propre(x.textContent))).toEqual(["École", "Nature", "Secteur", "Élèves 2025", "Classes 2025", "IPS 2024"]);
    const lignes = [...b.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((x) => propre(x.textContent)));
    expect(lignes).toEqual([
      ["École élémentaire du Bourg", "École élémentaire", "Public", "10", "1", "non publié"],
      ["École maternelle des Prés", "École maternelle", "Public", "45", "non publié", "non publié"],
    ]);
    const f = d.querySelector("#ecoles-fermees")!;
    expect(propre(f.querySelector("h2")?.textContent)).toBe("Écoles fermées depuis 2012");
    expect(propre(f.querySelector("h3")?.textContent)).toBe("Le Moulin : écoles fermées");
    expect(propre(f.textContent)).toContain("École élémentaire du Moulin · Fermée le 05/07/2016");
    expect(liens(f)).toEqual(["/etablissement/0440106F/"]);
    expect(d.querySelector("#ecoles-proches")).toBeNull();
  });

  test("évolution des élèves et des classes de la commune ; carte des écoles (plein : public, anneau : privé)", () => {
    const b = doc("commune/44150").querySelector("#ecoles")!;
    const svgs = [...b.querySelectorAll("svg")].map((s) => s.getAttribute("aria-label") ?? "");
    expect(svgs[0]).toStartWith("Élèves : 2014 70, 2015 70, 2019 55,");
    expect(svgs[1]).toStartWith("Carte des écoles : 1 point");
    const nantes = doc("commune/44109").querySelector("#ecoles")!;
    const titres = (s: string) => [...nantes.querySelectorAll(`${s} circle title`)].map((x) => propre(x.textContent));
    expect(titres('g[fill="none"][stroke="var(--pri)"]')).toEqual(["École primaire Sainte-Marie"]); // privée : anneau
    expect(titres('g[fill="var(--pub)"]').sort()).toEqual(["École maternelle Les Lilas", "École primaire des Tilleuls", "École élémentaire Jules-Ferry"]);
  });

  test("commune sans école ouverte (44903) : « Plus d'école dans la commune depuis 2018 », écoles fermées nommées, plus proches depuis le centre", () => {
    const d = doc("commune/44903");
    const t = texte("commune/44903");
    expect(propre(d.querySelector("h1")?.textContent)).toBe("Val-de-l'Erdre");
    expect(t).toContain("Plus d'école dans la commune depuis 2018");
    const f = d.querySelector("#ecoles-fermees")!;
    expect(propre(f.textContent)).toContain("École maternelle des Landes (Les Landes) · Fermée le 06/07/2018");
    expect(f.querySelector("a")).toBeNull(); // pas de fiche pour cette école
    const p = d.querySelector("#ecoles-proches")!;
    expect(propre(p.querySelector("h2")?.textContent)).toBe("Écoles les plus proches");
    const tp = propre(p.textContent);
    expect(tp).toContain("Aucune école à moins de 10 km");
    expect(tp).not.toContain("Aucune autre école");
    expect(tp).toContain("Distances mesurées depuis le centre de la commune.");
    expect(liens(p.querySelector("tbody"))[0]).toBe("/etablissement/0440104D/");
    // pas de collège ni de lycée : ni bloc du second degré, ni « 0 établissements »
    expect(t).not.toContain("établissements");
    expect(t).not.toContain("Privé hors contrat");
  });

  test("commune sans contour (44888) : absence des écoles les plus proches dite, pas de tableau", () => {
    const p = doc("commune/44888").querySelector("#ecoles-proches")!;
    expect(propre(p.querySelector("h2")?.textContent)).toBe("Écoles les plus proches");
    expect(propre(p.querySelector(".na")?.textContent)).toBe("Position de la commune non disponible : écoles les plus proches non calculées");
    expect(p.querySelector("table")).toBeNull();
    expect(texte("commune/44888")).toContain("Plus d'école dans la commune depuis 2020");
  });

  test("courbe de Saint-Aubin : classes non publiées en 2025 (0 classe d'une école), jamais un total partiel", () => {
    const svg = doc("commune/44150").querySelector("#ecoles svg")!;
    expect(svg.getAttribute("aria-label")).toEndWith("non disponible en 2025");
  });

  test("CSV : pas de CSV pour une nouvelle page commune, lien vers celui du département, qui contient les écoles", () => {
    expect(existe("commune/44150/etablissements.csv")).toBe(false);
    expect(existe("commune/44903/etablissements.csv")).toBe(false);
    for (const c of ["44150", "44903"]) {
      expect(doc(`commune/${c}`).querySelector('a[href="/departement/44/etablissements.csv"]')).not.toBeNull();
      expect(doc(`commune/${c}`).querySelector(`a[href="/commune/${c}/etablissements.csv"]`)).toBeNull();
    }
    const dep = page("departement/44/etablissements.csv");
    expect(dep).toContain("0440104D;École élémentaire du Bourg;elementaire;public;Saint-Aubin;");
    expect(dep).not.toContain("0440106F"); // fermée
    expect(dep).toContain("0440202B;École élémentaire Jules-Ferry;elementaire;public;Nantes;REP;196;"); // éducation prioritaire
    // CSV d'une commune du second degré : URL gardée, enrichi des écoles de la commune
    const nantes = page("commune/44109/etablissements.csv");
    expect(nantes).toContain("0440201A;École maternelle Les Lilas;maternelle;public;Nantes;");
    expect(nantes).not.toContain("0440104D");
  });

  test("pages commune du second degré : contenu existant gardé, bloc des écoles ajouté avant les sources", () => {
    const d = doc("commune/44109");
    const ids = [...d.querySelectorAll("main section")].map((s) => s.id);
    expect(ids.slice(-3)).toEqual(["ecoles", "ecoles-fermees", ""]); // puis la section « Sources »
    expect(d.querySelector('a[href="/commune/44109/etablissements.csv"]')).not.toBeNull();
    expect(propre(d.querySelector("#ecoles-fermees")!.textContent)).toContain("École maternelle des Peupliers · Fermée le 05/07/2013");
  });

  test("poids : une nouvelle page commune fait 15 000 octets au plus", () => {
    expect(octets("commune/44150")).toBeLessThanOrEqual(15_000);
    expect(octets("commune/44903")).toBeLessThanOrEqual(15_000);
  });
});
