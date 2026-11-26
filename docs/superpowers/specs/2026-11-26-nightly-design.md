# Collecte et publication séparées

Date : 2026-11-26 · Statut : proposé

## Pourquoi

Le workflow `nightly.yml` enchaîne la collecte, le build et le déploiement dans un seul job. Le 25 novembre, plus aucun déploiement n'a pu partir pendant des heures, y compris pour de simples corrections de code. La cause n'était pas la donnée du jour :

- sources déclarées dans le code mais jamais collectées (`transport_2020`, `idf_lycees`, `bzh_batiments`). Un build lancé par un push ne collecte rien, il échoue donc sur `aucune version archivée` ;
- serveur breton injoignable depuis GitHub ;
- erreurs de code ou garde-fous, qui sont légitimement bloquants.

Autre constat : l'annuaire change vraiment presque chaque jour (quelques lignes). Le site est donc reconstruit presque chaque nuit, soit 89 000 pages en environ 20 minutes, et des dizaines de milliers de fichiers sont renvoyés, alors que le reste des données change une fois par an.

## Objectifs

- Un problème de donnée ne bloque jamais la publication d'une correction de code.
- Une nouvelle version de source invalide n'est pas mise en ligne : le site continue sur la dernière version valide, et l'auteur est prévenu.
- Quand seules les données changent, le site est republié **une fois par semaine**. Un push de code publie tout de suite.
- La collecte reste quotidienne, légère, et son journal garde le dépôt actif (GitHub suspend une tâche planifiée après 60 jours sans activité).

## Hors du périmètre

- Build incrémental (ne reconstruire que les pages touchées).
- Modifier les règles de validation des sources (`motifRejet`, colonnes requises) ou les garde-fous.
- Rendre le serveur breton joignable depuis GitHub.

## À éviter (échec même si « ça marche »)

- **Bruit** : une alerte par nuit pour un même problème. Une source en échec doit donner une seule issue, tenue à jour.
- **Silence** : une source rejetée ou en erreur pendant des semaines sans que personne ne le sache.
- **Publication d'une donnée invalide** pour débloquer un build.

## Approches envisagées

- **A. Un seul workflow consolidé** : validation, collecte des sources manquantes, build seulement sur changement utile. C'est le plus petit changement, mais la collecte et la publication restent liées et se mettent en file l'une derrière l'autre.
- **B. Deux workflows, collecte et publication (retenue)** : chacun échoue seul, et la publication devient hebdomadaire pour les données.
- **C. Collecte hebdomadaire seulement** : la plus simple, mais l'heartbeat d'activité se raréfie et une source cassée reste invisible jusqu'à sept jours.

B a été choisie parce que c'est le couplage collecte / build / déploiement qui a provoqué le blocage.

## Ce qui existe déjà et reste tel quel

- `collecter()` (`pipeline/src/collect.ts`) vérifie chaque source, la rejette (`rejete`) si des colonnes requises manquent ou si la nouvelle version est aberrante par rapport à la précédente, et ignore un contenu identique. Une version rejetée n'entre pas dans le manifeste : le build utilise donc déjà la dernière version valide. Chaque résultat est écrit dans `archives/journal.jsonl` (`inchange`, `telecharge`, `rejete`, `erreur`).
- `bun run collect` sort toujours en 0 : « le journal fait foi ».
- Le job `deployer` (wrangler, `dist` en artefact) ne change pas.

## Conception

### `collecte.yml` (chaque nuit)

- Déclencheurs : `schedule` quotidien (heure actuelle, 02:17 UTC) et `workflow_dispatch`.
- Étapes : `bun run collect`, puis commit de `archives/` (manifeste, journal, corrections) avec `pull --rebase` avant le push, comme aujourd'hui.
- Puis **synchronisation des alertes** (voir plus bas), à partir des lignes de journal produites par cette exécution.
- Aucun build ni déploiement. Le workflow est vert même si une source est rejetée. Il n'est rouge que s'il plante lui-même, et GitHub envoie alors son e-mail habituel.
- Permissions : `contents: write`, `issues: write`.

### `publication.yml` (sur push et chaque semaine)

- Déclencheurs : `push` sur `main`, `schedule` hebdomadaire (lundi, après la collecte de la nuit) et `workflow_dispatch`.
- Sur le déclencheur hebdomadaire, **on ne publie que si le manifeste a changé depuis la dernière publication réussie**. Sinon, le job s'arrête en vert.
- Étape 1, **sources manquantes** : on collecte uniquement les sources déclarées qui n'ont aucune version dans le manifeste (nouvelle option de la CLI, par exemple `collect --manquantes`). Si l'une échoue, la publication échoue avec un message clair. Pour une source marquée « collecte locale », c'est le motif `MOTIF_COLLECTE_LOCALE`, qui dit de lancer `bun run collect` depuis un poste. Ce blocage est voulu : on ne publie pas un site sans une source déclarée.
- Étape 2, **build** (`bun run build`) puis commit de `archives/` même en cas d'échec, comme aujourd'hui.
- Étape 3, **déploiement** : job `deployer` inchangé.
- En cas d'échec, une issue « publication en échec » est ouverte ou mise à jour. Elle est fermée à la publication réussie suivante.
- `concurrency: deploiement` est conservé (pas d'annulation).
- `nightly.yml` est supprimé.

### Alertes par issues GitHub

- **Une issue ouverte par source en difficulté**, repérée par un label (par exemple `alerte-source` plus un label ou un titre stable contenant l'identifiant de la source). Elle contient le motif, la date et un lien vers l'exécution.
- Une nouvelle nuit en échec ajoute un commentaire seulement si le motif change. Sinon, l'issue reste telle quelle (pas de bruit).
- Le retour à `inchange` ou `telecharge` sans erreur ferme l'issue avec un commentaire.
- Sont en échec : `rejete` et `erreur`, y compris l'erreur « millésime suivant attendu » et l'erreur de comparaison des versions (`suite`).
- **Sources à collecte locale** (aujourd'hui `bzh_batiments`) : sur GitHub, la collecte écrit seulement une ligne `local`, qui n'est ni un succès ni un échec. Une issue s'ouvre quand la dernière collecte manuelle (`collecteLe` de la dernière version dans le manifeste) a **plus de 90 jours**. Elle se ferme à la première nuit qui suit une collecte manuelle plus récente. La fonction reçoit donc aussi les dates de collecte du manifeste.
- Une source qui n'est plus déclarée dans le code (source retirée, millésime remplacé) voit son issue fermée automatiquement. La fonction reçoit donc aussi la liste des sources déclarées *(choix de conception)*.
- **Une issue unique pour la publication** (label `alerte-publication`), selon le même principe.
- La logique « lignes de journal + issues ouvertes → issues à ouvrir, commenter ou fermer » est une fonction pure, testée avec `bun test`. Seule l'exécution passe par `gh`.

## Décidé par l'auteur

- Une nouvelle version invalide ne part pas en ligne, et l'auteur est prévenu.
- Deux workflows (approche B).
- Données republiées chaque semaine. Le code est publié à chaque push.
- Alerte au-delà de 90 jours sans collecte manuelle pour une source à collecte locale.

## Choix de conception proposés (à corriger au besoin)

- Le canal d'alerte est une issue GitHub, et non l'e-mail d'échec de workflow : avec cette conception, la collecte reste verte.
- Les sources manquantes sont collectées au début de la publication.
- Le jour hebdomadaire est le lundi.
- L'issue d'une source qui n'est plus déclarée se ferme automatiquement.
- Une erreur pendant la collecte des sources manquantes bloque la publication.

## Laissé au constructeur

- Comment retrouver « la dernière publication réussie » : par exemple le `headSha` du dernier run vert de `publication.yml` via `gh run list`, puis `git diff` sur `archives/manifest.json`.
- Le nom exact des labels, le format des titres et du corps des issues.
- L'emplacement du script d'alertes (`scripts/` ou commande de la CLI du pipeline).
- La gestion des commits concurrents sur `main` entre les deux workflows : `pull --rebase` suffit-il, ou faut-il un groupe de concurrence commun pour les étapes qui committent ?
