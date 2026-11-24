# Observatoire citoyen de l'éducation en France, phase 3 (budget des collectivités par élève, pages région) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** afficher, pour chaque collectivité qui finance des collèges ou des lycées, ses dépenses en euros par élève, séparées public / privé, de l'exercice 2020 à 2024, sur les fiches et les pages de territoire. Ajouter 18 pages région.

**Architecture :**
- La collecte gagne une famille de sources : un extrait filtré par exercice des balances DGFiP nature × fonction (`budget_<exercice>`), téléchargé depuis l'API Opendatasoft de data.economie.gouv.fr et archivé comme les autres sources, avec la requête exacte. Un exercice nouveau est découvert par recherche dans le catalogue.
- Le pipeline normalise les balances dans DuckDB (`budget_lignes`, `budget_postes`), puis un module TypeScript calcule les montants par élève à partir des effectifs déjà présents dans les fiches, et les moyennes France Σ / Σ.
- Le site ajoute un bloc « Moyens de la collectivité » (fiche, fiche A4, gabarit de territoire), une vue « budget » sur la carte de France, et le niveau `region` au gabarit de territoire.

**Tech stack :** l'existant (Bun 1.4.5, TypeScript, DuckDB, Astro 7.4, `@observablehq/plot` 0.6.x, `topojson-client` 3.x, `linkedom`, `bun test`). Aucune dépendance nouvelle.

**Spec :**
- `docs/superpowers/specs/2026-11-24-observatoire-phase3-budget-design.md` (conception de phase 3). **Elle fait foi pour le périmètre de la phase 3.**
- Les specs et plans des phases 1 et 2 (`docs/superpowers/specs/`, `docs/superpowers/plans/`) : leurs « Global Constraints » restent toutes en vigueur.

## Global Constraints

- **Toutes les contraintes globales des plans de phase 1 et 2 s'appliquent** : libellés exacts, nombres à la française, aucun zéro pour une absence, anti-palmarès (aucun des mots `rang`, `classement`, `top`, `meilleur(e)(s)`, `pire(s)` dans une page générée), aucun JavaScript requis pour lire une page, `dist/` sous 900 Mo et 50 000 fichiers.
- **Exercices publiés :** 2020 à 2024 (`EXERCICE_MIN = 2020`) ; un exercice N utilise les élèves de la rentrée N−1.
- **Unité : la collectivité.** Identifiants (`IdCollectivite`, chaîne) : `dep-<code dép.>` (ex. `dep-44`, `dep-976` pour Mayotte), `reg-<code INSEE région>` (ex. `reg-52`), `ml-lyon`, `paris`, `cea` (Collectivité européenne d'Alsace), `ctu-corse`, `ctu-martinique`, `ctu-guyane`. Aucune valeur n'est fusionnée entre deux collectivités.
- **Codes INSEE des 18 régions :** 11 Île-de-France, 24 Centre-Val de Loire, 27 Bourgogne-Franche-Comté, 28 Normandie, 32 Hauts-de-France, 44 Grand Est, 52 Pays de la Loire, 53 Bretagne, 75 Nouvelle-Aquitaine, 76 Occitanie, 84 Auvergne-Rhône-Alpes, 93 Provence-Alpes-Côte d'Azur, 94 Corse, 01 Guadeloupe, 02 Martinique, 03 Guyane, 04 La Réunion, 06 Mayotte. URL : `/region/<code>/`.
- **Fil d'Ariane :** France › Région › Académie › Département › Commune.
- **Dépense réelle d'une ligne de balance :** `(obnetdeb − oobdeb) − (obnetcre − oobcre)` (opérations budgétaires nettes, hors opérations d'ordre). Formule à confirmer à la tâche 4 ; si le contrôle échoue, elle est corrigée là et nulle part ailleurs (`depenseReelle` dans `pipeline/src/budget.ts`).
- **Comptes (par nomenclature, correspondance exacte, pas par préfixe : `655112` commence par `65511`) :**
  - départements, dotation aux collèges publics : `65511` (M52), `655111` (M57) ; contribution aux collèges privés : `65512` (M52), `655112` (M57) ;
  - personnel : comptes commençant par `64` ;
  - fonctionnement : classe 6 ; investissement : comptes commençant par `20`, `21`, `23` (`204` compris dans `20`) ; exclus partout : `16`, `68`, `675`, `676` ;
  - départements, investissement privé : comptes commençant par `2042` (subventions d'équipement aux personnes de droit privé) dans la fonction 221 ;
  - régions : public = fonction 222, privé = fonction 223.
- **Fonctions :** un code de fonction se normalise par ses trois derniers chiffres quand il vaut `221`, `222`, `223` seul ou précédé d'un chapitre de deux chiffres commençant par 9 (`93221`, `90222`, `91221`…) ; `22` seul ou préfixé (`922`, `932`, `9322`) devient `22` (fonction non détaillée).
- **Libellés exacts nouveaux** (dans `shared/src/libelles.ts`, `LIBELLES_BUDGET`) :
  - titre du bloc : « Moyens de la collectivité » ;
  - postes : « Fonctionnement hors personnel », « Fonctionnement, personnel compris », « Investissement », « Contribution aux collèges privés » / « Contribution aux lycées privés » ;
  - unités : « € par élève », « € par élève du privé » ;
  - absences : « personnel non rattaché aux collèges dans les comptes de la collectivité » (ou « … aux lycées … ») ; « fonction collèges non détaillée dans les comptes de la collectivité » (ou « lycées ») ; « aucun élève du privé sous contrat » ; « collectivité non identifiée dans les balances de la DGFiP » ;
  - moyenne : « moyenne calculée par l'observatoire », « moyenne de {n} collectivités » ;
  - source : « DGFiP, balances comptables, exercice {N} · élèves à la rentrée {N−1} (DEPP) » ;
  - mention agricole (si la tâche 4 conclut qu'on ne peut pas isoler) : « Les dépenses de la région incluent l'enseignement agricole, dont les élèves ne sont pas comptés ici : le montant par élève en est surestimé, surtout pour le privé. » ;
  - mention cités scolaires : « Les comptes de la collectivité incluent des reversements entre collectivités pour des cités scolaires (environ {x} % des dépenses retenues). »
- **Règle de comparaison public / privé :** le privé ne s'affiche à côté du public qu'en face de « Fonctionnement, personnel compris » ; si ce montant est absent pour la collectivité, la ligne du privé reste, mais sans écart calculé ni mise en regard.
- **Montants :** euros courants, arrondis à l'euro à l'affichage, valeurs non arrondies dans les données ; moyenne France = Σ montants ÷ Σ élèves des collectivités qui ont une valeur.
- **Carte de la page France, vue « budget » :** fonctionnement hors personnel par élève du public des collèges, dernier exercice, par collectivité ; rampe continue `--pub-soft` → `--pub-ink` ; la Métropole de Lyon et le reste du Rhône sont deux formes ; Bas-Rhin et Haut-Rhin portent la valeur `cea`, 2A et 2B la valeur `ctu-corse`, avec une note sous la carte.

## Review Focus

1. **Collectivité qui change de nomenclature entre deux exercices** (M52 → M57 en 2021-2024, M71 → M57). Attendu : les montants restent continus, les comptes publics / privés sont lus avec la table de la bonne nomenclature, et aucun exercice ne double ni ne perd le forfait du privé. Testé à la tâche 3 (`M52 puis M57 : même total public et privé`).
2. **Département qui ne rattache pas son personnel** (personnel dans `0201`). Attendu : « Fonctionnement, personnel compris » absent avec son libellé, jamais 0 € ; la moyenne France de ce poste ne le compte pas et dit « moyenne de n collectivités ». Testé aux tâches 5 et 8.
3. **Établissement de la Métropole de Lyon, de Saint-Martin, de Saint-Barthélemy ou de Saint-Pierre-et-Miquelon.** Attendu : la fiche d'un collège de Villeurbanne ou de Lyon 5e montre la Métropole de Lyon ; celle d'un collège de Tarare montre le Département du Rhône ; Saint-Martin, Saint-Barthélemy et Saint-Pierre-et-Miquelon montrent la collectivité trouvée à la tâche 4, sinon « collectivité non identifiée dans les balances de la DGFiP ». Testé aux tâches 1 et 8.
4. **Exercice nouveau publié par la DGFiP, ou titre ambigu dans le catalogue.** Attendu : un seul jeu trouvé → collecté et archivé la nuit même ; zéro ou plusieurs → une ligne `erreur` explicite dans le journal, rien d'inventé, le site reste sur les exercices connus. Testé à la tâche 2.
5. **Collectivité sans élèves du privé, ou sans aucune ligne pour un exercice.** Attendu : « aucun élève du privé sous contrat » (pas de division par zéro, pas d'« Infinity ») ; une collectivité absente d'un exercice a ses montants `non_disponible` pour cet exercice et le graphique d'évolution a un trou, pas un zéro. Testé aux tâches 5 et 8.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `shared/src/collectivites.ts` (créé) | régions, départements par région, communes de la Métropole de Lyon, rattachement établissement → collectivité, libellés des collectivités |
| `shared/src/types.ts` (modifié) | `SourceId` accepte `budget_<exercice>` ; `Fiche.budget` |
| `shared/src/donnees.ts` (modifié) | types du budget ; niveau `region` ; `DonneesTerritoire.budget` ; `VersionSource.requete` |
| `shared/src/libelles.ts` (modifié) | `LIBELLES_BUDGET` |
| `pipeline/src/sources.ts` (modifié) | champ `api` et `filtre` des sources ; `SOURCES_BUDGET` ; `toutesSources()` |
| `pipeline/src/ods.ts` (modifié) | export filtré ; recherche dans le catalogue |
| `pipeline/src/archive.ts`, `collect.ts` (modifiés) | jeux découverts dans le manifest, collecte des extraits budget |
| `pipeline/src/budget.ts` (créé) | SQL de normalisation des balances, rattachement des budgets aux collectivités |
| `pipeline/src/budget-eleves.ts` (créé) | montants par élève, statuts, moyennes France |
| `pipeline/src/budget-constantes.ts` (créé) | seuil du personnel, règle agricole, collectivités à mention « cités scolaires » (fixés à la tâche 4) |
| `pipeline/src/territoires.ts`, `fiches.ts` (modifiés) | export du budget, pages région |
| `scripts/budget-controles.ts` (créé) | contrôles sur données réelles (tâche 4), réexécutables |
| `docs/budget-controles.md` (créé) | résultats des contrôles, pour le porteur |
| `site/src/components/BlocBudget.astro` (créé) | bloc « Moyens de la collectivité » |
| `site/src/components/Territoire.astro`, `Entete.astro`, `Ariane.astro`, `FicheA4.astro` (modifiés) | bloc, niveau région, fil d'Ariane |
| `site/src/pages/etablissement/[uai].astro` (modifié) | bloc sur la fiche |
| `site/src/pages/region/[code]/index.astro`, `departements.csv.ts` (créés) | pages région |
| `site/src/pages/france/budget-colleges.csv.ts`, `budget-lycees.csv.ts` (créés) | tableaux téléchargeables |
| `site/src/lib/cartes.ts`, `contours.ts`, `plot.ts` (modifiés) | vue « budget », formes Lyon / Rhône, contours régions, courbe d'évolution |
| `site/src/pages/methode.astro`, `sources.astro`, `index.astro`, `sitemap.xml.ts`, `recherche.json.ts` (modifiés) | méthode, sources, maillage |
| `tests/fixtures/budget_2023.csv`, `budget_2024.csv` (créés) | balances fictives |
| `tests/budget.test.ts`, `tests/budget-eleves.test.ts`, `tests/collectivites.test.ts`, `tests/site-budget.test.ts`, `tests/site-regions.test.ts` (créés) ; `tests/ods.test.ts`, `collect.test.ts`, `aide.ts`, `site.ts` (modifiés) | tests |

---

### Task 1 : Collectivités, régions et types partagés

**Files:**
- Create: `shared/src/collectivites.ts`
- Modify: `shared/src/types.ts`, `shared/src/donnees.ts`, `shared/src/libelles.ts`, `shared/src/territoires.ts`
- Test: `tests/collectivites.test.ts`

**Interfaces:**
- Produces :
  - `type IdCollectivite = string` ; `type NiveauBudget = "colleges" | "lycees"`.
  - `REGIONS: readonly { code: string; libelle: string; deps: readonly string[] }[]` (18 entrées, codes de département au format du site : `"01"`, `"2A"`, `"971"`).
  - `regionDe(dep: string): string | null` (code région ; `null` pour `975`).
  - `COMMUNES_METROPOLE_LYON: ReadonlySet<string>` (codes INSEE, arrondissements de Lyon compris), copiés de `https://geo.api.gouv.fr/epcis/200046977/communes`, avec la date de copie en commentaire.
  - `collectiviteDe(niveau: NiveauBudget, dep: string, codeCommune: string): IdCollectivite | null`.
  - `libelleCollectivite(id: IdCollectivite): string` (« Département de Loire-Atlantique », « Région Pays de la Loire », « Métropole de Lyon », « Ville de Paris », « Collectivité européenne d'Alsace », « Collectivité de Corse », « Collectivité territoriale de Martinique », « Collectivité territoriale de Guyane », « Département de Mayotte »).
  - `SourceId` : union existante `| \`budget_${number}\``.
  - Dans `donnees.ts` : `NiveauTerritoire` gagne `"region"` ; `VersionSource.requete?: string` ; types du budget :
    ```ts
    export type StatutBudget = "ok" | "personnel_non_rattache" | "fonction_non_detaillee" | "aucun_eleve_prive" | "collectivite_non_identifiee" | "non_disponible";
    export interface MontantBudget { total: number | null; parEleve: number | null; statut: StatutBudget }
    export interface ExerciceBudget {
      exercice: number; rentree: number; source: SourceId;
      eleves: ParSecteur<number | null>;
      public: { horsPersonnel: MontantBudget; avecPersonnel: MontantBudget; investissement: MontantBudget };
      prive: { fonctionnement: MontantBudget; investissement: MontantBudget };
    }
    export interface BudgetCollectivite {
      id: IdCollectivite; libelle: string; niveau: NiveauBudget;
      exercices: ExerciceBudget[];            // par exercice croissant
      mentions: ("agricole" | "cites_scolaires")[]; partCitesScolaires?: number;
    }
    export interface MoyenneBudget { valeur: number | null; n: number }
    export interface MoyennesBudgetFrance {
      niveau: NiveauBudget;
      exercices: { exercice: number; public: { horsPersonnel: MoyenneBudget; avecPersonnel: MoyenneBudget; investissement: MoyenneBudget };
                   prive: { fonctionnement: MoyenneBudget; investissement: MoyenneBudget } }[];
    }
    export interface BudgetTerritoire { collectivites: BudgetCollectivite[]; france: MoyennesBudgetFrance[] }
    ```
  - `DonneesTerritoire.budget: BudgetTerritoire` ; `DonneesTerritoire.academies?: RefTerritoire[]` (page région) ; `ValeurCarte` gagne `budget?: number | null` et la carte France gagne `{ genre: "collectivites"; valeurs: { id: IdCollectivite; deps: string[]; budget: number | null }[] }` à côté des vues existantes (le builder choisit de l'ajouter comme second champ `carteBudget` de `DonneesFrance` ou dans `CarteDonnees`).
  - `Fiche.budget: { colleges?: BudgetCollectivite | null; lycees?: BudgetCollectivite | null; france: MoyennesBudgetFrance[] }` (seul le niveau de la famille est présent ; `null` = collectivité non identifiée).
  - `LIBELLES_BUDGET` (libellés exacts des Global Constraints).

- [ ] **Step 1 : Écrire les tests**

```ts
test("régions : 18, chaque département du site dans une seule, sauf 975", () => {
  expect(REGIONS).toHaveLength(18);
  const tous = REGIONS.flatMap((r) => r.deps);
  expect(new Set(tous).size).toBe(tous.length);
  expect(regionDe("44")).toBe("52");
  expect(regionDe("2A")).toBe("94");
  expect(regionDe("976")).toBe("06");
  expect(regionDe("975")).toBeNull();
});
test("collèges : Métropole de Lyon, Rhône, Paris, Alsace, Corse, Mayotte", () => {
  expect(collectiviteDe("colleges", "69", "69266")).toBe("ml-lyon");    // Villeurbanne
  expect(collectiviteDe("colleges", "69", "69385")).toBe("ml-lyon");    // Lyon 5e
  expect(collectiviteDe("colleges", "69", "69243")).toBe("dep-69");     // Tarare
  expect(collectiviteDe("colleges", "75", "75115")).toBe("paris");
  expect(collectiviteDe("colleges", "68", "68224")).toBe("cea");
  expect(collectiviteDe("colleges", "2B", "2B033")).toBe("ctu-corse");
  expect(collectiviteDe("colleges", "972", "97209")).toBe("ctu-martinique");
  expect(collectiviteDe("colleges", "976", "97611")).toBe("dep-976");
  expect(collectiviteDe("colleges", "44", "44109")).toBe("dep-44");
});
test("lycées : région, collectivités uniques, Mayotte", () => {
  expect(collectiviteDe("lycees", "44", "44109")).toBe("reg-52");
  expect(collectiviteDe("lycees", "2A", "2A004")).toBe("ctu-corse");
  expect(collectiviteDe("lycees", "973", "97302")).toBe("ctu-guyane");
  expect(collectiviteDe("lycees", "976", "97611")).toBe("dep-976");
});
test("Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon : non identifiés tant que la tâche 4 n'a rien trouvé", () => {
  expect(collectiviteDe("colleges", "971", "97801")).toBeNull();
  expect(collectiviteDe("lycees", "971", "97701")).toBeNull();
  expect(collectiviteDe("colleges", "975", "97502")).toBeNull();
});
test("chemin d'une page région", () => {
  expect(cheminTerritoire({ niveau: "region", code: "52", libelle: "Pays de la Loire" })).toBe("/region/52/");
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec** — Run : `bun test tests/collectivites.test.ts` ; attendu : FAIL (module absent).
- [ ] **Step 3 : Implémenter** `collectivites.ts` et les types ci-dessus. Les communes 977xx / 978xx et le département 975 renvoient `null` (la tâche 4 pourra changer ce comportement, test compris).
- [ ] **Step 4 : Lancer les tests et `bun run typecheck`** — attendu : PASS. Les erreurs de typage dues aux nouveaux champs obligatoires (`budget`) dans le pipeline et les tests sont corrigées par des valeurs vides provisoires (`{ collectivites: [], france: [] }`), remplies aux tâches 6 et 7.
- [ ] **Step 5 : Commit** — `git commit -m "feat: collectivités, régions et types du budget"`

### Task 2 : Collecte des extraits budget

**Files:**
- Modify: `pipeline/src/sources.ts`, `pipeline/src/ods.ts`, `pipeline/src/archive.ts`, `pipeline/src/collect.ts`, `pipeline/src/cli.ts`, `tests/aide.ts`
- Test: `tests/ods.test.ts`, `tests/collect.test.ts`

**Interfaces:**
- Consumes : `SourceId` (tâche 1), `VersionSource.requete`.
- Produces :
  - `Source` gagne `api: string` (base de l'API ; `API` actuel pour les sources existantes, `API_ECO = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets"`) et `filtre?: string` (clause `where` ODSQL) ; `producteur` vaut `"DGFiP"` pour le budget ; `pageUrl` sur `https://data.economie.gouv.fr/explore/dataset/<id>/information/`.
  - `EXERCICES_BUDGET: Record<number, string>` = les cinq identifiants de la spec (section 6.1) pour 2020 à 2024.
  - `FILTRE_BUDGET: string` : `categ in ("DEPT","REG","CTU","ML","PARIS") and cbudg = "1" and fonction in (…)`, la liste étant générée : `221`, `222`, `223`, `22`, et chacun précédé de `90`, `91`, `92`, `93`, `94` ; plus `922`, `932`.
  - `COLONNES_BUDGET` (colonnes requises) : `exer, ident, siren, lbudg, categ, ndept, cregi, cbudg, nomen, fonction, compte, obnetdeb, obnetcre, oobdeb, oobcre`.
  - `sourceBudget(exercice: number, datasetId: string): Source` (id `budget_<exercice>`, titre « Balances comptables des collectivités, présentation croisée nature-fonction <exercice> », `referentiel: false`).
  - `toutesSources(manifest: Manifest): Source[]` : `SOURCES` + budgets connus + jeux découverts enregistrés dans le manifest.
  - `OdsClient.telechargerParquet` : URL `${s.api}/${s.datasetId}/exports/parquet` + `?where=<filtre encodé>` si `s.filtre` ; renvoie aussi l'URL utilisée (stockée dans `VersionSource.requete`). `OdsClient.metadata` utilise `s.api`.
  - `OdsClient.chercherJeu(api: string, titre: string): Promise<string[]>` : identifiants des jeux dont le titre contient exactement `titre` (une requête catalogue `where=search("…")`, filtrage exact côté client).
  - `Manifest.jeuDecouvert(id: SourceId): string | undefined` et `Manifest.decouvrir(id: SourceId, datasetId: string)` (champ `jeux` du manifest).
  - `collecter` : après les sources connues, cherche l'exercice `max(exercices connus) + 1` avec le titre « nature-fonction <exercice> » ; un seul résultat → enregistré par `decouvrir` puis traité comme les autres ; zéro → rien (cas normal, pas de ligne de journal) ; plusieurs → ligne `{ action: "erreur", motif: "plusieurs jeux pour l'exercice <N> : …" }`.
  - `assurerCache` et `cheminsFixtures` itèrent sur `toutesSources(manifest)` (fixtures : `budget_2023`, `budget_2024`).

- [ ] **Step 1 : Écrire les tests** (`fetch` simulé, comme les tests existants)
  - `ods.test.ts` : `telechargerParquet` d'une source budget appelle `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/<id>/exports/parquet?where=` suivi de `FILTRE_BUDGET` encodé, et renvoie cette URL ; une source sans filtre garde l'URL actuelle (test de non-régression).
  - `ods.test.ts` : `chercherJeu` renvoie `[]`, un identifiant, ou deux, selon la réponse du catalogue, et n'accepte pas « nature-fonction 20250 » pour « nature-fonction 2025 ».
  - `collect.test.ts` : `un exercice nouveau trouvé est collecté et archivé avec sa requête` (manifest final : `jeux.budget_2025` renseigné, version avec `requete` qui contient `where=`) ; `deux jeux pour un exercice : erreur au journal, rien de collecté` ; `aucun jeu : aucune ligne de journal pour l'exercice` ; `un extrait budget sans la colonne fonction est rejeté`.
- [ ] **Step 2 : Lancer, vérifier l'échec** — `bun test tests/ods.test.ts tests/collect.test.ts` ; attendu : FAIL sur les nouveaux tests seulement.
- [ ] **Step 3 : Implémenter** les interfaces ci-dessus ; créer `tests/fixtures/budget_2023.csv` et `budget_2024.csv` vides d'abord (en-têtes `COLONNES_BUDGET`), remplis à la tâche 3.
- [ ] **Step 4 : Lancer toute la suite** — `bun test` ; attendu : PASS.
- [ ] **Step 5 : Essai réel limité** — `OBS_DEPOT=local bun run collect` ; attendu : `budget_2020` à `budget_2024` en `telecharge`, chacun entre 1 000 et 50 000 lignes, aucune autre source en `erreur`. Ne pas commiter `archives/` produit par cet essai.
- [ ] **Step 6 : Commit** — `git commit -m "feat: collecte des balances DGFiP filtrées par exercice"`

### Task 3 : Normalisation des balances

**Files:**
- Create: `pipeline/src/budget.ts`
- Modify: `pipeline/src/db.ts` (étape ajoutée à `ETAPES`), `tests/fixtures/budget_2023.csv`, `tests/fixtures/budget_2024.csv`
- Test: `tests/budget.test.ts`

**Interfaces:**
- Consumes : vues `src_budget_<exercice>` (créées par `ouvrir` pour chaque source présente), `IdCollectivite`.
- Produces :
  - `collectiviteDuBudget(l: { categ: string; ndept: string | null; cregi: string | null; lbudg: string }): IdCollectivite | null` : `DEPT` → `dep-<ndept sans zéro de tête, au format du site>` sauf Alsace (`lbudg` contient `ALSACE`) → `cea` et Mayotte → `dep-976` ; `REG` → `reg-<code INSEE>` (le builder établit la correspondance `cregi` → code INSEE, qui diffère pour les régions d'outre-mer) ; `ML` → `ml-lyon` ; `PARIS` → `paris` ; `CTU` → d'après `lbudg` (`CORSE`, `MARTINIQUE`, `GUYANE`) ; sinon `null`.
  - `depenseReelle` : expression SQL de la formule des Global Constraints.
  - `fonctionNormalisee(code: string): "221" | "222" | "223" | "22" | null`.
  - `sqlBudget(exercices: number[]): string` → tables :
    - `budget_lignes(exercice, collectivite, nomen, fonction, compte, montant)` ;
    - `budget_postes(exercice, collectivite, niveau, secteur, poste, montant)`, `niveau` ∈ `colleges | lycees`, `secteur` ∈ `public | prive`, `poste` ∈ `fonctionnement_hors_personnel | personnel | investissement` (privé : `fonctionnement | investissement`) ;
    - `budget_non_detaille(exercice, collectivite, niveau)` : collectivités qui n'ont que la fonction `22`.
  - Les budgets dont `collectiviteDuBudget` renvoie `null` vont dans la table `budget_inconnus(exercice, ident, lbudg)` ; leur nombre est affiché par `bun run data`.

- [ ] **Step 1 : Remplir les fixtures**, une dizaine de lignes par exercice, qui couvrent : un département M52 en 2023 et M57 en 2024 (Loire-Atlantique fictive, `65511` / `65512` puis `655111` / `655112`), avec du personnel dans `221` ; un département sans personnel dans `221` (personnel en `0201`) ; une région avec `93222`, `90222`, `93223` ; une région au code nu (`222`, `223`) ; une ligne d'opération d'ordre (`oobdeb` non nul) ; un compte `6811` ; un compte `1641` ; une collectivité `ML` ; une `CTU` Corse avec `221` et `222` ; un département qui n'a que `9322`.
- [ ] **Step 2 : Écrire les tests**
  - `collectiviteDuBudget` : un cas par catégorie, plus `null` pour un `lbudg` inconnu en `CTU`.
  - `fonctionNormalisee` : `"93221"→"221"`, `"90222"→"222"`, `"223"→"223"`, `"9322"→"22"`, `"922"→"22"`, `"2210"→null`, `"81"→null`.
  - `M52 puis M57 : même total public et privé` (fixtures construites pour donner les mêmes montants les deux années).
  - `opérations d'ordre, amortissements et emprunts exclus`.
  - `région : 222 public, 223 privé, codes préfixés et nus additionnés de la même façon`.
  - `Corse : collèges et lycées dans la même collectivité, niveaux séparés`.
  - `fonction non détaillée : présente dans budget_non_detaille, absente de budget_postes`.
- [ ] **Step 3 : Lancer, vérifier l'échec** — `bun test tests/budget.test.ts`.
- [ ] **Step 4 : Implémenter** `budget.ts`. La table de correspondance `budget_collectivites(categ, ndept, cregi, lbudg, collectivite)` est remplie en TypeScript avec `collectiviteDuBudget` appliqué aux combinaisons distinctes, puis jointe en SQL.
- [ ] **Step 5 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 6 : Commit** — `git commit -m "feat: normalisation des balances (collèges, lycées, public, privé)"`

### Task 4 : Contrôles sur les données réelles (point d'arrêt pour le porteur)

**Files:**
- Create: `scripts/budget-controles.ts`, `pipeline/src/budget-constantes.ts`, `docs/budget-controles.md`
- Modify (selon les résultats) : `pipeline/src/budget.ts`, `shared/src/collectivites.ts` et leurs tests

**Interfaces:**
- Consumes : tables de la tâche 3, sur les archives réelles collectées à la tâche 2 (`OBS_DEPOT=local`).
- Produces (`budget-constantes.ts`) :
  - `SEUIL_PERSONNEL_PAR_ELEVE: number` (€ de comptes 64 par élève du public en dessous duquel le personnel est « non rattaché ») ;
  - `AGRICOLE: { mode: "isole"; comptes: string[] } | { mode: "mention" }` ;
  - `CITES_SCOLAIRES: Record<IdCollectivite, number>` (part en % des reversements entre collectivités, seulement pour les collectivités au-dessus de 3 %) ;
  - éventuellement des collectivités pour Saint-Martin, Saint-Barthélemy et Saint-Pierre-et-Miquelon dans `collectivites.ts`.

`scripts/budget-controles.ts` imprime un rapport ; chaque contrôle a un critère de réussite écrit.

- [ ] **Step 1 : Formule de la dépense réelle.** Pour Loire-Atlantique, Nord et Gironde 2024, comparer la somme des dépenses de fonctionnement de la fonction 221 (classe 6) à l'agrégat OFGL « Dépenses de fonctionnement » de la fonction 221 (`ofgl-base-departements-fonctionnelle`, une requête par département). Critère : écart < 1 %. Sinon, corriger `depenseReelle` (par exemple `obnetdeb − obnetcre` si `obnet` exclut déjà l'ordre), relancer, et noter la formule retenue.
- [ ] **Step 2 : Couverture.** Pour chaque exercice : nombre de collectivités par catégorie avec des lignes `221` / `222` / `223`, liste de `budget_inconnus` et de `budget_non_detaille`. Critère : toutes les collectivités attendues (environ 95 pour les collèges, 18 pour les lycées) ont des lignes ou figurent dans une des deux listes avec une explication.
- [ ] **Step 3 : Seuil du personnel.** Imprimer, pour 2024, la distribution des comptes 64 par élève du public, par collectivité. Choisir le seuil dans le creux entre les deux groupes (environ 56 / 37 attendus) ; le reporter dans `SEUIL_PERSONNEL_PAR_ELEVE`.
- [ ] **Step 4 : Enseignement agricole.** Chercher dans les fonctions 222 / 223 des régions les comptes ou libellés qui isolent l'enseignement agricole (subventions aux maisons familiales rurales, aux EPLEFPA). Si un ensemble de comptes isole ces montants pour toutes les régions, `mode: "isole"` et `budget.ts` les retire (test ajouté à `budget.test.ts`) ; sinon `mode: "mention"`.
- [ ] **Step 5 : Cités scolaires.** Mesurer, par collectivité et pour 2024, la part des participations versées à d'autres collectivités (comptes `6573x`, `2041x` vers départements et régions) dans les dépenses retenues. Lister celles au-dessus de 3 % dans `CITES_SCOLAIRES`.
- [ ] **Step 6 : Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon.** Chercher leurs collectivités dans les balances (catégories et `lbudg`). Si l'une finance ses collèges ou lycées dans une fonction 221 / 222, ajouter sa règle à `collectiviteDuBudget` et `collectiviteDe`, avec les tests ; sinon laisser `null`.
- [ ] **Step 7 : Écrire `docs/budget-controles.md`** : chaque contrôle, son résultat chiffré, la décision prise.
- [ ] **Step 8 : Commit** — `git commit -m "chore: contrôles du budget sur les balances 2020-2024"`
- [ ] **Step 9 : Point d'arrêt.** Présenter `docs/budget-controles.md` au porteur (la spec, sections 6.6 et 6.7, exige qu'il soit prévenu avant publication pour l'agricole et les cités scolaires). Ne pas commencer la tâche 5 sans son accord.

### Task 5 : Montants par élève et moyennes France

**Files:**
- Create: `pipeline/src/budget-eleves.ts`
- Test: `tests/budget-eleves.test.ts`

**Interfaces:**
- Consumes : `budget_postes`, `budget_non_detaille` (tâche 3) ; constantes (tâche 4) ; `collectiviteDe`, `libelleCollectivite` (tâche 1) ; fiches actives **et disparues** (`Fiche[]`), dont l'historique de l'indicateur `eleves`.
- Produces :
  - `elevesParCollectivite(fiches: Fiche[], rentree: number): Map<string, ParSecteur<number>>` (clé `${niveau}|${id}` ; collèges = famille `college` ; lycées = `legt`, `lpo`, `lp`, `erea` ; une fiche sans valeur pour cette rentrée ne compte pas).
  - `calculerBudgets(db: Db, fiches: Fiche[]): Promise<{ collectivites: Map<string, BudgetCollectivite>; france: MoyennesBudgetFrance[] }>`, clé `${niveau}|${id}`, exercices ≥ `EXERCICE_MIN`.
  - Règles de statut : `avecPersonnel` = `horsPersonnel + personnel` si personnel par élève ≥ `SEUIL_PERSONNEL_PAR_ELEVE`, sinon `personnel_non_rattache` ; privé sans élèves → `aucun_eleve_prive` ; collectivité dans `budget_non_detaille` → `fonction_non_detaillee` pour tous ses postes ; exercice sans ligne → `non_disponible`. `total` et `parEleve` sont `null` dès que le statut n'est pas `ok`.
  - Moyennes France : Σ `total` ÷ Σ élèves sur les collectivités `ok` du poste ; `n` = leur nombre.
  - `mentions` : `"agricole"` pour les lycées si `AGRICOLE.mode === "mention"` ; `"cites_scolaires"` et `partCitesScolaires` d'après `CITES_SCOLAIRES`.

- [ ] **Step 1 : Écrire les tests** (sur `dbTest()` et des fiches de test)
  - `exercice 2024 divisé par les élèves de la rentrée 2023`.
  - `personnel non rattaché : statut et null, jamais 0`.
  - `aucun élève du privé : aucun_eleve_prive, pas d'Infinity ni de NaN` (parcourir toutes les valeurs numériques produites et vérifier `Number.isFinite`).
  - `moyenne France du personnel compris : n ne compte que les collectivités ok`.
  - `une fiche disparue compte dans les élèves des exercices où elle avait des élèves`.
  - `exercice absent pour une collectivité : non_disponible`.
- [ ] **Step 2 : Lancer, vérifier l'échec.**
- [ ] **Step 3 : Implémenter.**
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: dépenses par élève et moyennes France"`

### Task 6 : Export du budget et des pages région (pipeline)

**Files:**
- Modify: `pipeline/src/fiches.ts`, `pipeline/src/territoires.ts`, `pipeline/src/cli.ts`
- Test: `tests/territoires.test.ts`, `tests/fiches.test.ts`

**Interfaces:**
- Consumes : `calculerBudgets` (tâche 5), `REGIONS`, `regionDe`, `collectiviteDe`.
- Produces (fichiers de `site/data/`) :
  - `fiches/<uai>.json` : `budget` rempli (collèges ou lycées selon la famille ; `null` si collectivité non identifiée ; `france` = moyennes du niveau).
  - `regions/<code>.json` : `DonneesTerritoire` de niveau `region` : `parents: [FRANCE]`, familles avec IPS moyens **calculés** (comme les communes, `calculee: true`), `moyennes` face à la France seulement, `enfants` = départements de la région (`LigneTerritoire`), `academies` = ses académies, `carte` = départements colorés (vues A / B), `budget` = la région (lycées) + chaque collectivité des collèges de ses départements.
  - `departements/<dep>.json` : `parents: [FRANCE, région, académie]` ; `budget` = collectivité(s) des collèges du département (deux pour le Rhône) + collectivité des lycées.
  - `academies/<aca>.json` : `parents: [FRANCE, région]` ; `budget` = collectivités des collèges de ses départements + région.
  - `communes/<insee>.json` : `parents: [FRANCE, région, académie, département]` ; `budget` vide (pas de bloc sur les pages commune).
  - `france.json` : `budget` = toutes les collectivités + moyennes ; données de la vue carte « budget » par collectivité (avec `deps` couverts) ; liste des régions (`regions: RefTerritoire[]`).
  - Saint-Pierre-et-Miquelon : académie et département sans parent région.
  - `bun run data` affiche le nombre de budgets inconnus et de collectivités par statut pour le dernier exercice.

- [ ] **Step 1 : Écrire les tests**
  - `fiche collège de Loire-Atlantique : budget dep-44, pas de lycées`.
  - `page région : parents [France], IPS moyens calculés, départements et académies listés, budget de la région`.
  - `fil d'Ariane des données : département → [France, région, académie]` ; `975 → [France, académie]`.
  - `département du Rhône : deux collectivités des collèges`.
  - `aucun fichier regions/ pour 975`.
- [ ] **Step 2 : Lancer, vérifier l'échec.**
- [ ] **Step 3 : Implémenter.**
- [ ] **Step 4 : Lancer toute la suite, puis `OBS_DEPOT=local bun run data`** ; attendu : 18 fichiers dans `site/data/regions/`, aucun budget inconnu non expliqué par `docs/budget-controles.md`.
- [ ] **Step 5 : Commit** — `git commit -m "feat: export du budget et des données des régions"`

### Task 7 : Pages région, fil d'Ariane et maillage (site)

**Files:**
- Create: `site/src/pages/region/[code]/index.astro`, `site/src/pages/region/[code]/departements.csv.ts`
- Modify: `site/src/components/Territoire.astro`, `Entete.astro`, `Ariane.astro`, `site/src/lib/donnees.ts`, `site/src/lib/contours.ts`, `site/src/lib/territoire.ts`, `site/src/pages/index.astro`, `site/src/pages/france/index.astro`, `site/src/pages/sitemap.xml.ts`, `site/src/pages/recherche.json.ts`
- Test: `tests/site-regions.test.ts`

**Interfaces:**
- Consumes : `regions/<code>.json`, `regionDe`, `cheminTerritoire`.
- Produces : `regionsDisponibles(): string[]` ; `contourRegion(code: string): Contour | null` (fusion des contours départementaux avec `topojson-client` `merge`) ; la page région utilise `Territoire.astro` avec les mêmes blocs que la page académie (titre de section de la liste : « Départements de la région »), plus la liste de ses académies.

- [ ] **Step 1 : Écrire les tests** (site d'essai, `tests/site.ts`)
  - `/region/52/` existe, titre « Pays de la Loire », mention « moyenne calculée par l'observatoire » à côté des IPS.
  - `fil d'Ariane d'une fiche : France › Pays de la Loire › Académie de Nantes › Loire-Atlantique`, chaque maillon lié.
  - `la page France liste les 18 régions, triées par nom, chacune liée`.
  - `l'accueil propose les régions` ; `le sitemap contient /region/52/` ; `la recherche propose « Pays de la Loire »`.
  - `/region/52/departements.csv` : une ligne par département, mêmes colonnes que `academies.csv`.
  - `aucune page /region/975/`.
- [ ] **Step 2 : Lancer, vérifier l'échec.**
- [ ] **Step 3 : Implémenter.**
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: pages région et fil d'Ariane France › Région › Académie"`

### Task 8 : Bloc « Moyens de la collectivité »

**Files:**
- Create: `site/src/components/BlocBudget.astro`
- Modify: `site/src/pages/etablissement/[uai].astro`, `site/src/components/FicheA4.astro`, `site/src/components/Territoire.astro`, `site/src/lib/plot.ts`, `shared/src/libelles.ts`
- Test: `tests/site-budget.test.ts`

**Interfaces:**
- Consumes : `Fiche.budget`, `DonneesTerritoire.budget`, `LIBELLES_BUDGET`, règle d'affichage du socle (écart puis moyenne entre parenthèses sur la page web, moyenne seule sur l'A4).
- Produces : `BlocBudget` (props : `budget: BudgetCollectivite | null`, `france: MoyennesBudgetFrance | undefined`, `secteurEnPremier: "public" | "prive"`, `evolution: boolean`) ; `svgEvolutionBudget(exercices: ExerciceBudget[]): string` dans `plot.ts` (deux courbes, public personnel compris ou, à défaut, hors personnel, et privé ; un exercice absent fait un trou).
- Placement :
  - fiche : nouvelle section `<section id="moyens">` après « Vie scolaire », entrée « Moyens » au sommaire ; fiche privée : la contribution au privé en premier ;
  - fiche A4 : trois lignes dans le tableau central (hors personnel, personnel compris, contribution au privé), moyennes seules, source numérotée ;
  - gabarit de territoire : section « Moyens de la collectivité », dans l'onglet de la famille concernée (collèges / lycées) ; page académie et page région : tableau des collectivités des collèges, trié par nom ; graphique d'évolution sur les pages de territoire seulement.

- [ ] **Step 1 : Écrire les tests**
  - `fiche collège public : les trois postes, la contribution au privé, la source « DGFiP, balances comptables, exercice 2024 · élèves à la rentrée 2023 (DEPP) »`.
  - `personnel non rattaché : libellé exact, aucun « 0 € »` ; `la ligne du privé n'a pas d'écart calculé quand le personnel compris est absent`.
  - `fiche privée : « Contribution aux collèges privés » avant les montants du public`.
  - `fiche lycée de la région agricole : mention agricole exacte` (si `mode: "mention"`).
  - `collectivité non identifiée (Saint-Martin) : libellé exact`.
  - `fiche A4 : moyennes seules, pas d'écart`.
  - `aucun « NaN », « Infinity », « undefined » dans les pages générées` (ajouté aux contrôles transverses existants).
  - `anti-palmarès : aucun mot interdit` (contrôle transverse existant, qui couvre les nouvelles pages).
- [ ] **Step 2 : Lancer, vérifier l'échec.**
- [ ] **Step 3 : Implémenter.**
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Vérifier à l'œil** une fiche collège public, une fiche lycée privé, la page du Rhône et la page Pays de la Loire dans le navigateur (`bun run --cwd site astro preview` après un build local), clair et sombre, et à l'impression.
- [ ] **Step 6 : Commit** — `git commit -m "feat: bloc Moyens de la collectivité (fiches et territoires)"`

### Task 9 : Carte et tableaux de la page France

**Files:**
- Create: `site/src/pages/france/budget-colleges.csv.ts`, `site/src/pages/france/budget-lycees.csv.ts`
- Modify: `site/src/lib/cartes.ts`, `site/src/lib/contours.ts`, `site/src/components/CarteTerritoire.astro`, `site/src/components/Territoire.astro`
- Test: `tests/cartes.test.ts`, `tests/site-budget.test.ts`

**Interfaces:**
- Consumes : vue carte « budget » de `france.json` (tâche 6), `COMMUNES_METROPOLE_LYON`.
- Produces : `VueCarte` gagne `"budget"` (troisième bouton radio de la bascule existante, libellé « Dépense de fonctionnement hors personnel par élève des collèges publics ») ; `formesCollectivites(): { id: IdCollectivite; contour: Contour }[]` (Métropole de Lyon = fusion de ses communes ; Rhône = fusion des autres communes du 69 ; ailleurs, le département) ; CSV `budget-colleges.csv` / `budget-lycees.csv` : une ligne par collectivité et par exercice, colonnes `collectivite;libelle;exercice;rentree;eleves_public;eleves_prive;fonct_hors_personnel_par_eleve;fonct_avec_personnel_par_eleve;invest_public_par_eleve;contribution_prive_par_eleve;invest_prive_par_eleve;statut_personnel`, tri par libellé puis exercice.

- [ ] **Step 1 : Écrire les tests**
  - `cartes.test.ts` : `Rhône et Métropole de Lyon : deux formes, valeurs distinctes` ; `Bas-Rhin et Haut-Rhin : même valeur cea, note sous la carte` ; `collectivité sans valeur : grisée, « non disponible » dans la légende`.
  - `site-budget.test.ts` : `les deux CSV existent, une ligne d'en-tête exacte, aucune cellule « 0 » pour une absence (cellule vide et statut)`.
- [ ] **Step 2 : Lancer, vérifier l'échec.**
- [ ] **Step 3 : Implémenter.**
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: carte et tableaux du budget sur la page France"`

### Task 10 : Méthode, sources, documentation et build complet

**Files:**
- Modify: `site/src/pages/methode.astro`, `site/src/pages/sources.astro`, `README.md`, `docs/superpowers/specs/2026-11-24-observatoire-phase3-budget-design.md` (statut), `.github/workflows/nightly.yml` (seulement si la collecte en a besoin)
- Test: `tests/site-pages.test.ts`

- [ ] **Step 1 : Écrire les tests** : `/methode/` contient une section « Budget des collectivités » avec la formule de la dépense réelle, les comptes retenus par nomenclature, le critère du personnel, la règle des élèves de la rentrée N−1, la règle agricole et les cités scolaires ; `/sources/` liste les cinq exercices des balances DGFiP avec la requête archivée de chacun.
- [ ] **Step 2 : Lancer, vérifier l'échec.**
- [ ] **Step 3 : Rédiger** la méthode à partir de la spec (sections 6.2 à 6.7) et de `docs/budget-controles.md`, sans commentaire sur les montants ; mettre à jour `/sources/` (producteur DGFiP, lien vers la requête archivée), le README (sources, tableau des phases avec Écoles et Transport scolaire), et le statut de la spec (« livrée »).
- [ ] **Step 4 : Build complet** — `OBS_DEPOT=local bun run build` ; attendu : le garde-fou passe, et les tailles et le nombre de fichiers de `dist/` sont affichés (environ 20 pages de plus que la phase 2).
- [ ] **Step 5 : Lancer `bun test` et `bun run typecheck`** — attendu : PASS.
- [ ] **Step 6 : Commit** — `git commit -m "docs: méthode et sources du budget, phase 3 livrée"`
