# Observatoire citoyen de l'éducation en France, phase 4 (réussite, historique, fiabilité) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** ajouter aux fiches et aux pages de territoire la réussite et la valeur ajoutée (IVAC, IVAL), l'IPS depuis 2016-2017, la ségrégation sociale entre collèges par département, les établissements fermés avec leurs successeurs et le signalement des millésimes corrigés. Livraison en quatre lots mis en ligne l'un après l'autre.

**Architecture :**
- La collecte gagne onze sources de data.education.gouv.fr (mêmes mécanismes que les sources existantes ; « Établissements fermés » est un extrait filtré, comme le budget). Chaque source millésimée déclare sa colonne de millésime et sa clé : à chaque nouvelle version, la collecte la compare à la précédente et inscrit les valeurs changées dans `archives/corrections.json`.
- DuckDB normalise les nouveaux jeux (`fermes`, `successeurs`, `ips` élargie, `resultats`, `segregation`) ; TypeScript assemble les nouveaux champs des fiches (`fermeLe`, `successeurs`, `predecesseurs`, `resultats`, corrections dans `sources`) et des territoires (`ipsHistorique`, `nuages`, `segregation`).
- Le site ajoute une section « Résultats » à la fiche, enrichit l'en-tête, les voisins, la liste des établissements, la fiche A4 et le bloc Sources, et ajoute aux territoires une courbe d'IPS, des nuages IPS × réussite (SVG Plot au build) et un bloc ségrégation.

**Tech stack :** l'existant (Bun 1.4.5, TypeScript, DuckDB, Astro 7.4, `@observablehq/plot` 0.6.x, `linkedom`, `bun test`). Aucune dépendance nouvelle.

**Spec :**
- `docs/superpowers/specs/2026-11-24-observatoire-phase4-reussite-design.md`. **Elle fait foi pour le périmètre de la phase 4.**
- Les specs et plans des phases 1 à 3 : leurs « Global Constraints » restent en vigueur.

**Écarts constatés en préparant le plan (à reporter dans la spec à la tâche 15) :**
1. Les pages académie, région et France n'ont pas de liste d'établissements : les colonnes de résultats vont dans la liste des pages **département et commune** seulement (la spec, section 7, les mettait partout).
2. Les **EREA** n'ont aujourd'hui aucun IPS (aucune source) : le lot 2 leur en donne un, de 2016-2017 à la dernière rentrée.
3. Les effectifs ne remontent qu'à la rentrée **2019** : les moyennes d'IPS calculées des rentrées 2016 à 2018 sont pondérées par les élèves de 2019 (section « Global Constraints »).
4. La déduction des successeurs a besoin de la **date d'ouverture** des établissements actifs : `date_ouverture` rejoint les colonnes requises de l'Annuaire (une nouvelle version de l'Annuaire sera archivée à la première collecte).

## Global Constraints

- **Contraintes des phases 1 à 3** : libellés exacts dans `shared/src/libelles.ts`, nombres à la française, aucun zéro pour une absence, anti-palmarès (aucun des mots `rang`, `classement`, `top`, `meilleur(e)(s)`, `pire(s)` dans une page générée ; tri par défaut par nom ; aucun extrême mis en avant), aucune page qui dépend de JavaScript pour être lue, `dist/` sous 900 Mo et 50 000 fichiers, quelques requêtes par source et par nuit.
- **Identifiants des nouvelles sources (`SourceId`) et jeux :**
  | `SourceId` | datasetId | millésime (colonne) | clé |
  |---|---|---|---|
  | `fermes` | `fr-en-etablissements-fermes` | — | `numero_uai` |
  | `ips_colleges_2016` | `fr-en-ips_colleges` | `rentree_scolaire` | `uai` |
  | `ips_colleges_2022` | `fr-en-ips-colleges-ap2022` | `rentree_scolaire` | `uai` |
  | `ips_lycees_2016` | `fr-en-ips_lycees` | `rentree_scolaire` | `uai` |
  | `ips_lycees_2022` | `fr-en-ips-lycees-ap2022` | `rentree_scolaire` | `uai` |
  | `ips_erea_2016` | `fr-en-ips_erea` | `rentree_scolaire` | `uai` |
  | `ips_erea` | `fr-en-ips-erea-ap2022` | `rentree_scolaire` | `uai` |
  | `ivac` | `fr-en-indicateurs-valeur-ajoutee-colleges` | `session` | `uai` |
  | `ival_gt` | `fr-en-indicateurs-de-resultat-des-lycees-gt_v2` | `annee` | `uai` |
  | `ival_pro` | `fr-en-indicateurs-de-resultat-des-lycees-pro_v2` | `annee` | `uai` |
  | `segregation` | `fr-en-indicateur_segregation_sociale_colleges` | `annee` | `dep` |
- **Filtre de `fermes`** (clause `where` ODSQL) : `date_fermeture >= date'2012-01-01' and (nature_uai_libe like "COLLEGE%" or nature_uai_libe like "LYCEE%" or nature_uai_libe like "ETAB REGIONAL%")`.
- **Session** : l'année de l'examen (`2025` = juin 2025), lue par la macro `session(v)` (quatre premiers chiffres, comme `rentree`). Une session S se rapproche de la rentrée S − 1.
- **IVAC : sessions 2022 et suivantes seulement** ; **IVAL : sessions 2012 et suivantes**, rupture signalée à partir de la session **2021**.
- **Voies de résultat (`VoieResultat`)** : `brevet_general` (colonnes `_g` de l'IVAC), `brevet_pro` (colonnes `_p`), `bac_gt` (`ival_gt`), `bac_pro` (`ival_pro`).
- **Un seul chiffre par établissement** (voisins, listes, nuages) : collège → `brevet_general` ; LEGT → `bac_gt` ; LP → `bac_pro` ; LPO → `bac_gt` et `bac_pro`, affichés « GT 92 % · pro 85 % » dans une même cellule et présents dans les deux nuages de lycées.
- **Valeur ajoutée** : affichée signée telle que publiée (« +3 », « −2 », signe moins typographique, pas de décimale si la source n'en a pas), jamais d'écart ni de moyenne.
- **Moyennes de taux calculées** (réussite, accès, mentions) : Σ(taux × effectif) / Σ effectif par (voie, niveau, territoire, secteur, session), effectif = candidats (IVAC) ou présents (IVAL), tous les établissements qui ont un résultat pour la session, fermés depuis compris (spec 6.4) ; libellé « moyenne calculée par l'observatoire ».
- **Moyennes d'IPS calculées** (rentrées sans moyenne publiée par la DEPP) : Σ(IPS × élèves) / Σ élèves, élèves de la même rentrée, ou ceux de la rentrée **2019** pour 2016 à 2018 ; établissements ouverts à cette rentrée (fermés compris) ; arrondi à 0,1 ; même libellé.
- **Successeurs**, déduction (un lien seulement si un seul candidat ; deux règles, la première qui trouve un candidat unique l'emporte) :
  1. un établissement du second degré ouvert dans **la même commune**, **même secteur**, famille compatible (`FAMILLES_VOISINES`), dont la date d'ouverture est à **92 jours ou moins** de la date de fermeture ;
  2. sinon, un établissement **ouvert à la date de fermeture**, même commune, même adresse normalisée (minuscules, sans accents ni ponctuation), même secteur, famille compatible.
  Le fichier `pipeline/successeurs-manuels.json` (`{ "ajouter": [{ "de", "vers", "motif" }], "retirer": [{ "de", "vers", "motif" }] }`) l'emporte. Une UAI inconnue dans ce fichier fait échouer `bun run data`.
- **Correction de millésime** : une version d'une source millésimée dont au moins une ligne (clé, millésime) d'un millésime **présent dans la version précédente** a une valeur différente sur une colonne requise, ou a disparu. Une ligne d'un millésime nouveau n'est pas une correction. Comparaison du texte des valeurs (`trim`). Seules les valeurs publiées déclenchent la mention (jamais une moyenne calculée).
- **Libellés exacts nouveaux :**
  - en-tête : « Fermé le {jj/mm/aaaa} » ; « Successeur : » (puis les liens « {nom} ({UAI}) » séparés par « , ») ; « Succède à {nom} ({UAI}), fermé le {jj/mm/aaaa} » (une ligne par prédécesseur) ;
  - section : « Résultats » ; sous-titres « Diplôme national du brevet, série générale », « … série professionnelle », « Baccalauréat, voie générale et technologique », « Baccalauréat, voie professionnelle » ;
  - lignes : « Candidats » / « Présents », « Taux de réussite », « Note moyenne à l'écrit », « Taux d'accès de la 6e à la 3e », « Taux d'accès de la seconde au bac », « Taux de mentions », « Mentions (assez bien · bien · très bien) », colonne « Valeur ajoutée » ;
  - absences : « non publié pour cette session », « pas de résultats publiés pour cet établissement », « valeur ajoutée non publiée pour la série professionnelle » ;
  - phrase fixe : « La valeur ajoutée compare le résultat de l'établissement à celui qu'on attendrait compte tenu de ses élèves. » suivie du lien « Comment la lire » vers `/methode/#valeur-ajoutee` ;
  - rupture : « Réforme du baccalauréat : les séries changent à partir de la session 2021. » ;
  - source : « {producteur}, {titre} · session {S} · collecté le … » ;
  - correction : « Millésime {x} corrigé par le producteur le {jj/mm/aaaa} » puis « version précédente » · « version corrigée » (liens) ;
  - ségrégation : titre « Ségrégation sociale entre collèges » ; lignes « Ensemble des collèges », « Entre collèges publics », « Entre collèges privés sous contrat », « Entre public et privé » (indice d'entropie) ; « Part de la ségrégation due à l'écart entre public et privé » ; renvoi : « La DEPP publie la ségrégation sociale entre collèges par département seulement : voir les pages des départements. » ;
  - nuages : titres « Collèges : IPS et réussite au brevet (série générale) », « Lycées : IPS de la voie générale et technologique et réussite au bac », « Lycées : IPS de la voie professionnelle et réussite au bac » ; note « Chaque point est un établissement. Lignes : moyennes du territoire. Survolez un point pour son nom et ses valeurs ; le tableau des établissements donne les mêmes chiffres. » ; note si IPS d'ensemble : « IPS de l'ensemble de l'établissement (l'IPS par voie n'est pas publié pour cette rentrée). ».
- **Nuages** : pages **département et académie** ; affichés seulement s'ils ont **au moins 5 points** ; formes pleines (public) / contour (privé), rayon fixe, aucune couleur selon la valeur, aucun texte sur les points, infobulle `<title>` « {nom} ({commune}) · {secteur} · IPS {x} · réussite {y} % · valeur ajoutée {±z} · {n} candidats ». Le code des marques et des échelles est une fonction pure de `site/src/lib/plot.ts` qui ne dépend que des données (réutilisable dans le navigateur).

## Review Focus

1. **Résultat publié pour une UAI sans fiche** (établissement fermé absent du jeu des fermés, ou UAI changée). Attendu : la ligne est ignorée, le nombre de lignes ignorées par source est affiché par `bun run data`, aucune page n'est inventée. Testé à la tâche 9 (`résultats d'une UAI inconnue : ignorés et comptés`).
2. **Valeur secrète ou vide** dans l'IVAC ou l'IVAL (`""`, `"ND"`, `"."`). Attendu : « non publié pour cette session », jamais 0, et l'établissement n'entre pas dans les moyennes ni dans les nuages pour cet indicateur. Testé aux tâches 9 et 11.
3. **Chaîne ou cycle de successeurs** (A → B, B → C ; A → B et B → A par le fichier manuel). Attendu : la chaîne est affichée maillon par maillon (pas de saut A → C) ; un cycle fait échouer `bun run data` avec les UAI en cause. Testé à la tâche 3.
4. **Nouvelle version qui ajoute seulement une rentrée** (effectifs de septembre) ou qui réordonne les lignes. Attendu : aucune correction ; une ligne supprimée d'un millésime ancien en est une. Testé à la tâche 5.
5. **LPO présent dans un seul des deux jeux IVAL, ou dans aucun pour la dernière session.** Attendu : la cellule montre la voie présente seule (« GT 92 % »), ou l'absence ; le nuage de l'autre voie ne le contient pas. Testé aux tâches 10 et 12.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `shared/src/types.ts`, `shared/src/donnees.ts`, `shared/src/libelles.ts` (modifiés) | `SourceId` élargi ; `Fiche.fermeLe`, `successeurs`, `predecesseurs`, `resultats` ; `SourceRef.corrections` ; `Voisin` et `LigneListe` enrichis ; `SyntheseFamille.ipsHistorique` ; `DonneesTerritoire.nuages`, `segregation`, `corrections` ; libellés |
| `pipeline/src/sources.ts` (modifié) | onze sources, `Source.millesime`, `date_ouverture` dans l'Annuaire |
| `pipeline/src/normalise.ts` (modifié) | macros `session`, `adresse_normalisee` |
| `pipeline/src/corrections.ts` (créé) | comparaison de deux versions, lecture et écriture de `archives/corrections.json` |
| `pipeline/src/collect.ts` (modifié) | appel de la comparaison après chaque nouvelle version |
| `scripts/rattraper-corrections.ts` (créé) | comparaison des versions déjà archivées |
| `pipeline/sql/05_fermes.sql` (créé) | tables `fermes`, `historiques` ; `disparus` et `fiches_etab` élargis |
| `pipeline/src/successeurs.ts` (créé) | déduction, fichier manuel, contrôle des cycles |
| `pipeline/successeurs-manuels.json` (créé) | corrections manuelles des liens |
| `pipeline/sql/01_normaliser.sql` (modifié) | table `ips` élargie (anciens jeux, EREA, IPS par voie) |
| `pipeline/src/ips-historique.ts` (créé) | moyennes d'IPS par rentrée (publiées ou calculées) |
| `pipeline/sql/06_resultats.sql` (créé) | tables `resultats`, `moyennes_resultats` |
| `pipeline/src/resultats.ts` (créé) | assemblage de `Fiche.resultats`, résumés pour voisins et listes, nuages |
| `pipeline/sql/07_segregation.sql` (créé) | table `segregation` |
| `pipeline/src/db.ts`, `fiches.ts`, `territoires.ts`, `registre.ts`, `cli.ts` (modifiés) | étapes, assemblage, export, journal |
| `site/src/components/Entete.astro`, `FicheA4.astro`, `Voisins.astro`, `ListeEtablissements.astro`, `Sources.astro`, `Territoire.astro` (modifiés) | affichage |
| `site/src/components/BlocResultats.astro`, `Nuage.astro`, `BlocSegregation.astro` (créés) | nouveaux blocs |
| `site/src/lib/plot.ts`, `site/src/lib/resultats.ts` (modifié, créé) | courbes, nuage, formats des résultats |
| `site/src/pages/etablissement/[uai].astro`, `methode.astro`, `sources.astro`, `recherche.json.ts` (modifiés) | fiche, méthode, sources |
| `tests/fixtures/*.csv` (créés pour les onze sources) ; `tests/corrections.test.ts`, `successeurs.test.ts`, `ips-historique.test.ts`, `resultats.test.ts`, `segregation.test.ts`, `site-resultats.test.ts`, `site-fermes.test.ts` (créés) ; tests existants (modifiés) | tests |

---

## Lot 1 : fiabilité

### Task 1 : Sources nouvelles, types et fixtures

**Files:**
- Modify: `shared/src/types.ts`, `pipeline/src/sources.ts`, `pipeline/src/normalise.ts`, `tests/aide.ts`
- Create: `tests/fixtures/{fermes,ips_colleges_2016,ips_colleges_2022,ips_lycees_2016,ips_lycees_2022,ips_erea_2016,ips_erea,ivac,ival_gt,ival_pro,segregation}.csv`
- Test: `tests/ods.test.ts`, `tests/collect.test.ts`, `tests/normaliser.test.ts`

**Interfaces:**
- Produces :
  - `SourceId` : union existante `| "fermes" | "ips_colleges_2016" | "ips_colleges_2022" | "ips_lycees_2016" | "ips_lycees_2022" | "ips_erea_2016" | "ips_erea" | "ivac" | "ival_gt" | "ival_pro" | "segregation"`.
  - `Source.millesime?: { colonne: string; cles: string[] }`, renseigné pour toutes les sources millésimées, existantes comprises (`ips_colleges`, `ips_lycees`, effectifs, `personnels`, `budget_<N>` avec `colonne: "exer"`, `cles: ["categ", "ndept", "cregi", "lbudg"]`), et pour les dix nouvelles sauf `fermes` (table des Global Constraints).
  - `SOURCES` gagne les onze entrées, titres = titres du portail (`Établissements fermés`, `Indices de position sociale des collèges (2016-2021)`, …), colonnes requises = celles que lisent les tâches 2, 7, 9 et 13 ; `fermes` a `filtre` = filtre des Global Constraints.
  - Annuaire : `date_ouverture` ajoutée aux colonnes requises.
  - Macros SQL `session(v)` (comme `rentree`) et `adresse_normalisee(a)` (minuscules, `strip_accents`, ponctuation remplacée par une espace, espaces réduits).
- [ ] **Step 1 : Écrire les tests**
  - `ods.test.ts` : `telechargerParquet` de `fermes` appelle `…/fr-en-etablissements-fermes/exports/parquet?where=` suivi du filtre encodé.
  - `collect.test.ts` : `une version de ivac sans la colonne va_du_taux_de_reussite_g est rejetée` ; `chaque source millésimée déclare une colonne de millésime présente dans ses colonnes requises` (boucle sur `SOURCES`).
  - `normaliser.test.ts` : `session("2025-01-01T00:00:00+00:00") = 2025`, `session("2025") = 2025`, `session("") = null` ; `adresse_normalisee("12, Rue de l'Église ") = "12 rue de l eglise"`.
- [ ] **Step 2 : Lancer, vérifier l'échec** — `bun test tests/ods.test.ts tests/collect.test.ts tests/normaliser.test.ts` ; attendu : FAIL sur les nouveaux tests.
- [ ] **Step 3 : Implémenter** les interfaces ; créer les onze fixtures (en-têtes = colonnes requises, lignes ajoutées aux tâches suivantes) ; `cheminsFixtures` les convertit déjà (boucle sur `SOURCES`).
- [ ] **Step 4 : Lancer toute la suite et `bun run typecheck`** — attendu : PASS.
- [ ] **Step 5 : Essai réel** — `OBS_DEPOT=local bun run collect` ; attendu : les onze sources `telecharge`, `fermes` entre 500 et 3 000 lignes, `segregation` 1 584 lignes, aucune autre source en `erreur`. Ne pas commiter `archives/` produit par l'essai.
- [ ] **Step 6 : Commit** — `git commit -m "feat: sources de la phase 4 (résultats, IPS anciens, ségrégation, fermetures)"`

### Task 2 : Établissements fermés et fiches historiques (pipeline)

**Files:**
- Create: `pipeline/sql/05_fermes.sql`
- Modify: `pipeline/sql/01_normaliser.sql` (`disparus`, `fiches_etab` déplacés en 05), `pipeline/src/db.ts` (`ETAPES`), `pipeline/src/fiches.ts`, `pipeline/src/registre.ts`, `shared/src/types.ts`, `tests/fixtures/fermes.csv`, `tests/fixtures/annuaire.csv`
- Test: `tests/fiches.test.ts`

**Interfaces:**
- Consumes : vues `src_fermes`, `src_ips_*`, `src_ivac`, `src_ival_*` (tâche 1).
- Produces :
  - Table `fermes(uai, nom, nature, famille, secteur, date_ouverture, date_fermeture, adresse, adresse_n, code_postal, code_commune, commune, dep, dep_libelle, aca, aca_libelle, lat, lon)` ; `secteur` = `public`, ou `prive_sous_contrat` si « Privé » (les fiches historiques ne viennent que de sources DEPP, qui ne couvrent que le privé sous contrat).
  - Table `cites(uai)` : UAI présentes dans `src_ips_colleges_2016`, `src_ips_colleges_2022`, `src_ips_lycees_2016`, `src_ips_lycees_2022`, `src_ips_erea_2016`, `src_ips_erea`, `src_ivac`, `src_ival_gt`, `src_ival_pro`.
  - Table `historiques` : lignes de `fermes` dont l'UAI est dans `cites`, ni dans `etablissements` ni dans `registre`.
  - `disparus` et `fiches_etab` incluent `historiques` (`disparu = true`).
  - `Fiche.fermeLe: string | null` (date ISO de `fermes.date_fermeture`, pour toute fiche dont l'UAI est dans `fermes`).
  - `assemblerFiches` crée une fiche par ligne de `historiques`, identité tirée de `fermes` (`contrat: null`, `ep: null`, `segpa/ulis/internat: false`, `autresSites: []`), `disparuLe` = `fermeLe`.
  - `mettreAJourRegistre` ajoute les fiches historiques au registre (`premiere` = date des données, `disparuLe` = `fermeLe`) : leur URL devient permanente.
- [ ] **Step 1 : Remplir les fixtures** : `fermes.csv` avec un collège fermé en 2019 cité par `ips_colleges_2016`, un LP fermé en 2014 cité seulement par `ival_pro`, un collège fermé non cité, un LGT fermé dont l'UAI est déjà au registre de test ; `annuaire.csv` gagne `date_ouverture`.
- [ ] **Step 2 : Écrire les tests** (`fiches.test.ts`)
  - `fermé cité par une source historique : une fiche, disparuLe = fermeLe = date officielle`.
  - `fermé que rien ne cite : pas de fiche`.
  - `LP fermé en 2014 cité par l'IVAL seul : une fiche`.
  - `fermé déjà au registre : fermeLe = date officielle, identité du registre gardée`.
  - `fiche active : fermeLe null`.
  - `les fiches historiques entrent au registre`.
- [ ] **Step 3 : Lancer, vérifier l'échec** — `bun test tests/fiches.test.ts`.
- [ ] **Step 4 : Implémenter**. `ETAPES` devient `["01_normaliser.sql", "05_fermes.sql", sqlEleves, sqlIndicateurs, etapeBudget]` (`ips` et `personnels` filtrent sur `fiches_etab`, qui doit exister avant : déplacer leur création après `05` si besoin, sans changer leur contenu).
- [ ] **Step 5 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 6 : Commit** — `git commit -m "feat: fiches des établissements fermés cités par les sources historiques"`

### Task 3 : Successeurs

**Files:**
- Create: `pipeline/src/successeurs.ts`, `pipeline/successeurs-manuels.json` (`{ "ajouter": [], "retirer": [] }`)
- Modify: `pipeline/src/fiches.ts`, `pipeline/src/cli.ts`, `shared/src/types.ts`, `tests/fixtures/fermes.csv`, `tests/fixtures/annuaire.csv`
- Test: `tests/successeurs.test.ts`

**Interfaces:**
- Consumes : tables `fermes`, `etablissements` (avec `date_ouverture`), `FAMILLES_VOISINES`.
- Produces :
  - `interface LienEtab { uai: string; nom: string; fermeLe: string | null }` ; `Fiche.successeurs: LienEtab[]`, `Fiche.predecesseurs: LienEtab[]`.
  - `interface Lien { de: string; vers: string; regle: 1 | 2 | "manuel" }`.
  - `deduireSuccesseurs(db: Db): Promise<{ liens: Lien[]; ambigus: { de: string; candidats: string[] }[] }>` (règles des Global Constraints ; candidats parmi `etablissements` et `fermes`).
  - `appliquerManuels(liens: Lien[], manuels: Manuels, connues: Set<string>): Lien[]` ; lève une erreur pour une UAI inconnue.
  - `verifierCycles(liens: Lien[]): void` ; lève une erreur qui cite les UAI d'un cycle.
  - `attacherSuccesseurs(fiches: Fiche[], liens: Lien[]): void`.
  - `bun run data` affiche « successeurs : {n} règle 1, {n} règle 2, {n} manuels, {n} ambigus ».
- [ ] **Step 1 : Compléter les fixtures** : un LGT et un LP fermés le 2020-08-31 dans une commune où un LPO ouvre le 2020-09-01 (règle 1, deux prédécesseurs) ; un collège fermé à l'adresse d'un collège actif ouvert depuis longtemps (règle 2) ; un collège fermé avec deux candidats (ambigu) ; une chaîne A → B → C.
- [ ] **Step 2 : Écrire les tests** : `règle 1 : LGT et LP → LPO` ; `règle 2 : même adresse` ; `deux candidats : aucun lien, signalé ambigu` ; `secteur différent : pas de lien` ; `fichier manuel : ajout et retrait l'emportent` ; `UAI inconnue dans le fichier manuel : erreur` ; `cycle : erreur qui cite les deux UAI` ; `chaîne : A pointe vers B seulement, B vers C`.
- [ ] **Step 3 : Lancer, vérifier l'échec** — `bun test tests/successeurs.test.ts`.
- [ ] **Step 4 : Implémenter** ; appeler `deduireSuccesseurs`, `appliquerManuels`, `verifierCycles`, `attacherSuccesseurs` dans `assemblerFiches`.
- [ ] **Step 5 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 6 : Essai réel** — `bun run data` ; noter dans le message de commit les quatre chiffres du journal des successeurs ; si les ambigus dépassent 100, s'arrêter et les montrer au porteur avant de continuer.
- [ ] **Step 7 : Commit** — `git commit -m "feat: successeurs des établissements fermés"`

### Task 4 : Fermetures et successeurs sur le site

**Files:**
- Modify: `shared/src/libelles.ts`, `site/src/components/Entete.astro`, `site/src/components/FicheA4.astro`, `site/src/pages/recherche.json.ts`, `tests/site.ts`
- Test: `tests/site-fermes.test.ts`

**Interfaces:**
- Consumes : `Fiche.fermeLe`, `successeurs`, `predecesseurs`.
- Produces : `LIBELLES.ferme(iso)`, `LIBELLES.successeur`, `LIBELLES.succedeA(nom, uai, iso)`.
- [ ] **Step 1 : Écrire les tests** (`site-fermes.test.ts`, site de test construit par `siteTest()`, registre et fixtures des tâches 2 et 3)
  - `fiche fermée : « Fermé le 31/08/2020 » et lien vers le successeur` ;
  - `fiche fermée sans successeur : « Fermé le … » sans « Successeur »` ;
  - `fiche du LPO : deux lignes « Succède à … »` ;
  - `fiche disparue sans date officielle : mention de disparition actuelle inchangée` ;
  - `fiche A4 fermée : « Fermé le … » dans l'en-tête imprimé`.
- [ ] **Step 2 : Lancer, vérifier l'échec** — `bun test tests/site-fermes.test.ts`.
- [ ] **Step 3 : Implémenter** (en-tête : `fermeLe` prime sur `LIBELLES.disparu`).
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: fermetures et successeurs sur les fiches"`

### Task 5 : Détection des corrections de millésime

**Files:**
- Create: `pipeline/src/corrections.ts`, `scripts/rattraper-corrections.ts`
- Modify: `pipeline/src/collect.ts`, `pipeline/src/cli.ts` (`CHEMINS.corrections = "archives/corrections.json"`)
- Test: `tests/corrections.test.ts`

**Interfaces:**
- Consumes : `Source.millesime`, `Depot.recuperer`, `Manifest.versions`.
- Produces :
  - `interface EntreeCorrection { source: SourceId; millesime: number; cles: string[]; precedente: string; corrigee: string; le: string }` (`precedente`, `corrigee` : `sha256` des versions ; `le` : `collecteLe` de la version corrigée ; `cles` : valeurs de la clé, jointes par `|` si plusieurs colonnes).
  - `comparerVersions(duck: DuckDBConnection, s: Source, ancien: string, nouveau: string): Promise<{ millesime: number; cles: string[] }[]>` (un élément par millésime corrigé ; millésime lu par `rentree`).
  - `lireCorrections(chemin: string): EntreeCorrection[]` ; `ajouterCorrections(chemin: string, e: EntreeCorrection[]): void` (fichier JSON trié par source, millésime, `le` ; dédoublonné sur `source|millesime|corrigee`).
  - `collecter` : après l'archivage d'une nouvelle version d'une source qui a `millesime`, récupère la version précédente (`depot.recuperer`), compare, ajoute les entrées ; une erreur de comparaison est une ligne `erreur` au journal, la version reste archivée.
  - `scripts/rattraper-corrections.ts` : compare chaque paire de versions consécutives du manifest et ajoute les entrées (idempotent).
- [ ] **Step 1 : Écrire les tests** (`corrections.test.ts`, Parquet construits dans le test)
  - `une valeur changée dans un millésime ancien : correction de ce millésime, clé citée` ;
  - `un millésime nouveau ajouté : aucune correction` ;
  - `lignes réordonnées : aucune correction` ;
  - `ligne supprimée d'un millésime ancien : correction` ;
  - `colonne non requise changée : aucune correction` ;
  - `clé à plusieurs colonnes (budget) : clé jointe par |` ;
  - `ajouterCorrections est idempotent` ;
  - `collecter : nouvelle version d'ips_colleges qui corrige 2024 → entrée dans corrections.json` (dépôt local de test).
- [ ] **Step 2 : Lancer, vérifier l'échec** — `bun test tests/corrections.test.ts`.
- [ ] **Step 3 : Implémenter**.
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Rattrapage réel** — `bun scripts/rattraper-corrections.ts` ; noter le nombre d'entrées dans le message de commit ; commiter `archives/corrections.json`.
- [ ] **Step 6 : Commit** — `git commit -m "feat: détection des corrections de millésime"`

### Task 6 : Corrections sur les pages

**Files:**
- Modify: `shared/src/types.ts`, `shared/src/donnees.ts`, `shared/src/libelles.ts`, `pipeline/src/fiches.ts`, `pipeline/src/territoires.ts`, `site/src/components/Sources.astro`, `site/src/components/Territoire.astro`
- Test: `tests/fiches.test.ts`, `tests/site-pages.test.ts`

**Interfaces:**
- Consumes : `lireCorrections`, `collectiviteDuBudget`.
- Produces :
  - `interface Correction { millesime: number; le: string; precedente: string; corrigee: string }` (URL des deux versions archivées).
  - `SourceRef.corrections?: Correction[]` : sur une fiche, les corrections dont la clé est l'UAI de la fiche, pour un millésime **affiché** par la fiche (rentrée, session ou exercice présent dans ses séries).
  - `DonneesTerritoire.corrections?: (Correction & { source: SourceId })[]` : page département (clé `dep` de `segregation`) et pages qui montrent le budget d'une collectivité (clé budget → collectivité par `collectiviteDuBudget`).
  - `LIBELLES.correction(millesime, iso)`.
- [ ] **Step 1 : Écrire les tests**
  - `fiches.test.ts` : `correction de l'IPS 2024 d'un collège : sur sa fiche seulement` ; `correction d'un millésime que la fiche n'affiche pas : absente`.
  - `site-pages.test.ts` : `bloc Sources : « Millésime 2024-2025 corrigé par le producteur le … », deux liens`.
- [ ] **Step 2 : Lancer, vérifier l'échec**.
- [ ] **Step 3 : Implémenter**. Le millésime s'affiche comme la source l'affiche déjà (rentrée « 2024-2025 », session « 2025 », exercice « 2024 »).
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: corrections de millésime signalées sur les pages"`

### Point de livraison du lot 1

- [ ] `bun run build` ; attendu : garde-fous verts. Montrer au porteur : le nombre de fiches historiques créées, les chiffres des successeurs, les corrections rattrapées, trois fiches (un fermé avec successeur, un LPO issu d'une fusion, une fiche corrigée si elle existe). **Le porteur décide de la mise en ligne.**

## Lot 2 : IPS ancien

### Task 7 : IPS de 2016 à aujourd'hui (pipeline)

**Files:**
- Create: `pipeline/src/ips-historique.ts`
- Modify: `pipeline/sql/01_normaliser.sql` (table `ips`), `pipeline/src/indicateurs.ts`, `pipeline/src/territoires.ts`, `shared/src/types.ts`, `shared/src/donnees.ts`, fixtures `ips_*`
- Test: `tests/ips-historique.test.ts`, `tests/indicateurs.test.ts`

**Interfaces:**
- Produces :
  - Table `ips(uai, rentree, source, ips, ecart_type, ips_gt, ips_pro, dep_public, dep_prive, aca_public, aca_prive, nat_public, nat_prive)` : union des huit jeux. Lycées : `ips` = `ips_etab` (actuel) ou `ips_ensemble_gt_pro` (anciens) ; `ips_gt`, `ips_pro` = colonnes par voie ; anciens jeux et `ap2022` collèges et lycées : moyennes `null`. EREA : colonnes des collèges. Une même (uai, rentrée) présente dans deux jeux : le plus récent l'emporte.
  - `interface PointIps { rentree: number; public: number | null; prive: number | null; calculee: boolean }`.
  - `calculerIpsHistorique(db: Db): Promise<IpsHistorique>`, avec `interface IpsHistorique { serie(niveau: "commune" | "departement" | "academie" | "region" | "france", famille: Famille, territoire: string): PointIps[] }` : moyenne publiée si elle existe pour la rentrée (département, académie, France), sinon calculée (Global Constraints) ; commune et région toujours calculées.
  - `Indicateur.referencesHistoriques?: PointIps[]` pour l'IPS : série du département de l'établissement.
  - `Indicateur.comparaisons` de l'IPS : pour une rentrée sans moyenne publiée, valeurs calculées et `calculee: true`.
  - `SyntheseFamille.ipsHistorique: PointIps[]` (tous les niveaux de territoire).
- [ ] **Step 1 : Compléter les fixtures** : un collège présent de 2016 à 2025 (anciens jeux, `ap2022`, actuel), un LPO avec IPS par voie, un EREA, un établissement en double (ancien jeu et `ap2022` pour 2022).
- [ ] **Step 2 : Écrire les tests**
  - `historique d'un collège : rentrées 2016 à 2025 sans trou` ;
  - `2022-2023 vient du jeu ap2022` ;
  - `doublon : le jeu le plus récent l'emporte` ;
  - `EREA : un IPS et des comparaisons publiées dès 2022` ;
  - `rentrée 2018 : moyenne départementale calculée, pondérée par les élèves de 2019, calculee = true` ;
  - `rentrée 2024 : moyenne publiée, calculee = false` ;
  - `LPO : ips_gt et ips_pro gardés`.
- [ ] **Step 3 : Lancer, vérifier l'échec**.
- [ ] **Step 4 : Implémenter** ; `verifierPonderation` reste inchangé (dernière rentrée).
- [ ] **Step 5 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 6 : Commit** — `git commit -m "feat: IPS depuis 2016-2017, moyennes calculées quand la DEPP n'en publie pas"`

### Task 8 : IPS ancien sur le site

**Files:**
- Modify: `site/src/lib/plot.ts`, `site/src/pages/etablissement/[uai].astro`, `site/src/components/Territoire.astro`
- Test: `tests/site-fiche.test.ts`, `tests/site-territoires.test.ts`

**Interfaces:**
- Consumes : `Indicateur.referencesHistoriques`, `SyntheseFamille.ipsHistorique`.
- Produces : `svgCourbe` trace les références publique et privée quand elles sont fournies (signature inchangée) ; les points calculés sont marqués d'un rond creux et la légende dit « moyenne calculée par l'observatoire ».
- [ ] **Step 1 : Écrire les tests** : `fiche : courbe de l'IPS de 2016 à 2025, références départementales` ; `rentrée calculée signalée` ; `page département : courbe de l'IPS moyen par famille` ; `page commune : courbe calculée`.
- [ ] **Step 2 : Lancer, vérifier l'échec**.
- [ ] **Step 3 : Implémenter**.
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: évolution de l'IPS depuis 2016 sur les fiches et les territoires"`

### Point de livraison du lot 2

- [ ] `bun run build` ; montrer au porteur une fiche de collège (2016 → 2025), un EREA, une page département. **Le porteur décide de la mise en ligne.**

## Lot 3 : résultats

### Task 9 : Normalisation des résultats

**Files:**
- Create: `pipeline/sql/06_resultats.sql`
- Modify: `pipeline/src/db.ts`, `pipeline/src/cli.ts`, `tests/fixtures/{ivac,ival_gt,ival_pro}.csv`
- Test: `tests/resultats.test.ts`

**Interfaces:**
- Produces :
  - Table `resultats(uai, voie, session, source, effectif, taux_reussite, va_reussite, note_ecrit, va_note, taux_acces, va_acces, taux_mentions, va_mentions, mentions_ab, mentions_b, mentions_tb)` ; colonnes absentes d'une voie à `null` ; IVAC : sessions ≥ 2022 seulement ; `brevet_pro` n'a ni valeur ajoutée ni mentions ; seules les UAI de `fiches_etab`.
  - Table `resultats_ignores(source, n)` : lignes dont l'UAI n'a pas de fiche ; affichée par `bun run data`.
  - Table `moyennes_resultats(voie, code, niveau, territoire, secteur, session, valeur, n)` : `code` ∈ `taux_reussite | taux_acces | taux_mentions` ; niveaux `departement | academie | france` ; pondération et périmètre des Global Constraints (territoire d'un établissement fermé : celui de sa fiche).
- [ ] **Step 1 : Remplir les fixtures** : un collège avec séries générale et professionnelle 2022-2025 ; un collège avec une valeur vide et une valeur `ND` ; une ligne IVAC de 2021 (ignorée) ; un LPO dans les deux jeux IVAL, 2019-2025 ; un LP dans `ival_pro` seul ; une UAI inconnue.
- [ ] **Step 2 : Écrire les tests** : `IVAC 2021 ignoré` ; `valeur vide ou ND : null, jamais 0` ; `brevet_pro sans valeur ajoutée` ; `LPO : deux voies` ; `résultats d'une UAI inconnue : ignorés et comptés` ; `moyenne départementale du taux de réussite pondérée par les candidats` ; `un établissement sans taux n'entre pas dans la moyenne`.
- [ ] **Step 3 : Lancer, vérifier l'échec**.
- [ ] **Step 4 : Implémenter** ; ajouter `06_resultats.sql` à `ETAPES` après `sqlIndicateurs`.
- [ ] **Step 5 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 6 : Commit** — `git commit -m "feat: normalisation de l'IVAC et de l'IVAL"`

### Task 10 : Résultats sur les fiches, voisins et listes (pipeline)

**Files:**
- Create: `pipeline/src/resultats.ts`
- Modify: `shared/src/types.ts`, `shared/src/donnees.ts`, `pipeline/src/fiches.ts`, `pipeline/src/territoires.ts`
- Test: `tests/resultats.test.ts`, `tests/fiches.test.ts`

**Interfaces:**
- Produces :
  ```ts
  export type VoieResultat = "brevet_general" | "brevet_pro" | "bac_gt" | "bac_pro";
  export type CodeResultat = "taux_reussite" | "note_ecrit" | "taux_acces" | "taux_mentions";
  export type StatutResultat = "ok" | "non_publie";
  export interface ValeurResultat {
    code: CodeResultat;
    valeur: number | null; statut: StatutResultat;
    va: number | null; statutVa: StatutResultat | "sans_objet";
    /** Taux seulement ; la note à l'écrit n'a pas de moyenne. */
    comparaisons: { niveau: Niveau; public: number | null; prive: number | null; n: ParSecteur<number> }[];
  }
  export interface ResultatsVoie {
    voie: VoieResultat; source: SourceId; session: number; effectif: number | null;
    valeurs: ValeurResultat[];
    mentions: { ab: number | null; b: number | null; tb: number | null } | null;
    /** [session, taux de réussite] par session croissante. */
    historique: [number, number][];
    rupture: number | null; // 2021 pour bac_gt et bac_pro si l'historique la traverse
  }
  export interface ResumeResultat { voie: VoieResultat; session: number; taux: number | null; va: number | null }
  ```
  - `Fiche.resultats: ResultatsVoie[]` (`[]` si aucun résultat ; ordre : `brevet_general`, `brevet_pro`, `bac_gt`, `bac_pro`).
  - `calculerResultats(db: Db): Promise<Map<string, ResultatsVoie[]>>`.
  - `resume(f: Pick<Fiche, "famille" | "resultats">): ResumeResultat[]` (règle « un seul chiffre » des Global Constraints).
  - `Voisin.reussite: ResumeResultat[]`, `Voisin.partAgreges: Mesure` ; `LigneListe.reussite: ResumeResultat[]`.
  - Sources de la fiche : `ivac`, `ival_gt`, `ival_pro` ajoutées à `sourcesUtilisees` avec la dernière session (champ `rentree` de `SourceRef` = session ; l'affichage dit « session »).
- [ ] **Step 1 : Écrire les tests** : `collège : brevet général et pro, dernière session 2025, historique 2022-2025` ; `comparaisons du taux : département, académie, France, public et privé` ; `LPO : bac_gt et bac_pro, rupture 2021` ; `resume d'un LPO présent dans ival_gt seul : une entrée` ; `voisin : reussite et partAgreges` ; `fiche sans résultats : []`.
- [ ] **Step 2 : Lancer, vérifier l'échec**.
- [ ] **Step 3 : Implémenter**.
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: résultats sur les fiches, les voisins et les listes"`

### Task 11 : Section « Résultats », voisins et listes (site)

**Files:**
- Create: `site/src/components/BlocResultats.astro`, `site/src/lib/resultats.ts`
- Modify: `shared/src/libelles.ts` (`LIBELLES_RESULTATS`), `site/src/pages/etablissement/[uai].astro` (section `#resultats` avant `#moyens`, sommaire), `site/src/components/FicheA4.astro`, `site/src/components/Voisins.astro`, `site/src/components/ListeEtablissements.astro`, `site/public/js/liste.js` (tri des nouvelles colonnes, si nécessaire)
- Test: `tests/site-resultats.test.ts`

**Interfaces:**
- Consumes : `Fiche.resultats`, `Voisin.reussite`, `Voisin.partAgreges`, `LigneListe.reussite`.
- Produces : `vaSignee(v: number): string` (« +3 », « −2 », « 0 ») et `celluleReussite(r: ResumeResultat[]): string` (« 92 % », « GT 92 % · pro 85 % », ou absence) dans `site/src/lib/resultats.ts`.
- [ ] **Step 1 : Écrire les tests** (`site-resultats.test.ts`)
  - `fiche de collège : section Résultats, deux sous-blocs, session 2025` ;
  - `taux : écart en premier, moyenne entre parenthèses, « moyenne calculée par l'observatoire »` ;
  - `valeur ajoutée signée, sans écart` ;
  - `série professionnelle : « valeur ajoutée non publiée pour la série professionnelle »` ;
  - `valeur ND : « non publié pour cette session », aucun 0` ;
  - `LPO : rupture 2021 signalée sous la courbe` ;
  - `phrase fixe et lien vers /methode/#valeur-ajoutee, identiques sur deux fiches` ;
  - `fiche sans résultats : « pas de résultats publiés pour cet établissement »` ;
  - `fiche A4 : dernière session, moyennes seules` ;
  - `voisins : colonnes réussite, valeur ajoutée, part d'agrégés ; LPO « GT … · pro … »` ;
  - `liste du département : colonnes réussite et valeur ajoutée triables, tri par défaut par nom` ;
  - `aucun mot de palmarès dans les pages touchées`.
- [ ] **Step 2 : Lancer, vérifier l'échec**.
- [ ] **Step 3 : Implémenter**.
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Commit** — `git commit -m "feat: section Résultats sur les fiches, voisins et listes enrichis"`

### Task 12 : Nuages IPS × réussite

**Files:**
- Create: `site/src/components/Nuage.astro`
- Modify: `shared/src/donnees.ts`, `pipeline/src/resultats.ts`, `pipeline/src/territoires.ts`, `site/src/lib/plot.ts`, `site/src/components/Territoire.astro`
- Test: `tests/resultats.test.ts`, `tests/site-resultats.test.ts`

**Interfaces:**
- Produces :
  ```ts
  export interface PointNuage { uai: string; nom: string; commune: string; secteur: Secteur; ips: number; taux: number; va: number | null; effectif: number | null }
  export interface Nuage {
    voie: "brevet_general" | "bac_gt" | "bac_pro"; session: number; rentreeIps: number;
    /** true : IPS d'ensemble faute d'IPS par voie publié. */
    ipsEnsemble: boolean;
    moyennes: { ips: number | null; taux: number | null };
    points: PointNuage[];
  }
  ```
  - `DonneesTerritoire.nuages?: Nuage[]` (département et académie ; nuages de moins de 5 points omis).
  - `nuages(groupe: Fiche[], ipsParVoie: Map<string, { gt: number | null; pro: number | null }>, rentreeIps: number): Nuage[]` dans `pipeline/src/resultats.ts` ; IPS de la rentrée `session − 1` ; moyennes pondérées par l'effectif.
  - `optionsNuage(n: Nuage): PlotOptions` (fonction pure : marques, échelles, `title` des points) et `svgNuage(n: Nuage): string` dans `site/src/lib/plot.ts`.
- [ ] **Step 1 : Écrire les tests**
  - `resultats.test.ts` : `nuage des collèges d'un département : un point par collège avec IPS et taux` ; `point sans taux : exclu` ; `LPO dans les deux nuages de lycées` ; `moins de 5 points : pas de nuage` ; `IPS par voie absent : ipsEnsemble = true`.
  - `site-resultats.test.ts` : `page département : nuage, formes pleines et contour, <title> par point, aucun nom écrit hors <title>` ; `note sous le nuage` ; `aucune droite de régression (une seule ligne par axe)` ; `page France : pas de nuage`.
- [ ] **Step 2 : Lancer, vérifier l'échec**.
- [ ] **Step 3 : Implémenter**.
- [ ] **Step 4 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 5 : Mesurer** — `bun run build` ; noter dans le commit le poids de la plus grosse page académie avant et après ; si elle dépasse 1,5 Mo, arrondir les coordonnées à une décimale (comme les cartes) avant de commiter.
- [ ] **Step 6 : Commit** — `git commit -m "feat: nuages IPS × réussite sur les pages département et académie"`

### Point de livraison du lot 3

- [ ] `bun run build` ; montrer au porteur une fiche de collège, un LPO, une page département et une page académie avec leurs nuages. **Le porteur décide de la mise en ligne.**

## Lot 4 : ségrégation

### Task 13 : Ségrégation sociale entre collèges

**Files:**
- Create: `pipeline/sql/07_segregation.sql`, `site/src/components/BlocSegregation.astro`
- Modify: `pipeline/src/db.ts`, `pipeline/src/territoires.ts`, `shared/src/donnees.ts`, `shared/src/libelles.ts`, `site/src/components/Territoire.astro`, `tests/fixtures/segregation.csv`
- Test: `tests/segregation.test.ts`, `tests/site-territoires.test.ts`

**Interfaces:**
- Produces :
  ```ts
  export interface AnneeSegregation {
    annee: number; colleges: number | null; partPrive: number | null;
    entropie: { ensemble: number | null; public: number | null; prive: number | null; publicPrive: number | null };
    /** Contributions publiées (en %). */
    contributions: { public: number | null; prive: number | null; publicPrive: number | null };
  }
  ```
  - Table `segregation(dep, annee, …)` (colonnes `nb_coll_calcul`, `poids_prive_calcul`, `i_entropie_tot`, `i_entropie_pu`, `i_entropie_pr`, `i_entropie_interpupr`, `contrib_pu`, `contrib_pr`, `contrib_interpupr`, `dep` normalisé par `dep_canonique`).
  - `DonneesTerritoire.segregation?: AnneeSegregation[]` : pages département, par année croissante.
- [ ] **Step 1 : Remplir la fixture** (deux départements, 2014-2025, une valeur vide).
- [ ] **Step 2 : Écrire les tests** : `département : 12 années` ; `valeur vide : null, jamais 0` ; `page département : bloc, courbe et tableau, source et année` ; `pages académie, région, France : phrase de renvoi, pas de valeurs` ; `page commune : ni bloc ni renvoi`.
- [ ] **Step 3 : Lancer, vérifier l'échec**.
- [ ] **Step 4 : Implémenter** ; le bloc va dans la section des collèges, après l'IPS moyen comparé.
- [ ] **Step 5 : Lancer toute la suite** — attendu : PASS.
- [ ] **Step 6 : Commit** — `git commit -m "feat: ségrégation sociale entre collèges sur les pages département"`

## Finitions

### Task 14 : Méthode, sources et contrôle complet

**Files:**
- Modify: `site/src/pages/methode.astro`, `site/src/pages/sources.astro`, `README.md`, `docs/superpowers/specs/2026-11-24-observatoire-phase4-reussite-design.md`
- Test: `tests/site-transverse.test.ts`

- [ ] **Step 1 : Écrire les tests** : `/methode/` contient les ancres `#valeur-ajoutee`, `#resultats-colleges`, `#rupture-bac`, `#successeurs`, `#corrections`, `#segregation`, `#ips-ancien` ; `/sources/` liste les onze nouvelles sources avec leurs versions.
- [ ] **Step 2 : Lancer, vérifier l'échec**.
- [ ] **Step 3 : Rédiger** les sections de la spec (6.8) : IVAC à partir de 2022 et brevet 2006-2021 non repris ; lecture de la valeur ajoutée (d'après la note de la DEPP, lien) ; rupture 2021 ; moyennes de taux et d'IPS calculées, dont la pondération 2016-2018 par les élèves de 2019 ; règles des successeurs et fichier manuel ; définition d'une correction ; indice d'entropie (lien vers la note de la DEPP). Vérifier dans la documentation des jeux IPS s'ils signalent une rupture de méthode entre 2021-2022 et 2022-2023 ; si oui, ajouter la mention sous la courbe (tâche 8) et dans la méthode.
- [ ] **Step 4 : Mettre à jour** le README (phase 4 livrée, sources) et reporter dans la spec les quatre écarts listés en tête de ce plan ; passer son statut à « livrée ».
- [ ] **Step 5 : Contrôle complet** — `bun test`, `bun run typecheck`, `bun run build` ; attendu : tout vert, `dist/` sous 900 Mo et 50 000 fichiers ; noter les deux chiffres dans le commit.
- [ ] **Step 6 : Commit** — `git commit -m "docs: méthode et sources de la phase 4"`

### Point de livraison final

- [ ] Montrer au porteur `/methode/` et le récapitulatif des chiffres (fiches historiques, successeurs, corrections, poids du site). **Le porteur décide de la mise en ligne.**
