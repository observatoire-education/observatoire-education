// Publication hebdomadaire : les données ont-elles changé depuis la dernière publication réussie ?
// Écrit changees=true|false dans $GITHUB_OUTPUT (et sur la sortie standard). Toujours 0 : dans le doute, on publie.
import { appendFileSync, readFileSync } from "node:fs";
import { donneesChangees } from "../pipeline/src/archive.ts";
import { CHEMINS } from "../pipeline/src/cli.ts";
import { type Lanceur, lanceurGh } from "../pipeline/src/depot.ts";

const lanceurGit: Lanceur = async (args) => {
  const p = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, sortie: code === 0 ? out : `${out}${err}`.trim() };
};

export async function verifier(gh: Lanceur, git: Lanceur, courant: string): Promise<boolean> {
  const runs = await gh(["run", "list", "--workflow", "publication.yml", "--branch", "main", "--status", "success", "--limit", "1", "--json", "headSha"]);
  const sha = runs.code === 0 ? (JSON.parse(runs.sortie) as { headSha: string }[])[0]?.headSha : undefined;
  if (!sha) return true;
  const avant = await git(["show", `${sha}:${CHEMINS.manifest}`]);
  return donneesChangees(avant.code === 0 ? avant.sortie : null, courant);
}

if (import.meta.main) {
  const changees = await verifier(lanceurGh, lanceurGit, readFileSync(CHEMINS.manifest, "utf8"));
  console.log(`changees=${changees}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changees=${changees}\n`);
}
