# Accueil et page Sources : montrer le travail d'agrégation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** refaire l'accueil (accroche, chiffres, recherche, bandeau « fabrique », fiche vitrine courte, comparatif) et ouvrir /sources/ sur la démonstration complète « D'où viennent les chiffres ».

**Architecture:** deux modules purs côté site calculent les compteurs (`lib/fabrique.ts`, depuis `sources.json`) et le contenu de la vitrine (`lib/vitrine.ts`, depuis la fiche de l'UAI configurée). Un composant `FicheVitrine.astro` (variantes courte / complète) est partagé par l'accueil et /sources/. Le pipeline ajoute un seul champ à `france.json` : `seriesDepuis`.

**Tech Stack:** Astro (sortie statique), TypeScript, Bun (`bun test`), DuckDB côté pipeline.

**Spec:** `docs/superpowers/specs/2026-11-25-observatoire-accueil-recit-design.md` · maquettes : `docs/superpowers/specs/maquettes-2026-11-25-accueil/accueil-c.html` et `accueil-c-sources.html` (référence visuelle et textes exacts).

## Global Constraints

- Site froid : aucun commentaire sur les chiffres, aucun site commercial nommé.
- Mots interdits partout (test existant) : `rang`, `classement`, `top`, `meilleur(e)(s)`, `pire(s)`.
- Aucun chiffre écrit en dur : nombre de jeux, producteurs, portails, « séries depuis », N de la vitrine, valeurs des tuiles.
- La rangée Écoles / Collèges / Lycées / EREA / Élèves de l'accueil actuel reste, inchangée dans son contenu et sa ligne de sources ; le bloc Principes reste (« Sans palmarès »).
- Pas de nouveau JavaScript ; tout est rendu au build.
- Couleurs : uniquement les tokens de `site/src/styles/obs.css` (clair et sombre) ; pas de classe `.note` de maquette.
- Une session parallèle travaille sur le bâti (`pipeline/src/sources.ts`, fiches, `BlocBatiment`) : ne pas modifier `pipeline/src/sources.ts` ; dans `pipeline/src/territoires.ts`, ne toucher que la construction de `france`.

## Review Focus

1. **UAI vitrine absente, fermée ou sans fiche** (config erronée, établissement disparu) : le build passe, le bloc vitrine est omis sur l'accueil et /sources/, un avertissement est écrit sur stderr. → test Task 3.
2. **Vitrine privée ou incomplète** (pas d'IPS publié, pas de budget, pas de valeur ajoutée) : les tuiles manquantes sont omises, jamais affichées à zéro ; N = nombre de sources réellement citées. → test Task 3.
3. **Source sans version actuelle** dans `sources.json` (jeu jamais collecté, ou bâti en cours) : non comptée dans les jeux, producteurs, portails. → test Task 2.
4. **Dernière collecte ancienne** (build relancé sans collecte) : afficher la date, pas « cette nuit ». → test Task 2.
5. **Largeur mobile 375 px** : pas de défilement horizontal (comparatif sur une colonne, mini-fiche sur une colonne). → vérification Task 6.

---

### Task 1: `seriesDepuis` dans `france.json`

**Files:**
- Modify: `shared/src/donnees.ts` (interface `DonneesFrance`)
- Modify: `pipeline/src/territoires.ts` (construction de `france`, vers la ligne 798)
- Test: `tests/territoires.test.ts`

**Interfaces:**
- Produces: `DonneesFrance.seriesDepuis: number | null` — plus petite rentrée présente dans les séries des fiches actives : premier point de chaque `Indicateur.historique`, de `Classes.historique` (écoles) et de `ResultatsVoie` (séries de sessions). `null` si aucune série.

- [ ] **Step 1: test qui échoue** — dans `tests/territoires.test.ts`, `test("france.json : seriesDepuis = première rentrée des séries des fiches actives")` : sur les fixtures, `france.seriesDepuis` égale le minimum calculé indépendamment dans le test à partir des fiches actives (parcours des mêmes historiques) ; et sur une liste de fiches vide, `seriesDepuis` vaut `null`.
- [ ] **Step 2:** `bun test tests/territoires.test.ts` → FAIL (`seriesDepuis` undefined).
- [ ] **Step 3:** ajouter le champ (commentaire JSDoc en français) et le calcul dans `exporterTerritoires`, à partir de `actives`.
- [ ] **Step 4:** `bun test tests/territoires.test.ts && bun run typecheck` → PASS.
- [ ] **Step 5: commit** `feat(france): première rentrée des séries publiées (seriesDepuis)`

---

### Task 2: compteurs de la fabrique

**Files:**
- Create: `site/src/lib/fabrique.ts`
- Test: `tests/fabrique.test.ts`

**Interfaces:**
- Consumes: `DonneesSource` (`shared/src/donnees.ts`).
- Produces:
  ```ts
  export interface SourceHorsRegistre { producteur: string; pageUrl: string }
  /** Sources affichées sur /sources/ mais absentes du registre (contours IGN). */
  export const SOURCES_HORS_REGISTRE: SourceHorsRegistre[]; // [{ producteur: "IGN", pageUrl: "https://data.geopf.fr/wfs/ows" }]
  export interface Fabrique {
    jeux: number;            // pageUrl distinctes
    producteurs: string[];   // libellés courts, ordre : MEN, DEPP, DGESCO, DGFiP, Insee, IGN, puis alphabétique
    portails: number;        // noms d'hôte distincts des pageUrl
    derniereCollecte: string | null; // ISO, max des actuelle.collecteLe
  }
  export function compterFabrique(sources: Record<string, DonneesSource>, horsRegistre?: SourceHorsRegistre[]): Fabrique;
  export function producteurCourt(p: string): string; // "MEN-DEPP" → "DEPP", "MEN-DGESCO" → "DGESCO", sinon inchangé
  /** « cette nuit » si la collecte date de moins de 24 h à `maintenant`, sinon « le JJ/MM/AAAA » (format.date). */
  export function libelleCollecte(iso: string, maintenant: Date): string;
  ```

- [ ] **Step 1: tests qui échouent** dans `tests/fabrique.test.ts` :
  - deux sources `budget_2024` et `transport_2024` de même `pageUrl` → `jeux` compte 1 ;
  - une source avec `actuelle: null` n'est comptée ni en jeux, ni en producteurs, ni en portails ;
  - sources MEN, MEN-DEPP, MEN-DGESCO, DGFiP, Insee + IGN hors registre → `producteurs` = `["MEN","DEPP","DGESCO","DGFiP","Insee","IGN"]`, `portails` = nombre d'hôtes distincts ;
  - `libelleCollecte("2026-11-25T02:10:00Z", new Date("2026-11-25T09:00:00Z"))` = `"cette nuit"` ; avec `maintenant` = 2026-11-27 → `"le 25/11/2026"`.
- [ ] **Step 2:** `bun test tests/fabrique.test.ts` → FAIL (module absent).
- [ ] **Step 3:** implémenter dans `site/src/lib/fabrique.ts` (aucune dépendance à Astro ; `date` vient de `@obs/shared/format`).
- [ ] **Step 4:** `bun test tests/fabrique.test.ts` → PASS.
- [ ] **Step 5: commit** `feat(site): compteurs de la fabrique calculés depuis sources.json`

---

### Task 3: établissement vitrine

**Files:**
- Modify: `site/src/lib/config.ts` (champ `VITRINE`), `observatoire.config.json` (`"VITRINE": { "UAI": "0440061C" }`), `tests/fixtures/observatoire.config.json` (`"VITRINE": { "UAI": "0440001A" }`, collège public des fixtures avec IVAC et carte scolaire)
- Create: `site/src/lib/vitrine.ts`
- Test: `tests/vitrine.test.ts`

**Interfaces:**
- Consumes: `lireFiche`, `lireIndex` (`site/src/lib/donnees.ts`), `Fiche`, `SourceRef` (`shared/src/types.ts`), `producteurCourt` (Task 2).
- Produces:
  ```ts
  // config.ts
  VITRINE?: { UAI: string };
  // vitrine.ts
  export interface SourceVitrine { numero: number; id: SourceId; titre: string; producteur: string; portail: string; pageUrl: string }
  export interface TuileVitrine { libelle: string; valeur: string; detail: string | null; numeros: number[]; large?: boolean }
  export interface Vitrine { uai: string; nom: string; sousTitre: string; lien: string; tuiles: TuileVitrine[]; sources: SourceVitrine[]; producteurs: string[]; portails: number }
  export function sourcesVitrine(fiche: Fiche): SourceVitrine[]; // fiche.sources dédoublonnées par pageUrl, numérotées 1..N dans l'ordre de fiche.sources
  export function tuilesVitrine(fiche: Fiche, sources: SourceVitrine[]): TuileVitrine[];
  /** null + avertissement stderr si pas de VITRINE, UAI absent de l'index, fiche disparue/fermée. */
  export function chargerVitrine(): Vitrine | null;
  ```
- Tuiles, dans cet ordre, chacune omise si sa donnée est absente (jamais de zéro) : Élèves (dernière rentrée, détail = série courte « 2019 → 2025 : a … b ») ; Élèves par ETP enseignant (détail = moyenne dép. public) ; IPS (large ; libellé « IPS · AAAA → AAAA » + « deux séries raboutées » si `sourcesHistorique` contient deux jeux ; détail = moyennes dép. public et privé s. c.) ; Brevet (taux, session ; détail = valeur ajoutée ou libellé d'absence existant de `@obs/shared/libelles`) ; Fonctionnement par élève (dernier exercice ; détail = moyenne France) ; Secteur (large ; nombre d'écoles du secteur, PIAL). Les valeurs et libellés d'absence passent par `@obs/shared/format` et `@obs/shared/libelles`, comme la synthèse de la fiche (`SyntheseSecondDegre.astro` sert de référence pour lire chaque donnée). `numeros` = numéros des `SourceVitrine` d'où vient la tuile.

- [ ] **Step 1: tests qui échouent** dans `tests/vitrine.test.ts` (fiches construites à la main, typées `Fiche` par un helper `ficheMinimale(partiel)` dans le test) :
  - `sourcesVitrine` : deux `SourceRef` de même `pageUrl` → une seule entrée ; numéros 1..N contigus ;
  - `tuilesVitrine` sur une fiche privée sans IPS ni budget → pas de tuile IPS ni Fonctionnement ; aucune `valeur` égale à `"0"` ;
  - tuile IPS avec `sourcesHistorique` de deux jeux → `numeros` a deux éléments et libellé contient « deux séries raboutées » ;
  - `chargerVitrine()` avec un UAI inconnu → `null` (test via `OBS_CONFIG` pointant vers une config temporaire, ou en exportant une variante `chargerVitrineDe(uai: string)` utilisée par `chargerVitrine`).
- [ ] **Step 2:** `bun test tests/vitrine.test.ts` → FAIL.
- [ ] **Step 3:** implémenter `config.ts` + `vitrine.ts`.
- [ ] **Step 4:** `bun test tests/vitrine.test.ts && bun run typecheck` → PASS.
- [ ] **Step 5: commit** `feat(site): établissement vitrine configurable et ses sources numérotées`

---

### Task 4: composant `FicheVitrine` et styles

**Files:**
- Create: `site/src/components/FicheVitrine.astro`, `site/src/components/BandeauFabrique.astro`
- Modify: `site/src/styles/obs.css` (classes `.fabrique`, `.vitrine`, `.tiles`, `.tile`, `.tag`, `.resume`, `.prod`, `ol.sources-vitrine`, `.compare`, reprises de la maquette, tokens uniquement)

**Interfaces:**
- Consumes: `Vitrine` (Task 3), `Fabrique`, `libelleCollecte` (Task 2).
- Produces:
  - `<FicheVitrine vitrine={Vitrine} variante="courte" | "complete" />` — courte : mini-fiche + phrase « Cette page rassemble N jeux de données de N producteurs, publiés sur N portails. » + étiquettes producteurs + phrase « Ailleurs : N fichiers de milliers de lignes, des séries coupées, aucune moyenne. Ici : une page, imprimable en A4, chaque chiffre relié à sa donnée brute. » + bouton « Voir d'où vient chaque chiffre → » (`/sources/#fiche`). Complète : mini-fiche + `<ol>` des sources (titre, producteur court · portail, lien `/sources/#<id>`), conteneur `id="fiche"`. Le nom de l'établissement est un lien vers sa fiche. Titre de section : « Une fiche, N sources » (courte) / « Exemple : une fiche, N sources » (complète). Accord : « 1 source », « 1 producteur », « 1 portail ».
  - `<BandeauFabrique fabrique={Fabrique} depuis={number | null} lien={boolean} />` — « N jeux de données publiques · N producteurs : A, B… · N portails · séries depuis AAAA · dernière collecte X » (+ « Toutes les sources → » si `lien`). « séries depuis » omis si `depuis` est null.

- [ ] **Step 1:** écrire les deux composants et les styles (aucune logique de calcul dans les composants).
- [ ] **Step 2:** `bun run typecheck` → PASS.
- [ ] **Step 3: commit** `feat(site): composants vitrine et bandeau de la fabrique` (testés par le rendu en Tasks 5 et 6).

---

### Task 5: nouvel accueil

**Files:**
- Modify: `site/src/pages/index.astro`
- Test: `tests/site-pages.test.ts` (describe « accueil et recherche »)

**Interfaces:**
- Consumes: `compterFabrique`, `SOURCES_HORS_REGISTRE` (Task 2), `chargerVitrine` (Task 3), `FicheVitrine`, `BandeauFabrique` (Task 4), `lireFrance().seriesDepuis` (Task 1).

Ordre et textes exacts (spec § 4) : H1 « Toutes les données publiques sur l'école, <em>rassemblées établissement par établissement.</em> » ; paragraphe d'accroche de la spec, avec « sur N portails » calculé ; rangée de chiffres actuelle et sa ligne de sources ; recherche (placeholder « Votre école, votre collège, votre commune, votre département… », exemples actuels) ; `BandeauFabrique lien` ; `FicheVitrine variante="courte"` (omise si `null`) ; section « Pourquoi pas directement à la source ? » avec les trois colonnes de la spec (« N jeux recoupés sur une seule fiche », « Séries remises bout à bout depuis AAAA » — ligne omise si null) ; puis territoires, mises à jour, principes inchangés. `description` meta : « Toutes les données publiques sur chaque école, collège et lycée de France : N jeux de données recoupés, sourcés et datés, sans palmarès. »

- [ ] **Step 1: tests qui échouent** — mettre à jour `"accueil : recherche et territoires"` : le texte attendu devient « Toutes les données publiques sur l'école, rassemblées établissement par établissement. » ; ajouter `test("accueil : fabrique, vitrine et comparatif")` :
  - `.fabrique` contient `${compterFabrique(lireSources de DIST_TEST…).jeux} jeux de données publiques` (relire `sources.json` du site d'essai) ;
  - un lien `a[href='/etablissement/0440001A/']` dans la vitrine et un lien `a[href='/sources/#fiche']` ;
  - les trois titres « Les portails officiels », « Les sites commerciaux », « L'observatoire » ;
  - `.kpis` toujours présent avant `.fabrique` dans l'ordre du document, et `input#q` entre les deux.
- [ ] **Step 2:** `bun test tests/site-pages.test.ts` → FAIL.
- [ ] **Step 3:** réécrire `index.astro` (mettre à jour son commentaire d'en-tête).
- [ ] **Step 4:** `bun test tests/site-pages.test.ts tests/site-transverse.test.ts` → PASS (anti-palmarès compris).
- [ ] **Step 5: commit** `feat(accueil): montrer le travail d'agrégation (fabrique, vitrine, comparatif)`

---

### Task 6: page /sources/, renvoi depuis Méthode, vérification finale

**Files:**
- Modify: `site/src/pages/sources.astro`, `site/src/pages/methode.astro`
- Test: `tests/site-pages.test.ts`

Spec § 5 : H1 « D'où viennent les chiffres » (`titre="Sources"` inchangé pour la navigation) ; paragraphe d'ouverture qui remplace le premier paragraphe actuel (producteurs, portails, collecte nocturne, archivage de chaque version, recoupement par établissement ; texte de la maquette `accueil-c-sources.html`), mention Licence Ouverte 2.0 conservée ; `BandeauFabrique lien={false}` ; `FicheVitrine variante="complete"` ; puis le contenu actuel inchangé. Méthode : une phrase dans l'introduction renvoyant à `/sources/#fiche` (« Un exemple montre d'où vient chaque chiffre d'une fiche. »).

- [ ] **Step 1: tests qui échouent** — `test("sources : démonstration en tête")` : `h1` = « D'où viennent les chiffres » ; `#fiche ol li` a autant d'éléments que de sources distinctes de la fiche 0440001A ; chaque `li a[href^='/sources/#']` pointe vers une `section[id]` existante de la page ; `methode/index.html` contient `a[href='/sources/#fiche']`.
- [ ] **Step 2:** `bun test tests/site-pages.test.ts` → FAIL.
- [ ] **Step 3:** modifier `sources.astro` et `methode.astro`.
- [ ] **Step 4:** `bun test && bun run typecheck` → toute la suite PASS.
- [ ] **Step 5: vérification visuelle** sur le site d'essai (`.cache/dist-test`, servi en local) : accueil et /sources/ en clair et en sombre, à 1366×768 (accroche, chiffres et recherche visibles sans défiler) et à 375 px (aucun défilement horizontal : `document.documentElement.scrollWidth <= innerWidth`). Captures pour le porteur.
- [ ] **Step 6: commit** `feat(sources): ouvrir sur « D'où viennent les chiffres » ; renvoi depuis Méthode`
