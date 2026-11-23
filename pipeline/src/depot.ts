// Dépôt des archives : GitHub Releases en production, dossier local pour les tests et les essais.
import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { Version } from "./archive.ts";

export interface Depot {
  /** Publie `fichier` sous `tag` et renvoie son URL permanente. */
  publier(tag: string, fichier: string): Promise<string>;
  /** Récupère une version archivée vers `dest`. */
  recuperer(v: Version, dest: string): Promise<void>;
}

export class DepotLocal implements Depot {
  constructor(readonly dossier: string) {}

  async publier(tag: string, fichier: string): Promise<string> {
    const cible = resolve(this.dossier, tag, basename(fichier));
    await mkdir(dirname(cible), { recursive: true });
    await copyFile(fichier, cible);
    return cible;
  }

  async recuperer(v: Version, dest: string): Promise<void> {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(this.dossier, v.tag, v.fichier), dest);
  }
}

/** Exécute `gh` ; injectable pour les tests. */
export type Lanceur = (args: string[]) => Promise<{ code: number; sortie: string }>;

export const lanceurGh: Lanceur = async (args) => {
  const p = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, sortie: `${out}${err}`.trim() };
};

/** Archives en fichiers joints de GitHub Releases. Le jeton vient de l'environnement (GH_TOKEN). */
export class DepotGithub implements Depot {
  constructor(
    readonly depot: string,
    private readonly lancer: Lanceur = lanceurGh,
  ) {}

  private async gh(args: string[], quoi: string): Promise<void> {
    const r = await this.lancer([...args, "--repo", this.depot]);
    if (r.code !== 0) throw new Error(`gh ${quoi} a échoué : ${r.sortie}`);
  }

  async publier(tag: string, fichier: string): Promise<string> {
    const vue = await this.lancer(["release", "view", tag, "--repo", this.depot]);
    if (vue.code !== 0) {
      await this.gh(
        ["release", "create", tag, "--title", tag, "--latest=false",
          "--notes", "Archives des versions collectées de cette source (Licence Ouverte 2.0)."],
        "release create",
      );
    }
    await this.gh(["release", "upload", tag, fichier, "--clobber"], "release upload");
    return `https://github.com/${this.depot}/releases/download/${tag}/${basename(fichier)}`;
  }

  async recuperer(v: Version, dest: string): Promise<void> {
    await mkdir(dirname(dest), { recursive: true });
    await this.gh(["release", "download", v.tag, "--pattern", v.fichier, "--output", dest, "--clobber"], "release download");
  }
}
