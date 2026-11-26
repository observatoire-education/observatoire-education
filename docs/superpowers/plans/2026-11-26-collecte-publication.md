# Collecte et publication séparées : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** remplacer `nightly.yml` par une collecte quotidienne qui alerte par issues GitHub, et par une publication lancée à chaque push et chaque lundi (seulement si les données ont changé).

**Architecture :** la logique de décision est écrite en fonctions pures et testées. Il y en a trois : les états des sources tirés du journal, le plan d'actions sur les issues, et le changement utile du manifeste. Deux scripts minces les exécutent avec `gh` (le type `Lanceur` existe déjà dans `depot.ts`). La CLI de collecte gagne une option `--manquantes`. Les workflows ne font qu'enchaîner ces commandes.

**Pile technique :** Bun 1.4.5, TypeScript, `bun:test`, GitHub Actions, CLI `gh`, `actionlint`.

**Spec :** `docs/superpowers/specs/2026-11-26-nightly-design.md`

## Contraintes globales

- Collecte : `schedule` quotidien à `17 2 * * *`, plus `workflow_dispatch`. Elle reste verte même si une source est rejetée.
- Publication : `push` sur `main`, `schedule` hebdomadaire le lundi après la collecte (`17 3 * * 1`), plus `workflow_dispatch`. Sur le déclencheur `schedule`, on ne publie que si le contenu utile du manifeste a changé depuis la dernière publication réussie.
- Une source à collecte locale déclenche une alerte quand sa dernière collecte a **plus de 90 jours**.
- Une source en échec n'a qu'une seule issue. On n'y ajoute un commentaire que si le motif change.
- `concurrency: deploiement` (sans annulation) est conservé pour la publication.
- Le job `deployer` est repris tel quel, avec `bunx wrangler@4.159.0 deploy`.
- Les textes des issues et des messages sont en français.

## Points d'attention pour la relecture

1. **Plusieurs lignes de journal pour une même source dans une exécution** : par exemple `telecharge` suivie d'une `erreur` (millésime périmé, ou comparaison en `suite`). La source est en échec et les motifs sont joints par « ; ». Testé à la tâche 2.
2. **Le journal contient des exécutions plus anciennes**, y compris des collectes manuelles faites sur un poste. Seules les lignes portant la `date` la plus récente comptent. Testé à la tâche 2.
3. **Une issue existe déjà pour une source qui n'est plus déclarée** : elle est fermée, même si aucune ligne ne la concerne. Testé à la tâche 2.
4. **Le manifeste ne change que dans `vus`**, parce que la date de l'annuaire bouge chaque jour. Ce n'est pas un changement utile, donc il n'y a pas de publication le lundi. Testé à la tâche 4.
5. **Aucune publication réussie auparavant**, ou commit introuvable : on publie. Testé à la tâche 4.

---

### Task 1: collecte des sources manquantes

**Fichiers :**
- Modifier : `pipeline/src/collect.ts` (ajouter le champ `manquantes` à `OptionsCollecte` et le filtrer dans la boucle de `collecter`)
- Modifier : `pipeline/src/cli.ts` (commande `collect --manquantes`, code de sortie)
- Test : `tests/collect.test.ts`

**Interfaces :**
- Produit : `OptionsCollecte.manquantes?: boolean`. À `true`, seules les sources de `toutesSources(manifest)` sans `manifest.derniere(id)` sont traitées. Les autres n'écrivent aucune ligne de journal.
- Produit : `sourcesSansVersion(manifest: Manifest): SourceId[]`, exportée par `collect.ts`.
- Produit : `bun pipeline/src/cli.ts collect --manquantes` affiche le journal comme `collect`. Elle sort en **1** si `sourcesSansVersion` n'est pas vide après la collecte, avec la ligne `source sans version archivée : <id> (<motif de la dernière ligne de journal>)` pour chacune. Sinon elle sort en 0. `collect` sans option garde son comportement (toujours 0).

- [ ] **Étape 1 : écrire les tests qui échouent**, dans le `describe("collecte")` de `tests/collect.test.ts` et avec les fabriques existantes (`fauxClient`, `DepotLocal`) :
  - `test("--manquantes : seules les sources sans version sont collectées")`. Partir d'un manifeste où `annuaire` est déjà archivée. Après `collecter({ ..., manquantes: true })`, `fauxClient().telechargements` ne contient pas `annuaire`, le journal n'a aucune ligne `annuaire`, et `sourcesSansVersion(manifest)` est vide.
  - `test("--manquantes : une source locale reste sans version sur serveur")`. Avec `distante: true`, la source `collecteLocale` donne une ligne `local` et apparaît dans `sourcesSansVersion(manifest)`.
- [ ] **Étape 2 : lancer `bun test tests/collect.test.ts`.** Attendu : échec (`manquantes` ignorée, `sourcesSansVersion` non exportée).
- [ ] **Étape 3 : implémenter** `manquantes` et `sourcesSansVersion` dans `collect.ts`, puis l'option et le code de sortie dans `cli.ts`. Lire `process.argv.includes("--manquantes")`, et mettre à jour le message d'usage en `collect [--manquantes] | data`.
- [ ] **Étape 4 : lancer `bun test tests/collect.test.ts && bun run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(collecte): option --manquantes pour ne collecter que les sources sans version`

### Task 2: logique des alertes (fonctions pures)

**Fichiers :**
- Créer : `pipeline/src/alertes.ts`
- Test : `tests/alertes.test.ts`

**Interfaces :**
- Consomme : `LigneJournal` (`collect.ts`), `Source` (`sources.ts`), `SourceId`.
- Produit :

```ts
export const DELAI_COLLECTE_LOCALE_JOURS = 90;
export const LABEL_SOURCE = "alerte-source";
export const LABEL_PUBLICATION = "alerte-publication";
/** "source:<id>" ou "publication" */
export type Cle = string;
export interface Etat { cle: Cle; enEchec: boolean; motif?: string }
export interface IssueOuverte { numero: number; cle: Cle; motif: string }
export type Action =
  | { type: "ouvrir"; cle: Cle; label: string; titre: string; corps: string }
  | { type: "commenter"; numero: number; corps: string }   // le corps porte le nouveau marqueur
  | { type: "fermer"; numero: number; commentaire: string };

export function lignesDerniereExecution(journal: LigneJournal[]): LigneJournal[];
export function etatsSources(
  lignes: LigneJournal[],
  sources: Pick<Source, "id" | "collecteLocale">[],
  dernieresCollectes: Partial<Record<SourceId, string>>, // collecteLe de manifest.derniere(id)
  maintenant: Date,
): Etat[];
export function etatPublication(reussie: boolean, lien: string): Etat;
/** declarees : clés encore valides. Une issue ouverte hors de cet ensemble est fermée. */
export function planifier(etats: Etat[], ouvertes: IssueOuverte[], declarees: Set<Cle>, lien: string): Action[];
export function marqueur(cle: Cle, motif: string): string;           // "<!-- alerte {\"cle\":…,\"motif\":…} -->"
export function lireMarqueur(texte: string): { cle: Cle; motif: string } | null; // dernier marqueur trouvé
```

Règles que les tests figent :
- `etatsSources` ne produit un état que pour les sources présentes dans `lignes`. Une source est en échec si l'une de ses lignes est `rejete` ou `erreur`, et son motif joint les motifs par « ; ». Pour une ligne `local` : la source est en échec si `dernieresCollectes[id]` est absente ou si elle a plus de `DELAI_COLLECTE_LOCALE_JOURS`. Le motif est alors `dernière collecte manuelle le AAAA-MM-JJ, il y a N jours : lancer bun run collect depuis un poste`, ou `aucune collecte manuelle : …` si la date manque.
- `planifier` :
  - en échec sans issue : `ouvrir`. Le titre est `Source <id> : collecte en échec`, ou `Publication en échec` pour la publication. Le corps contient le motif, le `lien` et `marqueur(cle, motif)` ;
  - en échec avec une issue au même motif : rien ;
  - en échec avec une issue au motif différent : `commenter` ;
  - réussie avec une issue ouverte : `fermer` ;
  - issue ouverte dont la clé n'est pas dans `declarees` : `fermer`, avec le commentaire `source retirée du code`.
  - Une clé sans état ne change rien.

- [ ] **Étape 1 : écrire les tests qui échouent** dans `tests/alertes.test.ts`. Un test par règle :
  - `lignesDerniereExecution` garde seulement la date maximale ;
  - `telecharge` puis `erreur` donne un échec aux motifs joints ;
  - `local` à 89 jours n'est pas en échec, `local` à 91 jours l'est (avec `maintenant = new Date("2026-11-26T02:17:00Z")`) ;
  - `local` sans collecte est en échec ;
  - chacun des cinq cas de `planifier` ;
  - `lireMarqueur(marqueur(cle, motif))` rend la paire d'origine, même quand le motif contient `-->` ou des guillemets (encodage JSON).
- [ ] **Étape 2 : lancer `bun test tests/alertes.test.ts`.** Attendu : échec (module absent).
- [ ] **Étape 3 : implémenter** `pipeline/src/alertes.ts` avec ces signatures. Dans le marqueur, remplacer `--` par `--` dans le JSON, pour que `-->` ne puisse pas fermer le commentaire HTML.
- [ ] **Étape 4 : lancer `bun test tests/alertes.test.ts && bun run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(alertes): plan d'actions sur les issues à partir du journal de collecte`

### Task 3: exécution des alertes avec `gh`

**Fichiers :**
- Créer : `scripts/alertes.ts`
- Test : `tests/alertes-gh.test.ts`

**Interfaces :**
- Consomme : la tâche 2 entière, plus `Lanceur` et `lanceurGh` (`pipeline/src/depot.ts`), `Manifest`, `toutesSources`, `CHEMINS` et `lireConfig` (`cli.ts`).
- Produit : `executerAlertes(lancer: Lanceur, depot: string, label: string, etats: Etat[], declarees: Set<Cle>, lien: string): Promise<Action[]>`. Elle :
  1. crée le label (`gh label create <label> --force`) ;
  2. liste les issues ouvertes (`gh issue list --label <label> --state open --json number,body,comments --limit 200`) et prend le motif courant au dernier marqueur, dans les commentaires puis dans le corps ;
  3. applique `planifier` (`gh issue create --title --body --label`, `gh issue comment <n> --body`, `gh issue close <n> --comment`) ;
  4. renvoie les actions appliquées.
  Un code `gh` non nul lève `Error("gh <quoi> a échoué : <sortie>")`, comme dans `depot.ts`.
- Produit : la CLI `bun scripts/alertes.ts sources <lien>` ou `bun scripts/alertes.ts publication <ok|echec> <lien>`.
  - Mode `sources` : il lit `archives/journal.jsonl` et le manifeste, puis appelle `executerAlertes` avec `LABEL_SOURCE`. Les clés déclarées sont `source:<id>` pour chaque source de `toutesSources`.
  - Mode `publication` : il appelle `executerAlertes` avec `LABEL_PUBLICATION`, l'état unique `etatPublication(...)` et les clés déclarées `{"publication"}`.
  - Il affiche une ligne par action et sort en 0.

- [ ] **Étape 1 : écrire les tests qui échouent**, avec un faux `Lanceur` qui enregistre les appels et rend des sorties JSON préparées :
  - `test("ouvre une issue pour une nouvelle source en échec")` : l'un des appels commence par `["issue","create"]` et contient le label ;
  - `test("motif lu dans le dernier commentaire : pas de doublon")` ;
  - `test("ferme l'issue d'une source revenue à la normale")` ;
  - `test("gh en erreur : exception explicite")`.
- [ ] **Étape 2 : lancer `bun test tests/alertes-gh.test.ts`.** Attendu : échec.
- [ ] **Étape 3 : implémenter** `scripts/alertes.ts`, avec le point d'entrée sous `if (import.meta.main)` et le dépôt pris dans `lireConfig().DEPOT`.
- [ ] **Étape 4 : lancer `bun test tests/alertes-gh.test.ts && bun run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(alertes): ouverture, mise à jour et fermeture des issues avec gh`

### Task 4: le manifeste a-t-il changé depuis la dernière publication ?

**Fichiers :**
- Modifier : `pipeline/src/archive.ts`
- Créer : `scripts/donnees-changees.ts`
- Test : `tests/donnees-changees.test.ts`

**Interfaces :**
- Produit : `contenuUtile(json: string): string`, dans `archive.ts`. Elle renvoie la sérialisation stable (clés triées) de `{ versions, actuelles }` seulement : `vus` et `jeux` sont ignorés.
- Produit : `donneesChangees(avant: string | null, apres: string): boolean`. `avant` à `null` donne `true`.
- Produit : la CLI `bun scripts/donnees-changees.ts`. Elle trouve le `headSha` de la dernière exécution réussie de `publication.yml` (`gh run list --workflow publication.yml --status success --limit 1 --json headSha`), lit `git show <sha>:archives/manifest.json` (contenu `null` si le sha est absent ou si la commande échoue), le compare au fichier courant, puis écrit `changees=true|false` dans `$GITHUB_OUTPUT` et sur la sortie standard. Elle sort toujours en 0.

- [ ] **Étape 1 : écrire les tests qui échouent** :
  - un changement dans `vus` seul donne `false` ;
  - une nouvelle version dans `versions.annuaire` donne `true` ;
  - un changement dans `actuelles` donne `true` ;
  - `avant = null` donne `true` ;
  - l'ordre des clés de l'objet n'a pas d'effet.
- [ ] **Étape 2 : lancer `bun test tests/donnees-changees.test.ts`.** Attendu : échec.
- [ ] **Étape 3 : implémenter** les deux fonctions et le script, en passant par un `Lanceur` pour `gh` et `git`.
- [ ] **Étape 4 : lancer `bun test tests/donnees-changees.test.ts && bun run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(publication): détection d'un changement utile du manifeste`

### Task 5: workflows et documentation

**Fichiers :**
- Créer : `.github/workflows/collecte.yml`
- Créer : `.github/workflows/publication.yml`
- Supprimer : `.github/workflows/nightly.yml`
- Modifier : `README.md` (lignes 29, 79, 96, 98, 104, 126, 140 et 145, qui mentionnent `nightly`)

**Interfaces :** il consomme les CLI des tâches 1, 3 et 4.

**`collecte.yml`** : déclencheurs `schedule: "17 2 * * *"` et `workflow_dispatch`. Permissions `contents: write` et `issues: write`. `concurrency: { group: collecte, cancel-in-progress: false }`. Étapes :
1. checkout, setup-bun (même SHA épinglé que `nightly.yml`), `bun install --frozen-lockfile` ;
2. identité du bot ;
3. `bun run collect` avec `GH_TOKEN` ;
4. `git add archives/`, commit `data: collecte du $(date -u +%F)` s'il y a quelque chose, puis `git pull --rebase --autostash && git push` ;
5. `bun scripts/alertes.ts sources "$URL_RUN"`, avec `GH_TOKEN` et `URL_RUN: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`.

**`publication.yml`** : déclencheurs `push` sur `main`, `schedule: "17 3 * * 1"` et `workflow_dispatch`. Permissions `contents: write` et `issues: write`. `concurrency: deploiement`. Job `construire` :
1. checkout avec `fetch-depth: 0` (nécessaire pour `git show <sha>`), setup-bun, install, identité du bot ;
2. étape `id: change`. Sur `schedule`, `bun scripts/donnees-changees.ts` ; sinon, écrire `changees=true` ;
3. si `changees == 'true'` : `bun pipeline/src/cli.ts collect --manquantes` (avec `GH_TOKEN`), puis le cache `.cache/archives` (même clé qu'aujourd'hui), puis `bun run build` ;
4. commit de `archives/` si `!cancelled() && changees == 'true'`, comme le bloc actuel ;
5. envoi de l'artefact `dist`.

Job `deployer` : il est copié de `nightly.yml`, avec `if: needs.construire.outputs.changees == 'true'`.

Job `alerte` : `needs: [construire, deployer]`, `if: always() && needs.construire.outputs.changees != 'false'`. Il lance `bun scripts/alertes.ts publication ok "$URL_RUN"` quand les deux jobs sont `success` (ou `deployer` est `skipped`), et `... echec "$URL_RUN"` sinon. Ce job a besoin de checkout, setup-bun et install.

- [ ] **Étape 1 : écrire les deux workflows et supprimer `nightly.yml`.**
- [ ] **Étape 2 : lancer `actionlint .github/workflows/*.yml`.** Attendu : aucune sortie.
- [ ] **Étape 3 : mettre à jour `README.md`.** Remplacer les consignes « lancer `nightly` à la main » : après l'ajout d'une source, un simple push suffit, puisque la publication collecte les sources manquantes ; pour une collecte complète, on lance `collecte` à la main. Ajouter un paragraphe sur les alertes : les labels `alerte-source` et `alerte-publication`, la fermeture automatique et le délai de 90 jours pour `bzh_batiments`.
- [ ] **Étape 4 : lancer `bun test && bun run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit** `ci: collecte quotidienne et publication hebdomadaire séparées, alertes par issues`
- [ ] **Étape 6 : vérifier après la fusion** (c'est à l'auteur de pousser) :
  - `gh workflow run collecte.yml`, puis `gh run watch` : le run est vert, l'issue `Source bzh_batiments` n'est pas ouverte (collecte du 2026-11-26) et un commit `data:` est poussé s'il y a lieu ;
  - le push de la fusion déclenche `publication.yml`, qui doit être vert de bout en bout.
