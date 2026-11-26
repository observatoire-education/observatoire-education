// Alertes par issues GitHub : décisions pures (journal de collecte, issues ouvertes → actions).
// L'exécution avec gh est dans scripts/alertes.ts.
import type { SourceId } from "@obs/shared/types";
import type { LigneJournal } from "./collect.ts";
import type { Source } from "./sources.ts";

/** Une source à collecte locale est signalée au-delà de ce délai sans collecte manuelle. */
export const DELAI_COLLECTE_LOCALE_JOURS = 90;
export const LABEL_SOURCE = "alerte-source";
export const LABEL_PUBLICATION = "alerte-publication";

/** "source:<id>" ou "publication" */
export type Cle = string;
export interface Etat { cle: Cle; enEchec: boolean; motif?: string }
export interface IssueOuverte { numero: number; cle: Cle; motif: string }
export type Action =
  | { type: "ouvrir"; cle: Cle; label: string; titre: string; corps: string }
  /** Le corps porte le nouveau marqueur. */
  | { type: "commenter"; numero: number; corps: string }
  | { type: "fermer"; numero: number; commentaire: string };

const RAPPEL_LOCAL = "lancer bun run collect depuis un poste";
const JOUR_MS = 86_400_000;

/** Lignes de la dernière exécution : toutes celles d'une collecte portent la même date. */
export function lignesDerniereExecution(journal: LigneJournal[]): LigneJournal[] {
  const derniere = journal.reduce((max, l) => (l.date > max ? l.date : max), "");
  return journal.filter((l) => l.date === derniere);
}

export function etatsSources(
  lignes: LigneJournal[],
  sources: Pick<Source, "id" | "collecteLocale">[],
  dernieresCollectes: Partial<Record<SourceId, string>>,
  maintenant: Date,
): Etat[] {
  const locales = new Set(sources.filter((s) => s.collecteLocale).map((s) => s.id));
  return [...Map.groupBy(lignes, (l) => l.source)].map(([id, ls]): Etat => {
    const cle = `source:${id}`;
    if (locales.has(id) && ls.some((l) => l.action === "local")) {
      const date = dernieresCollectes[id];
      if (!date) return { cle, enEchec: true, motif: `aucune collecte manuelle : ${RAPPEL_LOCAL}` };
      const jours = Math.floor((maintenant.getTime() - new Date(date).getTime()) / JOUR_MS);
      if (jours <= DELAI_COLLECTE_LOCALE_JOURS) return { cle, enEchec: false };
      // Pas le nombre de jours : il change chaque nuit et commenterait l'issue chaque nuit.
      return { cle, enEchec: true, motif: `dernière collecte manuelle le ${date.slice(0, 10)}, plus de ${DELAI_COLLECTE_LOCALE_JOURS} jours : ${RAPPEL_LOCAL}` };
    }
    const echecs = ls.filter((l) => l.action === "rejete" || l.action === "erreur");
    if (!echecs.length) return { cle, enEchec: false };
    return { cle, enEchec: true, motif: echecs.map((l) => l.motif ?? l.action).join(" ; ") };
  });
}

export function etatPublication(reussie: boolean, lien: string): Etat {
  return reussie ? { cle: "publication", enEchec: false } : { cle: "publication", enEchec: true, motif: `publication en échec : ${lien}` };
}

const titre = (cle: Cle) => (cle === "publication" ? "Publication en échec" : `Source ${cle.slice("source:".length)} : collecte en échec`);
const corps = (cle: Cle, motif: string, lien: string) => `${motif}\n\nExécution : ${lien}\n\n${marqueur(cle, motif)}`;

export function planifier(etats: Etat[], ouvertes: IssueOuverte[], declarees: Set<Cle>, lien: string): Action[] {
  const actions: Action[] = [];
  const parCle = new Map(ouvertes.map((i) => [i.cle, i]));
  for (const e of etats) {
    const issue = parCle.get(e.cle);
    if (e.enEchec) {
      const motif = e.motif ?? "échec";
      if (!issue) {
        actions.push({
          type: "ouvrir", cle: e.cle, label: e.cle === "publication" ? LABEL_PUBLICATION : LABEL_SOURCE,
          titre: titre(e.cle), corps: corps(e.cle, motif, lien),
        });
      } else if (issue.motif !== motif) actions.push({ type: "commenter", numero: issue.numero, corps: corps(e.cle, motif, lien) });
    } else if (issue) actions.push({ type: "fermer", numero: issue.numero, commentaire: `Revenu à la normale : ${lien}` });
  }
  // Une clé en échec cette nuit n'est pas « retirée », même absente des sources déclarées : l'exercice budget
  // suivant, non découvert (API en panne, plusieurs jeux), serait sinon fermé puis rouvert une nuit sur deux.
  const enEchec = new Set(etats.filter((e) => e.enEchec).map((e) => e.cle));
  for (const i of ouvertes) {
    if (!declarees.has(i.cle) && !enEchec.has(i.cle)) actions.push({ type: "fermer", numero: i.numero, commentaire: "source retirée du code" });
  }
  return actions;
}

// JSON dans un commentaire HTML : « -- » est échappé pour que le motif ne puisse pas le refermer.
export function marqueur(cle: Cle, motif: string): string {
  return `<!-- alerte ${JSON.stringify({ cle, motif }).replaceAll("--", "\\u002d\\u002d")} -->`;
}

export function lireMarqueur(texte: string): { cle: Cle; motif: string } | null {
  const trouves = [...texte.matchAll(/<!-- alerte (\{.*?\}) -->/g)];
  const dernier = trouves.at(-1);
  if (!dernier) return null;
  try {
    const { cle, motif } = JSON.parse(dernier[1]!) as { cle: unknown; motif: unknown };
    return typeof cle === "string" && typeof motif === "string" ? { cle, motif } : null;
  } catch {
    return null;
  }
}
