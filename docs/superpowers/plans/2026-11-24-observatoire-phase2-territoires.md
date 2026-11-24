# Observatoire citoyen de l'éducation en France, phase 2 (pages de territoire et cartes) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** ajouter une page France, une page par académie et une page par commune d'au moins 3 établissements. Les pages France, académie, département et commune reçoivent des cartes SVG, et le fil d'Ariane devient cliquable.

**Architecture :**
- La page département devient un gabarit de territoire unique (`Territoire.astro`), alimenté par un seul format de données, `DonneesTerritoire`. Le pipeline l'écrit pour les quatre niveaux, dans `site/data/{departements,academies,communes}/` et `france.json`.
- Les contours IGN sont téléchargés une fois par un script, simplifiés en TopoJSON et committés dans `site/contours/`.
- Les cartes sont rendues en SVG au build par Plot, sans JavaScript.

**Tech stack :** l'existant (Bun 1.4.5, TypeScript, DuckDB, Astro 7.4, `@observablehq/plot` 0.6.x, `linkedom`, `bun test`), plus :
- `topojson-client` 3.x (site), pour lire les contours ;
- `mapshaper` 0.6.x (devDependency racine), utilisé seulement par le script des contours.

**Spec :**
- `docs/superpowers/specs/2026-11-24-observatoire-phase2-territoires-design.md` (la conception de phase 2). **Elle fait foi pour le périmètre de la phase 2.**
- `docs/superpowers/specs/2026-11-23-observatoire-socle-et-maquettes-design.md` (le socle) et la maquette `docs/superpowers/specs/maquettes-2026-11-23/departement.html`.
- Le plan de phase 1, `docs/superpowers/plans/2026-11-23-observatoire-phase1-socle.md`. Ses « Global Constraints » restent toutes en vigueur.

## Global Constraints

- **Toutes les contraintes globales du plan de phase 1 s'appliquent** : libellés exacts, nombres à la française, aucun zéro pour une absence, anti-palmarès (aucun des mots `rang`, `classement`, `top`, `meilleur(e)(s)`, `pire(s)` dans une page générée), jetons de couleur `--pub` / `--pri`, `dist/` sous 900 Mo et 50 000 fichiers.
- **URL permanentes :** `/france/`, `/academie/<code>/` (le code de l'annuaire, par exemple `17`), `/commune/<INSEE>/` (par exemple `44109`). Les CSV sont à côté de la page : `/france/academies.csv`, `/academie/<code>/departements.csv`, `/commune/<INSEE>/etablissements.csv`.
- **Seuil des pages communes :** `SEUIL_COMMUNE = 3` établissements actifs (UAI distincts, `disparuLe === null`), toutes familles et tous secteurs confondus. Le seuil est recalculé à chaque build.
- **Paris, Lyon, Marseille :** les codes d'arrondissement sont rattachés à la commune. 75101 à 75120 donnent 75056 « Paris », 69381 à 69389 donnent 69123 « Lyon », 13201 à 13216 donnent 13055 « Marseille ».
- **Moyennes d'IPS :**
  - celles que publie la DEPP (département, académie, France) s'affichent telles quelles, sans recalcul ;
  - pour la commune, l'observatoire calcule une moyenne **pondérée par les élèves**, avec la mention exacte « moyenne calculée par l'observatoire » et le nombre d'établissements pris en compte.
- **Vue A (carte) :** part des élèves dans le privé sous contrat = Σ élèves privés / Σ élèves (public + privé), toutes familles, dernière rentrée, en %.
- **Vue B (carte) :** écart d'IPS des collèges = `dep_prive − dep_public` des moyennes DEPP (ou `aca_prive − aca_public` pour une ligne académie), en points.
- **Libellés exacts nouveaux :**
  - « moyenne calculée par l'observatoire » ;
  - « Part des élèves dans le privé sous contrat » ;
  - « Écart d'IPS moyen privé − public des collèges » ;
  - « Aucun {famille au singulier, en minuscules} {public|privé} dans la commune » (par exemple « Aucun collège privé dans la commune ») ;
  - « Territoires non représentés sur la carte (contour non disponible) : … ».
- **Cartes :**
  - rampe continue d'une seule teinte par vue : de `--pri-soft` à `--pri-ink` pour A, de `--pub-soft` à `--pub-ink` pour B ;
  - une valeur absente est grisée (`--line`) et la légende dit « non disponible » ;
  - aucune mise en valeur des extrêmes, aucun libellé de valeur sur la carte ;
  - points : plein `--pub` pour le public, anneau `--pri` pour le privé, rayon selon les élèves.
- **Aucun JavaScript requis** pour lire une page. La bascule entre A et B se fait avec des boutons radio et du CSS ; à l'impression, les deux cartes sont affichées.

## Review Focus

1. **Commune passée sous le seuil** (fermeture ou disparition d'un établissement). Attendu : pas de page, et aucun lien vers elle (fil d'Ariane de la fiche, puces de la page département, recherche, sitemap). Testé aux tâches 2 et 6 (`commune sous le seuil : aucune page ni lien`).
2. **Arrondissement de Paris, Lyon ou Marseille.** Attendu : la fiche d'un collège du 15e lie vers `/commune/75056/`, la page Paris liste ses établissements avec l'arrondissement en commune, et il n'existe aucune page `/commune/75115/`. Testé aux tâches 1, 2 et 6.
3. **Un secteur absent ou un seul établissement dans une commune.** Attendu : « Aucun collège privé dans la commune » au lieu d'un zéro ; avec un seul établissement, la moyenne calculée porte la mention « 1 collège ». Testé aux tâches 2 et 5.
4. **Département sans collège privé ou sans moyenne DEPP.** Attendu : grisé sur la vue B, avec la légende « non disponible », et la ligne de la liste dit « non disponible ». Testé aux tâches 2 et 4.
5. **Territoire absent des contours** (code inconnu de l'IGN, commune nouvelle). Attendu : le build ne casse pas ; la carte de points s'affiche sans fond ; la carte des départements cite le territoire sous la mention « Territoires non représentés sur la carte… ». Testé à la tâche 4.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `shared/src/territoires.ts` (créé) | rattachement des communes (Paris, Lyon, Marseille), seuil, chemins des pages de territoire |
| `shared/src/donnees.ts` (modifié) | `DonneesTerritoire` et types associés ; disparition de `DonneesDepartement` |
| `pipeline/src/territoires.ts` (créé) | synthèses de territoire, moyenne pondérée, contrôle face à la DEPP, export des quatre niveaux |
| `pipeline/src/fiches.ts` (modifié) | `exporter()` délègue les territoires à `territoires.ts` ; `ipsMoyens()` accepte `"aca"` |
| `pipeline/src/cli.ts` (modifié) | l'étape `data` échoue si le contrôle de pondération échoue |
| `scripts/contours.ts` (créé) | téléchargement et simplification des contours IGN (lancé à la main, une fois par an) |
| `site/contours/departements.topo.json`, `communes.topo.json` (créés, committés) | contours simplifiés |
| `tests/fixtures/contours/` (créé) | petits contours de test (44, 2A, 44109) |
| `site/src/lib/contours.ts` (créé) | lecture des contours |
| `site/src/lib/cartes.ts` (créé) | rendu SVG des cartes |
| `site/src/components/Ariane.astro` (créé) | fil d'Ariane commun aux fiches et aux territoires |
| `site/src/components/Territoire.astro`, `CarteTerritoire.astro`, `ListeTerritoires.astro` (créés) | gabarit de territoire |
| `site/src/lib/territoire.ts` (modifié) | CSV généralisé, ordre des familles |
| `site/src/pages/{france,academie/[aca],commune/[insee],departement/[dep]}/…` | pages et CSV |
| `site/src/pages/index.astro`, `sitemap.xml.ts`, `methode.astro`, `sources.astro`, `components/Entete.astro` (modifiés) | maillage et méthode |
| `site/public/js/recherche.js` (modifié) | groupe « Communes » |
| `tests/territoires.test.ts`, `tests/cartes.test.ts`, `tests/site-territoires.test.ts` (créés) ; `tests/fiches.test.ts`, `tests/territoire.test.ts`, `tests/site-pages.test.ts`, `tests/site.ts` (modifiés) | tests |

---

### Task 0 : Saint-Barthélemy, Saint-Martin et Saint-Pierre-et-Miquelon dans le périmètre

Spec, section 6.6. Cette tâche est indépendante des suivantes et passe en premier : elle change les données dont elles partent.

**Files:**
- Modify: `pipeline/sql/01_normaliser.sql` (ligne de `dep_canonique(code_departement) as dep`, `dep_libelle`, et le `case` du `classement`), `site/src/pages/methode.astro` (section `#perimetre`), `tests/fixtures/annuaire.csv` et les fixtures IPS / effectifs pour un établissement de Saint-Martin et un de Saint-Pierre-et-Miquelon, `tests/normaliser.test.ts`, les compteurs des tests qui en dépendent (`tests/fiches.test.ts`, `tests/site-pages.test.ts`)
- Test: `tests/normaliser.test.ts`

**Interfaces:**
- Produces : dans la table `etablissements`, un établissement de l'annuaire dont `code_departement` vaut `977` ou `978` a `dep = '971'`, `dep_libelle = 'Guadeloupe'`, et garde son `code_commune` (97701, 97801). Un établissement du `975` a `dep = '975'` et son académie (code 44). Le motif `hors_perimetre_geographique` ne s'applique plus qu'aux `98x`.

- [ ] **Step 1 : tests qui échouent** (`tests/normaliser.test.ts`)
  - La fixture `9770001G` (Collège Gustavia, 977) n'est plus exclue : sa ligne dans `etablissements` a `dep: "971"`, `dep_libelle: "Guadeloupe"`, `code_commune: "97701"`.
  - Une fixture `9711023K` (Collège Soualiga, 978, Saint-Martin, académie 32) a `dep: "971"`.
  - Une fixture `9750001C` (975, académie 44 « Saint Pierre et Miquelon ») a `dep: "975"`.
  - Une fixture `9870001A` (dép. `987`) garde le motif `hors_perimetre_geographique`.
  - Les listes attendues de « périmètre et Corse » et des motifs d'exclusion sont mises à jour en conséquence.
- [ ] **Step 2 : lancer** `bun test tests/normaliser.test.ts` ; attendu : FAIL.
- [ ] **Step 3 : implémenter** dans `01_normaliser.sql` le rattachement de 977 et 978 à 971 (code et libellé), au moment où `dep` est calculé, et la réduction du motif géographique aux `98%`.
  - Réécrire dans `/methode/` la puce du périmètre : Saint-Barthélemy et Saint-Martin figurent avec la Guadeloupe, et pourquoi (anciennes communes de la Guadeloupe, collectivités d'outre-mer depuis 2007, toujours rattachées au rectorat de Guadeloupe, comme dans les données de la DEPP) ; Saint-Pierre-et-Miquelon a sa page département ; le Pacifique n'est pas couvert.
  - Aucune raison non vérifiée n'est donnée.
- [ ] **Step 4 : lancer** `bun test` ; attendu : PASS, après mise à jour des compteurs touchés par les nouvelles fixtures.
- [ ] **Step 5 : vérifier sur les données réelles** avec `bun run data`.
  - `site/data/departements/971.json` liste des établissements de Saint-Martin et de Saint-Barthélemy ;
  - `site/data/departements/975.json` existe ;
  - aucun fichier `977.json` ni `978.json`.
- [ ] **Step 6 : commit** `feat: Saint-Barthélemy et Saint-Martin avec la Guadeloupe, Saint-Pierre-et-Miquelon couvert`

### Task 1 : types partagés et rattachement des communes

**Files:**
- Create: `shared/src/territoires.ts`
- Modify: `shared/src/donnees.ts`
- Test: `tests/territoires.test.ts`

**Interfaces:**
- Produces (`shared/src/territoires.ts`) :
  - `SEUIL_COMMUNE = 3`
  - `communeDeRattachement(codeCommune: string): string` : arrondissement → commune, tout autre code inchangé
  - `LIBELLES_PLM: Record<"75056" | "69123" | "13055", string>` (« Paris », « Lyon », « Marseille »)
  - `cheminTerritoire(ref: RefTerritoire): string` : `/france/`, `/academie/17/`, `/departement/44/`, `/commune/44109/`
- Produces (`shared/src/donnees.ts`) ; les types existants `EntreeIndex`, `LigneListe`, `ParSecteur`, `MoyenneTerritoire` et `VersionSource` sont inchangés :
  ```ts
  export type NiveauTerritoire = "france" | "academie" | "departement" | "commune";
  export interface RefTerritoire { niveau: NiveauTerritoire; code: string; libelle: string } // France : code "FR"
  export interface IpsMoyens {
    public: number | null; prive: number | null;
    calculee: boolean;                 // false : publiée par la DEPP
    n?: ParSecteur<number>;            // seulement si calculee : établissements pris en compte
  }
  // SyntheseFamille : `ipsMoyen` devient `IpsMoyens` ; les autres champs sont inchangés.
  export interface LigneTerritoire {
    ref: RefTerritoire; compte: ParSecteur<number>; eleves: ParSecteur<number | null>;
    partPrive: number | null; ecartIpsColleges: number | null;
  }
  export interface PointCarte { uai: string; nom: string; lat: number; lon: number; secteur: Secteur; eleves: number | null }
  export interface ValeurCarte { dep: string; partPrive: number | null; ecartIpsColleges: number | null }
  export type CarteDonnees = { genre: "points"; points: PointCarte[] } | { genre: "departements"; valeurs: ValeurCarte[] };
  export interface DonneesTerritoire {
    ref: RefTerritoire;
    parents: RefTerritoire[];          // du plus large au plus proche ; [] pour la France
    rentree: number | null;
    familles: Partial<Record<Famille, SyntheseFamille>>;
    horsContrat: number;
    enfants: LigneTerritoire[];        // France : académies ; académie : départements ; sinon []
    communes: RefTerritoire[];         // département : communes ayant une page ; sinon []
    carte: CarteDonnees;
  }
  export interface DonneesFrance extends DonneesTerritoire {
    academies: { aca: string; libelle: string; departements: { dep: string; libelle: string }[] }[];
  }
  ```
  `DonneesDepartement` est supprimé ; ses usages passent à `DonneesTerritoire` aux tâches 2 et 5.

- [ ] **Step 1 : écrire les tests qui échouent** (`describe("rattachement des communes")`)
  - `communeDeRattachement("75115") === "75056"`, `("75101") === "75056"`, `("69385") === "69123"`, `("13216") === "13055"`, `("44109") === "44109"`, `("75056") === "75056"`, `("2A004") === "2A004"`.
  - `cheminTerritoire({ niveau: "france", code: "FR", libelle: "France" }) === "/france/"`, et de même pour `"/academie/17/"`, `"/departement/2A/"` et `"/commune/44109/"`.
- [ ] **Step 2 : lancer** `bun test tests/territoires.test.ts` ; attendu : FAIL (module introuvable).
- [ ] **Step 3 : implémenter** `shared/src/territoires.ts` et les types de `shared/src/donnees.ts`. Les arrondissements se repèrent par des intervalles de codes numériques : 75101-75120, 69381-69389, 13201-13216.
- [ ] **Step 4 : lancer** `bun test tests/territoires.test.ts` ; attendu : PASS. `bun run typecheck` échoue encore sur les usages de `DonneesDepartement`, ce qui est attendu jusqu'à la tâche 2.
- [ ] **Step 5 : commit** `feat: types des territoires et rattachement des communes`

### Task 2 : synthèses et export des quatre niveaux de territoire

**Files:**
- Create: `pipeline/src/territoires.ts`
- Modify: `pipeline/src/fiches.ts` (l'export des départements et de la France, aujourd'hui dans `exporter()`, part dans `territoires.ts` ; `ipsMoyens()` accepte `"dep" | "aca" | "nat"`), `pipeline/src/cli.ts`
- Test: `tests/territoires.test.ts`, `tests/fiches.test.ts` (section « export des données du site »)

**Interfaces:**
- Consumes : tâche 1 ; `Fiche`, `ipsMoyens()`, `distribution()`, `ligneListe()`, `moyennesTerritoire()` et `BORNES_IPS` de `fiches.ts`. Les helpers dont `territoires.ts` a besoin sont exportés de `fiches.ts`, ou déplacés dans `territoires.ts` et importés par `fiches.ts`. Pas de copie.
- Produces (`pipeline/src/territoires.ts`) :
  - `moyennePonderee(paires: { valeur: number; poids: number }[]): number | null` : Σ(valeur × poids) / Σ poids ; `null` si Σ poids = 0 ; arrondie à 0,1.
  - `communesRetenues(actives: Fiche[]): Map<string, Fiche[]>` : clé `communeDeRattachement(f.codeCommune)`, seulement si au moins `SEUIL_COMMUNE` UAI distincts.
  - `controlerPonderation(actives: Fiche[], ipsDep: Map<string, IpsMoyen>): { n: number; mediane: number; p90: number }`. Pour chaque (famille, département, secteur) qui a une moyenne DEPP et au moins un établissement avec IPS et élèves, on prend l'écart absolu entre `moyennePonderee` (IPS pondéré par les élèves) et la moyenne DEPP.
  - `SEUILS_PONDERATION = { mediane: 0.2, p90: 1.0 }`. Mesure du 2026-11-24 sur les données réelles : médiane 0,06 et p90 0,54 sur 744 groupes.
  - `exporterTerritoires(actives: Fiche[], db: Db, sortie: string, rentree: number | null): Promise<void>` : écrit `departements/<dep>.json`, `academies/<aca>.json`, `communes/<insee>.json` et `france.json`.
- Règles de contenu par niveau :
  - `ipsMoyen` : DEPP `dep` / `aca` / `nat` avec `calculee: false` pour département, académie et France. Pour la commune, `moyennePonderee` des fiches de la famille et du secteur, avec IPS `ok` et élèves `ok`, et `calculee: true, n`.
  - `liste` : les établissements pour un département ou une commune ; `[]` pour une académie ou la France.
  - `enfants` : les académies pour la France, les départements pour une académie, triés par libellé (`localeCompare(…, "fr")`).
  - `communes` : pour un département, les communes retenues, triées par libellé.
  - `carte` : `points` (fiches ayant `lat` et `lon`) pour un département ou une commune ; `departements` pour la France (tous) ou une académie (les siens).
  - Libellé d'une commune : `LIBELLES_PLM` si le code y figure, sinon la `commune` la plus fréquente parmi ses fiches.
  - `parents` : le département a France et académie ; la commune a France, académie et département ; l'académie a France.

- [ ] **Step 1 : tests unitaires qui échouent** (`tests/territoires.test.ts`, `describe("synthèses de territoire")`)
  - `moyennePonderee([{valeur:100,poids:100},{valeur:130,poids:300}]) === 122.5` ; `moyennePonderee([]) === null` ; `moyennePonderee([{valeur:90,poids:0}]) === null`.
  - `communesRetenues` sur des fiches construites avec `identiteTest` de `tests/aide.ts` :
    - 3 UAI à Nantes, dont un disparu : la commune est absente ;
    - 3 UAI actifs : présente ;
    - un UAI en 75115 et deux en 75107 : clé `"75056"`, et aucune clé `"75115"`.
  - `controlerPonderation` : deux fiches à IPS 100 (100 élèves) et 130 (300 élèves) et une moyenne DEPP à 122,5 donnent `mediane === 0` ; avec une DEPP à 115, `mediane === 7.5`.
- [ ] **Step 2 : lancer** `bun test tests/territoires.test.ts` ; attendu : FAIL.
- [ ] **Step 3 : implémenter** les quatre fonctions et `SEUILS_PONDERATION`.
- [ ] **Step 4 : tests d'export qui échouent** (`tests/fiches.test.ts`, dans « fichiers produits ») :
  - `departements/44.json` : `ref` vaut `{niveau:"departement", code:"44", libelle:"Loire-Atlantique"}`, `parents.map(p => p.niveau)` vaut `["france","academie"]`, `familles.college.ipsMoyen` correspond à `{public:106.4, prive:121.4, calculee:false}`, `communes` contient `{niveau:"commune", code:"44109", libelle:"Nantes"}`, `carte.genre === "points"`, et la fiche `0440005E` (sans GPS) est absente des points.
  - `communes/44109.json` existe ; `familles.college.ipsMoyen.calculee === true` ; `ipsMoyen.n` vaut les comptes des fiches avec IPS et élèves ; la `liste` est triée par nom.
  - `communes/2A004.json` n'existe pas (Ajaccio a moins de 3 établissements).
  - `academies/17.json` : `enfants` a une ligne `departement` 44 ; `ecartIpsColleges` vaut `121.4 − 106.4 = 15` ; `carte.genre === "departements"`.
  - `france.json` : `enfants` comprend l'académie 17 ; `ref.code === "FR"` ; `academies` est inchangé par rapport à la phase 1.
  - **Commune sous le seuil** : appeler `exporterTerritoires` avec les fiches actives du 44 réduites à 2 établissements de Nantes ; `communes/44109.json` n'est pas écrit et `departements/44.json` a `communes: []`.
  - Les attentes existantes sur `DonneesDepartement` sont réécrites avec `ref` et `parents`, sans changer les valeurs attendues.
- [ ] **Step 5 : lancer** `bun test tests/fiches.test.ts tests/territoires.test.ts` ; attendu : FAIL.
- [ ] **Step 6 : implémenter** `exporterTerritoires`, appelé par `exporter()`. Dans `cli.ts`, l'étape `data` appelle `controlerPonderation` sur les fiches actives et lève une erreur au-delà de `SEUILS_PONDERATION`, en citant les trois chiffres. Une nuit qui échoue ainsi ne publie pas, comme pour une source rejetée.
- [ ] **Step 7 : lancer** `bun test` et `bun run typecheck`. Attendu : PASS. Les tests `site-*` peuvent encore échouer jusqu'à la tâche 5, et ceux qui lisent `d.dep` / `d.libelle` sont mis à jour à la tâche 5.
- [ ] **Step 8 : commit** `feat: synthèses et export des territoires (France, académie, département, commune)`

### Task 3 : contours IGN

**Files:**
- Create: `scripts/contours.ts`, `site/contours/departements.topo.json`, `site/contours/communes.topo.json`, `site/contours/LISEZMOI.md` (source, millésime, date, commande), `tests/fixtures/contours/departements.topo.json`, `tests/fixtures/contours/communes.topo.json`, `site/src/lib/contours.ts`
- Modify: `package.json` (devDependency `mapshaper`), `site/package.json` (dépendance `topojson-client`), `tests/site.ts` (variable `OBS_CONTOURS` pointant sur les fixtures)
- Test: `tests/cartes.test.ts` (`describe("contours")`)

**Interfaces:**
- Produces (`site/src/lib/contours.ts`) ; le dossier vient de `process.env.OBS_CONTOURS`, par défaut `../site/contours` relatif au `cwd` du build, comme `config.ts` :
  - `contoursDepartements(codes?: string[]): FeatureCollection` : propriété `code` (INSEE canonique, `2A`, `971`).
  - `contourDepartement(code: string): Feature | null`
  - `communesDuDepartement(dep: string): FeatureCollection` : propriétés `code`, `dep`.
  - `contourCommune(insee: string): Feature | null`
- Produces (`scripts/contours.ts`) : `bun scripts/contours.ts` télécharge depuis le service WFS de la Géoplateforme (`https://data.geopf.fr/wfs/ows`) les couches `ADMINEXPRESS-COG-CARTO.LATEST:departement` et `…:commune`.
  - Vérifier les noms exacts des couches et des champs (`code_insee`, `code_insee_du_departement`) avec `GetCapabilities` / `DescribeFeatureType` avant d'écrire le script.
  - Pagination par `count` / `startIndex`, au plus quelques dizaines de requêtes. User-Agent du plan de phase 1.
  - Simplification par l'API de mapshaper : `-simplify 3% keep-shapes`, puis sortie TopoJSON `quantization=1e5`, propriétés réduites à `code` (et `dep` pour les communes).
  - Budget : moins de 1 Mo pour les départements, moins de 8 Mo pour les communes. Le script affiche les tailles et échoue au-delà.
  - Script lancé à la main, pas dans la collecte nocturne.

- [ ] **Step 1 : fixtures de test.** Écrire à la main les TopoJSON de `tests/fixtures/contours/` : des carrés pour les départements `44` et `2A`, deux communes `44109` et `44020` dans le 44, et aucune commune pour le 2A.
- [ ] **Step 2 : tests qui échouent.**
  - `contourDepartement("44")` n'est pas null ; `contourDepartement("99")` est null.
  - `communesDuDepartement("44").features` a une longueur de 2.
  - `contourCommune("75056")` est null avec les fixtures.
- [ ] **Step 3 : lancer** `bun test tests/cartes.test.ts` ; attendu : FAIL.
- [ ] **Step 4 : implémenter** `site/src/lib/contours.ts` (`topojson-client` : `feature`). Lecture une seule fois par build, mise en cache dans le module.
- [ ] **Step 5 : lancer** `bun test tests/cartes.test.ts` ; attendu : PASS.
- [ ] **Step 6 : implémenter et lancer** `bun scripts/contours.ts`.
  - Attendu : 101 départements et environ 34 900 communes ; aucun `code` vide ; `75056`, `69123` et `13055` présents ; tailles sous le budget.
  - Renseigner `site/contours/LISEZMOI.md` avec le millésime d'ADMIN EXPRESS (lu dans les métadonnées de la couche), la date et la commande.
- [ ] **Step 7 : commit** `feat: contours IGN simplifiés (ADMIN EXPRESS COG CARTO)`, en incluant les deux TopoJSON.

### Task 4 : rendu SVG des cartes

**Files:**
- Create: `site/src/lib/cartes.ts`
- Test: `tests/cartes.test.ts` (`describe("cartes")`)

**Interfaces:**
- Consumes : `contours.ts` (tâche 3), `PointCarte` et `ValeurCarte` (tâche 1). Réutilise la fonction `svg()` de `plot.ts` (nettoyage, `role="img"`, `aria-label`, arrondi des coordonnées). Il faut l'exporter, pas la dupliquer.
- Produces :
  - `type VueCarte = "prive" | "ecart_ips"`
  - `svgCarteDepartements(valeurs: ValeurCarte[], vue: VueCarte, opts: { encartsDrom: boolean }): { svg: string; absents: string[] }`. Avec `encartsDrom`, la métropole est dessinée en projection conique conforme, et chaque DROM présent dans `valeurs` dans un petit SVG à part, concaténé après. `absents` liste les codes sans contour.
  - `svgCartePoints(points: PointCarte[], fond: { territoire: Feature | null; mailles: FeatureCollection | null }): string` : la projection est ajustée au territoire, ou aux points s'il n'a pas de contour.
  - `legendeCarte(vue: VueCarte, domaine: [number, number]): string` : HTML de la rampe, des bornes et de la case « non disponible ».
- Domaines de couleur fixes, pour que deux pages restent comparables : vue A de 0 à 50 % ; vue B de 0 à 40 points. Une valeur hors domaine est bornée.

- [ ] **Step 1 : tests qui échouent.**
  - `svgCarteDepartements([{dep:"44",partPrive:41.2,ecartIpsColleges:15},{dep:"2A",partPrive:null,ecartIpsColleges:null}], "prive", {encartsDrom:false})` :
    - `svg` contient `role="img"` ;
    - exactement un chemin a le remplissage `var(--line)` (le 2A) ;
    - `absents` vaut `[]`.
  - Avec un `dep:"99"` en plus : `absents` vaut `["99"]` et le rendu ne lève pas d'erreur.
  - `svgCartePoints` avec un public de 500 élèves et un privé de 200 : un `circle` à `fill` `var(--pub)` ; un `circle` à `fill="none"` et `stroke` `var(--pri)` ; le rayon du premier est supérieur à celui du second.
  - `svgCartePoints(points, { territoire: null, mailles: null })` rend un SVG sans erreur.
  - Aucune des sorties ne contient `<script`, ni les mots interdits.
  - `legendeCarte("ecart_ips", [0, 40])` contient « Écart d'IPS moyen privé − public des collèges » et « non disponible ».
- [ ] **Step 2 : lancer** `bun test tests/cartes.test.ts` ; attendu : FAIL.
- [ ] **Step 3 : implémenter** avec `Plot.geo` (fond, mailles en trait `--line`, territoire en trait `--muted`) et `Plot.dot` (rayon `r: "eleves"`, `r.range [1.5, 9]`, points sans élèves au rayon minimal). Pas de `legend: true` de Plot, qui a besoin d'un canvas absent sous `linkedom` : la légende est en HTML.
- [ ] **Step 4 : lancer** `bun test tests/cartes.test.ts` ; attendu : PASS.
- [ ] **Step 5 : commit** `feat: cartes SVG des territoires`

### Task 5 : gabarit de territoire et page département

**Files:**
- Create: `site/src/components/Territoire.astro`, `site/src/components/CarteTerritoire.astro`, `site/src/components/ListeTerritoires.astro`, `site/src/components/Ariane.astro`
- Modify: `site/src/pages/departement/[dep]/index.astro` (réduite à `getStaticPaths` + `<Territoire d={…} />`), `site/src/pages/departement/[dep]/etablissements.csv.ts`, `site/src/lib/territoire.ts`, `site/src/lib/donnees.ts`, `site/src/styles/obs.css`, `tests/territoire.test.ts`, `tests/site-pages.test.ts`
- Test: `tests/site-pages.test.ts` (« page département »)

**Interfaces:**
- Consumes : tâches 1, 2 et 4.
- Produces :
  - `site/src/lib/donnees.ts` :
    - `lireTerritoire(ref: Pick<RefTerritoire, "niveau" | "code">): DonneesTerritoire` ;
    - `lireFrance(): DonneesFrance` ;
    - `academiesDisponibles(): string[]` ;
    - `communesDisponibles(): Set<string>`.
    - `departementsDisponibles()` est inchangé.
  - `Ariane.astro`, props `{ parents: RefTerritoire[]; dernier?: string }`. Chaque parent est un lien vers `cheminTerritoire`, sauf une commune absente de `communesDisponibles()`, qui reste en texte simple. `dernier` est le maillon courant, en texte.
  - `Territoire.astro`, props `{ d: DonneesTerritoire }`. Il affiche les blocs du tableau 6.1 de la spec selon `d.ref.niveau` :
    - bandeau ;
    - carte ;
    - distribution des IPS (sauf commune) ;
    - moyennes : colonnes des niveaux supérieurs seulement (département : dép., académie et France ; académie : académie et France ; France : France ; commune : aucune) ;
    - `ListeEtablissements` ou `ListeTerritoires` ;
    - puces des communes (département) ;
    - sources.
  - `CarteTerritoire.astro`, props `{ carte: CarteDonnees; ref: RefTerritoire }` : pour `departements`, deux `input type="radio" name="vue-carte"` et deux figures, la seconde masquée par CSS si la première radio est cochée ; `@media print` affiche les deux. Sous la carte des départements, si `absents` n'est pas vide : « Territoires non représentés sur la carte (contour non disponible) : » suivi des libellés.
  - `ListeTerritoires.astro`, props `{ lignes: LigneTerritoire[] }` : tableau trié par libellé, réutilisant le tri de `liste.js` (attributs `data-v`) ; colonnes établissements public / privé, élèves, part du privé, écart d'IPS des collèges.
  - `site/src/lib/territoire.ts` : `csvTerritoire(d: DonneesTerritoire): string` remplace `csvDepartement`.
    - Département et commune : colonnes de la phase 1, inchangées.
    - Académie et France : `code;libelle;etablissements_public;etablissements_prive;eleves_public;eleves_prive;part_prive;ecart_ips_colleges`.
    - Même protection contre les formules qu'avant.

- [ ] **Step 1 : mettre à jour les tests.**
  - `tests/territoire.test.ts` : la fabrique `dep()` produit un `DonneesTerritoire` ; tous les tests CSV visent `csvTerritoire`.
  - Ajouter un test CSV de niveau académie : en-tête exact, `part_prive` avec point décimal, `ecart_ips_colleges` vide si absent.
  - `tests/site-pages.test.ts` (« page département »), en ajoutant :
    - `doc("departement/44").querySelector(".crumb a[href='/france/']")` et `a[href='/academie/17/']` existent ;
    - la carte de points est présente (`#carte-territoire svg[role=img]`) ;
    - la puce « Nantes » est un lien `a[href='/commune/44109/']`.
  - Les tests existants de la page département restent verts sans changement de valeurs.
- [ ] **Step 2 : lancer** `bun test tests/territoire.test.ts tests/site-pages.test.ts` ; attendu : FAIL.
- [ ] **Step 3 : implémenter** les quatre composants et réécrire la page département sur `Territoire.astro`.
  - Le HTML et les classes existants sont conservés autant que possible : `liste.js` et `fiche.js` (bouton imprimer) doivent continuer à fonctionner sans modification.
  - Le CSS de la bascule A/B va dans `obs.css`.
- [ ] **Step 4 : lancer** `bun test` ; attendu : PASS, y compris `site-transverse` (mots interdits, poids).
- [ ] **Step 5 : commit** `refactor: gabarit de territoire, page département avec carte`

### Task 6 : pages France, académie et commune

**Files:**
- Create: `site/src/pages/france/index.astro`, `site/src/pages/france/academies.csv.ts`, `site/src/pages/academie/[aca]/index.astro`, `site/src/pages/academie/[aca]/departements.csv.ts`, `site/src/pages/commune/[insee]/index.astro`, `site/src/pages/commune/[insee]/etablissements.csv.ts`
- Modify: `site/src/components/Entete.astro` (fil d'Ariane via `Ariane.astro`, maillon commune selon `communeDeRattachement(f.codeCommune)`)
- Test: `tests/site-territoires.test.ts`

**Interfaces:**
- Consumes : tâche 5 (`Territoire.astro`, `Ariane.astro`, `csvTerritoire`, `lireTerritoire`, `academiesDisponibles`, `communesDisponibles`).
- Produces : les pages et CSV aux URL des Global Constraints. Titres :
  - France : « France » ;
  - académie : `academie(libelle)` de `@obs/shared/libelles` (« Académie de Nantes ») ;
  - commune : « {libellé} ({dep}) ».
- Page commune, bandeau IPS : par famille et par secteur, la valeur, puis « moyenne calculée par l'observatoire · {n} {famille au singulier ou au pluriel selon n} », puis la moyenne DEPP du département en repère (« Loire-Atlantique : 106,4 »). Si `n` vaut 0 pour un secteur : « Aucun {famille} {public|privé} dans la commune ».

- [ ] **Step 1 : tests qui échouent** (`tests/site-territoires.test.ts`, site d'essai de `tests/site.ts`)
  - `france/index.html` :
    - contient « Part des élèves dans le privé sous contrat » et « Écart d'IPS moyen privé − public des collèges » ;
    - deux `input[name=vue-carte]` ;
    - un lien `a[href='/academie/17/']` dans la liste ;
    - aucun lien `a[href^='/etablissement/']` dans la liste.
  - `france/academies.csv` : l'en-tête exact de la tâche 5 et une ligne qui commence par `17;Nantes;`.
  - `academie/17/index.html` : le fil d'Ariane a un lien vers `/france/` ; un lien `a[href='/departement/44/']` ; le tableau des moyennes a des colonnes Académie et France, sans colonne « Dép. ».
  - `commune/44109/index.html` :
    - le fil d'Ariane a des liens vers `/france/`, `/academie/17/` et `/departement/44/` ;
    - contient « moyenne calculée par l'observatoire » ;
    - la liste est triée par nom ;
    - il y a une carte de points.
  - **Secteur absent** : les fixtures n'ont aucun lycée privé à Nantes ; la page contient « Aucun lycée privé dans la commune ».
  - `commune/2A004/index.html` n'existe pas, et `etablissement/6200001F/index.html` a « Ajaccio » en texte simple dans `.crumb`, sans lien `/commune/`.
  - `etablissement/0440001A/index.html` a `.crumb a[href='/commune/44109/']`.
  - **Paris, Lyon, Marseille** : ajouter aux fixtures (`annuaire.csv`, effectifs, IPS) 3 collèges en 75115, 75115 et 75107. Attendu :
    - `commune/75056/index.html` existe ;
    - `commune/75115/index.html` n'existe pas ;
    - la fiche d'un des collèges lie vers `/commune/75056/`.
    Mettre à jour les compteurs des tests existants que ces fixtures changent (nombre d'entrées de l'index, de la France).
- [ ] **Step 2 : lancer** `bun test tests/site-territoires.test.ts` ; attendu : FAIL.
- [ ] **Step 3 : implémenter** les pages (`getStaticPaths` sur `academiesDisponibles()` et `communesDisponibles()`), les CSV et le fil d'Ariane de `Entete.astro`.
- [ ] **Step 4 : lancer** `bun test` ; attendu : PASS.
- [ ] **Step 5 : commit** `feat: pages France, académie et commune`

### Task 7 : maillage, recherche, sitemap, méthode et sources

**Files:**
- Modify: `site/src/pages/index.astro`, `site/public/js/recherche.js`, `site/src/pages/sitemap.xml.ts`, `site/src/pages/methode.astro`, `site/src/pages/sources.astro`
- Test: `tests/site-pages.test.ts`, `tests/recherche.test.ts`

**Interfaces:**
- Consumes : tâches 5 et 6.
- Produces :
  - Accueil : lien « France entière » vers `/france/` ; chaque libellé d'académie de « Parcourir par territoire » devient un lien `/academie/<code>/`. Le test de phase 1 qui exigeait l'absence de lien (`.acad b` sans `a`) est inversé.
  - Communes de la recherche intégrées à l'accueil, comme les départements : `<script type="application/json" id="communes">` contenant `[{ i: insee, l: libelle, d: dep }]`, pour les communes qui ont une page. `recherche.js` ajoute un groupe « Communes » entre établissements et départements, avec la même normalisation accents et casse.
  - Sitemap : ajoute `/france/`, les académies et les communes qui ont une page.
  - `/methode/`, trois ancres nouvelles :
    - `#cartes` : vues A et B, formules exactes des Global Constraints, domaines de couleur ;
    - `#moyennes-calculees` : pondération par les élèves, mention, contrôle face à la DEPP avec les seuils ;
    - `#communes` : seuil de 3, rattachement de Paris, Lyon et Marseille.
  - `/sources/` : ligne IGN, ADMIN EXPRESS COG CARTO, millésime lu dans `site/contours/LISEZMOI.md` ou dans une constante écrite par le script de la tâche 3, Licence Ouverte 2.0.

- [ ] **Step 1 : tests qui échouent.**
  - Accueil : `a[href='/france/']` et `a[href='/academie/17/']` existent ; `script#communes` contient `{ i: "44109", l: "Nantes", d: "44" }` et ne contient pas `2A004`.
  - `tests/recherche.test.ts` : chercher « nantes » renvoie un groupe Communes qui a un lien `/commune/44109/`. Suivre la façon dont ce fichier teste déjà `recherche.js`.
  - Sitemap : contient `/france/`, `/academie/17/` et `/commune/44109/` ; ne contient pas `/commune/2A004/`.
  - `/methode/` : contient `id="cartes"`, `id="moyennes-calculees"` et `id="communes"`. `/sources/` contient « ADMIN EXPRESS ».
- [ ] **Step 2 : lancer** `bun test` ; attendu : FAIL sur ces tests.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer** `bun test` ; attendu : PASS.
- [ ] **Step 5 : commit** `feat: maillage des territoires, recherche des communes, méthode des cartes`

### Task 8 : build réel, garde-fous et documents

**Files:**
- Modify: `docs/superpowers/plans/2026-11-23-observatoire-phase1-socle.md` (section « Phases suivantes » : phase 2 redécoupée, phase 5 ajoutée) ; `docs/superpowers/specs/2026-11-23-observatoire-socle-et-maquettes-design.md` (sections 2.4 et 2.7 : explorateur et `/donnees/` renvoyés en phase 5 ; règle des moyennes précisée comme dans la spec de phase 2, section 6.4)
- Test: aucun nouveau test ; vérification sur les données réelles.

- [ ] **Step 1 : lancer** `bun run build` sur les données réelles. Attendu :
  - le contrôle de pondération passe (médiane ≤ 0,2 et p90 ≤ 1,0, avec les trois chiffres affichés) ;
  - `scripts/garde-fous.ts` passe ;
  - `fd . dist/commune -d 1 -t d | wc -l` donne environ 1 035 ;
  - `fd . dist/academie -d 1 -t d | wc -l` donne 31 (Saint-Pierre-et-Miquelon compris) ;
  - `du -sh dist` reste sous 900 Mo. Noter la taille dans le commit.
- [ ] **Step 2 : contrôles visuels** dans le navigateur (`bun run --cwd site astro preview`) :
  - `/france/` : la bascule A/B marche sans JavaScript (le désactiver), et l'aperçu d'impression montre les deux cartes ;
  - `/academie/02/` ;
  - `/departement/13/` ;
  - `/commune/13055/` : Marseille, avec ses arrondissements dans la liste ;
  - `/commune/44109/` ;
  - `/departement/971/` (Saint-Martin et Saint-Barthélemy dans la liste) et `/departement/975/`.
  - Le thème sombre garde des cartes lisibles.
  - Poids HTML de `/departement/59/`, le plus gros département : noter s'il dépasse 400 Ko.
- [ ] **Step 3 : mettre à jour** les deux documents listés plus haut.
- [ ] **Step 4 : commit** `docs: phase 2 livrée, découpage des phases mis à jour`
