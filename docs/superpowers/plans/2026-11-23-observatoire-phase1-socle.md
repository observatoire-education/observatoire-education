# Observatoire citoyen de l'éducation en France, phase 1 (socle) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** mettre en ligne un site statique, régénéré chaque nuit. Il comprend une fiche par collège, lycée et EREA (public et privé sous contrat, métropole et DROM), des pages département, un accueil avec recherche, et des pages sources et méthode. Chaque chiffre est situé par rapport aux moyennes du département, de l'académie et de la France, et porte sa source datée.

**Architecture :** un dépôt organisé en espaces de travail Bun.
- `pipeline` collecte les sources et archive chaque version modifiée comme fichier joint d'une GitHub Release. Le dépôt ne garde que le manifest et le journal.
- `pipeline` croise ensuite tout dans DuckDB, avec des fichiers `.sql`, puis écrit des fichiers JSON de données dans `site/data/`.
- `site` (Astro, sortie statique) génère le HTML à partir de ces JSON. Les graphiques Observable Plot sont rendus en SVG au build.
- GitHub Actions enchaîne le tout chaque nuit et déploie sur GitHub Pages.

**Tech stack :** Bun ≥ 1.4 (testé avec 1.4.5), TypeScript, `@duckdb/node-api` 2.0.1-r.1 (version épinglée : le suffixe `-r.N` échappe à `^2.0.1`), Astro 7.4.x, `@observablehq/plot` 0.6.x et `linkedom` (rendu SVG au build), `qrcode` 1.5.x, `maplibre-gl` 6.x (carte au clic), `bun test`.

**Spec :**
- `docs/superpowers/specs/2026-11-23-observatoire-citoyen-education-design.md`, la spec produit ;
- `docs/superpowers/specs/2026-11-23-observatoire-socle-et-maquettes-design.md`, le socle technique et les maquettes ; **il fait foi en cas de divergence** ;
- les maquettes HTML de `docs/superpowers/specs/maquettes-2026-11-23/`, qui servent de référence visuelle.

Les trois sont déjà dans le dépôt, sous `docs/superpowers/` (rien à copier).

**Vérifié le 2026-11-23 :**
- `@duckdb/node-api` 2.0.1 et le rendu SVG de Plot via `linkedom` fonctionnent sous Bun 1.4.5.
- Les identifiants des jeux et les noms de champs cités ci-dessous viennent de l'API `data.education.gouv.fr/api/explore/v2.1`.
- La machine du porteur a Bun 1.0.6 : il faut lancer `bun upgrade` avant la tâche 1.

**Écarts assumés en phase 1 (ils viennent du document socle, section 2.7) :**
- Pas de pages commune, académie ni France, pas d'explorateur et pas de `/donnees/`. Ces maillons du fil d'Ariane sont du texte simple.
- **Pas de carte SVG sur la page département**, faute de contours IGN dans les sources de la phase 1 ; elle arrive en phase 2.
- **Pas de lien vers l'établissement successeur** sur une page fermée (phase 4).
- **Historique limité** aux millésimes présents dans les jeux actuels. L'IPS 2016-2022 arrive en phase 4.
- **Résultats et budget** : les blocs ne sont pas affichés.

### Phases suivantes (plans séparés)
- **Phase 2 :** pages commune, académie et France ; cartes SVG des territoires ; explorateur DuckDB-WASM ; `/donnees/`.
- **Phase 3 :** budget en euros par élève.
- **Phase 4 :** IVAC et IVAL, ségrégation, IPS 2016-2022, successeurs, corrections de millésime.

## Global Constraints

- **Nom et domaine :** « Observatoire citoyen de l'éducation en France », domaine `observatoireeducation.fr`. Le nom figure dans le `<title>`, l'en-tête et le pied de page ; à la mise en ligne, `DOMAINE` vaut `observatoireeducation.fr` et `SITE_URL` vaut `https://observatoireeducation.fr`.
- **Emplacement et organisation du dépôt :**
  - dépôt `~/Projets/observatoire-education` (déjà initialisé, sans commit ; le dépôt `AED` reste dans `~/Projets/fcpe/sources/AED`) ;
  - espaces de travail `shared/`, `pipeline/` et `site/`, plus `tests/fixtures/` à la racine.
- **Licences :** code sous AGPL-3.0 (`LICENSE`) ; données retraitées sous Licence Ouverte 2.0 (`LICENCE-DONNEES.md`, et pied de page du site).
- **Périmètre :**
  - les établissements de l'annuaire dont `type_etablissement` vaut `Collège`, `Lycée` ou `EREA`, dont `etat` vaut `OUVERT`, et dont la famille et le secteur sont reconnus (tâche 4) ;
  - les départements `975`, `977`, `978` et `98x` sont exclus, avec le motif `hors_perimetre_geographique`.
- **Clé de jointure :** l'UAI, 8 caractères en majuscules. Selon les sources, il s'appelle `identifiant_de_l_etablissement`, `uai`, `numero_college` ou `numero_lycee`.
- **Secteur et famille viennent toujours de l'annuaire.** Exception : pour les lycées, le `type_de_lycee` de l'IPS (LEGT, LPO ou LP) l'emporte sur la famille de l'annuaire.
- **Codes département canoniques au format INSEE :** `01`, `2A`, `44`, `971`. Les formes `001` et `02A` sont normalisées.
- **Rentrée canonique :** l'année de septembre. « 2025-2026 », « 2025 » et `2025-01-01` donnent tous `2025`.
- **Aucun zéro pour une donnée absente.** Une mesure a un statut parmi `ok`, `non_publie_prive` et `non_disponible`. Un ratio dont le dénominateur est nul ou absent vaut `non_disponible`.
- **Libellés exacts :**
  - « non publié pour le privé » ;
  - « non disponible » ;
  - « non couvert par les statistiques publiques » ;
  - « pas de SEGPA » ;
  - « Voisins non calculables (coordonnées absentes) » ;
  - « Cet établissement n'apparaît plus dans l'Annuaire de l'éducation depuis le {jj/mm/aaaa}. ».
- **Ligne de source exacte :** `Source : {producteur}, {titre} · rentrée {r}-{r+1} · collecté le {jj/mm/aaaa}`.
- **Comparaisons :**
  - Sur le web, la forme est `{écart} ({moyenne})`, par exemple `−14,0 (106,4)` : signe moins U+2212, signe `+` pour un écart positif, `0,0` sans signe si |écart| < 0,05.
  - Sur la fiche A4, on affiche les moyennes seules.
  - Les volumes (élèves, ETP) n'ont jamais de moyenne.
- **Nombres à la française :** virgule décimale ; espace fine insécable U+202F pour les milliers ; une décimale pour l'IPS et les ratios ; une décimale suivie de ` %` pour les parts. Les parts des barres empilées sont arrondies à l'entier.
- **Moyennes calculées :**
  - formule Σ numérateurs / Σ dénominateurs, par (niveau territorial, code, famille, secteur, rentrée) ;
  - seuls comptent les établissements du périmètre dont le numérateur et le dénominateur sont présents et dont le dénominateur est supérieur à 0 ;
  - les moyennes de l'IPS sont celles publiées par la source (`calculee: false`).
- **Anti-palmarès :**
  - aucune page générée ne contient les mots `rang`, `classement`, `top`, `meilleur(e)(s)`, `pire(s)` ;
  - les listes sont triées par nom par défaut, et le voisinage par distance ;
  - aucune mise en couleur des extrêmes.
- **Couleur et formes :**
  - jetons de `maquettes-2026-11-23/obs.css` (violet `--pub`, ambre `--pri`, thème sombre automatique) ;
  - polices système uniquement, aucune ressource tierce sauf les tuiles OpenFreeMap chargées au clic ;
  - public = point plein, privé = anneau, établissement = losange ;
  - catégories en rampe de gris.
- **Requêtes HTTP :**
  - User-Agent `observatoireeducation/0.1 (+https://observatoireeducation.fr)` ;
  - `Accept-Encoding: gzip` ;
  - au plus une requête de métadonnées et un téléchargement par source et par exécution ;
  - aucune donnée personnelle.
- **Volumes :**
  - `dist/` doit rester sous 900 Mo et 50 000 fichiers, sinon le build échoue ;
  - le HTML d'une fiche de test complète fait au plus 50 Ko.
- **Configuration :** `observatoire.config.json` contient `{"SITE_URL": "", "DOMAINE": "", "DEPOT": "org/depot", "INDEXABLE": false}`.
  - `CNAME` n'est écrit que si `DOMAINE` est non vide.
  - Si `INDEXABLE` vaut false, on ajoute `<meta name="robots" content="noindex">` et un `robots.txt` `Disallow: /`.

## Review Focus

1. **Libellés de contrat inattendus dans l'annuaire.** On trouve « C0NTRAT SIMPLE POUR PARTIE DES CLASSES », écrit avec un zéro, ainsi que « INCONNU DU GESTIONNAIRE » et `null`. Attendu : la classification est explicite, sans correspondance approximative ; un libellé inconnu donne le motif `secteur_inconnu` dans `exclus` et un compteur dans le journal de build ; jamais de plantage. Testé à la tâche 4 (`test contrat avec zéro et inconnu`).
2. **Valeur numérique en texte, `"NA"` ou vide** (`ips_etab` et `ecart_type_etablissement` sont des champs texte dans l'IPS des lycées). Attendu : statut `non_disponible`, jamais 0. Testé à la tâche 4 (`test nombre NA`).
3. **Source dont le schéma change ou dont le téléchargement est tronqué.** Attendu : la version est rejetée, la précédente est conservée, le journal enregistre `rejete` avec le motif, et la collecte continue pour les autres sources. Testé à la tâche 3.
4. **Un lycée polyvalent présent à la fois dans les effectifs GT et pro.** Attendu : ses élèves sont la somme des deux jeux, sans double compte ni écrasement. Testé à la tâche 5 (`test LPO somme GT et pro`).
5. **Un établissement disparu de l'annuaire** (fermeture, fusion, sortie du périmètre). Attendu : sa page reste à la même URL, avec la mention de disparition et ses dernières données, et il n'apparaît plus chez personne comme voisin. Testé à la tâche 7 (`test page conservée après disparition`).

---

## Fichiers

```
observatoire-education/
  package.json                     # workspaces ["shared","pipeline","site"], scripts collect|data|build|test
  observatoire.config.json         # SITE_URL, DOMAINE, DEPOT, INDEXABLE
  LICENSE  LICENCE-DONNEES.md  README.md  .gitignore (.cache/, dist/, site/data/, *.duckdb, node_modules/)
  docs/superpowers/specs/…         # spec, document socle, maquettes (déjà présents)
  docs/superpowers/plans/…         # ce plan
  archives/manifest.json           # versions archivées (tâche 3)
  archives/journal.jsonl           # une ligne par source et par exécution
  archives/registre-pages.json     # toutes les UAI ayant eu une page (tâche 7)
  shared/src/types.ts              # types communs (tâche 1)
  shared/src/format.ts             # formatage FR (tâche 1)
  shared/src/libelles.ts           # libellés exacts, familles, indicateurs (tâche 1)
  pipeline/src/sources.ts          # registre des sources (tâche 2)
  pipeline/src/ods.ts              # client Opendatasoft (tâche 2)
  pipeline/src/depot.ts            # dépôt d'archives : GitHub Releases + cache local (tâche 3)
  pipeline/src/archive.ts          # manifest, validation (tâche 3)
  pipeline/src/collect.ts          # orchestration de la collecte, journal (tâche 3)
  pipeline/src/db.ts               # connexion DuckDB, exécution des .sql, UDF (tâche 4)
  pipeline/sql/01_normaliser.sql   # tables canoniques (tâche 4)
  pipeline/sql/02_moyennes.sql     # moyennes Σ/Σ et parts (tâche 6)
  pipeline/sql/03_eleves.sql       # élèves détaillés (tâche 5)
  pipeline/sql/04_voisins.sql      # voisinage (tâche 7)
  pipeline/src/indicateurs.ts      # assemblage Indicateur / Repartition (tâche 6)
  pipeline/src/eleves.ts           # assemblage Eleves (tâche 5)
  pipeline/src/fiches.ts           # Fiche, voisins, registre, export JSON (tâche 7)
  pipeline/src/cli.ts              # `collect` | `data`
  site/astro.config.mjs
  site/src/lib/donnees.ts          # lecture de site/data/ (tâche 8)
  site/src/lib/plot.ts             # rendu SVG Plot au build (tâche 8)
  site/src/layouts/Base.astro
  site/src/components/*.astro      # Entete, Bandeau, CarteIndicateur, Points, Empile, Voisins, Sources, Absence…
  site/src/pages/etablissement/[uai].astro
  site/src/pages/departement/[dep].astro  site/src/pages/index.astro
  site/src/pages/sources.astro  site/src/pages/methode.astro  site/src/pages/404.astro
  site/src/pages/recherche.json.ts  site/src/pages/sitemap.xml.ts
  site/src/styles/obs.css          # repris de maquettes-2026-11-23/obs.css
  site/public/js/theme.js  recherche.js  carte.js  liste.js
  tests/fixtures/*.csv  tests/aide.ts  tests/*.test.ts
  scripts/garde-fous.ts            # volume de dist/ (tâche 11)
  .github/workflows/tests.yml  .github/workflows/nightly.yml
```

---

### Task 1 : dépôt, espaces de travail, types partagés, formatage

**Files :**
- Create : `package.json`, `shared/package.json`, `pipeline/package.json`, `site/package.json`, `tsconfig.json`, `observatoire.config.json`, `LICENSE` (texte AGPL-3.0), `LICENCE-DONNEES.md`, `.gitignore`, `README.md`, `shared/src/types.ts`, `shared/src/format.ts`, `shared/src/libelles.ts`
- Test : `tests/format.test.ts`

**Interfaces (Produces), `shared/src/types.ts` :**
```ts
export type Statut = "ok" | "non_publie_prive" | "non_disponible";
export type Famille = "college" | "legt" | "lpo" | "lp" | "erea";
export type Secteur = "public" | "prive_sous_contrat";
export type Niveau = "departement" | "academie" | "france";
export type SourceId = "annuaire" | "ips_colleges" | "ips_lycees" | "effectifs_colleges"
  | "effectifs_lycees_gt" | "effectifs_lycees_pro" | "personnels";
export interface Mesure { valeur: number | null; statut: Statut; source: SourceId | null; rentree: number | null; couverture?: number }
export interface Comparaison { niveau: Niveau; public: Mesure; prive: Mesure; calculee: boolean }
export interface Indicateur { code: CodeIndicateur; mesure: Mesure; comparaisons: Comparaison[]; historique: [number, number][] }
export interface PartsReference { niveau: Niveau; secteur: Secteur; parts: number[] | null; statut: Statut }
export interface Repartition { code: CodeRepartition; categories: string[]; parts: number[] | null; statut: Statut;
  references: PartsReference[]; source: SourceId; rentree: number | null; couverture?: number }
export interface NiveauEleves { libelle: string; eleves: number | null; filles: number | null; garcons: number | null }
export interface Eleves { rentree: number; total: number | null; niveaux: NiveauEleves[];
  segpa: number | null; ulis: number | null; source: SourceId[] }
export interface Site { nom: string; adresse: string; codePostal: string; commune: string }
export interface Voisin { uai: string; nom: string; famille: Famille; secteur: Secteur; commune: string;
  distanceKm: number; eleves: Mesure; elevesParEtpEns: Mesure; ips: Mesure }
export interface SourceRef { id: SourceId; producteur: string; titre: string; pageUrl: string;
  rentree: number | null; collecteLe: string; brutUrl: string }
export interface Fiche { uai: string; nom: string; famille: Famille; secteur: Secteur; contrat: string | null;
  adresse: string; codePostal: string; commune: string; codeCommune: string; dep: string; depLibelle: string;
  aca: string; acaLibelle: string; ep: "REP+" | "REP" | null; segpa: boolean; ulis: boolean; internat: boolean;
  lat: number | null; lon: number | null; disparuLe: string | null; autresSites: Site[];
  indicateurs: Indicateur[]; repartitions: Repartition[]; eleves: Eleves | null;
  voisins: Voisin[] | null; sources: SourceRef[] }
```
`CodeIndicateur` et `CodeRepartition` sont les unions des codes des tableaux de la tâche 6, exportées depuis `libelles.ts`.

**Interfaces (Produces), `shared/src/format.ts` :**
- `nombre(x: number | null, decimales = 1): string` : « — » si la valeur est `null`.
- `entier(x: number | null): string`
- `part(x: number | null): string` : `"10,0 %"`.
- `ecart(valeur: number, moyenne: number, decimales = 1): string` : `"−14,0 (106,4)"`.
- `date(iso: string): string` : `"22/11/2026"`.
- `ligneSource(s: SourceRef): string`
- `absence(statut: Statut): string` : renvoie le libellé exact.

- [ ] **Step 1 :** `bun --version` doit afficher ≥ 1.4.
  - Le dépôt git existe déjà (`git init` fait, aucun commit).
  - Créer les quatre `package.json`. La racine porte `"workspaces": ["shared","pipeline","site"]` et les scripts `collect`, `data`, `build` et `test` (`bun test`).
  - Ajouter `@duckdb/node-api@2.0.1-r.1` à `pipeline`, et `@obs/shared` (`workspace:*`) aux dépendances de la racine (Bun 1.4 isole les espaces de travail ; les tests vivent à la racine) ; `astro@^7.4`, `@observablehq/plot@^0.6.19`, `linkedom@^0.18`, `qrcode@^1.5` et `maplibre-gl@^6` à `site`.
  - Inclure `docs/` dans le premier commit.
- [ ] **Step 2 : écrire les tests qui doivent échouer**

```ts
// tests/format.test.ts
test("nombres FR", () => {
  expect(nombre(1234.56)).toBe("1 234,6"); expect(nombre(null)).toBe("—");
  expect(entier(84100)).toBe("84 100"); expect(part(10)).toBe("10,0 %");
});
test("écart", () => {
  expect(ecart(92.4, 106.4)).toBe("−14,0 (106,4)"); expect(ecart(123, 121.4)).toBe("+1,6 (121,4)");
  expect(ecart(100.02, 100)).toBe("0,0 (100,0)");
});
test("ligne de source", () => {
  expect(ligneSource({ id: "ips_colleges", producteur: "MEN-DEPP", titre: "Indices de position sociale des collèges",
    pageUrl: "", rentree: 2025, collecteLe: "2026-11-22T02:17:00Z", brutUrl: "" }))
    .toBe("Source : MEN-DEPP, Indices de position sociale des collèges · rentrée 2025-2026 · collecté le 22/11/2026");
});
test("absences", () => {
  expect(absence("non_publie_prive")).toBe("non publié pour le privé");
  expect(absence("non_disponible")).toBe("non disponible");
});
```

- [ ] **Step 3 :** `bun test tests/format.test.ts`. Attendu : FAIL (module introuvable).
- [ ] **Step 4 :** implémenter `types.ts`, `format.ts` et `libelles.ts`. Le formatage passe par `Intl.NumberFormat("fr-FR")`, puis on remplace l'espace insécable U+00A0 par U+202F.
- [ ] **Step 5 :** relancer. Attendu : PASS.
- [ ] **Step 6 :** commit `chore: dépôt, espaces de travail, types et formatage`.

---

### Task 2 : registre des sources et client Opendatasoft

**Files :**
- Create : `pipeline/src/sources.ts`, `pipeline/src/ods.ts`
- Test : `tests/ods.test.ts`

**Interfaces (Produces) :**
- `interface Source { id: SourceId; datasetId: string; titre: string; producteur: string; pageUrl: string; colonnesRequises: string[]; referentiel: boolean }`
- `SOURCES: Record<SourceId, Source>`
- `interface SourceMeta { modified: string; recordsCount: number }`
- `class OdsClient`, construit par `constructor(fetcher: typeof fetch = fetch, userAgent: string)`, avec :
  - `metadata(s: Source): Promise<SourceMeta>` ;
  - `telechargerParquet(s: Source, dest: string): Promise<string>`.

Base des URL : `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets`. `pageUrl` vaut `https://data.education.gouv.fr/explore/dataset/{datasetId}/information/`. Le producteur est « MEN » pour l'annuaire et « MEN-DEPP » pour les autres sources.

| id | datasetId | titre | colonnesRequises |
|---|---|---|---|
| `annuaire` | `fr-en-annuaire-education` | Annuaire de l'éducation | identifiant_de_l_etablissement, nom_etablissement, type_etablissement, statut_public_prive, type_contrat_prive, libelle_nature, adresse_1, code_postal, code_commune, nom_commune, code_departement, libelle_departement, code_academie, libelle_academie, latitude, longitude, appartenance_education_prioritaire, segpa, ulis, hebergement, etat |
| `ips_colleges` | `fr-en-ips-colleges-ap2023` | Indices de position sociale des collèges | rentree_scolaire, uai, ips, ecart_type_de_l_ips, ips_{departemental,academique,national}_{public,prive} |
| `ips_lycees` | `fr-en-ips-lycees-ap2023` | Indices de position sociale des lycées | rentree_scolaire, uai, type_de_lycee, ips_etab, ecart_type_etablissement, ips_{departemental,academique,national}_{legt,lpo,lp}_{public,prive} |
| `effectifs_colleges` | `fr-en-college-effectifs-niveau-sexe-lv` | Effectifs d'élèves par niveau, sexe et langue des collèges | rentree_scolaire, numero_college, nombre_eleves_total, nombre_d_eleves_total_segpa, nombre_d_eleves_total_ulis, nombre_total_de_{6,5,4,3}emes, {6,5,4,3}eme_filles, {6,5,4,3}emes_garcons, nombre_de_{6,5,4,3}emes_lv1_{allemand,anglais,espagnol,autres_langues}, nombre_de_{5,4,3}emes_lv2_{allemand,anglais,espagnol,italien,autres_langues} |
| `effectifs_lycees_gt` | `fr-en-lycee_gt-effectifs-niveau-sexe-lv` | Effectifs d'élèves des lycées généraux et technologiques | rentree_scolaire, numero_lycee, nombre_d_eleves, 2ndes_gt, 2ndes_gt_filles, 2ndes_gt_garcons, 1eres_g, terminales_g |
| `effectifs_lycees_pro` | `fr-en-lycee_pro-effectifs-niveau-sexe-lv` | Effectifs d'élèves des lycées professionnels | rentree_scolaire, numero_lycee, nombre_d_eleves, 2ndes_pro, 1eres_pro, terminales_pro, cap_1ere_annee, cap_2nde_annee |
| `personnels` | `fr-en-indicateurs_personnels_etablissements2d` | Les personnels dans les établissements du second degré | annee_de_la_rentree_scolaire, uai, etp_total, etp_de_personnels_de_vie_scolaire, etp_enseignants_hommes_et_femmes, etp_de_femmes_enseignantes, etp_d_enseignants_agreges, etp_d_enseignants_certifies_peps, etp_d_enseignants_plp, etp_d_enseignants_titulaires_d_un_autre_corps, etp_d_enseignants_non_titulaires, etp_d_enseignants_de_moins_de_35_ans, etp_d_enseignants_de_35_a_moins_de_50_ans, etp_d_enseignants_de_50_ans_ou_plus, etp_d_enseignants_ayant_une_anciennete_dans_l_etablissement_de_{moins_de_2_ans,2_ans_a_moins_de_5_ans,5_ans_a_moins_de_8_ans,8_ans_ou_plus} |

Les accolades désignent la liste développée : `sources.ts` contient les noms complets.

- [ ] **Step 1 : écrire les tests qui doivent échouer.** Le fetcher est faux et ne fait aucun appel réseau.

```ts
test("registre", () => { expect(Object.keys(SOURCES).length).toBe(7); expect(SOURCES.annuaire.referentiel).toBe(true); });
test("metadata", async () => {
  // réponse {"metas":{"default":{"modified":"2026-09-01T09:31:02+00:00","records_count":21061}}}
  expect(await client.metadata(SOURCES.ips_colleges)).toEqual({ modified: "2026-09-01T09:31:02+00:00", recordsCount: 21061 });
});
test("téléchargement parquet", async () => { /* GET …/exports/parquet -> "PAR1…" ; le fichier commence par PAR1 */ });
test("retries et user-agent", async () => { /* 503, 503, 200 -> succès en 3 appels ; UA commence par "observatoireeducation/" */ });
```

- [ ] **Step 2 :** `bun test tests/ods.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - Délai d'expiration de 120 s, 3 essais avec une attente de 2 puis 4 s, sur les erreurs 5xx et réseau.
  - En-tête `Accept-Encoding: gzip`.
  - Écriture en flux sur disque avec `Bun.write(dest, response)`.
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: registre des sources et client Opendatasoft`.

---

### Task 3 : archives en GitHub Releases, validation, collecte, journal

**Files :**
- Create : `pipeline/src/depot.ts`, `pipeline/src/archive.ts`, `pipeline/src/collect.ts`, `pipeline/src/cli.ts` (sous-commande `collect`)
- Test : `tests/collect.test.ts`

**Interfaces :**
- Consumes : `SOURCES`, `OdsClient` (tâche 2).
- Produces :
  - `interface Version { sha256: string; tag: string; fichier: string; url: string; modified: string; collecteLe: string; lignes: number }`
  - `interface Depot { publier(tag: string, fichier: string): Promise<string>; recuperer(v: Version, dest: string): Promise<void> }`, avec deux implémentations :
    - `DepotGithub(depot: string)`, qui appelle `gh release create`/`upload`, et dont l'URL vaut `https://github.com/{DEPOT}/releases/download/{tag}/{fichier}` ;
    - `DepotLocal(dossier: string)`, pour les tests.
  - `class Manifest` :
    - `static lire(chemin): Manifest` ;
    - `versions(id): Version[]`, `derniere(id): Version | undefined` ;
    - `ajouter(id, v): boolean` (false si l'empreinte est connue) ;
    - `ecrire()`, une écriture atomique via un fichier temporaire suivi d'un renommage.
  - `collecter(opts: { manifest: Manifest; client: OdsClient; depot: Depot; maintenant: Date; tmp: string }): Promise<LigneJournal[]>`
  - `assurerCache(manifest: Manifest, depot: Depot, cache = ".cache/archives"): Promise<Record<SourceId, string>>` : renvoie le chemin local de la dernière version de chaque source et vérifie son empreinte.
  - `type LigneJournal = { date: string; source: SourceId; action: "inchange" | "telecharge" | "rejete" | "erreur"; modified?: string; sha256?: string; lignes?: number; motif?: string }`

**Règles :**
- **Nommage des archives :**
  - le tag de release vaut `archives-{source}-{année de collecte}`, par exemple `archives-annuaire-2026` ;
  - le fichier vaut `{sha256[:16]}.parquet` ;
  - on crée la release si elle n'existe pas encore.
- **Source statistique dont `modified` n'a pas changé** depuis la dernière version : aucun téléchargement, et le journal enregistre `inchange`.
- **Annuaire :**
  - on le télécharge chaque nuit ;
  - on le réduit avec DuckDB aux `colonnesRequises`, aux lignes `type_etablissement IN ('Collège','Lycée','EREA')`, et on trie par UAI ;
  - on calcule l'empreinte du fichier réduit, et une empreinte déjà connue n'est pas republiée.
- **Validation avant publication :**
  - toutes les colonnes requises doivent être présentes ;
  - le nombre de lignes doit valoir au moins 80 % de celui de la version précédente ;
  - sinon le journal enregistre `rejete` avec le motif (« colonne manquante : uai », « 70 lignes < 80 % de 100 »).
- **Erreurs :** une exception sur une source donne une ligne `erreur`, puis on passe à la source suivante.
- **Journal :** les lignes sont ajoutées à `archives/journal.jsonl`.
- **Code de sortie :** `collect` sort toujours avec 0, même en cas de rejet ; le journal fait foi.

- [ ] **Step 1 : écrire les tests qui doivent échouer.** Le client est faux ; le dépôt est un `DepotLocal` ; les fichiers Parquet sont fabriqués avec DuckDB (`COPY (SELECT …) TO 'x.parquet'`).

```ts
test("inchangé : aucun téléchargement", …);            // action "inchange", 0 appel telechargerParquet
test("nouvelle version publiée et dédupliquée", …);    // 2 collectes, même contenu -> 1 version, tag archives-ips_colleges-2026
test("colonne manquante rejetée", …);                  // motif contient "uai" ; manifest inchangé
test("baisse de lignes rejetée", …);                   // 100 puis 70 -> "rejete", motif contient "80 %"
test("erreur réseau isolée", …);                       // ips_colleges lève -> "erreur" ; ips_lycees traité
test("annuaire réduit puis dédupliqué", …);            // 2 téléchargements, modified différent, même contenu filtré -> 1 version
test("journal : une ligne par source", …);             // 7 lignes ajoutées
test("assurerCache vérifie l'empreinte", …);           // fichier corrompu dans le cache -> re-récupéré
```

- [ ] **Step 2 :** `bun test tests/collect.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - Empreinte : `Bun.CryptoHasher("sha256")` en flux.
  - Colonnes et nombre de lignes : `DESCRIBE` et `count(*)` sur `read_parquet` via `@duckdb/node-api`.
  - `DepotGithub` passe par `Bun.spawn(["gh", …])`, avec le jeton `GH_TOKEN` fourni par l'environnement.
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: collecte, validation et archives en GitHub Releases`.

---

### Task 4 : normalisation en tables canoniques

**Files :**
- Create : `pipeline/src/db.ts`, `pipeline/sql/01_normaliser.sql`, `tests/fixtures/*.csv`, `tests/aide.ts`
- Test : `tests/normaliser.test.ts`

**Interfaces :**
- Consumes : `assurerCache` (tâche 3), qui fournit les chemins Parquet.
- Produces :
  - `ouvrir(chemins: Record<SourceId, string>): Promise<Db>`, avec `Db = { sql<T>(q: string, params?: unknown[]): Promise<T[]>; fermer(): Promise<void> }`. Cette fonction exécute `01_normaliser.sql` après avoir créé une vue `src_{id}` par source.
  - Fonctions TypeScript, également enregistrées comme macros DuckDB (`CREATE MACRO`) pour être utilisables en SQL :
    - `depCanonique(code: string): string` ;
    - `rentree(v: string): number` ;
    - `famille(libelleNature: string, typeLycee: string | null): Famille | null` ;
    - `secteur(statut: string, contrat: string | null): Secteur | "prive_hors_contrat" | null` ;
    - `nombre(v: unknown): number | null`.
  - Tables :
    - `etablissements(uai, nom, famille, secteur, contrat, adresse, code_postal, code_commune, commune, dep, dep_libelle, aca, aca_libelle, lat, lon, ep, segpa, ulis, internat)` ; une ligne par UAI (site principal) ;
    - `sites(uai, rang, nom, adresse, code_postal, commune, principal)` : tous les sites des UAI multi-sites ;
    - `ips(uai, rentree, ips, ecart_type, dep_public, dep_prive, aca_public, aca_prive, nat_public, nat_prive)` ;
    - `personnels(uai, rentree, etp_total, etp_vs, etp_ens, etp_femmes, etp_agreges, etp_certifies, etp_plp, etp_autres_tit, etp_non_tit, etp_moins_35, etp_35_49, etp_50_plus, etp_anc_moins_2, etp_anc_2_4, etp_anc_5_7, etp_anc_8_plus)` ;
    - `exclus(uai, motif)`.
  - Fixtures de test dans `tests/aide.ts` :
    - `cheminsFixtures(dossier): Promise<Record<SourceId,string>>` convertit les CSV en Parquet ;
    - `dbTest(): Promise<Db>`.

**Constats sur l'annuaire réel (essai de la tâche 3, 2026-11-23) :**
- **L'UAI n'est pas unique** : sur 14 908 lignes réduites (collèges, lycées, EREA), seules 14 833 UAI sont distinctes. 69 UAI partagent 144 lignes, toutes marquées `multi_uai = 1` : ce sont les sites d'un même établissement (annexe, voie GT / voie pro, pôle), avec des noms ou adresses différents. Les statistiques étant publiées par UAI, il n'y a aucun double compte.
  **Décision du porteur (2026-11-23) : un site principal et la liste des autres sites.**
  - `multi_uai` rejoint les colonnes requises de l'annuaire.
  - La table `sites(uai, rang, nom, adresse, code_postal, commune, principal)` garde toutes les lignes. `etablissements` garde **une ligne par UAI**, celle du site principal, choisi de façon déterministe : d'abord un nom qui ne commence pas par « Annexe », puis un site qui n'est pas d'enseignement supérieur (nom contenant « sup », « supérieur », « prépa » ou « STS »), puis le nom le plus court, puis l'ordre alphabétique du nom et de l'adresse. Sur les données réelles, le critère « supérieur » évite de retenir « Notre-Dame (sup) » ou « Henri Bergson (enseignement supérieur) ».
  - La fiche porte `autresSites` et affiche « Établissement réparti sur {n} sites » avec la liste. Les voisins se calculent depuis le site principal.
  - La règle est publiée sur `/methode/`.
  - Test : `UAI multi-sites : un site principal, les autres listés`.
- **Le portail alterne entre deux états** sous la même date `modified`, avec des écarts sur une soixantaine d'UAI (codes postaux, casse des noms, adresses ; jamais de champ statistique). La collecte le gère : déduplication par empreinte sur toutes les versions, et suivi de la version actuelle (`actuelles` dans le manifest).
  **Décision du porteur (2026-11-23) : accepter, documenter, surveiller.** Une fiche peut changer d'adresse ou de casse d'une nuit à l'autre ; `/methode/` le mentionne. Si l'alternance persiste, on envisagera une hystérésis (basculer après deux nuits identiques). Le porteur peut signaler l'anomalie au producteur.
- **Autres valeurs réelles :**
  - `etat` vaut toujours `OUVERT` : l'export ne contient pas les établissements fermés, les disparitions passent par le registre des pages (tâche 7) ;
  - 1 477 lignes « SECTION ENSEIGNT GEN. ET PROF. ADAPTE » (des SEGPA ayant leur propre UAI) et 757 « SECTION D ENSEIGNEMENT PROFESSIONNEL » sont exclues par `famille_inconnue`, ce qui est voulu ;
  - `segpa` est du texte « 0 »/« 1 », `ulis` et `hebergement` des entiers 0/1 : la normalisation compare des chaînes (`v::varchar`) pour rester insensible au type ;
  - la rentrée des effectifs est une date `AAAA-01-01` qui désigne la rentrée de septembre AAAA (vérifié par l'IPS 2025-2026) ;
  - 140 établissements n'ont pas de coordonnées (2 seulement dans le périmètre).
- **Résultat sur les données réelles (essai de la tâche 4)** : 11 221 établissements dans le périmètre, 101 départements ; exclus : 2 319 `famille_inconnue`, 1 077 `prive_hors_contrat`, 207 `hors_perimetre_geographique`, 9 `secteur_inconnu`. 28 lycées changent de famille grâce au type de l'IPS.
- **Lycées sans IPS** : 223 lycées professionnels privés « SOUS CONTRAT ETABLISSEMENT AGRICOLE » (ministère de l'Agriculture, hors du champ de l'IPS de la DEPP), plus environ 300 lycées publics. Ils affichent « non disponible » ; aucun traitement spécial en phase 1.

**Correspondances :**
- **`famille`** (sur `libelle_nature` en majuscules) :
  - `college` : COLLEGE, COLLEGE SPECIALISE, COLLEGE CLIMATIQUE ;
  - `legt` : LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE, LYCEE D ENSEIGNEMENT GENERAL, LYCEE D ENSEIGNEMENT TECHNOLOGIQUE, LYCEE CLIMATIQUE, LYCEE EXPERIMENTAL ;
  - `lpo` : LYCEE POLYVALENT, LYCEE ENS GENERAL TECHNO PROF AGRICOLE ;
  - `lp` : LYCEE PROFESSIONNEL ;
  - `erea` : ETAB REGIONAL/LYCEE ENSEIGNEMENT ADAPTE ;
  - un `type_de_lycee` valant LEGT, LPO ou LP l'emporte ;
  - tout autre libellé donne `null`, avec le motif `famille_inconnue`.
- **`secteur`** :
  - `public` : « Public » ;
  - `prive_sous_contrat` : « Privé » avec l'un de ces contrats, comparés à l'identique :
    - CONTRAT D'ASSOCIATION TOUTES CLASSES ;
    - CONTRAT ASSOCIATION PARTIE DES CLASSES ;
    - CONTRAT SIMPLE TOUTES CLASSES ;
    - C0NTRAT SIMPLE POUR PARTIE DES CLASSES (écrit avec un zéro dans la source) ;
    - CONTRAT PARTIE DES CLASSES SIMPLE+ASSOC ;
    - CONTRAT TTES CLASSES SIMPLE+ASSOCIATION ;
    - SOUS CONTRAT ETABLISSEMENT AGRICOLE ;
  - `prive_hors_contrat` : HORS CONTRAT, avec le motif `prive_hors_contrat` ;
  - tout le reste, y compris INCONNU DU GESTIONNAIRE et `null`, donne `null`, avec le motif `secteur_inconnu`.
- **`ep`** : `appartenance_education_prioritaire` vaut « REP+ », « REP », ou `null` sinon.
- **`internat`** : `hebergement` vaut « 1 » ou « Oui ».
- **Établissement fermé** : `etat` ≠ `OUVERT` donne le motif `ferme`.

**Fixtures** (CSV avec les vrais noms de champs ; les mêmes servent aux tâches 5 à 11) :
- **`annuaire.csv`** :
  - `0440001A` Collège Jules-Verne, Public, COLLEGE, dép. `044`, aca 17, Nantes 44109, 47.218/-1.553, REP, SEGPA, ULIS ;
  - `0440002B` Collège Saint-Exemple, Privé, CONTRAT D'ASSOCIATION TOUTES CLASSES, COLLEGE, 47.225/-1.553 ;
  - `0440003C` Lycée Guist'hau, Public, LYCEE ENSEIGNT GENERAL ET TECHNOLOGIQUE, 47.220/-1.560 ;
  - `0440004D` Cours Libre, Privé, HORS CONTRAT ;
  - `0440005E` Collège Sans GPS, Public, latitude et longitude vides ;
  - `0440006F` Lycée Polyvalent Exemple, Public, LYCEE POLYVALENT, 47.230/-1.540 ;
  - `0440007G` Collège Simple, Privé, « C0NTRAT SIMPLE POUR PARTIE DES CLASSES », 47.300/-1.500 ;
  - `0440008H` Collège Mystère, Privé, « INCONNU DU GESTIONNAIRE » ;
  - `6200001F` Collège Ajaccio, Public, dép. `02A`, aca 27 ;
  - `9770001G` Collège Gustavia, Public, dép. `977`.
- **`ips_colleges.csv`** :
  - `0440001A` 2025-2026 : ips 92.4, écart-type 25.1, dep 106.4/121.4, aca 104.0/120.0, nat 99.9/118.5 ;
  - `0440001A` 2024-2025 : ips 93.0 ;
  - `0440002B` 2025-2026 : 123.0 ;
  - `6200001F` 2025-2026 : 101.2.
- **`ips_lycees.csv`** :
  - `0440003C` 2025-2026, LEGT, ips_etab "118.2", écart-type "30.0", `ips_departemental_legt_public` 112.0 et `_prive` 125.0 ;
  - `0440006F` 2025-2026, LPO, ips_etab "NA".
- **`effectifs_colleges.csv`** :
  - `0440001A` 2025 : total 590, SEGPA 48, ULIS 12, 6e 150 (filles 76, garçons 74), 5e 148 (70, 78), 4e 146 (75, 71), 3e 146 (69, 77), LV1 anglais 574, allemand 10, espagnol 6 ;
  - `0440001A` 2024 : total 600 ;
  - `0440002B` 2025 : total 600 ;
  - `0440005E` 2025 : total 300.
- **`effectifs_lycees_gt.csv`** :
  - `0440003C` 2025 : 1200 élèves, 2ndes_gt 400 (filles 210, garçons 190) ;
  - `0440006F` 2025 : 700.
- **`effectifs_lycees_pro.csv`** : `0440006F` 2025 : 300, 2ndes_pro 100.
- **`personnels.csv`** (rentrée 2025) :
  - `0440001A` : total 52, VS 5, ens 40, femmes 25.6, agrégés 3.2, certifiés 31.2, PLP 0, autres 1.6, non titulaires 4, < 35 ans 12, 35-49 ans 18.4, ≥ 50 ans 9.6, ancienneté < 2 ans 8, 2-4 ans 12, 5-7 ans 8.8, ≥ 8 ans 11.2 ;
  - `0440002B` : total 33.5, VS vide, ens 30, femmes 21.3, non titulaires 3 ;
  - `0440005E` : VS 0, ens vide ;
  - `0440003C` : VS 12, ens 90, non titulaires 9.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("codes et rentrées", () => {
  expect(["001","01","02A","2A","044","971","976"].map(depCanonique)).toEqual(["01","01","2A","2A","44","971","976"]);
  expect([rentree("2025-2026"), rentree("2025"), rentree("2025-01-01")]).toEqual([2025, 2025, 2025]);
});
test("nombre NA", () => { expect(nombre("NA")).toBeNull(); expect(nombre("")).toBeNull(); expect(nombre("98,2")).toBe(98.2); });
test("famille", () => { expect(famille("LYCEE PROFESSIONNEL", "LPO")).toBe("lpo"); expect(famille("SECTION D ENSEIGNEMENT PROFESSIONNEL", null)).toBeNull(); });
test("contrat avec zéro et inconnu", async () => {
  const db = await dbTest();
  expect(await db.sql("select secteur from etablissements where uai='0440007G'")).toEqual([{ secteur: "prive_sous_contrat" }]);
  const motifs = Object.fromEntries((await db.sql<{uai:string,motif:string}>("select uai, motif from exclus")).map(r => [r.uai, r.motif]));
  expect(motifs).toMatchObject({ "0440004D": "prive_hors_contrat", "0440008H": "secteur_inconnu", "9770001G": "hors_perimetre_geographique" });
});
test("périmètre et Corse", async () => { /* 7 UAI dans etablissements ; dep de 6200001F = "2A" */ });
test("IPS lycée : moyennes de la famille, NA absent", async () => {
  /* 0440003C -> (118.2, 112.0, 125.0) ; 0440006F -> ips null */
});
test("personnels vides restent null", async () => { /* etp_vs de 0440002B est null, pas 0 */ });
```

- [ ] **Step 2 :** `bun test tests/normaliser.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - Les fonctions TypeScript et les macros SQL sont testées sur les mêmes cas.
  - `01_normaliser.sql` est idempotent (`CREATE OR REPLACE`).
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: normalisation des sources en tables canoniques`.

---

### Task 5 : élèves détaillés (collèges et lycées)

**Files :**
- Create : `pipeline/sql/03_eleves.sql`, `pipeline/src/eleves.ts`
- Test : `tests/eleves.test.ts`

**Interfaces :**
- Consumes : les vues `src_effectifs_*` et la table `etablissements` (tâche 4).
- Produces :
  - les tables `effectifs(uai, rentree, eleves, filles, garcons, segpa, ulis)` et `effectifs_niveaux(uai, rentree, ordre, libelle, eleves, filles, garcons)`, ainsi que les comptes de langues `lv(uai, rentree, rang, langue, eleves)` ;
  - `calculerEleves(db: Db): Promise<Map<string, Eleves>>`, pour la dernière rentrée.

**Règles :**
- **Collèges :**
  - niveaux 6e, 5e, 4e et 3e, avec filles et garçons ;
  - `segpa` et `ulis` reprennent les totaux de la source ;
  - LV1 sur les quatre niveaux ; LV2 sur 5e, 4e et 3e.
- **Lycées GT :**
  - niveaux « Seconde GT », « Première » (somme des colonnes `1eres_*` hors `_filles` et `_garcons`) et « Terminale » (idem avec `terminales_*`) ;
  - filles et garçons sommés de la même façon.
- **Lycées pro :** niveaux « Seconde pro », « Première pro », « Terminale pro », « CAP 1re année », « CAP 2e année », avec filles et garçons.
- **Établissement présent dans les deux jeux de lycées** (cas typique des LPO) : on ajoute les deux niveaux et on additionne les totaux, filles et garçons. `source` liste les deux jeux.
- **Valeurs absentes :** une valeur absente reste `null`, et un total est `null` dès qu'une de ses parties est `null`. On ne fait aucune somme partielle silencieuse.

**Mise en œuvre et constats (tâche 5, 2026-11-23) :**
- Les niveaux sont déclarés dans `pipeline/src/colonnes-eleves.ts`. Le SQL est généré par `sqlEleves()` (étape « 03 » de `ETAPES` dans `db.ts`) et **les colonnes requises des trois jeux d'effectifs sont dérivées de ces définitions** : toute colonne lue par le calcul est exigée à la collecte.
- Lycées GT : « Seconde GT », « Première » et « Terminale » regroupent la voie générale et les voies technologiques (STI2D, STL, STMG, ST2S, STD2A, STHR, TMD, BT), par une liste explicite (le motif `1eres_*` capterait aussi les colonnes de langues). STHR, TMD et BT n'ont pas de répartition par sexe : si l'une a des élèves, filles et garçons du niveau sont `null`.
- Lycées pro : un niveau « Autres formations » (CAP en 3 ans, CAP en 1 an, BMA, CS/MC, autres) complète les cinq niveaux du plan.
- **Une voie à 0 élève compte 0 fille et 0 garçon**, même si la source laisse la case vide (fréquent). C'est une déduction certaine, pas un zéro inventé.
- **Secret statistique** : la source masque toujours filles *et* garçons ensemble quand l'un des sexes est très minoritaire (effectifs de 5 à 175 élèves). Rien ne permet de le déduire : le niveau reste `null`.
- **3e prépa-métiers** : 741 lycées pro et 456 LPO figurent aussi dans le jeu des collèges (environ 25 élèves de 3e chacun) ; les EREA figurent dans les jeux collèges et pro. L'addition des jeux est donc correcte. Conséquences : à la tâche 8, ne pas afficher les niveaux à 0 élève d'un lycée (« 6e : 0 ») ; à la tâche 6, les répartitions `lv1`/`lv2` ne concernent que la famille `college`.
- Données réelles 2025 : 10 642 établissements avec effectifs, 3,32 millions de collégiens, sept rentrées d'historique (2019-2025). Calcul complet (ouverture + normalisation + élèves) : 0,6 s.
- **Part de filles d'un établissement : décision du porteur (2026-11-23), option « partielle + couverture ».** Avec la règle stricte, `part_filles` aurait été `non_disponible` pour 78 % des LPO, 61 % des LP, 27 % des LEGT et 1 % des collèges, à cause d'une seule voie masquée. On la calcule donc **sur les niveaux dont filles et garçons sont publiés**, et on affiche leur couverture :
  - `effectifs` porte `filles_pub` et `garcons_pub` (sommes sur les niveaux publiés) ;
  - `part_filles` = 100 × filles_pub / (filles_pub + garcons_pub) ; la répartition `sexe_eleves` utilise les mêmes sommes ;
  - `couverture` = 100 × (filles_pub + garcons_pub) / élèves, plafonnée à 100, portée par `Mesure.couverture` et `Repartition.couverture` (champ optionnel, présent seulement s'il est inférieur à 100) ;
  - affichage : « 47,2 % (sur 92 % des élèves) » ; les moyennes de comparaison sont des Σ/Σ sur les niveaux publiés ;
  - si aucun niveau n'est publié, `non_disponible`. La part par niveau reste exacte.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("collège : niveaux et sexe", async () => {
  const e = (await calculerEleves(db)).get("0440001A")!;
  expect(e.total).toBe(590); expect(e.segpa).toBe(48);
  expect(e.niveaux[0]).toEqual({ libelle: "6e", eleves: 150, filles: 76, garcons: 74 });
});
test("LPO somme GT et pro", async () => {
  const e = (await calculerEleves(db)).get("0440006F")!;
  expect(e.total).toBe(1000); expect(e.source).toEqual(["effectifs_lycees_gt", "effectifs_lycees_pro"]);
  expect(e.niveaux.map(n => n.libelle)).toContain("Seconde pro");
});
test("lycée GT : filles en seconde", async () => {
  expect((await calculerEleves(db)).get("0440003C")!.niveaux[0]).toEqual({ libelle: "Seconde GT", eleves: 400, filles: 210, garcons: 190 });
});
```

- [ ] **Step 2 :** `bun test tests/eleves.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - La liste des colonnes de chaque niveau est déclarée dans `eleves.ts`, sous forme de constantes.
  - Le SQL est généré à partir de ces listes, pour ne pas écrire 180 colonnes à la main.
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: élèves par niveau, sexe et langue`.

---

### Task 6 : indicateurs, comparaisons et répartitions

**Files :**
- Create : `pipeline/sql/02_moyennes.sql`, `pipeline/src/indicateurs.ts`
- Test : `tests/indicateurs.test.ts`

**Interfaces :**
- Consumes : `Db` et les tables de la tâche 4 ; la table `effectifs(uai, rentree, eleves, filles, garcons, segpa, ulis)` et la table `lv` de la tâche 5. L'ordre d'exécution des `.sql` est 01, 03, 02, 04.
- Produces :
  - `calculerIndicateurs(db: Db): Promise<Map<string, Indicateur[]>>` ;
  - `calculerRepartitions(db: Db): Promise<Map<string, Repartition[]>>`.

Chaque indicateur prend la rentrée la plus récente où l'établissement a la donnée. Les comparaisons sont calculées pour cette même rentrée, aux trois niveaux, pour le public et pour le privé.

| code | numérateur / dénominateur (ou valeur) | comparaisons |
|---|---|---|
| `eleves` | effectifs.eleves ; historique de toutes les rentrées | aucune |
| `ips` | ips.ips ; historique | colonnes de la source (`calculee: false`) |
| `ecart_type_ips` | ips.ecart_type | aucune |
| `etp_total`, `etp_enseignants`, `etp_vs` | volumes | aucune |
| `eleves_par_etp_ens` | eleves / etp_ens | Σ/Σ |
| `eleves_par_etp_vs` | eleves / etp_vs ; pour le privé : `non_publie_prive` | Σ/Σ ; pour la moyenne privée : `non_publie_prive` |
| `part_enseignantes` | 100 × etp_femmes / etp_ens | Σ/Σ |
| `part_non_titulaires` | 100 × etp_non_tit / etp_ens | Σ/Σ |
| `part_agreges` | 100 × etp_agreges / etp_ens | Σ/Σ |
| `part_moins_35`, `part_50_plus` | 100 × etp_x / etp_ens | Σ/Σ |
| `part_anciennete_moins_2`, `part_anciennete_8_plus` | 100 × etp_x / etp_ens | Σ/Σ |
| `part_filles` | 100 × filles_pub / (filles_pub + garcons_pub), avec `couverture` (décision du 2026-11-23) | Σ/Σ |

| répartition | catégories (dans l'ordre) | références |
|---|---|---|
| `sexe_enseignants` | Femmes, Hommes (= ens − femmes) | dép. et France, public et privé |
| `statuts` | Agrégés ; Certifiés, PEPS ; PLP ; Autres titulaires ; Non titulaires | idem |
| `ages` | Moins de 35 ans ; 35 à 49 ans ; 50 ans ou plus | idem |
| `anciennete` | Moins de 2 ans ; 2 à 4 ans ; 5 à 7 ans ; 8 ans ou plus | idem |
| `sexe_eleves` | Filles, Garçons | idem |
| `lv1`, `lv2` (collèges) | Anglais, Allemand, Espagnol, (Italien pour LV2), Autres | idem |

Les parts d'une répartition sont calculées sur la somme des catégories. Une répartition dont la somme vaut 0 ou est absente est `non_disponible`.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("IPS et moyennes de la source", async () => {
  const i = await indic("0440001A", "ips");
  expect(i.mesure).toEqual({ valeur: 92.4, statut: "ok", source: "ips_colleges", rentree: 2025 });
  expect(i.comparaisons[0]).toMatchObject({ niveau: "departement", calculee: false, public: { valeur: 106.4 }, prive: { valeur: 121.4 } });
  expect(i.historique).toEqual([[2024, 93.0], [2025, 92.4]]);
});
test("vie scolaire : public calculé, privé non publié", async () => {
  expect((await indic("0440001A", "eleves_par_etp_vs")).mesure.valeur).toBe(118);
  expect((await indic("0440002B", "eleves_par_etp_vs")).mesure.statut).toBe("non_publie_prive");
  const dep = (await indic("0440001A", "eleves_par_etp_vs")).comparaisons[0];
  expect(dep.prive.statut).toBe("non_publie_prive"); expect(dep.calculee).toBe(true);
});
test("ETP nul exclu des moyennes", async () => {
  expect((await indic("0440005E", "eleves_par_etp_vs")).mesure.statut).toBe("non_disponible");
  expect((await indic("0440001A", "eleves_par_etp_vs")).comparaisons[0].public.valeur).toBe(118); // 0440005E exclu
});
test("moyenne par famille", async () => {
  // le lycée 0440003C n'entre pas dans la moyenne des collèges publics : (590)/(40) = 14.75
  expect((await indic("0440001A", "eleves_par_etp_ens")).comparaisons[0].public.valeur).toBe(14.75);
});
test("privé : ratios enseignants publiés", async () => { expect((await indic("0440002B", "eleves_par_etp_ens")).mesure.valeur).toBe(20); });
test("répartition des statuts", async () => {
  const r = await repart("0440001A", "statuts");
  expect(r.parts!.map(Math.round)).toEqual([8, 78, 0, 4, 10]);
  expect(r.references.find(x => x.niveau === "departement" && x.secteur === "public")!.parts).not.toBeNull();
});
test("part de filles", async () => { expect((await indic("0440001A", "part_filles")).mesure.valeur).toBeCloseTo(49.15, 1); });
```

**Mise en œuvre et constats (tâche 6, 2026-11-23) :**
- Le SQL est généré par `sqlIndicateurs()` (étape « 02 » de `ETAPES`, après les élèves) à partir des définitions `MESURES` et `DEF_REPARTITIONS` de `indicateurs.ts` : tables `base` (effectifs ⨝ personnels), `mesures`, `moyennes`, `repartitions`, `references_repartitions`. La table `ips` porte désormais sa `source` (`ips_colleges` ou `ips_lycees`).
- Chaque indicateur a un historique (toutes les rentrées où il est calculable). Un établissement sans donnée garde ses comparaisons, à la dernière rentrée disponible, pour être situé.
- Données réelles 2025 (collèges, France) : 14,8 élèves par ETP enseignant dans le public, 17,2 dans le privé ; 74,1 élèves par ETP de vie scolaire (public) ; 64,3 % d'enseignantes dans le public, 68,8 % dans le privé ; 7,0 % de non-titulaires dans le public, 15,4 % dans le privé. Calcul complet : environ 2,2 s ; environ 10 Ko de JSON d'indicateurs par fiche.
- Vie scolaire du privé : 3 108 fiches en `non_publie_prive`, comme attendu.
- **Couverture de `part_filles`** : 2 004 établissements ont une couverture inférieure à 100 % (médiane 73 %, minimum 1,7 %).
  **Décision du porteur (2026-11-23) : seuil de 50 %** (`SEUIL_COUVERTURE` dans `indicateurs.ts`). En dessous, `part_filles` et `sexe_eleves` sont `non_disponible` (la `couverture` reste dans la mesure, pour que la fiche explique pourquoi : « filles et garçons publiés pour 10 % des élèves seulement ») ; l'établissement n'entre ni dans les moyennes ni dans les références, et le point est retiré de l'historique.
  Effet réel : 689 fiches en `non_disponible` (575 sans seuil). Environ 330 établissements sous le seuil en 2025 affichent, selon la règle générale, la part de la dernière rentrée où elle est affichable (la rentrée est indiquée et les comparaisons portent sur cette même rentrée).

`indic(uai, code)` et `repart(uai, code)` sont des aides de `tests/aide.ts`. Elles mettent le résultat en cache pour toute la session de tests.

- [ ] **Step 2 :** `bun test tests/indicateurs.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - Les agrégats sont en SQL : une table `moyennes(code, niveau, territoire, famille, secteur, rentree, valeur)`, et une table de parts de référence équivalente.
  - L'assemblage en objets se fait en TypeScript.
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: indicateurs situés et répartitions`.

---

### Task 7 : voisins, fiches, registre des pages, export des données du site

**Files :**
- Create : `pipeline/sql/04_voisins.sql`, `pipeline/src/fiches.ts`, et la sous-commande `data` de `cli.ts`
- Test : `tests/fiches.test.ts`

**Interfaces :**
- Consumes : tâches 3 à 6.
- Produces :
  - `distanceKm(lat1, lon1, lat2, lon2): number` : haversine, avec un rayon terrestre de 6371,0 km ;
  - `calculerVoisins(db: Db, k = 6, rayonKm = 30): Promise<Map<string, Voisin[] | null>>` ;
  - `assemblerFiches(db: Db, manifest: Manifest, registre: Registre, maintenant: Date): Promise<Fiche[]>` ;
  - `interface Registre { [uai: string]: { premiere: string; derniere: string; fiche: Fiche } }`, lu et écrit dans `archives/registre-pages.json`, avec les fonctions `lireRegistre(chemin)` et `ecrireRegistre(chemin, r)` ;
  - `exporter(fiches: Fiche[], db: Db, sortie = "site/data"): Promise<void>`, qui écrit les fichiers suivants :
    - `site/data/fiches/{UAI}.json` ;
    - `site/data/index.json` : `[{u, n, c, d, f, s}]` ;
    - `site/data/departements/{dep}.json` : `{dep, libelle, aca, acaLibelle, familles: {[famille]: {compte: {public, prive}, eleves: {public, prive}, ipsMoyen: {public, prive}, distributionIps: {public: number[], prive: number[], bornes: number[]}, moyennes: Indicateur[], liste: LigneListe[]}}, horsContrat: number}` ;
    - `site/data/france.json`, qui contient les mêmes agrégats nationaux pour l'accueil ;
    - `site/data/sources.json`, qui donne les `Version` de chaque source.
  - `type LigneListe = { uai: string; nom: string; secteur: Secteur; commune: string; ep: string | null; eleves: number | null; elevesParEtpEns: number | null; elevesParEtpVs: number | null; statutVs: Statut; partEnseignantes: number | null; ips: number | null }`

**Règles :**
- **Familles compatibles pour le voisinage :**
  - `college` avec `college` ;
  - `legt` avec `legt` et `lpo` ;
  - `lpo` avec `legt`, `lpo` et `lp` ;
  - `lp` avec `lp` et `lpo` ;
  - `erea` avec `erea`.
- **Sélection des voisins :**
  - public et privé sous contrat ;
  - les k plus proches dans le rayon, triés par distance ;
  - pré-filtre en boîte englobante (±0,3° de latitude, ±0,45° de longitude), puis distance haversine exacte en SQL.
- **Coordonnées absentes :** `voisins = null`, et l'établissement n'apparaît chez personne comme voisin.
- **Registre des pages :**
  - chaque UAI du périmètre est ajoutée ou mise à jour (`derniere` = date de collecte de l'annuaire, `fiche` = la dernière fiche complète) ;
  - une UAI du registre absente du périmètre produit une fiche à partir de `registre[uai].fiche`, avec `disparuLe = registre[uai].derniere`, sans voisins, et elle n'est voisine de personne.
- **`sources` d'une fiche :** les seules sources réellement utilisées. `brutUrl` reprend l'`url` de la `Version`.
- **Distribution des IPS :** classes de 5 points, de 60 à 160.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("distance", () => { expect(Math.round(distanceKm(47.218, -1.553, 47.225, -1.553) * 100) / 100).toBe(0.78); });
test("voisins d'un collège", async () => {
  const v = (await calculerVoisins(db)).get("0440001A")!;
  expect(v.map(x => x.uai)).toEqual(["0440002B", "0440007G"]);   // hors contrat, lycées, sans GPS exclus
});
test("sans coordonnées", async () => { /* get("0440005E") === null ; absent de toutes les listes */ });
test("rayon : seul en Corse", async () => { expect((await calculerVoisins(db)).get("6200001F")).toEqual([]); });
test("page conservée après disparition", async () => {
  const registre = { "0440099Z": { premiere: "2026-01-01", derniere: "2026-10-01", fiche: ficheMinimale("0440099Z") } };
  const f = (await assemblerFiches(db, manifest, registre, new Date())).find(x => x.uai === "0440099Z")!;
  expect(f.disparuLe).toBe("2026-10-01"); expect(f.voisins).toBeNull();
});
test("export", async () => { /* fichiers fiches/0440001A.json, index.json (7 entrées actives + registre), departements/44.json existent */ });
test("sources d'une fiche", async () => { /* 0440003C -> ["annuaire","ips_lycees","effectifs_lycees_gt","personnels"] */ });
```

- [ ] **Step 2 :** `bun test tests/fiches.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - `cli.ts data` enchaîne : `assurerCache`, `ouvrir`, `.sql` (01, 03, 02, 04), indicateurs, élèves, voisins, fiches, registre, `exporter`.
  - Il affiche le nombre de fiches et le nombre d'exclus par motif.
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: voisins, fiches, registre des pages et export`.

---

### Task 8 : site Astro, socle visuel et fiche établissement (web)

**Files :**
- Create : `site/astro.config.mjs`, `site/src/lib/donnees.ts`, `site/src/lib/plot.ts`, `site/src/layouts/Base.astro`, `site/src/components/{Entete,Bandeau,Comparaisons,Points,Empile,Barres,Courbe,Voisins,Sources,Absence}.astro`, `site/src/pages/etablissement/[uai].astro`, `site/src/styles/obs.css`, `site/public/js/theme.js`, `site/public/js/carte.js`
- Test : `tests/site-fiche.test.ts`

**Interfaces :**
- Consumes : les JSON de `site/data/` (tâche 7), `format.ts` et `libelles.ts` (tâche 1).
- Produces :
  - `lireFiche(uai): Fiche`, `lireIndex()`, `lireDepartement(dep)`, `lireFrance()`, `lireSources()` ;
  - `svgPoints(rangs: {libelle: string; public: number | null; prive: number | null}[], valeur: number | null, domaine: [number, number]): string` ;
  - `svgBarres(serie: [number, number][]): string` ;
  - `svgCourbe(serie: [number, number][], public: [number, number][], prive: [number, number][]): string`.

  Les trois fonctions SVG passent par Plot et `linkedom`, utilisent les variables CSS (`var(--pub)` et suivantes) pour que le thème sombre s'applique, et posent un `role="img"` avec un `aria-label` descriptif.

**Contenu de la page**, dans l'ordre et la forme de `maquettes-2026-11-23/fiche-public.html` et `fiche-prive.html` (document socle, sections 4.1 et 4.2) :
1. **En-tête :**
   - fil d'Ariane France › Académie › Département › Commune ; en phase 1, seul le maillon Département est un lien ;
   - nom et pastilles ;
   - si `autresSites` est non vide : « Établissement réparti sur {n} sites », avec le nom et l'adresse de chacun ;
   - boutons « Imprimer / PDF », « Afficher la carte » et « Copier le lien ».
2. **Bandeau des six chiffres clés**, chacun avec les moyennes départementales public et privé.
3. **Sommaire.**
4. **Élèves**, avec l'effectif historique, les niveaux et le sexe, SEGPA et ULIS (ou « pas de SEGPA »), et les langues.
5. **Composition sociale :**
   - le graphique à points de l'IPS ;
   - la courbe d'historique ;
   - un tableau des écarts au format `{écart} ({moyenne})`.
6. **Enseignants**, avec les volumes, les ratios en `{écart} ({moyenne})` et les quatre barres empilées (`Empile.astro` en HTML/CSS : une rampe de gris, une ligne par référence, des hachures pour les absences).
7. **Vie scolaire.**
8. **Voisins.**
9. **Sources**, avec la date de génération et le lien permanent `{SITE_URL}/etablissement/{UAI}/`.
10. **Page disparue** : si `disparuLe` est renseigné, un bandeau en tête de page porte le libellé exact.

Règles d'intégration :
- `carte.js` charge `/js/maplibre-gl.js`, copié depuis `node_modules` au build, et le style `https://tiles.openfreemap.org/styles/positron`, uniquement au clic.
- `theme.js` bascule `data-theme` et mémorise le choix dans `localStorage`, dans un `try/catch`.
- `Base.astro` pose `lang="fr"`, la balise canonical, le `noindex` si `INDEXABLE` vaut false, et le pied de page « Données : Licence Ouverte 2.0. Code : AGPL-3.0. Ce site ne commente pas les chiffres. ».

- [ ] **Step 1 : écrire les tests qui doivent échouer.** On construit le site sur les fixtures (`bun run data` sur les fixtures, puis `astro build` vers `.cache/dist-test`), et on lit le HTML avec `linkedom`.

```ts
test("fiche publique", () => {
  const h = page("etablissement/0440001A");
  expect(h).toContain("Collège Jules-Verne"); expect(h).toContain("−14,0 (106,4)");
  expect(h).toContain("Saint-Exemple");                               // voisin nommé
  expect(h).toMatch(/Source : MEN-DEPP, Indices de position sociale des collèges · rentrée 2025-2026 · collecté le \d\d\/\d\d\/\d{4}/);
});
test("fiche privée : vie scolaire non publiée", () => {
  const h = page("etablissement/0440002B");
  expect(h).toContain("non publié pour le privé"); expect(h).not.toMatch(/ETP de vie scolaire[^<]*<[^>]*>\s*0[,<]/);
});
test("sans GPS", () => { expect(page("etablissement/0440005E")).toContain("Voisins non calculables (coordonnées absentes)"); });
test("pas de SEGPA", () => { expect(page("etablissement/0440002B")).toContain("pas de SEGPA"); });
test("SVG rendus au build, aucun script Plot", () => {
  const h = page("etablissement/0440001A"); expect(h).toContain("<svg"); expect(h).not.toContain("observablehq");
});
test("poids d'une fiche complète", () => { expect(octets("etablissement/0440001A")).toBeLessThanOrEqual(50_000); });
```

`page(chemin)` et `octets(chemin)` sont des aides de `tests/aide.ts`. Elles construisent le site de test une seule fois par session.

- [ ] **Step 2 :** `bun test tests/site-fiche.test.ts`. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
  - `getStaticPaths` lit `lireIndex()`.
  - `obs.css` reprend les jetons et les composants de la maquette, sans les règles `.note` ni `.soon`.
- [ ] **Step 4 :** relancer, puis vérifier le rendu dans un navigateur : clair, sombre et 375 px de large. Attendu : PASS, et un rendu conforme aux maquettes.
- [ ] **Step 5 :** commit `feat: fiche établissement`.

---

### Task 9 : fiche imprimable A4

**Files :**
- Create : `site/src/components/FicheA4.astro` ; modifier `etablissement/[uai].astro` et `obs.css` (`@media print`)
- Test : `tests/site-impression.test.ts`

**Interfaces :**
- Consumes : `Fiche` ; `qrcode.toString(url, { type: "svg", margin: 0 })`.
- Produces : un bloc `.a4` présent dans la page, masqué à l'écran et seul affiché à l'impression (`@page { size: A4; margin: 11mm 12mm }`).

**Contenu** (calqué sur `maquettes-2026-11-23/fiche-a4.html`, document socle 4.3) :
- **En-tête :** identité, date d'édition, lien permanent et QR code.
- **Tableau central** : une ligne par indicateur ayant des comparaisons, avec les colonnes établissement, puis département, académie et France, chacune en public et en privé. On y met **les moyennes seules**, et chaque ligne renvoie à sa source par un numéro `[n]`.
- **Deux petits tableaux** : élèves par niveau, et personnels en ETP.
- **Voisins**, avec leur UAI.
- **Sources numérotées**, la définition de « non publié », et « Ce document ne contient aucun commentaire : il reproduit des données publiques. ».
- **Aucun SVG** dans le bloc `.a4`.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("bloc A4 : moyennes seules, sources numérotées, QR", () => {
  const a4 = doc("etablissement/0440001A").querySelector(".a4")!;
  expect(a4.textContent).toContain("106,4"); expect(a4.textContent).not.toContain("(106,4)");
  expect(a4.textContent).toMatch(/\[\d\]/); expect(a4.querySelectorAll("svg").length).toBe(1); // le QR seul
  expect(a4.textContent).toContain("Ce document ne contient aucun commentaire");
});
```

- [ ] **Step 2 :** lancer le test. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** relancer, puis contrôler à la main l'aperçu avant impression (⌘P) sur la fiche du collège et sur celle d'un lycée polyvalent. Attendu : PASS, et une seule page A4 dans les deux cas.
- [ ] **Step 5 :** commit `feat: fiche imprimable A4`.

---

### Task 10 : pages département, accueil, recherche, sources, méthode, 404, sitemap

**Files :**
- Create : `site/src/pages/departement/[dep].astro`, `index.astro`, `sources.astro`, `methode.astro`, `404.astro`, `recherche.json.ts`, `sitemap.xml.ts`, `site/public/js/recherche.js`, `site/public/js/liste.js`
- Test : `tests/site-pages.test.ts`

**Interfaces :**
- Consumes : `lireDepartement`, `lireFrance`, `lireSources` et `lireIndex` (tâche 8).
- Produces : les pages ci-dessous.

**Pages :**
- **Département** (document socle 4.4, sans la carte) :
  - un onglet par famille présente ;
  - le bandeau, avec le hors contrat et « non couvert par les statistiques publiques » ;
  - la distribution des IPS (Plot, barres public pleines et privé en contour) ;
  - l'IPS moyen comparé ;
  - le tableau des moyennes face à l'académie et à la France ;
  - la liste complète, avec ses filtres et son tri par `liste.js` : tri par nom par défaut, triable sur chaque colonne, aucun rang ;
  - le lien de téléchargement CSV de la liste (généré au build).
- **Accueil** (document socle 4.5) :
  - le titre et le paragraphe exacts de la maquette ;
  - la recherche (`recherche.js` charge `/recherche.json` au premier focus, normalise les accents et la casse, regroupe établissements et départements, affiche au plus 20 établissements, et un message explicite s'il n'y a aucun résultat) ;
  - le bandeau national, les académies et leurs départements (seul le département est un lien), les dernières mises à jour des sources tirées de `sources.json`, et les quatre principes.
- **Sources :**
  - pour chaque source : le titre, le producteur, le lien et chaque version (date de collecte, rentrée, empreinte courte, lien de téléchargement Release) ;
  - les dates des exécutions récentes tirées du journal.
- **Méthode :** périmètre et exclusions, moyennes Σ/Σ et exclusion des dénominateurs nuls, moyennes de l'IPS publiées par la DEPP, voisinage (familles compatibles, 6 voisins, 30 km), absences, pages conservées après disparition. Établissements multi-sites (règle du site principal) et alternance possible des adresses dans l'annuaire (décisions du 2026-11-23).
- **404 :** une adresse `/etablissement/[0-9a-z]{8}/` contenant des minuscules redirige (`location.replace`) vers sa forme en majuscules. Sinon, la page propose un lien vers l'accueil et la recherche.
- **Sitemap :** toutes les pages, avec pour `<lastmod>` la date de collecte la plus récente.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("département : tri par nom, onglets, hors contrat", () => {
  const d = doc("departement/44");
  const noms = [...d.querySelectorAll("#liste-college tbody td:first-child")].map(td => td.textContent!.trim());
  expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
  expect(d.textContent).toContain("non couvert par les statistiques publiques");
});
test("accueil : recherche et territoires", () => { /* input#q présent ; lien /departement/44/ ; "Académie de Nantes" sans lien */ });
test("recherche.json : clés courtes", () => { /* tableau d'objets {u,n,c,d,f,s} ; 0440004D absent */ });
test("404 : redirection minuscules", () => { expect(page("404")).toContain("toUpperCase"); });
test("sitemap", () => { /* contient /etablissement/0440001A/ et /departement/2A/ */ });
```

- [ ] **Step 2 :** lancer le test. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** relancer, puis tester la recherche à la main : « jules », « 0440 », « loire » et une recherche sans accent. Attendu : PASS.
- [ ] **Step 5 :** commit `feat: département, accueil, recherche, sources, méthode`.

---

### Task 11 : contrôles transverses du HTML, garde-fous et build complet

**Files :**
- Create : `scripts/garde-fous.ts` ; le script `build` de la racine enchaîne `bun run data && bun --cwd site astro build && bun scripts/garde-fous.ts`
- Test : `tests/site-transverse.test.ts`

**Interfaces :**
- Produces : `verifierDist(dossier: string, limites = { octets: 900e6, fichiers: 50_000 }): { octets: number; fichiers: number }`, qui lève une erreur au-delà des limites. Le script écrit aussi `CNAME` si `DOMAINE` est non vide, et `robots.txt` selon `INDEXABLE`.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
test("anti-palmarès sur toutes les pages", () => {
  const interdit = /\b(rang|classement|top|meilleur|meilleure|meilleurs|meilleures|pire|pires)\b/i;
  for (const p of toutesLesPages()) expect(interdit.test(texte(p))).toBe(false);
});
test("aucun zéro à la place d'une absence", () => { /* sur 0440002B et 0440005E : les cellules vie scolaire ne valent jamais "0" ni "0,0" */ });
test("chaque fiche porte au moins une ligne de source", () => { /* toutes les pages etablissement/* */ });
test("garde-fou de volume", () => { expect(() => verifierDist(".cache/dist-test", { octets: 10, fichiers: 50_000 })).toThrow(); });
test("CNAME et noindex", () => { /* DOMAINE vide -> pas de CNAME ; INDEXABLE false -> meta noindex présent */ });
```

- [ ] **Step 2 :** lancer le test. Attendu : FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** lancer `bun test`, c'est-à-dire toute la suite. Attendu : tout PASS ; la couverture (`bun test --coverage`) est d'au moins 80 % des lignes de `pipeline/src` et `shared/src`.
- [ ] **Step 5 : essai réel en local.**
  - Lancer `bun run collect`, avec un `DepotLocal` sous `.cache/depot` via `OBS_DEPOT=local`, puis `bun run build`.
  - Résultat attendu :
    - environ 11 000 à 12 000 fiches ;
    - le compte des exclus affiché par motif ;
    - une taille de `dist/` affichée sous 900 Mo, et une fiche réelle de lycée polyvalent sous 50 Ko.
  - Contrôler à la main quatre valeurs par rapport à data.education.gouv.fr :
    - l'IPS d'un collège public de Loire-Atlantique ;
    - l'IPS d'un collège privé ;
    - le ratio élèves par ETP de vie scolaire d'un collège public, comparé au dépôt AED ;
    - la part de filles en 6e d'un collège.
- [ ] **Step 6 :** commit `feat: contrôles transverses et build complet`.

---

### Task 12 : intégration continue, collecte nocturne et déploiement

**Files :**
- Create : `.github/workflows/tests.yml`, `.github/workflows/nightly.yml` ; modifier `README.md` (fonctionnement, sources, mise en ligne, licences)

**`tests.yml`** se déclenche sur `push` et `pull_request` ; il enchaîne `oven-sh/setup-bun` (version `1.4.x`), `bun install --frozen-lockfile` et `bun test`.

**`nightly.yml`** :
- **Déclencheurs :** `schedule` (cron `17 2 * * *`), `workflow_dispatch`, et `push` sur `main`.
- **Permissions :** `contents: write`, `pages: write`, `id-token: write`.
- **Concurrence :** groupe `pages`, sans annuler l'exécution en cours.
- **Job `collecter-construire` :**
  1. checkout, puis setup-bun, puis `bun install` ;
  2. si l'événement n'est pas un `push` :
     - lancer `bun run collect` avec `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` ;
     - committer `archives/` (manifest, journal, registre) sous l'identité `github-actions[bot]`, avec le message `data: collecte du AAAA-MM-JJ`, puis pousser ;
     - le journal garantit un commit chaque nuit, ce qui évite la suspension des tâches planifiées après 60 jours ;
  3. si l'événement est `schedule` et que `archives/manifest.json` est identique avant et après la collecte : terminer sans reconstruire ;
  4. `bun run build`, avec un cache `actions/cache` sur `.cache/archives` indexé par l'empreinte du manifest ;
  5. `actions/upload-pages-artifact` sur `dist`.
- **Job `deployer` :** `actions/deploy-pages`.

- [ ] **Step 1 :** écrire les deux workflows, puis lancer `bunx actionlint`. Attendu : une sortie vide.
- [ ] **Step 2 :** commit `ci: tests, collecte nocturne et déploiement Pages`.
- [ ] **Step 3 : mise en ligne, par le porteur.** Ces étapes sont manuelles ; l'agent ne peut pas les faire.
  1. Créer l'organisation GitHub dédiée et le dépôt public, puis renseigner `DEPOT` dans `observatoire.config.json`.
  2. Pousser le dépôt. Dans Settings → Pages, choisir la source « GitHub Actions ».
  3. Lancer `nightly` à la main. Tant que `INDEXABLE` vaut false, le site sert d'aperçu non référencé.
  4. Une fois le domaine `observatoireeducation.fr` acheté, créer les enregistrements DNS de `observatoireeducation.fr` vers GitHub Pages (A/AAAA à l'apex, `www` en CNAME vers `<org>.github.io`). Renseigner `DOMAINE` (`observatoireeducation.fr`) et `SITE_URL` (`https://observatoireeducation.fr`), passer `INDEXABLE` à true, puis activer « Enforce HTTPS ». C'est seulement à ce moment que la mise en ligne devient publique.
- [ ] **Step 4 : vérification.**
  - L'exécution `nightly` est verte.
  - La fiche d'un établissement réel répond à son URL.
  - Le lien « donnée brute » d'une source télécharge bien le Parquet archivé.
  - L'exécution planifiée du lendemain produit un commit `data: collecte du …`.
