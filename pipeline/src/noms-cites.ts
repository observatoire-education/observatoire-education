// Noms et communes des établissements fermés que la liste des fermés ne publie pas (appellation ou commune vides) :
// ils viennent des sources chiffrées qui citent l'UAI (IPS, résultats, effectifs et classes des écoles,
// éducation prioritaire). Ces sources écrivent en capitales sans accents : le nom est remis en forme.
import type { Db } from "./db.ts";
import { litteral } from "./duck.ts";

/** Nom affiché quand aucune source ne publie le nom d'un établissement fermé. */
export const NOM_NON_PUBLIE = "Établissement sans nom publié";

/**
 * Sources qui citent un établissement par son nom, par ordre de préférence à millésime égal.
 * `nom` est une liste de colonnes concaténées (dénomination puis patronyme) ; une colonne absente du fichier
 * (anciennes versions, données de test) écarte la source.
 */
const CITATIONS: { id: string; uai: string; millesime: string; nom: string[]; commune: string; code: string }[] = [
  { id: "ips_colleges", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissement"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_colleges_2022", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_colleges_2016", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_lycees", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissement"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_lycees_2022", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_lycees_2016", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_erea", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_erea_2016", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_ecoles", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissement"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ips_ecoles_2016", uai: "uai", millesime: "rentree_scolaire", nom: ["nom_de_l_etablissment"], commune: "nom_de_la_commune", code: "code_insee_de_la_commune" },
  { id: "ivac", uai: "uai", millesime: "session", nom: ["nom_de_l_etablissement"], commune: "commune", code: "" },
  { id: "ival_gt", uai: "uai", millesime: "annee", nom: ["libelle_uai"], commune: "libelle_commune", code: "code_commune" },
  { id: "ival_pro", uai: "uai", millesime: "annee", nom: ["libelle_uai"], commune: "libelle_commune", code: "code_commune" },
  { id: "classes_ecoles", uai: "uai", millesime: "annee", nom: ["libelle_etablissement"], commune: "libelle_commune", code: "insee_commune" },
  { id: "effectifs_ecoles", uai: "numero_ecole", millesime: "rentree_scolaire", nom: ["denomination_principale", "patronyme"], commune: "commune", code: "code_commune_insee" },
  { id: "ecoles_ep", uai: "uai", millesime: "rs", nom: ["typeetabn", "patronyme"], commune: "communen", code: "" },
];

/** Accents perdus par les sources en capitales, et mots de la nature écrits en minuscules après le premier. */
const MOTS: Record<string, string> = {
  lycee: "lycée", college: "collège", ecole: "école", etablissement: "établissement", elementaire: "élémentaire",
  prive: "privé", privee: "privée", general: "général", generale: "générale", regional: "régional",
  adapte: "adapté", metiers: "métiers", ecoles: "écoles", lycees: "lycées", colleges: "collèges",
  primaire: "primaire", maternelle: "maternelle", publique: "publique", public: "public", technologique: "technologique",
  professionnel: "professionnel", polyvalent: "polyvalent", agricole: "agricole", enseignement: "enseignement",
  application: "application", annexe: "annexe", micro: "micro",
};
const PETITS = new Set(["de", "du", "des", "la", "le", "les", "et", "ou", "au", "aux", "en", "sur", "sous", "a"]);
const ELISIONS = new Set(["d", "l"]);

function capitale(m: string): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Un mot en capitales, en minuscules ou avec une capitale initiale, selon sa place. */
function mot(m: string, premier: boolean): string {
  const bas = m.toLowerCase();
  const connu = MOTS[bas] ?? (bas === "a" ? "à" : undefined);
  if (connu !== undefined) return premier ? capitale(connu) : connu;
  if (!premier && PETITS.has(bas)) return bas;
  return bas.split("-").map((p, k) => (k > 0 && MOTS[p] !== undefined ? MOTS[p] : capitale(p))).join("-");
}

/**
 * Nom cité remis en forme : « LYCEE PROFESSIONNEL ARBEZ CARME » → « Lycée professionnel Arbez Carme ».
 * Un nom déjà en casse mixte est gardé tel quel. Le « - » qui tient lieu de patronyme absent est retiré,
 * le « ? » d'un accent mal encodé redevient un E (« MICRO-LYC?E »). Null si rien ne reste.
 */
export function nomCite(brut: string | null | undefined): string | null {
  const t = (brut ?? "").replace(/\s+/g, " ").trim();
  if (t === "") return null;
  const sansTiret = t.replace(/(\s+-)+$/, "").replace(/\s+-\s+/g, " ").trim();
  if (sansTiret === "" || sansTiret === "-") return null;
  if (/[a-zà-ÿ]/.test(sansTiret)) return sansTiret;
  const mots = sansTiret.replaceAll("?", "E").replaceAll("'", " ' ").split(" ").filter((m) => m !== "");
  const sortie: string[] = [];
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i]!;
    const bas = m.toLowerCase();
    // élision : « D ENSEIGNEMENT » ou « D'ENSEIGNEMENT » → « d'enseignement »
    if (ELISIONS.has(bas) && i + 1 < mots.length) {
      const suivant = mots[i + 1] === "'" ? i + 2 : i + 1;
      if (suivant < mots.length) {
        sortie.push(`${sortie.length === 0 ? capitale(bas) : bas}'${mot(mots[suivant]!, false)}`);
        i = suivant;
        continue;
      }
    }
    if (m === "'") continue;
    sortie.push(mot(m, sortie.length === 0));
  }
  return sortie.join(" ");
}

/** Commune citée sans code reconnu : « CHARLEVILLE MEZIERES » → « Charleville Mezieres » (le COG est préféré). */
export function communeCitee(brut: string | null | undefined): string | null {
  const t = (brut ?? "").replace(/\s+/g, " ").trim();
  if (t === "") return null;
  if (/[a-zà-ÿ]/.test(t)) return t;
  return t.split(" ").map((m, i) => (i > 0 && PETITS.has(m.toLowerCase()) ? m.toLowerCase() : m.toLowerCase().split("-").map(capitale).join("-"))).join(" ");
}

/** Nom réduit à la nature (« École primaire publique ») : moins informatif qu'un nom qui porte un patronyme. */
function generique(nom: string): boolean {
  return nom.split(/[\s']+/).every((m) => {
    const bas = m.toLowerCase();
    return bas === "" || bas in MOTS || PETITS.has(bas) || ELISIONS.has(bas) || Object.values(MOTS).includes(bas) || bas === "à";
  });
}

interface Citation { uai: string; rang: number; millesime: number | null; nom: string | null; commune: string | null; code: string | null }

/**
 * Étape de la base : table `noms_cites` (uai, nom, commune, code_commune) pour les fermés sans appellation ou sans
 * commune. Le nom retenu porte un patronyme si une source en donne un, puis vient du millésime le plus récent, puis
 * de la source la mieux classée ; la commune suit la même règle, son libellé vient du COG quand le code y figure.
 */
export async function etapeNomsCites(db: Db): Promise<string> {
  const colonnes = new Map<string, Set<string>>();
  for (const l of await db.sql<{ t: string; c: string }>(
    "select table_name as t, column_name as c from information_schema.columns where table_name like 'src\\_%' escape '\\'",
  )) {
    const s = colonnes.get(l.t) ?? new Set();
    s.add(l.c);
    colonnes.set(l.t, s);
  }
  const ok = (t: string, c: string) => c !== "" && (colonnes.get(t)?.has(c) ?? false);
  const parties = CITATIONS.flatMap((s, rang) => {
    const t = `src_${s.id}`;
    if (!ok(t, s.uai) || !ok(t, s.millesime) || !s.nom.every((c) => ok(t, c))) return [];
    const nom = `concat_ws(' ', ${s.nom.map((c) => `nullif(trim(${c}::varchar), '')`).join(", ")})`;
    const commune = ok(t, s.commune) ? `trim(${s.commune}::varchar)` : "null";
    const code = ok(t, s.code) ? `trim(${s.code}::varchar)` : "null";
    return [`select upper(trim(${s.uai}::varchar)) as uai, ${rang} as rang, rentree(${s.millesime}) as millesime,
      ${nom} as nom, ${commune} as commune, ${code} as code from ${t}`];
  });
  const vide = "create or replace table noms_cites (uai varchar, nom varchar, commune varchar, code_commune varchar);";
  if (parties.length === 0 || !colonnes.has("src_fermes")) return vide;

  const lignes = await db.sql<Citation>(`
    with c as (${parties.join("\nunion all\n")})
    select distinct c.* from c
    join src_fermes f on upper(trim(f.numero_uai)) = c.uai
    where nullif(trim(f.appellation_officielle), '') is null or nullif(trim(f.libelle_commune), '') is null
    order by all`);
  const cog = new Map(
    colonnes.has("src_cog_communes")
      ? (await db.sql<{ com: string; libelle: string }>("select trim(com::varchar) as com, trim(libelle) as libelle from src_cog_communes where typecom = 'COM'"))
          .map((l) => [l.com, l.libelle])
      : [],
  );
  const meilleur = (a: Citation & { generique: boolean }, b: Citation & { generique: boolean }) =>
    Number(a.generique) - Number(b.generique) || (b.millesime ?? 0) - (a.millesime ?? 0) || a.rang - b.rang;
  const parUai = Map.groupBy(
    lignes.map((l) => {
      const nom = nomCite(l.nom);
      return { ...l, nom, generique: nom === null || generique(nom) };
    }),
    (l) => l.uai,
  );
  const retenus = [...parUai].map(([uai, cs]) => {
    const noms = cs.filter((c) => c.nom !== null).sort(meilleur);
    const communes = cs.filter((c) => (c.code !== null && cog.has(c.code)) || communeCitee(c.commune) !== null)
      .sort((a, b) => (b.millesime ?? 0) - (a.millesime ?? 0) || a.rang - b.rang);
    const c = communes[0];
    const code = c?.code !== null && c?.code !== undefined && cog.has(c.code) ? c.code : null;
    return { uai, nom: noms[0]?.nom ?? null, commune: code !== null ? cog.get(code)! : (communeCitee(c?.commune) ?? null), code_commune: code };
  });
  return `create or replace table noms_cites as
    select unnest(from_json(${litteral(JSON.stringify(retenus))}::json,
      '[{"uai":"VARCHAR","nom":"VARCHAR","commune":"VARCHAR","code_commune":"VARCHAR"}]'), recursive := true);
    ${retenus.length === 0 ? vide : ""}`;
}
