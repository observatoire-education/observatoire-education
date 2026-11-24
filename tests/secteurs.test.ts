import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ouvrir } from "../pipeline/src/db.ts";
import { connexion, executer, litteral } from "../pipeline/src/duck.ts";
import { calculerSecteurs, normaliserAdresse, normaliserVoie, type RapportSecteurs } from "../pipeline/src/secteurs.ts";
import { cheminsFixtures, dbTest, FIXTURES } from "./aide.ts";

const rapport: RapportSecteurs = { sansFiche: 0, ecolesSansFiche: 0, communesDeuxCartes: 0 };
const secteurs = await calculerSecteurs(await dbTest(), rapport);

const JULES_VERNE = { uai: "0440001A", nom: "Collège Jules-Verne", fermeLe: null };
const SAINT_EXEMPLE = { uai: "0440002B", nom: "Collège Saint-Exemple", fermeLe: null };
const SANS_GPS = { uai: "0440005E", nom: "Collège Sans GPS", fermeLe: null };

/**
 * Base des fixtures où quelques écoles de l'annuaire changent d'adresse ou de commune, et où la carte scolaire
 * reçoit des lignes de plus (au format de tests/fixtures/carte_scolaire.csv).
 */
async function dbModifiee(annuaire: Record<string, Record<string, string>>, carte: string[] = []) {
  const dossier = await mkdtemp(join(tmpdir(), "obs-secteurs-"));
  const chemins = await cheminsFixtures(dossier);
  const duck = await connexion();
  const colonnes = [...new Set(Object.values(annuaire).flatMap(Object.keys))];
  const exprs = colonnes.map((c) => {
    const cas = Object.entries(annuaire)
      .filter(([, r]) => c in r)
      .map(([uai, r]) => `when identifiant_de_l_etablissement = ${litteral(uai)} then ${litteral(r[c]!)}`)
      .join(" ");
    return `case ${cas} else "${c}" end as "${c}"`;
  });
  const annuaireModifie = join(dossier, "annuaire.modifie.parquet");
  await executer(
    duck,
    `copy (select * replace (${exprs.join(", ")}) from read_parquet(${litteral(chemins.annuaire)}))
     to ${litteral(annuaireModifie)} (format parquet)`,
  );
  const csv = join(dossier, "carte_scolaire.csv");
  await writeFile(csv, `${(await readFile(join(FIXTURES, "carte_scolaire.csv"), "utf8")).trimEnd()}\n${carte.join("\n")}\n`);
  const carteModifiee = join(dossier, "carte_scolaire.modifiee.parquet");
  await executer(
    duck,
    `copy (select * from read_csv(${litteral(csv)}, header = true, all_varchar = true)) to ${litteral(carteModifiee)} (format parquet)`,
  );
  duck.closeSync();
  return ouvrir({ ...chemins, annuaire: annuaireModifie, carte_scolaire: carteModifiee });
}

describe("normalisation des adresses", () => {
  test("numéro, indice de répétition et voie", () => {
    expect(normaliserAdresse("3 bis rue Jules Ferry")).toEqual({ numero: 3, indice: "B", voie: "RUE JULES FERRY" });
    expect(normaliserAdresse("12 rue des Lilas")).toEqual({ numero: 12, indice: null, voie: "RUE LILAS" });
    expect(normaliserAdresse("5 ter, av. de l'Église")).toEqual({ numero: 5, indice: "T", voie: "AVENUE EGLISE" });
    expect(normaliserAdresse("8B rue du Port")).toEqual({ numero: 8, indice: "B", voie: "RUE PORT" });
    // « TER » n'est un indice que s'il forme un mot
    expect(normaliserAdresse("3 Terrasse des Pins")).toEqual({ numero: 3, indice: null, voie: "TERRASSE PINS" });
  });

  test("sans numéro, ou sans voie", () => {
    expect(normaliserAdresse("Lieu-dit Le Bourg")).toMatchObject({ numero: null, indice: null, voie: "LIEU DIT BOURG" });
    expect(normaliserAdresse("rue des Lilas")).toEqual({ numero: null, indice: null, voie: "RUE LILAS" });
    expect(normaliserAdresse("BP 12")).toMatchObject({ voie: null });
    expect(normaliserAdresse("12")).toEqual({ numero: 12, indice: null, voie: null });
    expect(normaliserAdresse("")).toEqual({ numero: null, indice: null, voie: null });
  });

  test("voie : accents, ponctuation, articles, espaces et abréviations", () => {
    expect(normaliserVoie("Rue de l'Église")).toBe("RUE EGLISE");
    expect(normaliserVoie("RUE DE L EGLISE")).toBe("RUE EGLISE");
    expect(normaliserVoie("  avenue   Flandre-Dunkerque ")).toBe("AVENUE FLANDRE DUNKERQUE");
    expect(normaliserVoie("Rue Sœur Emmanuelle")).toBe("RUE SOEUR EMMANUELLE");
    expect(normaliserVoie("R. Jules Ferry")).toBe("RUE JULES FERRY");
    expect(normaliserVoie("AV du 11 Novembre")).toBe("AVENUE 11 NOVEMBRE");
    expect(normaliserVoie("Bd Victor Hugo")).toBe("BOULEVARD VICTOR HUGO");
    expect(normaliserVoie("PL. de la Mairie")).toBe("PLACE MAIRIE");
    expect(normaliserVoie("Che des Prés")).toBe("CHEMIN PRES");
    expect(normaliserVoie("Imp. des Lilas")).toBe("IMPASSE LILAS");
    expect(normaliserVoie("All. des Pins")).toBe("ALLEE PINS");
    expect(normaliserVoie("LD La Noé")).toBe("LIEU DIT NOE");
    expect(normaliserVoie("Route de St-Paul")).toBe("ROUTE SAINT PAUL");
    // une abréviation du type de voie n'est développée qu'en tête : « R » ailleurs est une initiale
    expect(normaliserVoie("Rue R Schuman")).toBe("RUE R SCHUMAN");
    expect(normaliserVoie("RUE FRANCOIS VILLON")).toBe("RUE FRANCOIS VILLON");
  });
});

describe("collège de secteur à l'adresse de l'école", () => {
  test("commune entièrement rattachée", () => {
    expect(secteurs.get("0440104D")).toEqual({ statut: "commune", colleges: [JULES_VERNE] });
  });

  test("commune découpée : voie, numéro et parité", () => {
    expect(secteurs.get("0440201A")).toEqual({ statut: "voie", colleges: [JULES_VERNE] }); // 12, pair
    // 3 bis rue Jules Ferry : un tronçon sur toute la voie, pairs et impairs
    expect(secteurs.get("0440202B")).toEqual({ statut: "voie", colleges: [SAINT_EXEMPLE] });
  });

  test("adresse sans numéro dans une commune découpée : non rapprochée", () => {
    expect(secteurs.get("0440203C")).toEqual({ statut: "non_rapproche", colleges: [] });
  });

  test("secteur multi-collèges : tous les collèges, triés par nom", () => {
    expect(secteurs.get("0440108H")).toEqual({ statut: "voie", colleges: [SAINT_EXEMPLE, SANS_GPS] });
    expect(rapport).toEqual({ sansFiche: 0, ecolesSansFiche: 0, communesDeuxCartes: 0 });
  });

  test("écoles ouvertes seulement", () => {
    expect(secteurs.has("0440001A")).toBe(false);
    expect(secteurs.has("0440106F")).toBe(false); // école fermée
    expect([...secteurs.keys()].sort()).toEqual(["0350201R", "0440104D", "0440105E", "0440108H", "0440201A", "0440202B", "0440203C"]);
  });

  test("numéro impair, département absent de la carte, commune absente d'un département publié, ambiguïtés", async () => {
    const entete = "044,LOIRE-ATLANTIQUE,44109,NANTES";
    const db = await dbModifiee(
      {
        "0440201A": { adresse_1: "13 rue des Lilas" },
        "0440202B": { code_commune: "49007", code_departement: "049" },
        "0440104D": { code_commune: "44999" },
        // voies que seuls les articles séparent, vers deux collèges différents
        "0440203C": { adresse_1: "7 rue du Port" },
        // même voie dans deux lieux-dits (commune nouvelle) ; le numéro n'est couvert qu'à Chantenay :
        // l'adresse ne dit pas le lieu-dit, choisir Chantenay serait une supposition
        "0440105E": { adresse_1: "4 rue des Écoles", code_commune: "44109" },
        // indices de répétition différents à la borne du tronçon : indéterminé
        "0440108H": { adresse_1: "41 ter rue des Tilleuls" },
      },
      [
        `${entete},,RUE DU PORT,1.0,,99.0,,PI,0440001A,N`,
        `${entete},,RUE DE PORT,1.0,,99.0,,PI,0440005E,N`,
        `${entete},CHANTENAY,RUE DES ECOLES,1.0,,99.0,,PI,0440001A,N`,
        `${entete},DOULON,RUE DES ECOLES,1.0,,3.0,,PI,0440002B,N`,
        `${entete},,RUE DES TILLEULS,41.0,B,9999.0,,PI,0440001A,N`,
      ],
    );
    const s = await calculerSecteurs(db);
    db.fermer();
    expect(s.get("0440201A")).toEqual({ statut: "voie", colleges: [SAINT_EXEMPLE] });
    expect(s.get("0440202B")).toEqual({ statut: "carte_non_publiee", colleges: [] });
    expect(s.get("0440104D")).toEqual({ statut: "non_rapproche", colleges: [] });
    expect(s.get("0440203C")).toEqual({ statut: "non_rapproche", colleges: [] });
    expect(s.get("0440105E")).toEqual({ statut: "non_rapproche", colleges: [] });
    expect(s.get("0440108H")).toEqual({ statut: "non_rapproche", colleges: [] });
  });

  test("adresse sans numéro : rapprochée quand la voie est couverte en entier et mène aux mêmes collèges", async () => {
    const r: RapportSecteurs = { sansFiche: 0, ecolesSansFiche: 0, communesDeuxCartes: 0 };
    const db = await dbModifiee(
      {
        "0440203C": { adresse_1: "rue Jules Ferry" }, // un seul tronçon, 1 à 9999
        "0440108H": { adresse_1: "rue des Tilleuls" }, // secteur multi-collèges sur toute la voie
        "0440105E": { adresse_1: "rue des Écoles", code_commune: "44109" }, // deux lieux-dits, deux collèges
        "0440201A": { adresse_1: "rue des Cerisiers" }, // un seul tronçon, 1 à 99 : voie couverte en partie
        "0440202B": { adresse_1: "rue des Peupliers" }, // pairs couverts jusqu'au bout, impairs avec un trou
      },
      [
        "044,LOIRE-ATLANTIQUE,44109,NANTES,CHANTENAY,RUE DES ECOLES,1.0,,99.0,,PI,0440001A,N",
        "044,LOIRE-ATLANTIQUE,44109,NANTES,DOULON,RUE DES ECOLES,1.0,,99.0,,PI,0440002B,N",
        "044,LOIRE-ATLANTIQUE,44109,NANTES,,RUE DES CERISIERS,1.0,,99.0,,PI,0440001A,N",
        "044,LOIRE-ATLANTIQUE,44109,NANTES,,RUE DES PEUPLIERS,2.0,,9998.0,,P,0440001A,N",
        "044,LOIRE-ATLANTIQUE,44109,NANTES,,RUE DES PEUPLIERS,1.0,,41.0,,I,0440001A,N",
        "044,LOIRE-ATLANTIQUE,44109,NANTES,,RUE DES PEUPLIERS,45.0,,9999.0,,I,0440001A,N",
      ],
    );
    const s = await calculerSecteurs(db, r);
    db.fermer();
    expect(s.get("0440203C")).toEqual({ statut: "voie", colleges: [SAINT_EXEMPLE] });
    expect(s.get("0440108H")).toEqual({ statut: "voie", colleges: [SAINT_EXEMPLE, SANS_GPS] });
    expect(s.get("0440105E")).toEqual({ statut: "non_rapproche", colleges: [] });
    expect(s.get("0440201A")).toEqual({ statut: "non_rapproche", colleges: [] });
    expect(s.get("0440202B")).toEqual({ statut: "non_rapproche", colleges: [] });
    // rue des Lilas, découpée par parité entre deux collèges : toujours non rapprochée (base des fixtures)
    expect(secteurs.get("0440203C")).toEqual({ statut: "non_rapproche", colleges: [] });
  });

  test("un collège du secteur sans fiche : aucune liste partielle, l'école est non rapprochée et comptée", async () => {
    const r: RapportSecteurs = { sansFiche: 0, ecolesSansFiche: 0, communesDeuxCartes: 0 };
    const db = await dbModifiee(
      { "0440201A": { adresse_1: "2 rue des Acacias" } },
      [
        "044,LOIRE-ATLANTIQUE,44109,NANTES,,RUE DES ACACIAS,1.0,,9999.0,,PI,0440001A,N",
        "044,LOIRE-ATLANTIQUE,44109,NANTES,,RUE DES ACACIAS,1.0,,9999.0,,PI,0449998X,N",
        // Nantes aussi dans la carte d'un autre département : ses lignes sont réunies à celles de la Loire-Atlantique
        "049,MAINE-ET-LOIRE,44109,NANTES,,RUE DES BORDS,1.0,,9999.0,,PI,0440001A,N",
      ],
    );
    const s = await calculerSecteurs(db, r);
    db.fermer();
    expect(s.get("0440201A")).toEqual({ statut: "non_rapproche", colleges: [] });
    expect(r).toEqual({ sansFiche: 1, ecolesSansFiche: 1, communesDeuxCartes: 1 });
  });
});
