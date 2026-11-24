# Observatoire citoyen de l'éducation en France

Les chiffres publics de chaque école, collège et lycée de France, public et privé sous contrat : sourcés, datés, sans palmarès.

Une page par établissement du second degré et par école, des pages par département, par académie, par région et par commune, une page France, le budget des collectivités en euros par élève, les résultats des examens et la valeur ajoutée, l'historique de l'IPS depuis 2016, les établissements fermés et leurs successeurs, une recherche, une fiche imprimable A4. Chaque chiffre est situé par rapport aux moyennes du département, de l'académie et de la France, et porte sa source, son millésime et un lien vers la donnée brute archivée. Le site ne commente pas les chiffres. Avec les écoles et les communes, le site compte environ 92 000 fichiers (estimation, à confirmer par le premier build réel ; le garde-fou s'arrête à 95 000).

## Fonctionnement

Un site statique régénéré chaque nuit par GitHub Actions et publié sur Cloudflare Workers (assets statiques) :

1. **Collecte** (`bun run collect`) : pour chaque source, lecture de la date de modification sur data.education.gouv.fr ; téléchargement en Parquet seulement si elle a changé (l'Annuaire de l'éducation est relu chaque nuit). Chaque version est validée (colonnes requises, nombre de lignes), puis archivée telle quelle comme fichier joint d'une GitHub Release, avec son empreinte : elle reste téléchargeable à une adresse permanente. Le dépôt ne garde que `archives/manifest.json` et le journal `archives/journal.jsonl`.
2. **Croisement** (`bun run data`) : DuckDB lit les archives, normalise (`pipeline/sql/01_normaliser.sql`), calcule élèves, indicateurs, moyennes Σ / Σ et voisins, puis écrit les fichiers de données du site dans `site/data/` et met à jour le registre des pages (`archives/registre-pages.json`).
3. **Site** (Astro, sortie statique) : une page par établissement et par école, par commune, par département, par académie et par région, une page France, graphiques Observable Plot rendus en SVG au build ; JavaScript seulement pour la recherche, le tri des listes, le thème et la carte (chargée au clic).
4. **Garde-fous** : le build échoue si `dist/` dépasse 95 000 fichiers, si un fichier pèse plus de 25 Mio (pas de plafond sur le poids total) ou si `recherche.json` dépasse 10 000 000 octets.

`bun run build` enchaîne les étapes 2 à 4.

## Organisation

| Dossier | Rôle |
|---|---|
| `shared/` | types communs, formatage à la française, libellés exacts, formats des fichiers de données |
| `pipeline/` | collecte, archives, normalisation et calculs (DuckDB), export des données du site |
| `site/` | site Astro |
| `scripts/` | garde-fous de fin de build (volume, robots.txt) |
| `tests/` | tests `bun test` (pipeline, SQL et HTML généré) et jeux d'essai |
| `archives/` | manifest des versions archivées, journal de collecte, registre des pages (créés par la collecte) |
| `docs/superpowers/` | spécification, socle technique, maquettes et plan de la phase 1 |
| `.github/workflows/` | `tests.yml` (chaque push) et `nightly.yml` (collecte, build, déploiement) |

## Commandes

Prérequis : Bun ≥ 1.4 ; `gh` (GitHub CLI) pour archiver en GitHub Releases.

```bash
bun install
bun test              # toute la suite (construit aussi un site d'essai)
bun run typecheck     # vérification TypeScript
```

Essai complet en local, sans GitHub : `OBS_DEPOT=local` archive dans `.cache/depot/` au lieu des GitHub Releases. Cet essai écrit `archives/` avec des chemins locaux : ces fichiers ne doivent pas être commités.

```bash
OBS_DEPOT=local bun run collect
OBS_DEPOT=local bun run build
```

## Sources

Jeux publiés par le ministère de l'Éducation nationale (MEN) et sa direction statistique (DEPP) sur data.education.gouv.fr, sous Licence Ouverte : Annuaire de l'éducation ; indices de position sociale des collèges, des lycées et des EREA (jeux 2016-2021 et 2022 et après) ; établissements fermés ; indicateurs de valeur ajoutée des collèges (IVAC) et de résultat des lycées généraux et technologiques et professionnels (IVAL) ; indicateur de ségrégation sociale entre collèges ; effectifs d'élèves des collèges, des lycées généraux et technologiques et des lycées professionnels ; personnels des établissements du second degré. Le budget des collectivités vient des balances comptables de la DGFiP (présentation croisée nature-fonction, un jeu par exercice de 2020 à 2025, sur data.economie.gouv.fr), collectées par requête filtrée et archivées avec cette requête ; les formules et les comptes retenus sont dans `docs/budget-controles.md`. Le Code officiel géographique de l'Insee (liste et mouvements des communes, fichiers CSV) sert aux communes nouvelles : son millésime est figé dans `pipeline/src/sources.ts` et doit être changé chaque année, dès que l'Insee publie le COG au 1er janvier (la collecte journalise une erreur « COG … périmé » à partir du 15 février). Le registre est dans `pipeline/src/sources.ts` ; la méthode est publiée sur la page `/methode/` du site.

## Phases

| Phase | Contenu | État |
|---|---|---|
| 1 | Pages établissement, départements, recherche, fiche imprimable | livrée |
| 2 | Pages académie, commune et France, cartes | livrée |
| 3 | Budget des collectivités en euros par élève ; pages région | livrée |
| 4 | IVAC / IVAL, indice de ségrégation, IPS 2016-2022, successeurs, corrections de millésime | livrée (mise en ligne à décider) |
| 5 | Exploration des données | à venir |
| Écoles | Écoles du premier degré : fiches, collège de secteur, PIAL, écoles proches, pages commune, budget des communes | livrée (mise en ligne à décider) |
| Transport scolaire | Financement, tracés des lignes et temps de trajet, d'abord pour les lycées | à venir |

La phase Écoles est faite ; le Transport scolaire vient ensuite, selon le porteur. L'ordre de la phase 5 reste à fixer. Le détail est dans `docs/superpowers/specs/`.

## Hébergement

Le garde-fou de fin de build (`scripts/garde-fous.ts`) limite `recherche.json` à 10 000 000 d'octets bruts (Cloudflare le sert compressé) ; si ce plafond est dépassé, l'index se découpe par département.

Configuration dans `observatoire.config.json` :

| Clé | Rôle |
|---|---|
| `DEPOT` | `organisation/dépôt` GitHub : les liens « donnée brute » pointent vers ses Releases |
| `DOMAINE` | domaine du site |
| `SITE_URL` | adresse complète (`https://…`) pour les liens permanents, le sitemap et les QR codes |
| `INDEXABLE` | `false` : aperçu non référencé (`noindex`, `robots.txt` Disallow) ; `true` : site public, robots d'entraînement d'IA exclus dans `robots.txt` (liste `ROBOTS_ENTRAINEMENT` de `scripts/garde-fous.ts`) |

Le site est servi par Cloudflare Workers (assets statiques, `wrangler.jsonc`), déployé par le job `deployer` du workflow `nightly` ; les adresses restent celles de `observatoireeducation.fr`.

Préalables, à faire par le porteur du projet, dans l'ordre :

1. Souscrire l'offre Workers payante sur le compte Cloudflare professionnel.
2. Créer un jeton d'API avec le modèle « Edit Cloudflare Workers », limité à ce compte.
3. Enregistrer les secrets `CLOUDFLARE_API_TOKEN` (le jeton) et `CLOUDFLARE_ACCOUNT_ID` (identifiant du compte) dans *Settings → Secrets and variables → Actions* du dépôt.
4. Ajouter la zone `observatoireeducation.fr` à Cloudflare.

Avant de changer les serveurs DNS chez OVH, vérifier dans la zone importée :

- les MX : `mx1.mail.ovh.net` (priorité 1), `mx2.mail.ovh.net` (5), `mx3.mail.ovh.net` (100) ;
- le TXT SPF ;
- les enregistrements DKIM d'OVH ;
- supprimer les quatre A `185.199.108.153` à `185.199.111.153` de GitHub Pages.

Le changement des serveurs DNS chez OVH n'a lieu qu'après la recette décrite plus loin (procédure de bascule).

Ensuite, lancer le workflow `nightly` à la main (*Actions → nightly → Run workflow*) : première collecte, archives, premier déploiement.

Après l'ajout d'une source (par exemple un nouvel exercice du budget), lancer `nightly` à la main (*Actions → nightly → Run workflow*) : tant qu'aucune version de cette source n'est archivée, le build sur push échoue et le site reste sur la version précédente.

### Recette et bascule d'hébergement

Procédure à suivre, dans l'ordre, une fois les préalables faits :

1. Déployer le site sur `observatoire-education.<compte>.workers.dev` (workflow `nightly`, lancé à la main).
2. Comparer ce déploiement au site en ligne sur un échantillon de 300 pages (premier, dernier et pas régulier du sitemap) :
   `bun scripts/comparer-hebergements.ts https://observatoireeducation.fr https://observatoire-education.<compte>.workers.dev 300`.
   Le script compare le statut HTTP et le corps (hors script Umami et date de génération des fiches), une page à la fois ; il doit conclure à zéro écart (code de sortie 0).
   `observatoire.config.json` porte déjà `INDEXABLE: true` : l'hôte `workers.dev` sert donc un `robots.txt` indexable pendant la recette, qui doit rester brève.
3. Vérifier à la main :
   - `/etablissement/0440001a/` redirige ;
   - une URL inconnue rend la page 404 ;
   - `robots.txt` est identique sur les deux hôtes.
4. Dans un seul commit de bascule : ajouter à `wrangler.jsonc` `routes: [{ "pattern": "observatoireeducation.fr", "custom_domain": true }]` (pas avant, la zone devant exister dans Cloudflare), supprimer le fichier `CNAME` à la racine (il ne servait qu'à GitHub Pages) et ajouter `"workers_dev": false` et `"preview_urls": false` pour que l'hôte `workers.dev` cesse de servir une fois le domaine personnalisé actif.
5. Changer les serveurs DNS chez OVH (par le porteur du projet), après la vérification des enregistrements décrite plus haut.
6. Tester l'envoi d'un message vers `contact@observatoireeducation.fr`.

La bascule est validée quand une nuit de collecte et de déploiement a réussi après elle.

### Mise en ligne de la phase 4

La phase 4 ajoute 11 sources (établissements fermés, IPS 2016-2021 et 2022, IVAC, IVAL, ségrégation). Ordre à suivre :

1. Merger la branche dans `main`.
2. Lancer le workflow `nightly` à la main (*Actions → nightly → Run workflow*, `workflow_dispatch`) : première collecte des 11 nouvelles sources, publiées sur les GitHub Releases.
3. Lancer `bun scripts/rattraper-corrections.ts` sur le dépôt réel (manifeste à jour, accès aux Releases), puis commiter `archives/corrections.json`. Une paire de versions en échec est signalée dans la sortie sans arrêter les autres.
4. Le déploiement sur Cloudflare Workers suit : le push de `archives/corrections.json` reconstruit le site et le redéploie avec les mentions de correction.

Avant l'étape 2, un build sur `main` échoue proprement (« aucune version archivée pour fermes ») sans rien publier de faux : le site reste sur la version précédente.

La collecte tourne ensuite chaque nuit à 2 h 17 UTC. Une nuit sans changement de source enregistre seulement le journal, sans reconstruire le site.

### Mise en ligne de la phase Écoles

La phase Écoles ajoute 9 sources (6 sources d'écoles : `effectifs_ecoles`, `ips_ecoles_2016`, `ips_ecoles`, `personnels_ecoles`, `classes_ecoles`, `ecoles_ep` ; la carte scolaire des collèges ; deux fichiers COG de l'Insee) et élargit les extraits du budget (voir plus bas). Elle se met en ligne en deux temps : d'abord le changement d'hébergement seul (lot 0), puis le reste de la branche. La recette compare le site en ligne (GitHub Pages) au déploiement sur Workers et doit conclure à zéro écart : elle n'a de sens que si les deux hébergements servent le même site, donc avant l'arrivée des écoles. Ordre à suivre :

1. Lot 0 seul. Créer une branche au commit `c028e7a` de `phase-ecoles` (il ne contient que le lot 0 et les documents), y reprendre le correctif du déploiement (`git cherry-pick 4d0473f` : déploiement par `bunx wrangler` et cache des scripts, sans lequel le job `deployer` échoue), la fusionner dans `main`, puis suivre la procédure de recette et de bascule ci-dessus. Attendre une nuit de collecte et de déploiement réussie après la bascule. Le nombre de fichiers du site avec les écoles dépasse ce que GitHub Pages peut servir : le site doit déjà être sur Cloudflare Workers.
2. Fusionner le reste de la branche `phase-ecoles` dans `main`.
3. Lancer le workflow `nightly` à la main (`workflow_dispatch`) : première collecte des 9 nouvelles sources, et nouvelle version archivée de chaque exercice du budget.
4. Vérifier le journal de la collecte et du build : taux de rapprochement des adresses avec la carte scolaire, têtes de PIAL sans fiche, alerte « COG périmé » (à partir du 15 février, changer alors le millésime dans `pipeline/src/sources.ts`), nombre de fichiers affiché par le garde-fou (sous 95 000), poids des fiches et des pages commune (médiane, 95e centile, maximum ; plafond de 150 000 octets par page).

Avant l'étape 3, un build sur `main` échoue proprement (aucune version archivée pour les nouvelles sources) sans rien publier de faux.

Si le téléchargement d'un fichier du COG (`cog_communes`, `cog_mouvements`) échoue lors de cette première collecte, aucune version n'en est archivée et chaque build reste bloqué sur cette absence, sans rien publier : le site reste sur la version précédente jusqu'à une collecte réussie. Relancer alors le workflow `nightly` à la main (`workflow_dispatch`) ; la collecte suivante retente le téléchargement.

### Mise en ligne du lot 4 de la phase Écoles (budget des communes)

Le filtre des balances comptables de la DGFiP s'élargit aux communes, aux syndicats et à la Ville de Paris sur les fonctions des écoles (21x). La première collecte après le merge voit le filtre changé : elle **retélécharge et archive une nouvelle version de chaque exercice** (`budget_2020` à `budget_2025`), environ 217 000 lignes par exercice au lieu de 7 000, sans comparaison avec la version précédente (le périmètre n'est plus le même, ce n'est pas une correction). Les montants des départements et des régions ne changent pas. Prévoir cette nuit-là six téléchargements plus lourds et six nouvelles versions sur les GitHub Releases.

## Contact

contact@observatoireeducation.fr

## Licences

- Code : AGPL-3.0 (`LICENSE`).
- Données retraitées et archives : Licence Ouverte 2.0 (`LICENCE-DONNEES.md`).
