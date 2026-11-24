# Observatoire citoyen de l'éducation en France, phase Écoles (premier degré) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** héberger le site sur Cloudflare Workers, puis ajouter les écoles maternelles, élémentaires et primaires (publiques et privées sous contrat) : fiche école, écoles fermées, collège de secteur à l'adresse de l'école, PIAL, écoles les plus proches, pages commune pour toutes les communes qui ont ou ont eu une école, premier degré sur les territoires et dépenses des communes pour leurs écoles. Cinq lots mis en ligne l'un après l'autre.

**Architecture :**
- **Lot 0** : `dist/` est servi par un Worker « fichiers statiques seulement » (pas de code de Worker), déployé par `wrangler` depuis le workflow `nightly`. Aucune URL ne change.
- **Les écoles sont des `Fiche` comme les autres.** Le type `Famille` gagne `maternelle`, `elementaire` et `primaire`. Le registre, l'index, les successeurs, les indicateurs et les répartitions fonctionnent sans fourche. Ce qui est propre aux écoles s'ajoute en champs optionnels de `Fiche` : `classes`, `rattachements`, `ecolesProches`. Côté collège, ce sont `ecolesDuSecteur` et `pial`.
- **Garde-fou de lot** : `FAMILLES_SECOND_DEGRE` (`shared/src/libelles.ts`) exclut les écoles des voisins, des territoires et des pages commune jusqu'aux lots 3 et 4, qui les y font entrer explicitement.
- Le site garde une seule route `/etablissement/[uai]/`. La page délègue le corps de la fiche à `FicheEcole.astro` quand la famille est une école.

**Tech stack :** l'existant (Bun 1.4.5, TypeScript, DuckDB, Astro 7.4, `@observablehq/plot` 0.6.x, `linkedom`, `bun test`) et `wrangler` 4.x (lot 0, via `cloudflare/wrangler-action` dans le workflow). Aucune autre dépendance.

**Spec :** `docs/superpowers/specs/2026-11-24-observatoire-phase-ecoles-design.md`. **Elle fait foi.** Les « Global Constraints » des plans des phases 1 à 4 restent en vigueur.

**Écarts constatés en préparant le plan (à reporter dans la spec à la tâche 19) :**
1. **Tête de réseau REP/REP+** : aucune source à jour ne la publie (`fr-en-ecoles-ep` s'arrête en 2019). La fiche école affiche l'appartenance (Annuaire) seule ; aucune tâche ne collecte la tête de réseau. `fr-en-ecoles-ep` est collecté pour la seule série d'effectifs 2011-2019.
2. **Liste des écoles sur les pages département** : 500 à 1 500 lignes alourdiraient la page. Les pages département montrent la synthèse du premier degré, sans liste nominative. Les écoles sont listées sur les pages commune et dans le CSV du département.
3. **Niveaux de la maternelle** : la source publie le préélémentaire en un seul total. Il n'y a pas de détail PS, MS, GS.
4. **Nature « élémentaire » de l'Annuaire** : elle couvre aussi les écoles primaires. La famille vient des drapeaux `ecole_maternelle` et `ecole_elementaire` (tâche 5).
5. **Comparaisons de la fiche école** : département, académie et France, comme le second degré (le type `Niveau` n'a pas de commune). Les moyennes de la commune sont sur la page commune (tâche 16).

## Global Constraints

- **Contraintes des phases 1 à 4** : libellés exacts dans `shared/src/libelles.ts`, nombres à la française, aucun zéro pour une absence, anti-palmarès (aucun des mots `rang`, `classement`, `top`, `meilleur(e)(s)`, `pire(s)` dans une page générée ; tri par nom par défaut), aucune page qui dépend de JavaScript pour être lue, quelques requêtes par source et par nuit.
- **Garde-fou de build (lot 0)** : au plus **95 000 fichiers** dans `dist/`, aucun fichier de plus de **25 Mio** ; plus de plafond de poids total.
- **Budget de poids** : une fiche école de fixture fait **25 000 octets de HTML au plus** (test de la tâche 9).
- **Familles** : `maternelle` (« École maternelle », pluriel « Écoles maternelles »), `elementaire` (« École élémentaire », « Écoles élémentaires »), `primaire` (« École primaire », « Écoles primaires »). Règle de classement : type `Ecole` dans l'Annuaire ; `ecole_maternelle = 1` et `ecole_elementaire = 1` → `primaire` ; `ecole_elementaire = 1` seul → `elementaire` ; `ecole_maternelle = 1` seul → `maternelle`. Sont exclues, avec un motif, les natures `ECOLE REGIONALE DU PREMIER DEGRE`, `ECOLE SANS EFFECTIFS PERMANENTS` et `ECOLE DE PLEIN AIR` (motif `nature_ecole_hors_perimetre`).
- **`FAMILLES_SECOND_DEGRE`** = `["college", "legt", "lpo", "lp", "erea"]` ; **`FAMILLES_ECOLES`** = `["maternelle", "elementaire", "primaire"]` ; `estEcole(f: Famille): boolean`.
- **Compatibilité entre écoles** (successeurs et écoles proches) : `maternelle` → `maternelle`, `primaire` ; `elementaire` → `elementaire`, `primaire` ; `primaire` → les trois.
- **Identifiants des nouvelles sources :**
  | `SourceId` | datasetId | millésime (colonne) | clé |
  |---|---|---|---|
  | `effectifs_ecoles` | `fr-en-ecoles-effectifs-nb_classes` | `rentree_scolaire` | `numero_ecole` |
  | `ips_ecoles_2016` | `fr-en-ips_ecoles_v2` | `rentree_scolaire` | `uai` |
  | `ips_ecoles` | `fr-en-ips-ecoles-ap2022` | `rentree_scolaire` | `uai` |
  | `personnels_ecoles` | `fr-en-indicateurs_personnels_etablissements1d` | `annee_de_la_rentree_scolaire` | `identifiant_de_l_etablissement` |
  | `classes_ecoles` | `fr-en-typologie-des-classes-dans-les-etablissements-du-premier-degre_v2` | `annee` | `uai`, `type_classe` |
  | `ecoles_ep` | `fr-en-ecoles-ep` | `rs` | `uai` |
  | `carte_scolaire` | `fr-en-carte-scolaire-colleges-publics` | — (référentiel) | — |
  | `cog_mouvements` | fichier « Mouvements des communes » du Code officiel géographique (Insee, millésime en vigueur) | — (référentiel) | — |
- **Filtre de `fermes`** devient : `date_fermeture >= date'2012-01-01' and (nature_uai_libe like "COLLEGE%" or nature_uai_libe like "LYCEE%" or nature_uai_libe like "ETAB REGIONAL%" or nature_uai_libe like "ECOLE%")`.
- **Élèves par classe** : élèves ÷ classes, arrondi à 0,1. Statut `non_disponible` si les classes valent 0 ou sont absentes.
- **Libellés exacts nouveaux :**
  - sections : « Rattachements », « Classes », « Autour de l'école » ; sur la fiche collège, « Écoles de son secteur » et « PIAL » ;
  - secteur : « Collège de secteur à l'adresse de l'école : » (école publique) ; « Située dans le secteur du collège public » (école privée sous contrat) ; plusieurs collèges séparés par « , » ;
  - notes : « Le secteur de collège dépend de l'adresse de chaque famille, pas de l'école fréquentée. Source : carte scolaire des collèges publics, définie par le conseil départemental. » ; pour le privé, « Les écoles privées ne sont pas soumises à la carte scolaire. Le collège public de secteur d'un élève dépend de l'adresse de sa famille. » ;
  - absences : « Carte scolaire non publiée pour ce département », « Adresse de l'école non rapprochée de la carte scolaire », « IPS non publié pour cette école », « Budget non publié pour les communes de moins de 3 500 habitants », « Coordonnées de l'école non publiées » ;
  - PIAL : « PIAL du {famille en minuscules} {nom} », puis la liste ; phrase « Le PIAL (pôle inclusif d'accompagnement localisé) organise l'accompagnement des élèves en situation de handicap. » et lien « En savoir plus » vers `/methode/#pial` ;
  - décompte : « {n} école(s) publique(s), {m} privée(s) sous contrat » ;
  - écoles proches : « Aucune autre école à moins de {n} km » ; « École maternelle ou primaire la plus proche : » ; « École élémentaire ou primaire la plus proche : » ; note « Distances à vol d'oiseau, sans tenir compte du relief ni des routes. » ;
  - commune : « Plus d'école dans la commune depuis {année} », « Plus d'école à {commune déléguée} depuis {année} », « Écoles fermées depuis 2012 » ;
  - fermeture d'une école : « Fermée le {jj/mm/aaaa} » (le second degré garde « Fermé le ») ;
  - effectifs : « Rentrée {aaaa}, dernière publiée » ; « Élèves par classe » ; « Classes à un niveau », « Classes à plusieurs niveaux » ; niveaux « Préélémentaire », « CP », « CE1 », « CE2 », « CM1 », « CM2 » ; « ULIS », « UEEA ».
- **Seuils des écoles proches** : `SEUILS_ISOLEMENT_KM = [2, 5, 10]`. La phrase « Aucune autre école à moins de n km » prend le plus grand seuil sous lequel il n'y a aucune autre école ouverte compatible. Elle n'apparaît pas si une école compatible est à moins de 2 km.
- **Écoles proches** : les **6** écoles ouvertes compatibles les plus proches dans un rayon de **50 km**, triées par distance.

## Review Focus

1. **Adresse d'école ambiguë dans une commune découpée par rue** (lieu-dit, « BP », « bis », numéro absent, voie absente de la carte). Attendu : statut `non_rapproche` et la mention « Adresse de l'école non rapprochée de la carte scolaire ». Jamais un collège deviné. Testé à la tâche 11 (`adresse sans numéro dans une commune découpée : non rapprochée`).
2. **École sans coordonnées.** Attendu : `ecolesProches` vaut `null` ; la fiche affiche « Coordonnées de l'école non publiées » à la place du bloc ; l'école n'est la voisine de personne. Testé à la tâche 14.
3. **Effectifs ou IPS publiés pour une UAI sans fiche** (école fermée absente du jeu des fermés). Attendu : lignes ignorées et comptées par `bun run data`, aucune page inventée. Testé à la tâche 6.
4. **Commune nouvelle dont une commune déléguée a perdu son école alors que la commune nouvelle en a encore.** Attendu : la page de la commune nouvelle a une partie « Plus d'école à {déléguée} depuis {année} » ; la phrase « Plus d'école dans la commune » n'apparaît pas. Testé à la tâche 16.
5. **École à classe unique ou école sans classe déclarée** (1 classe à cinq niveaux ; classes = 0). Attendu : élèves par classe = élèves dans le premier cas ; `non_disponible` dans le second, jamais une division par zéro ni un « 0 ». Testé à la tâche 6.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `wrangler.jsonc`, `site/public/_headers` (créés) | Worker de fichiers statiques, en-têtes de cache |
| `scripts/garde-fous.ts`, `.github/workflows/nightly.yml`, `README.md` (modifiés) | limites Cloudflare, déploiement `wrangler`, mode d'emploi de la bascule |
| `scripts/comparer-hebergements.ts` (créé) | recette : comparaison de deux hébergements sur un échantillon d'URL |
| `shared/src/types.ts`, `donnees.ts`, `libelles.ts` (modifiés) | familles, `SourceId`, champs de fiche et de territoire, libellés |
| `pipeline/src/sources.ts`, `normalise.ts`, `colonnes-eleves.ts`, `indicateurs.ts` (modifiés) | sources, macros, effectifs, indicateurs des écoles |
| `pipeline/sql/01_normaliser.sql`, `05_fermes.sql`, `03_ips_personnels.sql` (modifiés) | classement des écoles, fermés, IPS et personnels |
| `pipeline/sql/08_ecoles.sql` (créé) | tables `classes_ecoles`, `effectifs_ecoles_hist` |
| `pipeline/src/ecoles.ts` (créé) | `Fiche.classes`, élèves par classe, écoles proches |
| `pipeline/src/secteurs.ts` (créé) | carte scolaire : normalisation des adresses et rapprochement |
| `pipeline/src/pial.ts` (créé) | PIAL : tête et membres |
| `pipeline/src/communes.ts` (créé) | COG : commune actuelle, communes déléguées, centre d'une commune |
| `pipeline/src/fiches.ts`, `territoires.ts`, `successeurs.ts`, `budget.ts`, `budget-eleves.ts`, `db.ts`, `cli.ts` (modifiés) | assemblage, territoires, export, journal |
| `site/src/components/FicheEcole.astro`, `BlocRattachements.astro`, `BlocEcolesProches.astro`, `BlocEcolesSecteur.astro`, `BlocPial.astro`, `BlocEcolesCommune.astro` (créés) | affichage |
| `site/src/pages/etablissement/[uai].astro`, `components/Entete.astro`, `FicheA4.astro`, `Territoire.astro`, `pages/methode.astro`, `pages/sources.astro`, `public/js/recherche.js` (modifiés) | fiche, territoires, méthode, recherche |
| `tests/fixtures/{effectifs_ecoles,ips_ecoles_2016,ips_ecoles,personnels_ecoles,classes_ecoles,ecoles_ep,carte_scolaire,cog_mouvements}.csv` (créés) ; `annuaire.csv`, `fermes.csv` (enrichis) | données d'essai |
| `tests/garde-fous.test.ts`, `ecoles.test.ts`, `secteurs.test.ts`, `pial.test.ts`, `communes.test.ts`, `site-ecoles.test.ts` (créés) ; tests existants (modifiés) | tests |

**Fixtures des écoles** (département 44, réutilisées par toutes les tâches) :
- `0440201A` « École maternelle Les Lilas », publique, Nantes (44109), 12 rue des Lilas, 4 classes ;
- `0440202B` « École élémentaire Jules-Ferry », publique, Nantes, 3 bis rue Jules Ferry, 8 classes ;
- `0440203C` « École primaire Sainte-Marie », privée sous contrat, Nantes, rue des Lilas sans numéro ;
- `0440104D` « École élémentaire du Bourg », publique, Saint-Aubin (44150, commune entièrement rattachée au collège `0440001A`), 1 classe CP-CE1-CE2-CM1-CM2 ;
- `0440105E` « École maternelle des Prés », publique, Saint-Aubin, sans coordonnées ;
- `0440106F` « École élémentaire du Moulin », publique, fermée le 2016-07-05, commune déléguée `44999` rattachée à la commune nouvelle `44150` ;
- fusion : `0440107G` « École maternelle des Tilleuls » et `0440109K` « École élémentaire des Tilleuls », publiques, Nantes, 5 rue des Tilleuls, fermées le 2019-07-04 ; `0440108H` « École primaire des Tilleuls », même adresse, ouverte le 2019-07-04 ;
- une ligne d'effectifs pour l'UAI inconnue `0449999Z`.
Le collège `0440001A` (fixture existante) est en tête du PIAL de `0440201A`, `0440202B` et `0440104D`. Nantes (44109) est découpée par rue dans `carte_scolaire.csv` : rue des Lilas, numéros pairs → `0440001A`, impairs → `0440002B` ; rue Jules Ferry, numéros 1 à 99, pairs et impairs → `0440002B`.

---

## Lot 0 : hébergement

### Task 1 : Worker de fichiers statiques et garde-fous

**Files:**
- Create: `wrangler.jsonc`, `site/public/_headers`, `tests/garde-fous.test.ts`
- Modify: `scripts/garde-fous.ts`

**Interfaces:**
- Produces: `LIMITES: { fichiers: 95_000; octetsParFichier: 25 * 1024 * 1024 }` ; `verifierDist(dossier, limites?): { octets: number; fichiers: number }` (même signature, nouvelles règles) ; `ecrireFichiersHebergement(dossier, config)` n'écrit plus `CNAME`.

- [ ] **Step 1 : tests** dans `tests/garde-fous.test.ts` : un dossier temporaire de 3 fichiers avec `{ fichiers: 2, octetsParFichier: 10 }` lève « dist/ contient trop de fichiers : 3 > 2 » ; un fichier de 11 octets avec `octetsParFichier: 10` lève une erreur qui nomme ce fichier ; aucune erreur à 1 Go de poids total ; `ecrireFichiersHebergement` ne crée pas `CNAME` et supprime un `CNAME` existant.
- [ ] **Step 2 :** `bun test tests/garde-fous.test.ts` → FAIL.
- [ ] **Step 3 :** adapter `scripts/garde-fous.ts` aux limites ci-dessus. Message de dépassement : « (voir la marge R2, spec phase Écoles 6.9) ».
- [ ] **Step 4 :** créer `wrangler.jsonc` : `name: "observatoire-education"`, `compatibility_date: "2026-11-01"`, `assets: { directory: "./dist", html_handling: "auto-trailing-slash", not_found_handling: "404-page" }`, pas de `main`, pas encore de `routes` (elles viennent à la bascule, tâche 3). Créer `site/public/_headers` : `/_astro/*` et `/js/*` avec `Cache-Control: public, max-age=31536000, immutable` ; `/*` avec `Cache-Control: public, max-age=3600`. La redirection des UAI en minuscules reste dans `404.astro` : elle fonctionne avec `not_found_handling: "404-page"`.
- [ ] **Step 5 :** `bun test` → PASS ; `bun run build` → la sortie affiche « limites : 95000 fichiers ».
- [ ] **Step 6 :** commit `feat: hébergement Cloudflare Workers (configuration, garde-fous)`.

### Task 2 : Déploiement depuis `nightly`

**Files:**
- Modify: `.github/workflows/nightly.yml`, `README.md`

- [ ] **Step 1 :** remplacer `actions/upload-pages-artifact` et le job `deployer` par un job `deployer` qui récupère `dist/` (via `actions/upload-artifact@v4` puis `download-artifact@v4`) et lance `cloudflare/wrangler-action@v3` avec `command: deploy`, `wranglerVersion: "4"`, secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`. Retirer `pages: write`, `id-token: write` et `environment: github-pages`. Le groupe de concurrence devient `deploiement`.
- [ ] **Step 2 :** README, section « Hébergement » qui remplace « Mise en ligne » : préalables du porteur, dans l'ordre : (1) offre Workers payante sur le compte pro ; (2) jeton d'API avec le modèle « Edit Cloudflare Workers », limité au compte ; (3) secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` dans le dépôt ; (4) ajout de la zone `observatoireeducation.fr`. Liste des enregistrements à vérifier dans la zone importée **avant** de changer les serveurs DNS chez OVH : MX `mx1.mail.ovh.net` (priorité 1), `mx2.mail.ovh.net` (5), `mx3.mail.ovh.net` (100) ; le TXT SPF ; les enregistrements DKIM d'OVH ; supprimer les quatre A `185.199.108-111.153` de GitHub Pages.
- [ ] **Step 3 :** `bunx actionlint .github/workflows/nightly.yml` → aucune erreur (si `actionlint` n'est pas disponible, relire le YAML et le valider avec `bunx yaml-lint`).
- [ ] **Step 4 :** commit `ci: déploiement sur Cloudflare Workers`.

### Task 3 : Recette et bascule

**Files:**
- Create: `scripts/comparer-hebergements.ts`, test dans `tests/garde-fous.test.ts`
- Modify: `wrangler.jsonc` (à la bascule), `README.md`

**Interfaces:**
- Produces: `echantillonUrls(sitemap: string, n: number): string[]` (pure, déterministe : premier, dernier et un pas régulier) ; `comparer(a: string, b: string, chemins: string[]): Promise<{ chemin: string; ecart: string }[]>` (statut HTTP, et corps identique hors balises `<script>` d'Umami et `generated` de la fiche A4).

- [ ] **Step 1 : test** `echantillonUrls` sur un sitemap de 10 URL avec n = 4 → les URL 1, 4, 7 et 10 (chemins seulement).
- [ ] **Step 2 :** FAIL, implémenter, PASS.
- [ ] **Step 3 :** README, procédure : déploiement sur `observatoire-education.<compte>.workers.dev` ; `bun scripts/comparer-hebergements.ts https://observatoireeducation.fr https://observatoire-education.<compte>.workers.dev 300` → aucun écart, plus trois vérifications à la main : `/etablissement/0440001a/` redirige, une URL inconnue rend la 404, `robots.txt` est identique. Puis ajout de `routes: [{ "pattern": "observatoireeducation.fr", "custom_domain": true }]` à `wrangler.jsonc`, changement des serveurs DNS chez OVH par le porteur, et test d'envoi vers `contact@observatoireeducation.fr`.
- [ ] **Step 4 :** commit `feat: recette de la bascule d'hébergement`. **Le lot 0 est validé quand une nuit de collecte et de déploiement a réussi après la bascule. Ensuite seulement, la tâche 4.**

---

## Lot 1 : fiches école

### Task 4 : Sources du premier degré et fixtures

**Files:**
- Modify: `shared/src/types.ts` (`SourceId`), `pipeline/src/sources.ts`, `tests/fixtures/annuaire.csv`, `tests/fixtures/fermes.csv`, `tests/collect.test.ts`
- Create: les six fixtures `effectifs_ecoles`, `ips_ecoles_2016`, `ips_ecoles`, `personnels_ecoles`, `classes_ecoles`, `ecoles_ep` (`carte_scolaire` à la tâche 11, `cog_mouvements` à la tâche 15)

- [ ] **Step 1 :** relever les colonnes de chaque jeu avec `curl -s https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/<id> | jq '[.fields[].name]'`, et les reporter dans `colonnesRequises`. Pour `effectifs_ecoles` : `rentree_scolaire, numero_ecole, secteur, nombre_total_classes, nombre_total_eleves, nombre_eleves_preelementaire_hors_ulis, nombre_eleves_elementaire_hors_ulis, nombre_eleves_ulis, nombre_eleves_ueea, nombre_eleves_cp_hors_ulis, nombre_eleves_ce1_hors_ulis, nombre_eleves_ce2_hors_ulis, nombre_eleves_cm1_hors_ulis, nombre_eleves_cm2_hors_ulis`. Pour `personnels_ecoles` : `annee_de_la_rentree_scolaire, secteur, identifiant_de_l_etablissement, etp_d_enseignants_hommes_et_femmes, etp_de_femmes_enseignantes`, plus les trois colonnes d'âge et les quatre d'ancienneté. Pour `classes_ecoles` : `annee, uai, libelle_secteur, type_classe, nb_classes`. Pour `ecoles_ep` : `rs, uai, appartep, nbeleves, nbclasses`. L'Annuaire ajoute : `ecole_maternelle, ecole_elementaire, pial, code_circonscription, nom_circonscription, rpi_concentre, rpi_disperse`.
- [ ] **Step 2 : test** dans `tests/collect.test.ts` : `SOURCES.effectifs_ecoles.millesime` vaut `{ colonne: "rentree_scolaire", cles: ["numero_ecole"] }` ; `FILTRE_FERMES` contient `nature_uai_libe like "ECOLE%"`.
- [ ] **Step 3 :** FAIL, déclarer les sources (tableau des Global Constraints) et élargir `FILTRE_FERMES`, PASS.
- [ ] **Step 4 :** écrire les fixtures des écoles décrites plus haut (effectifs 2019 à 2025 pour les écoles ouvertes, 2014 à la rentrée précédant la fermeture pour `0440106F`, `0440107G` et `0440109K` ; IPS 2016 à 2024 pour `0440202B` et `0440203C`, aucun IPS pour les maternelles ; personnels 2024 et 2025 ; classes 2025 dont une classe `CP-CE1-CE2-CM1-CM2` pour `0440104D` ; `ecoles_ep` 2011 à 2019 pour `0440202B`).
- [ ] **Step 5 :** `bun test` → PASS (les tests existants ne voient pas encore les écoles : le classement les exclut jusqu'à la tâche 5).
- [ ] **Step 6 :** commit `feat: sources du premier degré`.

### Task 5 : Familles des écoles et classement

**Files:**
- Modify: `shared/src/types.ts`, `shared/src/libelles.ts`, `pipeline/src/normalise.ts`, `pipeline/sql/01_normaliser.sql`, `pipeline/src/fiches.ts` (`FAMILLES_VOISINES`), `pipeline/src/territoires.ts`, `site/src/lib/territoire.ts`, `site/src/lib/budget.ts`, `tests/normaliser.test.ts`

**Interfaces:**
- Produces: `Famille` élargi ; `FAMILLES_ECOLES`, `FAMILLES_SECOND_DEGRE`, `estEcole(f: Famille): boolean` (dans `libelles.ts`) ; `FAMILLES_COMPATIBLES_ECOLES: Record<"maternelle" | "elementaire" | "primaire", Famille[]>` (dans `fiches.ts`).

- [ ] **Step 1 : tests** dans `tests/normaliser.test.ts` : `0440201A` est classée `maternelle`, `0440202B` et `0440104D` `elementaire`, `0440203C` et `0440108H` `primaire` ; une école `ECOLE REGIONALE DU PREMIER DEGRE` a le motif `nature_ecole_hors_perimetre` ; une école privée hors contrat a le motif `prive_hors_contrat`.
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** type `Ecole` admis au périmètre ; macro `famille_ecole(maternelle, elementaire)` appliquée quand `type_etablissement = 'Ecole'` ; libellés `FAMILLES` et `FAMILLES_PLURIEL`. Les écoles n'ont pas de voisins : `calculerVoisins` ne traite que `FAMILLES_SECOND_DEGRE` et renvoie `null` pour une école. `communesRetenues`, `exporterTerritoires`, `controlerPonderation` et `ORDRE_FAMILLES` filtrent sur `FAMILLES_SECOND_DEGRE`. `niveauDe` (budget) n'est appelé que pour le second degré.
- [ ] **Step 4 :** `bun test` → PASS, et `site-territoires` inchangé (aucune école sur les territoires).
- [ ] **Step 5 :** commit `feat: familles des écoles`.

### Task 6 : Effectifs et classes des écoles

**Files:**
- Create: `pipeline/sql/08_ecoles.sql`, `pipeline/src/ecoles.ts`, `tests/ecoles.test.ts`
- Modify: `pipeline/src/colonnes-eleves.ts`, `pipeline/src/eleves.ts`, `pipeline/src/indicateurs.ts`, `pipeline/src/db.ts` (`ETAPES` : `08_ecoles.sql` après `05_fermes.sql`), `shared/src/types.ts`, `shared/src/libelles.ts`, `pipeline/src/fiches.ts`, `pipeline/src/cli.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared/src/types.ts
  export interface TypeClasses { libelle: string; niveaux: number; classes: number }
  export interface Classes {
    rentree: number;
    total: number | null;
    /** [rentrée, élèves, classes] par rentrée croissante, série complète (effectifs_ecoles, puis ecoles_ep). */
    historique: [number, number | null, number | null][];
    /** null si la typologie n'est pas publiée pour la rentrée. */
    types: TypeClasses[] | null;
    source: SourceId[];
  }
  // Fiche : classes?: Classes | null (présent pour les écoles seulement)
  ```
  `Eleves.ueea?: number | null`. `CodeIndicateur` gagne `eleves_par_classe`. `calculerClasses(db: Db): Promise<Map<string, Classes>>` dans `pipeline/src/ecoles.ts`. Table `ecoles_ignorees(source, n)`.

- [ ] **Step 1 : tests** dans `tests/ecoles.test.ts` :
  - `0440202B` : `classes.total = 8`, `historique` commence en 2011 (`ecoles_ep`) et finit en 2025, sans doublon pour 2019 (`effectifs_ecoles` l'emporte) ;
  - `0440104D` : indicateur `eleves_par_classe` = élèves (1 classe) ; `types` = `[{ libelle: "CP-CE1-CE2-CM1-CM2", niveaux: 5, classes: 1 }]` ;
  - une école à 0 classe : `eleves_par_classe.statut = "non_disponible"`, valeur `null` ;
  - `eleves.niveaux` d'une primaire = Préélémentaire, CP, CE1, CE2, CM1, CM2 (libellés exacts), `ulis` et `ueea` lus ;
  - `ecoles_ignorees` compte 1 ligne pour `effectifs_ecoles` (UAI `0449999Z`).
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** implémenter. `rentree(v)` lit l'année du champ date `rentree_scolaire`. Le nombre de niveaux d'un type de classe est le nombre de segments séparés par « - » (`Preel` compte pour un). Les élèves de la série `ecoles_ep` (`nbeleves`, `nbclasses`) ne servent qu'aux rentrées absentes d'`effectifs_ecoles`. `cli.ts` affiche « écoles ignorées (UAI sans fiche) : … ».
- [ ] **Step 4 :** `bun test` → PASS.
- [ ] **Step 5 :** commit `feat: effectifs et classes des écoles`.

### Task 7 : IPS et enseignants des écoles

**Files:**
- Modify: `pipeline/sql/01_normaliser.sql` (table `ips`), `pipeline/sql/03_ips_personnels.sql`, `pipeline/src/indicateurs.ts`, `pipeline/src/ips-historique.ts`, `tests/ips-historique.test.ts`, `tests/indicateurs.test.ts`

- [ ] **Step 1 : tests** :
  - `0440202B` : indicateur `ips` à la rentrée 2024 avec un historique 2016 → 2024 et `sourcesHistorique` qui passe de `ips_ecoles_2016` à `ips_ecoles` en 2022 ;
  - `0440201A` : `ips.statut = "non_disponible"` ;
  - comparaisons de l'IPS d'une école : moyennes publiées si le jeu en contient (colonnes relevées à la tâche 4), sinon `calculee: true`, pondérées par les élèves de la même rentrée, **calculées parmi les écoles seulement** ;
  - `0440202B` : répartitions `sexe_enseignants`, `ages`, `anciennete` (catégories existantes) et indicateur ETP d'enseignants ; pas de `statuts`, pas de vie scolaire, pas de part d'agrégés (absents des indicateurs de l'école, et non affichés comme absences).
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** implémenter. Les moyennes d'IPS de territoire sont calculées par groupe de familles (`FAMILLES_ECOLES` d'un côté, chaque famille du second degré de l'autre) : une école n'entre jamais dans une moyenne de collèges.
- [ ] **Step 4 :** `bun test` → PASS, y compris le contrôle de pondération du second degré inchangé.
- [ ] **Step 5 :** commit `feat: IPS et enseignants des écoles`.

### Task 8 : Écoles fermées et successeurs

**Files:**
- Modify: `pipeline/sql/05_fermes.sql`, `pipeline/src/successeurs.ts`, `tests/successeurs.test.ts`, `tests/fixtures/successeurs/`

- [ ] **Step 1 : tests** :
  - `0440106F` (fermée le 2016-07-05) a une fiche historique : elle est citée par `effectifs_ecoles` ;
  - une école fermée que rien ne cite n'a pas de fiche ;
  - fusion : `0440107G` (maternelle) et `0440109K` (élémentaire), fermées le 2019-07-04, ont toutes deux pour successeur `0440108H` (primaire ouverte le même jour à la même adresse) ; la fiche de `0440108H` a deux prédécesseurs ;
  - une maternelle fermée n'a jamais une élémentaire seule pour successeur (`FAMILLES_COMPATIBLES_ECOLES`).
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** la famille d'une école fermée vient de `nature_uai_libe` (`ECOLE MATERNELLE%` → `maternelle`, `ECOLE ELEMENTAIRE%` et `ECOLE DE NIVEAU ELEMENTAIRE%` → `elementaire`) ; son secteur, de `effectifs_ecoles` ou d'un des deux jeux d'IPS des écoles. Les règles de déduction de la phase 4 s'appliquent, avec `FAMILLES_COMPATIBLES_ECOLES` pour les écoles.
- [ ] **Step 4 :** `bun test` → PASS.
- [ ] **Step 5 :** commit `feat: écoles fermées et successeurs`.

### Task 9 : Fiche école (site)

**Files:**
- Create: `site/src/components/FicheEcole.astro`, `tests/site-ecoles.test.ts`
- Modify: `site/src/pages/etablissement/[uai].astro`, `site/src/components/Entete.astro`, `site/src/components/FicheA4.astro`, `site/src/lib/plot.ts`, `tests/site.ts`

**Interfaces:**
- Consumes: `Fiche.classes`, indicateurs `eleves`, `eleves_par_classe`, `ips`, ETP ; `estEcole`.
- Produces: `svgElevesClasses(historique: Classes["historique"]): string` dans `site/src/lib/plot.ts` (deux séries, élèves et classes, sur deux axes ; fonction pure).

- [ ] **Step 1 : tests** dans `tests/site-ecoles.test.ts` (site d'essai) :
  - `/etablissement/0440104D/` contient « Rentrée 2025, dernière publiée », « Élèves par classe », « Classes à plusieurs niveaux » et `CP-CE1-CE2-CM1-CM2` ;
  - `/etablissement/0440201A/` contient « IPS non publié pour cette école » et aucun « 0 » dans la cellule IPS ;
  - aucune fiche école ne contient « Rattachements », « Autour de l'école », « Budget », « Vie scolaire » ni « agrégés » (lots à venir, données sans objet) ;
  - `/etablissement/0440106F/` contient « Fermée le 05/07/2016 » (accord au féminin pour une école) ;
  - le HTML de `/etablissement/0440202B/` fait 25 000 octets au plus ;
  - la fiche A4 d'une école porte le titre « Fiche pour le conseil d'école ».
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** `[uai].astro` garde l'en-tête commun et rend `<FicheEcole f={f} />` quand `estEcole(f.famille)`. Ordre des blocs de la spec, section 6.3, sans les blocs des lots 2 à 4. Pour tenir le budget de poids : une seule courbe (élèves et classes), répartitions en barres empilées HTML/CSS, aucun tableau de voisins.
- [ ] **Step 4 :** `bun test` → PASS.
- [ ] **Step 5 :** commit `feat: fiche école`.

### Task 10 : Recherche, sources et méthode du lot 1

**Files:**
- Modify: `site/public/js/recherche.js`, `site/src/pages/sources.astro`, `site/src/pages/methode.astro`, `tests/recherche.test.ts`, `scripts/garde-fous.ts`

- [ ] **Step 1 : tests** : l'index de recherche du site d'essai contient `0440202B` avec `f: "elementaire"` ; la recherche affiche le libellé « École élémentaire » ; `/sources/` liste les six nouveaux jeux et la ligne « RASED : aucune donnée ouverte » ; `/methode/` a les ancres `#ecoles-sans-ips` et `#successeurs-ecoles` ; le garde-fou échoue si `recherche.json` dépasse **6 000 000 octets**.
- [ ] **Step 2 :** FAIL, implémenter, PASS.
- [ ] **Step 3 :** `bun run build` sur les vraies données : noter dans le commit le nombre de fichiers et le poids de `recherche.json` (attendu : environ 70 000 fichiers).
- [ ] **Step 4 :** commit `feat: écoles dans la recherche, sources et méthode`. **Mise en ligne du lot 1.**

---

## Lot 2 : rattachements

### Task 11 : Carte scolaire, normalisation et rapprochement

**Files:**
- Create: `pipeline/src/secteurs.ts`, `tests/secteurs.test.ts`, `tests/fixtures/carte_scolaire.csv`
- Modify: `pipeline/src/sources.ts`, `shared/src/types.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared/src/types.ts
  export type StatutSecteur = "commune" | "voie" | "non_rapproche" | "carte_non_publiee";
  export interface SecteurCollege { statut: StatutSecteur; colleges: LienEtab[] }
  // pipeline/src/secteurs.ts
  export interface AdresseNormalisee { numero: number | null; indice: string | null; voie: string | null }
  export function normaliserAdresse(adresse: string): AdresseNormalisee;
  export function normaliserVoie(libelle: string): string;
  export async function calculerSecteurs(db: Db): Promise<Map<string, SecteurCollege>>;
  ```

- [ ] **Step 1 : tests** :
  - `normaliserAdresse("3 bis rue Jules Ferry")` → `{ numero: 3, indice: "B", voie: "RUE JULES FERRY" }` ; `normaliserAdresse("Lieu-dit Le Bourg")` → `numero: null` ; `normaliserAdresse("BP 12")` → `voie: null` ;
  - `normaliserVoie` retire accents, ponctuation et articles en double espace, et développe les abréviations `R` → `RUE`, `AV` → `AVENUE`, `BD` → `BOULEVARD`, `PL` → `PLACE`, `CHE` → `CHEMIN`, `IMP` → `IMPASSE`, `ALL` → `ALLEE` ;
  - `0440104D` (Saint-Aubin, commune entière) → `{ statut: "commune", colleges: [0440001A] }` ;
  - `0440201A` (12 rue des Lilas, pair) → `voie`, `[0440001A]` ; une adresse au 13 → `[0440002B]` ;
  - `0440203C` (rue des Lilas sans numéro) → `non_rapproche`, `colleges: []` (**adresse sans numéro dans une commune découpée : non rapprochée**) ;
  - une école d'un département absent de la carte → `carte_non_publiee` ;
  - un secteur multi-collèges → les deux collèges, triés par nom.
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** implémenter. Un tronçon s'applique si la voie normalisée est égale, que le numéro est dans [début, fin] et que la parité correspond (`PI` : les deux ; `P` : pair ; `I` : impair ; valeurs relevées dans le jeu à cette étape). Commune sans aucune voie dans la carte : rattachement direct. Aucun rapprochement approché (pas de distance d'édition). `cli.ts` affiche le taux de rapprochement par statut.
- [ ] **Step 4 :** `bun test` → PASS.
- [ ] **Step 5 :** commit `feat: collège de secteur à l'adresse de l'école`.

### Task 12 : PIAL et écoles du secteur

**Files:**
- Create: `pipeline/src/pial.ts`, `tests/pial.test.ts`
- Modify: `shared/src/types.ts`, `pipeline/src/fiches.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MembreEtab extends LienEtab { famille: Famille; secteur: Secteur }
  export interface Pial { tete: MembreEtab; membres: MembreEtab[] } // membres triés par nom, tête exclue
  export interface LigneEcole { uai: string; nom: string; famille: Famille; secteur: Secteur; commune: string; eleves: number | null; ips: number | null }
  export interface Rattachements { secteur: SecteurCollege; pial: Pial | null; circonscription: string | null }
  // Fiche : rattachements?: Rattachements (écoles) ; pial?: Pial | null et ecolesDuSecteur?: LigneEcole[] | null (second degré)
  export async function calculerPial(db: Db): Promise<Map<string, Pial>>; // clé : UAI de chaque membre et de la tête
  ```
- [ ] **Step 1 : tests** : le PIAL de `0440201A` a pour tête `0440001A` et pour membres `0440201A`, `0440202B` et `0440104D` (la page n'affiche pas sa propre UAI dans la liste) ; `ecolesDuSecteur` de `0440001A` contient exactement `0440201A` et `0440104D` (`0440203C`, non rapprochée, n'y est pas ; `0440202B` relève de `0440002B`) ; un collège privé a `ecolesDuSecteur: null` ; un PIAL dont la tête n'a pas de fiche donne `pial: null` et est compté par `cli.ts`.
- [ ] **Step 2 :** FAIL, implémenter, PASS.
- [ ] **Step 3 :** commit `feat: PIAL et écoles du secteur`.

### Task 13 : Rattachements sur les fiches (site)

**Files:**
- Create: `site/src/components/BlocRattachements.astro`, `BlocEcolesSecteur.astro`, `BlocPial.astro`
- Modify: `site/src/components/FicheEcole.astro`, `site/src/pages/etablissement/[uai].astro`, `site/src/pages/methode.astro`, `tests/site-ecoles.test.ts`

- [ ] **Step 1 : tests** :
  - `/etablissement/0440201A/` contient « Collège de secteur à l'adresse de l'école : » suivi d'un lien vers `/etablissement/0440001A/`, et la note exacte du secteur ;
  - `/etablissement/0440203C/` (privée) : « Adresse de l'école non rapprochée de la carte scolaire » et la note du privé ; pour une privée rapprochée, « Située dans le secteur du collège public » ;
  - `/etablissement/0440001A/` contient « Écoles de son secteur », le décompte exact « 2 écoles publiques, 0 privée sous contrat » selon les fixtures, et « PIAL du collège … » ;
  - `/methode/` a les ancres `#secteur-ecole` et `#pial`.
- [ ] **Step 2 :** FAIL, implémenter, PASS.
- [ ] **Step 3 :** commit `feat: rattachements sur les fiches`. **Mise en ligne du lot 2.**

---

## Lot 3 : autour et communes

### Task 14 : Écoles les plus proches

**Files:**
- Modify: `pipeline/src/ecoles.ts`, `shared/src/types.ts`, `pipeline/src/fiches.ts`, `tests/ecoles.test.ts`
- Create: `site/src/components/BlocEcolesProches.astro`

**Interfaces:**
- Produces:
  ```ts
  export interface EcoleProche { uai: string; nom: string; famille: Famille; secteur: Secteur; commune: string; distanceKm: number; eleves: number | null; classes: number | null }
  export interface EcolesProches {
    liste: EcoleProche[];
    plusProcheMaternelle: EcoleProche | null;   // maternelle ou primaire
    plusProcheElementaire: EcoleProche | null;  // élémentaire ou primaire
    /** Plus grand seuil de SEUILS_ISOLEMENT_KM sans autre école compatible, null s'il y en a une à moins de 2 km. */
    aucuneAMoinsDe: number | null;
  }
  export const SEUILS_ISOLEMENT_KM = [2, 5, 10] as const;
  export async function calculerEcolesProches(db: Db, depuis?: { lat: number; lon: number }): Promise<Map<string, EcolesProches | null>>;
  ```
- [ ] **Step 1 : tests** : `0440104D` a `aucuneAMoinsDe` = le seuil attendu par les coordonnées des fixtures ; une maternelle a `plusProcheElementaire` qui n'est jamais une maternelle ; `0440105E` (sans coordonnées) → `null` et absente des listes des autres ; une école fermée n'est jamais dans une liste ; fiche `/etablissement/0440105E/` : « Coordonnées de l'école non publiées ».
- [ ] **Step 2 :** FAIL, implémenter (réutiliser `distanceKm` et le SQL haversine de `fiches.ts`), PASS.
- [ ] **Step 3 :** commit `feat: écoles les plus proches`.

### Task 15 : Communes nouvelles (COG)

**Files:**
- Create: `pipeline/src/communes.ts`, `tests/communes.test.ts`, `tests/fixtures/cog_mouvements.csv`
- Modify: `pipeline/src/sources.ts`, `pipeline/src/collect.ts` (téléchargement d'un fichier hors Opendatasoft), `pipeline/src/ods.ts` ou un nouveau client `pipeline/src/fichier.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TableCommunes { actuelle(code: string): string; deleguees(code: string): { code: string; nom: string }[] }
  export async function chargerCommunes(db: Db): Promise<TableCommunes>;
  export function centreCommune(insee: string): { lat: number; lon: number } | null; // centroïde du contour (site/contours)
  ```
- [ ] **Step 1 :** relever l'URL du fichier « Mouvements des communes » du COG en vigueur sur insee.fr et ses colonnes (`mod`, `date_eff`, `typecom_av`, `com_av`, `libelle_av`, `typecom_ap`, `com_ap`, `libelle_ap`, à confirmer), puis déclarer la source avec `api: "fichier"` et son URL directe. Elle est archivée comme les autres (empreinte, Release).
- [ ] **Step 2 : tests** : `actuelle("44999")` → `"44150"` ; `actuelle("44109")` → `"44109"` ; une chaîne de fusions (A → B en 2016, B → C en 2019) → `C` ; `deleguees("44150")` contient `{ code: "44999", nom: … }`.
- [ ] **Step 3 :** FAIL, implémenter, PASS.
- [ ] **Step 4 :** commit `feat: communes nouvelles (Code officiel géographique)`.

### Task 16 : Pages commune étendues

**Files:**
- Create: `site/src/components/BlocEcolesCommune.astro`
- Modify: `shared/src/donnees.ts`, `pipeline/src/territoires.ts`, `site/src/components/Territoire.astro`, `site/src/pages/commune/[insee]/etablissements.csv.ts`, `site/src/pages/departement/[dep]/etablissements.csv.ts`, `site/src/lib/donnees.ts`, `tests/territoires.test.ts`, `tests/site-ecoles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PartieDeleguee { code: string; nom: string; ecoles: LigneEcole[]; plusDEcoleDepuis: number | null }
  export interface EcolesCommune {
    ecoles: LigneEcole[];                         // ouvertes, triées par nom
    /** [rentrée, élèves, classes] de la commune. */
    historique: [number, number | null, number | null][];
    fermees: (LienEtab & { famille: Famille })[]; // depuis 2012, par date
    plusDEcoleDepuis: number | null;              // null si la commune a une école ouverte
    deleguees: PartieDeleguee[];                  // vide si la commune n'est pas une commune nouvelle
    plusProches: EcolesProches | null;            // seulement si la commune n'a plus d'école
  }
  // DonneesTerritoire : ecoles?: EcolesCommune (pages commune)
  // communesAvecCsv(): Set<string> dans site/src/lib/donnees.ts
  ```
- [ ] **Step 1 : tests** :
  - une page existe pour `44150` (écoles ouvertes) et pour une commune de fixture qui n'a plus que des écoles fermées ; aucune page pour le code disparu `44999` ;
  - la page `44150` contient « Plus d'école à {nom de 44999} depuis 2016 » et **ne contient pas** « Plus d'école dans la commune » ;
  - la commune sans école ouverte contient « Plus d'école dans la commune depuis {année} » et ses écoles les plus proches, depuis le centre de la commune ;
  - `/commune/44150/etablissements.csv` n'existe pas si la commune n'a pas de collège ni de lycée ; `/departement/44/etablissements.csv` contient `0440104D` ;
  - les pages commune existantes gardent leur contenu du second degré (test existant inchangé).
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** la page commune montre aussi la carte des écoles (`svgCartePoints`, mêmes conventions que les établissements). `communesRetenues` garde la règle actuelle pour le second degré et ajoute toute commune actuelle (après `TableCommunes.actuelle`) qui a ou a eu une école depuis 2012. Le CSV de commune n'est généré que pour les communes retenues par la règle du second degré.
- [ ] **Step 4 :** `bun test` → PASS ; `bun run build` sur les vraies données : le nombre de fichiers est sous 95 000 (le noter dans le commit).
- [ ] **Step 5 :** commit `feat: pages commune pour toutes les communes avec école`. **Mise en ligne du lot 3.**

---

## Lot 4 : territoires et budget

### Task 17 : Premier degré sur les territoires

**Files:**
- Modify: `shared/src/donnees.ts`, `pipeline/src/territoires.ts`, `site/src/components/Territoire.astro`, `site/src/lib/territoire.ts`, `tests/territoires.test.ts`, `tests/site-territoires.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SynthesePremierDegre {
    compte: ParSecteur<number>;
    eleves: ParSecteur<number | null>;
    elevesParClasse: ParSecteur<number | null>;   // Σ élèves ÷ Σ classes
    ipsMoyen: IpsMoyens;
    distributionIps: { public: number[]; prive: number[]; bornes: number[] };
    /** [rentrée, écoles ouvertes, classes] par rentrée croissante. */
    historique: [number, number, number | null][];
    /** [année, écoles fermées cette année-là] depuis 2012. */
    fermetures: [number, number][];
  }
  // DonneesTerritoire : premierDegre?: SynthesePremierDegre (département, académie, région, France)
  ```
- [ ] **Step 1 : tests** : la synthèse du 44 compte les écoles ouvertes par secteur des fixtures ; `elevesParClasse` = Σ élèves ÷ Σ classes ; `fermetures` contient `[2016, 1]` et `[2019, 1]` ; la page département n'a **pas** de liste nominative d'écoles et renvoie au CSV du département ; les synthèses du second degré sont inchangées.
- [ ] **Step 2 :** FAIL, implémenter, PASS.
- [ ] **Step 3 :** commit `feat: premier degré sur les pages de territoire`.

### Task 18 : Dépenses des communes pour leurs écoles

**Files:**
- Modify: `pipeline/src/sources.ts` (filtre du budget), `pipeline/src/budget.ts`, `pipeline/src/budget-eleves.ts`, `shared/src/collectivites.ts`, `shared/src/types.ts` (`Fiche.budget.ecoles?`), `site/src/components/BlocBudget.astro`, `site/src/components/FicheEcole.astro`, `docs/budget-controles.md`, `tests/budget.test.ts`, `tests/budget-eleves.test.ts`, `tests/fixtures/budget_2023.csv`, `tests/fixtures/budget_2024.csv`

- [ ] **Step 1 :** le filtre ODSQL du budget ajoute les catégories `Commune` et `SYND` sur les fonctions commençant par `21`. Les comptes et la formule suivent `docs/budget-controles.md` (même règle que les collèges, appliquée aux fonctions 21x). La section ajoutée à ce document dit comment sont traitées les dépenses scolaires portées par une intercommunalité ou un syndicat.
- [ ] **Step 2 : tests** : une commune de plus de 3 500 habitants des fixtures a un montant en euros par élève des écoles **publiques** de la commune ; une commune de moins de 3 500 habitants a le statut qui produit « Budget non publié pour les communes de moins de 3 500 habitants » ; la fiche `0440202B` montre le bloc Budget, la fiche d'une école privée ne le montre pas ; les budgets des départements et des régions sont inchangés.
- [ ] **Step 3 :** FAIL, implémenter, PASS. La première collecte archive une nouvelle version de chaque exercice (filtre élargi) : le noter dans le README, section Hébergement, pour la mise en ligne du lot.
- [ ] **Step 4 :** commit `feat: dépenses des communes pour leurs écoles`.

### Task 19 : Méthode, sources, documentation et contrôle complet

**Files:**
- Modify: `site/src/pages/methode.astro`, `site/src/pages/sources.astro`, `README.md` (tableau des phases), `docs/superpowers/specs/2026-11-24-observatoire-phase-ecoles-design.md` (section « Écarts constatés à la livraison »)

- [ ] **Step 1 :** `/methode/` : distance à vol d'oiseau et seuils, pages commune et communes nouvelles, budget communal (couverture, intercommunalités), premier degré sur les territoires. `/sources/` : COG. Spec : les quatre écarts du début de ce plan, et ceux constatés en route.
- [ ] **Step 2 :** `bun run typecheck && bun test && bun run build` → tout passe ; le garde-fou affiche le nombre de fichiers (sous 95 000).
- [ ] **Step 3 :** commit `docs: phase Écoles livrée`. **Mise en ligne du lot 4.**
