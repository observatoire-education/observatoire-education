// Alertes par issues GitHub, après la collecte ou la publication.
//   bun scripts/alertes.ts sources <lien de l'exécution>
//   bun scripts/alertes.ts publication <ok|echec> <lien de l'exécution>
// Toujours 0 sauf erreur de gh : l'alerte ne doit pas faire échouer la collecte qu'elle signale.
import { existsSync, readFileSync } from "node:fs";
import {
  type Action, type Cle, type Etat, etatPublication, etatsSources, type IssueOuverte,
  LABEL_PUBLICATION, LABEL_SOURCE, lignesDerniereExecution, lireMarqueur, planifier,
} from "../pipeline/src/alertes.ts";
import { Manifest } from "../pipeline/src/archive.ts";
import { CHEMINS, lireConfig } from "../pipeline/src/cli.ts";
import type { LigneJournal } from "../pipeline/src/collect.ts";
import { type Lanceur, lanceurGh } from "../pipeline/src/depot.ts";
import { toutesSources } from "../pipeline/src/sources.ts";

interface IssueGh { number: number; body: string; comments: { body: string }[] }

export async function executerAlertes(
  lancer: Lanceur, depot: string, label: string, etats: Etat[], declarees: Set<Cle>, lien: string,
): Promise<Action[]> {
  const gh = async (args: string[]): Promise<string> => {
    const r = await lancer([...args, "--repo", depot]);
    if (r.code !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} a échoué : ${r.sortie}`);
    return r.sortie;
  };
  await gh(["label", "create", label, "--force"]);
  const issues = JSON.parse(
    await gh(["issue", "list", "--label", label, "--state", "open", "--json", "number,body,comments", "--limit", "200"]),
  ) as IssueGh[];
  const ouvertes: IssueOuverte[] = issues.flatMap((i) => {
    // Le motif courant est celui du dernier marqueur : commentaires d'abord, corps sinon.
    const m = [...i.comments].reverse().map((c) => lireMarqueur(c.body)).find(Boolean) ?? lireMarqueur(i.body);
    return m ? [{ numero: i.number, ...m }] : [];
  });
  const actions = planifier(etats, ouvertes, declarees, lien);
  for (const a of actions) {
    if (a.type === "ouvrir") await gh(["issue", "create", "--title", a.titre, "--body", a.corps, "--label", a.label]);
    else if (a.type === "commenter") await gh(["issue", "comment", String(a.numero), "--body", a.corps]);
    else await gh(["issue", "close", String(a.numero), "--comment", a.commentaire]);
  }
  return actions;
}

function lireJournal(chemin: string): LigneJournal[] {
  if (!existsSync(chemin)) return [];
  return readFileSync(chemin, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LigneJournal);
}

async function principal(args: string[]): Promise<void> {
  const depot = lireConfig().DEPOT;
  let actions: Action[];
  if (args[0] === "sources" && args[1]) {
    const manifest = Manifest.lire(CHEMINS.manifest);
    const sources = toutesSources(manifest);
    const collectes = Object.fromEntries(sources.flatMap((s) => {
      const v = manifest.derniere(s.id);
      return v ? [[s.id, v.collecteLe]] : [];
    }));
    const etats = etatsSources(lignesDerniereExecution(lireJournal(CHEMINS.journal)), sources, collectes, new Date());
    actions = await executerAlertes(lanceurGh, depot, LABEL_SOURCE, etats,
      new Set(sources.map((s) => `source:${s.id}`)), args[1]);
  } else if (args[0] === "publication" && (args[1] === "ok" || args[1] === "echec") && args[2]) {
    actions = await executerAlertes(lanceurGh, depot, LABEL_PUBLICATION, [etatPublication(args[1] === "ok", args[2])],
      new Set(["publication"]), args[2]);
  } else {
    console.error("usage : bun scripts/alertes.ts sources <lien> | publication <ok|echec> <lien>");
    process.exit(2);
  }
  for (const a of actions) console.log(a.type === "ouvrir" ? `ouverte : ${a.titre}` : `${a.type} : issue #${a.numero}`);
  if (!actions.length) console.log("aucune alerte à modifier");
}

if (import.meta.main) await principal(process.argv.slice(2));
