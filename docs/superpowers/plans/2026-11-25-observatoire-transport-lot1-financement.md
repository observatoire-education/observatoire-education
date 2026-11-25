# Transport scolaire, lot 1 : financement — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** afficher, sur les pages région, département et France, les dépenses de transport scolaire des collectivités (fonction « transports scolaires » des balances DGFiP), en euros, de 2020 au dernier exercice, sans aucun euro par élève.

**Architecture :** une nouvelle famille de sources `transport_<exercice>` interroge les mêmes jeux DGFiP que `budget_<exercice>`, avec son propre filtre (fonctions du transport scolaire ; catégories REG, CTU, DEPT, ML, PARIS, GFP, SYND). Une étape DuckDB `etapeTransport` produit les montants par collectivité et par exercice ; l'export ajoute un champ `transport` aux données des pages région, département et France ; un composant `BlocTransport.astro` les affiche. Le pipeline budget de la phase 3 n'est pas modifié, sauf l'export de deux constantes SQL.

**Tech Stack :** Bun, TypeScript, DuckDB, Astro (sortie statique), `bun test`.

**Spec :** `docs/superpowers/specs/2026-11-25-observatoire-phase-transport-design.md` (section 6), avec l'étude `docs/superpowers/specs/2026-11-24-observatoire-transport-etude.md`.

## Global Constraints

- Montants en euros, **jamais par élève** (spec, section 2, anti-objectifs).
- Une collectivité sans ligne de transport scolaire n'affiche **jamais 0 €** : une phrase d'absence (composant `Absence.astro`).
- Le site ne commente pas les chiffres : aucun classement par montant, aucun écart calculé entre collectivités.
- Toute règle de calcul (codes de fonction, comptes retenus) est consignée dans `docs/budget-controles.md` et résumée sur `/methode/`.
- Aucun nouveau fichier par commune ou par établissement (plafond de 95 000 fichiers) ; ce lot ajoute un seul fichier : `/france/transport-scolaire.csv`.
- Textes en français correct, avec accents ; libellés centralisés dans `shared/src/libelles.ts`.
- Les communes ne sont pas comptées (hors du périmètre de la spec, section 6).

## Review Focus

1. **Un exercice manquant pour une collectivité** (ex. un syndicat absent en 2022) : la série montre l'absence pour cet exercice, pas 0 €. Test dans la tâche 3.
2. **Montant net négatif** (annulations, reprises) : gardé tel quel, sans troncature à 0. Test dans la tâche 2.
3. **Intercommunalité ou syndicat dont le département n'est pas reconnu** : listé dans `transport_inconnus`, jamais rattaché au hasard ni perdu sans trace. Test dans la tâche 2.
4. **Région sans aucune ligne** (Île-de-France) : phrase d'absence propre à la région, pas de graphique vide. Tests dans les tâches 3 et 4.
5. **Collectivités particulières** (Métropole de Lyon, Collectivité européenne d'Alsace, Ville de Paris, CTU de Corse, de Martinique, de Guyane) : affichées sur la bonne page (département 69, 67 et 68, 75, région 94, 02, 03). Test dans la tâche 3.

---

### Task 1 : inventaire des codes et filtre des sources `transport_<exercice>`

Constats faits lors de la rédaction du plan (balances 2024, à confirmer sur tous les exercices) :
- Régions, en M57 : `9381` (chapitre 938 + fonction 81 « transports scolaires », environ 1,5 Md€ au débit), `9081` (investissement), `93252` et `90252` (fonction 252 « transports scolaires » du bloc enseignement, environ 93 M€). Les codes `93821` et `822` relèvent d'autres transports (82 : transports publics de voyageurs) : **exclus**.
- Départements : `81`, `9381`, `252`.
- GFP, SYND, ML : `81` et `252`.
- CTU : `9381`, `93252`, `90252`, `9081`.

**Files :**
- Create : `pipeline/src/transport-constantes.ts`
- Modify : `pipeline/src/sources.ts` (ajout de `sourceTransport`, et de ses sources dans `toutesSources`), `shared/src/types.ts` (`SourceId`), `pipeline/src/collect.ts` (découverte d'un nouvel exercice : créer aussi la source transport), `tests/aide.ts`
- Create : `tests/fixtures/transport_2023.csv`, `tests/fixtures/transport_2024.csv`
- Modify : `docs/budget-controles.md` (nouvelle section « Transport scolaire »)
- Test : `tests/transport.test.ts`

**Interfaces :**
- Produces :
  - `FONCTIONS_TRANSPORT: readonly string[]` : codes exacts retenus après l'inventaire, au minimum `["81", "9081", "9381", "252", "90252", "93252"]` ;
  - `CATEGORIES_TRANSPORT = ["REG", "CTU", "DEPT", "ML", "PARIS", "GFP", "SYND"] as const` ;
  - `FILTRE_TRANSPORT: string` : clause ODSQL ;
  - `sourceTransport(exercice: number, datasetId: string): Source`, avec l'id `transport_${exercice}`, le même `datasetId` que `sourceBudget`, `filtre: FILTRE_TRANSPORT`, `colonnesRequises: COLONNES_BUDGET` et `millesime: { colonne: "exer", cles: ["categ", "ndept", "cregi", "lbudg", "siren", "fonction"] }` ;
  - `SourceId` : ajout de `` `transport_${number}` ``.

- [ ] **Step 1 : inventaire.** Pour chaque exercice de `EXERCICES_BUDGET` (2020 à 2025), interroger l'API (`/records`, `select=categ,nomen,fonction,count(*),sum(obnetdeb)`, `group_by=categ,nomen,fonction`, `where cbudg="1"` et `fonction in (...)` sur une liste candidate large : `81`, `811`, `812`, `9081`, `9381`, `90381`, `93881`, `252`, `9252`, `90252`, `93252`). Le joker `like` de l'API est peu fiable (`"%252"` ne renvoie pas `93252`) : utiliser des listes exactes. Recouper les codes trouvés avec la nomenclature fonctionnelle de la M57 (et de la M52 et de la M71 si des exercices 2020-2023 les utilisent encore). Faire de même pour les comptes de classe 70 en fonction transport (produits des services, où figurent les participations des familles).

- [ ] **Step 2 : consigner l'inventaire** dans `docs/budget-controles.md`, section « Transport scolaire » : codes retenus et exclus avec leurs motifs, montants par exercice et par catégorie, comptes des produits, et contrôle de vraisemblance face aux chiffres régionaux de la phase 3 (Auvergne-Rhône-Alpes 219 M€, Pays de la Loire 175 M€ en 2024, fonctionnement). Un écart de plus de 10 % sur une région doit être expliqué dans cette section avant de passer à la suite.

- [ ] **Step 3 : écrire les tests qui doivent échouer**

```ts
describe("sources transport", () => {
  test("une source transport par exercice du budget, même jeu, filtre propre", () => {
    const s = sourceTransport(2024, EXERCICES_BUDGET[2024]!);
    expect(s.id).toBe("transport_2024");
    expect(s.datasetId).toBe(EXERCICES_BUDGET[2024]);
    expect(s.filtre).toContain(`"9381"`);
    expect(s.filtre).toContain(`"GFP"`);
    expect(s.filtre).not.toContain(`"93821"`);
    expect(s.filtre).not.toContain(`"Commune"`);
  });
  test("toutesSources contient transport_2020 à transport_2025", () => {
    const ids = toutesSources(manifestVide()).map((s) => s.id);
    for (const e of [2020, 2021, 2022, 2023, 2024, 2025]) expect(ids).toContain(`transport_${e}`);
  });
});
```

- [ ] **Step 4 : vérifier l'échec.** Lancer `bun test tests/transport.test.ts`. Attendu : FAIL, `sourceTransport` n'existe pas.

- [ ] **Step 5 : implémenter.** Écrire `transport-constantes.ts` et `sourceTransport`, et ajouter les sources dans `toutesSources`. Dans `collect.ts`, quand un exercice `budget_<n+1>` est découvert, créer aussi `transport_<n+1>` (même jeu). Écrire les jeux d'essai `transport_2023.csv` et `transport_2024.csv` avec les colonnes de `COLONNES_BUDGET`. Ils couvrent :
  - REG `052` en `9381` et `93252`, avec un compte `70` au crédit ;
  - REG `011` (Île-de-France) absente ;
  - DEPT `044` en `81` ;
  - deux GFP et un SYND de `044`, dont un SYND absent en 2023 ;
  - un GFP avec `ndept` vide ;
  - ML Lyon, CEA, Paris, CTU de Corse ;
  - une ligne à montant net négatif.

  Enregistrer ces sources dans `tests/aide.ts`, comme les sources budget.

- [ ] **Step 6 : vérifier le succès.** Lancer `bun test tests/transport.test.ts tests/collect.test.ts`, puis `bun run typecheck`. Attendu : PASS.

- [ ] **Step 7 : commit**

```bash
git add pipeline/src/transport-constantes.ts pipeline/src/sources.ts pipeline/src/collect.ts shared/src/types.ts tests/ docs/budget-controles.md
git commit -m "feat(transport): sources transport_<exercice> et inventaire des codes de fonction"
```

### Task 2 : étape DuckDB `etapeTransport`

**Files :**
- Create : `pipeline/src/transport.ts`
- Modify : `pipeline/src/budget.ts` (exporter `classe6`, `investissement` et `JOINTURE` sans changer leur valeur), `pipeline/src/db.ts` (ajouter `etapeTransport` à `ETAPES`, après `etapeBudget`)
- Test : `tests/transport.test.ts`

**Interfaces :**
- Consumes : `FONCTIONS_TRANSPORT` (tâche 1) ; `collectiviteDuBudget`, `depenseReelle`, `classe6` et `investissement` de `budget.ts`.
- Produces :
  - `collectiviteTransport(l: LigneBudget & { siren?: string | null }): IdCollectivite | null` :
    - DEPT, REG, CTU, ML et PARIS : délègue à `collectiviteDuBudget` ;
    - GFP et SYND : `grp-<dep>-<siren>`, où `<dep>` est tiré de `ndept` avec les règles de `codeDepartement` (à exporter) ;
    - null si le département n'est pas reconnu.
  - `etapeTransport(db: Db): Promise<string>` : crée les tables suivantes.
    - `transport_montants(exercice integer, collectivite varchar, libelle varchar, poste varchar, montant double)`. `poste` vaut `fonctionnement`, `investissement` ou `produits_services`. `libelle` est le `lbudg` du dernier exercice, pour les groupements.
    - `transport_inconnus(exercice integer, categ varchar, ndept varchar, lbudg varchar)`.

Règles de calcul :
- **Fonctionnement** : `depenseReelle` sur les comptes `classe6`.
- **Investissement** : `depenseReelle` sur les comptes `investissement`.
- **Produits des services** : recette réelle, soit `(obnetcre − oobcre) − (obnetdeb − oobdeb)`, sur les comptes `70%`.
- Pour une même collectivité, toutes les fonctions de `FONCTIONS_TRANSPORT` sont additionnées.
- Aucun montant n'est tronqué : un montant négatif reste négatif.

- [ ] **Step 1 : écrire les tests qui doivent échouer**

```ts
describe("collectiviteTransport", () => {
  const l = (categ: string, ndept: string | null, siren: string | null, lbudg = "X") => ({ categ, ndept, cregi: null, lbudg, siren });
  test("collectivités du budget inchangées ; groupements rattachés à leur département", () => {
    expect(collectiviteTransport({ ...l("REG", "044", null), cregi: "052" })).toBe("reg-52");
    expect(collectiviteTransport(l("ML", "069", null))).toBe("ml-lyon");
    expect(collectiviteTransport(l("GFP", "044", "244400404"))).toBe("grp-44-244400404");
    expect(collectiviteTransport(l("SYND", "02A", "252000001"))).toBe("grp-2A-252000001");
    expect(collectiviteTransport(l("GFP", null, "200000001"))).toBeNull();
  });
});

describe("etapeTransport", () => {
  test("montants par collectivité, poste et exercice ; négatif conservé ; inconnus listés", async () => {
    const db = await dbTest(); // jeux d'essai transport_2023 et transport_2024
    const m = await db.sql<{ exercice: number; collectivite: string; poste: string; montant: number }>(
      "select * from transport_montants order by all");
    expect(m.find((x) => x.collectivite === "reg-52" && x.exercice === 2024 && x.poste === "fonctionnement")!.montant)
      .toBe(/* somme 9381 + 93252 des jeux d'essai */);
    expect(m.some((x) => x.montant < 0)).toBe(true);
    expect(m.some((x) => x.collectivite.startsWith("reg-11"))).toBe(false);
    // syndicat absent en 2023 : aucune ligne 2023, pas de ligne à 0
    expect(m.filter((x) => x.collectivite === "grp-44-<siren du SYND>" && x.exercice === 2023)).toHaveLength(0);
    const inc = await db.sql("select * from transport_inconnus");
    expect(inc.length).toBeGreaterThan(0);
  });
});
```

Les valeurs exactes attendues sont celles des jeux d'essai de la tâche 1.

- [ ] **Step 2 : vérifier l'échec.** Lancer `bun test tests/transport.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : implémenter.** Écrire `collectiviteTransport` et `etapeTransport` sur le modèle de `etapeBudget`. Remplir une table `transport_collectivites`, de la même forme que `budget_collectivites` avec en plus `siren`, à partir des combinaisons distinctes, puis faire la jointure. La détection des exercices présents passe par les vues `src_transport_<exercice>`, sur le modèle de `exercicesPresents`.

- [ ] **Step 4 : vérifier le succès.** Lancer `bun test tests/transport.test.ts tests/budget.test.ts`. Attendu : PASS, budget inchangé.

- [ ] **Step 5 : commit**

```bash
git add pipeline/src/transport.ts pipeline/src/budget.ts pipeline/src/db.ts tests/transport.test.ts
git commit -m "feat(transport): étape DuckDB des montants de transport scolaire"
```

### Task 3 : données des pages (région, département, France)

**Files :**
- Modify : `shared/src/donnees.ts`, `pipeline/src/territoires.ts`, `pipeline/src/fiches.ts` (appel de lecture), `pipeline/src/cli.ts` si nécessaire
- Create : `pipeline/src/transport-export.ts`
- Test : `tests/transport.test.ts`, `tests/territoires.test.ts`

**Interfaces :**
- Consumes : la table `transport_montants` (tâche 2).
- Produces, dans `shared/src/donnees.ts` :

```ts
/** Montants d'un exercice ; null : poste absent des comptes cet exercice-là. */
export interface ExerciceTransport { exercice: number; fonctionnement: number | null; investissement: number | null; produitsServices: number | null }
export interface CollectiviteTransport { id: IdCollectivite; libelle: string; serie: ExerciceTransport[] }
export interface TransportTerritoire {
  /** Région ou CTU (page région) ; Département, Métropole de Lyon, CEA ou Ville de Paris (page département). */
  collectivites: CollectiviteTransport[];
  /** Page département : intercommunalités et syndicats dont le siège est dans le département, triés par libellé. */
  groupements?: { total: ExerciceTransport[]; liste: CollectiviteTransport[] };
  /** Page région dont ni la Région ni la CTU n'a de ligne : phrase d'absence (propre à la région, sinon générique). */
  absence?: "region_sans_ligne";
  exercices: number[];
}
```

- `DonneesTerritoire.transport?: TransportTerritoire`, présent sur les pages région et département.
- `DonneesFrance.transportRegions?: CollectiviteTransport[]` : les régions et les CTU, triées par libellé.
- `lireTransport(db: Db): Promise<TableTransport>` dans `transport-export.ts`, où `TableTransport = Map<IdCollectivite, CollectiviteTransport>`.

Rattachement aux pages : la page région prend `reg-<code>`, plus la CTU de la région (`ctu-corse` pour 94, `ctu-martinique` pour 02, `ctu-guyane` pour 03). La page département prend `dep-<dep>`. Elle prend aussi `ml-lyon` pour 69, `cea` pour 67 et 68, et `paris` pour 75. Ses groupements sont les `grp-<dep>-*`.

- [ ] **Step 1 : écrire les tests qui doivent échouer.** Dans `tests/territoires.test.ts` :
  - `regions/52.json` a `transport.collectivites[0].id === "reg-52"` et 2 exercices ;
  - `regions/11.json` a `transport.absence === "region_sans_ligne"` ;
  - `regions/94.json` contient `ctu-corse` ;
  - `departements/44.json` a `transport.collectivites[0].id === "dep-44"`, et `transport.groupements.liste` compte 3 groupements triés par libellé ;
  - `departements/69.json` contient `ml-lyon`, `departements/67.json` contient `cea`, `departements/75.json` contient `paris` ;
  - pour le syndicat absent en 2023, la série 2023 de `groupements.liste` a `fonctionnement === null`, et non 0 ;
  - `france.json` a `transportRegions` trié par libellé.

- [ ] **Step 2 : vérifier l'échec.** Lancer `bun test tests/territoires.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : implémenter.** Écrire `lireTransport`. Un exercice où un poste n'a aucune ligne donne `null`. Le total des groupements d'un exercice est null si aucun groupement n'a de ligne cet exercice-là. Ensuite, passer la table à `exporterTerritoires` comme `budgets`, et remplir `transport` aux endroits qui écrivent `regions/*.json`, `departements/*.json` et `france.json`.

- [ ] **Step 4 : vérifier le succès.** Lancer `bun test tests/territoires.test.ts tests/transport.test.ts` et `bun run typecheck`. Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add shared/src/donnees.ts pipeline/src/transport-export.ts pipeline/src/territoires.ts pipeline/src/fiches.ts pipeline/src/cli.ts tests/
git commit -m "feat(transport): montants de transport scolaire dans les données région, département et France"
```

### Task 4 : bloc « Transport scolaire » sur les pages

**Files :**
- Create : `site/src/components/BlocTransport.astro`
- Create : `site/src/pages/france/transport-scolaire.csv.ts`
- Modify : `site/src/components/Territoire.astro` (nouvelle section `<section id="transport">`, placée après les sections par famille et avant « Résultats »), `shared/src/libelles.ts` (`LIBELLES_TRANSPORT`)
- Test : `tests/site-transport.test.ts`, avec ajout du chemin du CSV à la liste attendue de `tests/garde-fous.test.ts` si elle existe

**Interfaces :**
- Consumes : `TransportTerritoire`, `DonneesFrance.transportRegions` (tâche 3).
- Produces : `LIBELLES_TRANSPORT` dans `shared/src/libelles.ts`, avec ces textes exacts :

```ts
export const LIBELLES_TRANSPORT = {
  titre: "Transport scolaire",
  fonctionnement: "Dépenses de fonctionnement",
  investissement: "Dépenses d'investissement",
  produitsServices: "Produits des services (dont participations des familles)",
  groupements: "Intercommunalités et syndicats ayant leur siège dans le département",
  note: "Ces montants ne sont pas rapportés au nombre d'élèves : l'organisation du transport scolaire peut être déléguée (départements, intercommunalités, syndicats), la participation des familles varie d'une région à l'autre, et aucun nombre d'élèves transportés n'est publié en données ouvertes.",
  absenceGenerique: (e: number) => `Aucune dépense de transport scolaire n'apparaît dans les comptes de cette collectivité pour l'exercice ${e}.`,
  absencesRegion: {
    "11": "Le transport scolaire n'apparaît pas dans les comptes de la Région : en Île-de-France, il est organisé par Île-de-France Mobilités.",
  } as Record<string, string>,
  csv: "⬇ Télécharger les dépenses de transport scolaire des régions (CSV)",
} as const;
```

  Phrase propre à La Réunion : ne l'ajouter que si une source officielle confirme qui organise le transport scolaire (l'étude ne l'a vu que dans un extrait de moteur de recherche). Sinon, la phrase générique s'applique.

Affichage :
- **Page région et page département** : une carte par collectivité.
  - En tête, les montants du dernier exercice : fonctionnement, investissement, produits des services. Une ligne n'apparaît que si elle est non nulle sur au moins un exercice.
  - Puis un graphique d'évolution du fonctionnement depuis 2020, rendu au build comme ceux de `BlocBudget` (Observable Plot en SVG).
  - Un exercice sans donnée crée un trou dans la courbe, pas un 0.
- **Page département** : sous la carte du Département, un encadré « groupements » avec le total, le nombre de groupements et un `<details>` qui les liste avec le fonctionnement du dernier exercice.
- **Page France** : un tableau des régions avec le fonctionnement, l'investissement et les produits du dernier exercice, plus le lien CSV.
- **CSV** (`/france/transport-scolaire.csv`) : colonnes `collectivite,libelle,exercice,fonctionnement,investissement,produits_services`, une ligne par région ou CTU et par exercice, avec une cellule vide quand la valeur est null.
- **Note** `LIBELLES_TRANSPORT.note` sous chaque bloc, avec un lien vers `/methode/#transport-financement`.
- **Formatage** : celui de `shared/src/format.ts`, en euros, à la française.

- [ ] **Step 1 : écrire les tests qui doivent échouer.** Dans `tests/site-transport.test.ts` :
  - `region/52` affiche `#transport` avec « Transport scolaire », le montant attendu formaté et la note ; il ne contient pas « par élève » dans `#transport` ;
  - `region/11` contient la phrase d'absence de l'Île-de-France et aucun `svg` dans `#transport` ;
  - `departement/44` affiche un `<details>` qui liste 3 groupements ;
  - `departement/69` mentionne la Métropole de Lyon dans `#transport` ;
  - `france/` contient le lien `a[href='/france/transport-scolaire.csv']`, et ce CSV a l'en-tête exact ci-dessus et une cellule vide pour la valeur null.

- [ ] **Step 2 : vérifier l'échec.** Lancer `bun test tests/site-transport.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : implémenter** `BlocTransport.astro` (props : `t: TransportTerritoire`, `region?: string`), le point d'entrée CSV et la section dans `Territoire.astro`. Pour le graphique, réutiliser l'aide d'évolution de `BlocBudget` si elle est extractible sans changer son rendu ; sinon, écrire un graphique dédié de même style.

- [ ] **Step 4 : vérifier le succès.** Lancer `bun test tests/site-transport.test.ts tests/site-budget.test.ts tests/site-regions.test.ts tests/garde-fous.test.ts`. Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add site/src shared/src/libelles.ts tests/
git commit -m "feat(transport): bloc Transport scolaire sur les pages région, département et France"
```

### Task 5 : méthode, sources et README

**Files :**
- Modify : `site/src/pages/methode.astro` (section `id="transport-financement"`), `site/src/pages/sources.astro` si les sources `transport_*` n'y apparaissent pas déjà par le registre, `README.md` (tableau des phases : « Transport scolaire : lot 1 financement livré »)
- Test : `tests/site-transverse.test.ts` ou `tests/site-transport.test.ts`

Contenu de la section méthode :
- les codes de fonction retenus et exclus, et pourquoi ;
- les catégories de collectivités prises en compte ;
- les comptes de chaque poste ;
- le rattachement des groupements au département de leur siège ;
- le non-traitement des communes ;
- l'absence d'euros par élève, avec les motifs de `LIBELLES_TRANSPORT.note`.

Tout cela reprend `docs/budget-controles.md` (tâche 1), sans le recopier en entier.

- [ ] **Step 1 : écrire le test qui doit échouer.** `/methode/` contient `#transport-financement` et le code `9381` ; `/sources/` liste « transport » pour l'exercice 2024 avec un lien vers l'archive.
- [ ] **Step 2 : vérifier l'échec.** Lancer `bun test tests/site-transport.test.ts`. Attendu : FAIL.
- [ ] **Step 3 : rédiger** la section méthode et compléter les sources et le README.
- [ ] **Step 4 : vérifier.** Lancer `bun test` (toute la suite) et `bun run typecheck`. Attendu : PASS.
- [ ] **Step 5 : contrôle en conditions réelles.** Lancer `OBS_DEPOT=local bun run collect` puis `OBS_DEPOT=local bun run build`. Vérifier que les montants 2024 de `regions/84.json` (Auvergne-Rhône-Alpes) et `regions/52.json` (Pays de la Loire) correspondent à l'inventaire de la tâche 1. Ne pas commiter `archives/` produit par cet essai local (voir le README).
- [ ] **Step 6 : commit**

```bash
git add site/src/pages/methode.astro site/src/pages/sources.astro README.md tests/
git commit -m "docs(transport): méthode et sources du financement du transport scolaire"
```
