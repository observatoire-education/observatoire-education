# Observatoire citoyen de l'éducation en France

Les chiffres publics de chaque collège et lycée de France, public et privé sous contrat : sourcés, datés, sans palmarès.

Une page par établissement (environ 11 200), des pages par département, par académie, par région et par commune, une page France, le budget des collectivités en euros par élève, une recherche, une fiche imprimable A4. Chaque chiffre est situé par rapport aux moyennes du département, de l'académie et de la France, et porte sa source, son millésime et un lien vers la donnée brute archivée. Le site ne commente pas les chiffres.

## Fonctionnement

Un site statique régénéré chaque nuit par GitHub Actions et publié sur GitHub Pages :

1. **Collecte** (`bun run collect`) : pour chaque source, lecture de la date de modification sur data.education.gouv.fr ; téléchargement en Parquet seulement si elle a changé (l'Annuaire de l'éducation est relu chaque nuit). Chaque version est validée (colonnes requises, nombre de lignes), puis archivée telle quelle comme fichier joint d'une GitHub Release, avec son empreinte : elle reste téléchargeable à une adresse permanente. Le dépôt ne garde que `archives/manifest.json` et le journal `archives/journal.jsonl`.
2. **Croisement** (`bun run data`) : DuckDB lit les archives, normalise (`pipeline/sql/01_normaliser.sql`), calcule élèves, indicateurs, moyennes Σ / Σ et voisins, puis écrit les fichiers de données du site dans `site/data/` et met à jour le registre des pages (`archives/registre-pages.json`).
3. **Site** (Astro, sortie statique) : une page par établissement et par département, graphiques Observable Plot rendus en SVG au build ; JavaScript seulement pour la recherche, le tri des listes, le thème et la carte (chargée au clic).
4. **Garde-fous** : le build échoue si `dist/` dépasse 900 Mo ou 50 000 fichiers.

`bun run build` enchaîne les étapes 2 à 4.

## Organisation

| Dossier | Rôle |
|---|---|
| `shared/` | types communs, formatage à la française, libellés exacts, formats des fichiers de données |
| `pipeline/` | collecte, archives, normalisation et calculs (DuckDB), export des données du site |
| `site/` | site Astro |
| `scripts/` | garde-fous de fin de build (volume, CNAME, robots.txt) |
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

Jeux publiés par le ministère de l'Éducation nationale (MEN) et sa direction statistique (DEPP) sur data.education.gouv.fr, sous Licence Ouverte : Annuaire de l'éducation ; indices de position sociale des collèges et des lycées ; effectifs d'élèves des collèges, des lycées généraux et technologiques et des lycées professionnels ; personnels des établissements du second degré. Le budget des collectivités vient des balances comptables de la DGFiP (présentation croisée nature-fonction, un jeu par exercice de 2020 à 2025, sur data.economie.gouv.fr), collectées par requête filtrée et archivées avec cette requête ; les formules et les comptes retenus sont dans `docs/budget-controles.md`. Le registre est dans `pipeline/src/sources.ts` ; la méthode est publiée sur la page `/methode/` du site.

## Phases

| Phase | Contenu | État |
|---|---|---|
| 1 | Pages établissement, départements, recherche, fiche imprimable | livrée |
| 2 | Pages académie, commune et France, cartes | livrée |
| 3 | Budget des collectivités en euros par élève ; pages région | livrée |
| 4 | IVAC / IVAL, indice de ségrégation, IPS 2016-2022, successeurs, corrections de millésime | à venir |
| 5 | Exploration des données | à venir |
| Écoles | Écoles du premier degré | à venir |
| Transport scolaire | Financement, tracés des lignes et temps de trajet, d'abord pour les lycées | à venir |

L'ordre de 4, 5, Écoles et Transport scolaire reste à fixer. Le détail est dans `docs/superpowers/specs/`.

## Mise en ligne

Configuration dans `observatoire.config.json` :

| Clé | Rôle |
|---|---|
| `DEPOT` | `organisation/dépôt` GitHub : les liens « donnée brute » pointent vers ses Releases |
| `DOMAINE` | domaine du site ; écrit dans `CNAME` s'il est renseigné |
| `SITE_URL` | adresse complète (`https://…`) pour les liens permanents, le sitemap et les QR codes |
| `INDEXABLE` | `false` : aperçu non référencé (`noindex`, `robots.txt` Disallow) ; `true` : site public |

Étapes, à faire par le porteur du projet :

1. Créer l'organisation GitHub dédiée et le dépôt public, puis renseigner `DEPOT`.
2. Pousser le dépôt. Dans *Settings → Pages*, choisir la source « GitHub Actions ».
3. Lancer le workflow `nightly` à la main (*Actions → nightly → Run workflow*) : première collecte, archives, premier déploiement. Tant que `INDEXABLE` vaut `false`, le site est un aperçu non référencé.
4. Une fois le domaine `observatoireeducation.fr` acheté : enregistrements DNS vers GitHub Pages (A/AAAA à l'apex, `www` en CNAME vers `<organisation>.github.io`) ; renseigner `DOMAINE` et `SITE_URL`, passer `INDEXABLE` à `true`, puis activer « Enforce HTTPS ».

La collecte tourne ensuite chaque nuit à 2 h 17 UTC. Une nuit sans changement de source enregistre seulement le journal, sans reconstruire le site.

## Contact

contact@observatoireeducation.fr

## Licences

- Code : AGPL-3.0 (`LICENSE`).
- Données retraitées et archives : Licence Ouverte 2.0 (`LICENCE-DONNEES.md`).
