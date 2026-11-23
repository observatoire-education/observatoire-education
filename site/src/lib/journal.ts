// Journal de collecte (archives/journal.jsonl à la racine du dépôt, ou OBS_JOURNAL) : exécutions récentes.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Execution {
  date: string;
  actions: Record<string, number>;
  details: { source: string; action: string; motif?: string }[];
}

export function executionsRecentes(n = 14): Execution[] {
  const chemin = process.env.OBS_JOURNAL ?? resolve(process.cwd(), "..", "archives", "journal.jsonl");
  if (!existsSync(chemin)) return [];
  const lignes = readFileSync(chemin, "utf8").trim().split("\n").filter(Boolean)
    .map((l) => JSON.parse(l) as { date: string; source: string; action: string; motif?: string });
  const parDate = Map.groupBy(lignes, (l) => l.date);
  return [...parDate.keys()].sort().reverse().slice(0, n).map((date) => {
    const d = parDate.get(date)!;
    const actions: Record<string, number> = {};
    for (const l of d) actions[l.action] = (actions[l.action] ?? 0) + 1;
    return { date, actions, details: d.map(({ source, action, motif }) => ({ source, action, motif })) };
  });
}
