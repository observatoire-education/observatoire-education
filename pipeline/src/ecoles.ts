// Classes des écoles : série des élèves et des classes, typologie de la dernière rentrée (tables de 08_ecoles.sql).
import type { Classes, SourceId, TypeClasses } from "@obs/shared/types";
import type { Db } from "./db.ts";
import { SOURCES } from "./sources.ts";

/** Ordre des niveaux pour trier les types de classes : « Preel » d'abord, puis CP à CM2. */
const ORDRE_NIVEAUX = ["PREEL", "CP", "CE1", "CE2", "CM1", "CM2"];
const rangNiveau = (libelle: string): number => {
  const i = ORDRE_NIVEAUX.indexOf(libelle.split("-")[0]!.trim().toUpperCase());
  return i === -1 ? ORDRE_NIVEAUX.length : i;
};

/** Classes à un niveau, puis à plusieurs niveaux ; à nombre égal, dans l'ordre du premier niveau. */
function trierTypes(types: TypeClasses[]): TypeClasses[] {
  return types.sort(
    (a, b) => a.niveaux - b.niveaux || rangNiveau(a.libelle) - rangNiveau(b.libelle) || a.libelle.localeCompare(b.libelle),
  );
}

/** Ordre des sources dans le registre. */
const ordreSource = (s: SourceId) => Object.keys(SOURCES).indexOf(s);

/** Classes de chaque école qui a une fiche et au moins une rentrée d'effectifs ou de l'éducation prioritaire. */
export async function calculerClasses(db: Db): Promise<Map<string, Classes>> {
  const series = Map.groupBy(
    await db.sql<{ uai: string; rentree: number; eleves: number | null; classes: number | null; source: SourceId }>(
      "select uai, rentree, eleves, classes, source from classes_historique order by uai, rentree",
    ),
    (l) => l.uai,
  );
  const types = Map.groupBy(
    await db.sql<TypeClasses & { uai: string; rentree: number }>(
      "select uai, rentree, libelle, niveaux, classes from classes_types",
    ),
    (t) => `${t.uai}|${t.rentree}`,
  );

  const resultat = new Map<string, Classes>();
  for (const [uai, serie] of series) {
    const derniere = serie.at(-1)!;
    const typesRentree = types.get(`${uai}|${derniere.rentree}`);
    const sources = new Set<SourceId>(serie.map((l) => l.source));
    if (typesRentree) sources.add("classes_ecoles");
    const c: Classes = {
      rentree: derniere.rentree,
      total: derniere.classes,
      historique: serie.map((l) => [l.rentree, l.eleves, l.classes]),
      types: typesRentree ? trierTypes(typesRentree.map(({ libelle, niveaux, classes }) => ({ libelle, niveaux, classes }))) : null,
      source: [...sources].sort((a, b) => ordreSource(a) - ordreSource(b)),
    };
    if (serie.some((l) => l.source !== derniere.source)) c.sourcesHistorique = serie.map((l) => l.source);
    resultat.set(uai, c);
  }
  return resultat;
}
