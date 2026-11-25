# Pages en onglets avec synthèse — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** chaque fiche et chaque page de territoire s'ouvre sur un onglet Synthèse, le détail est rangé en onglets, l'impression peut tout sortir.

**Architecture :** le HTML reste complet (Astro statique) ; chaque page est découpée en panneaux (`Panneau.astro`) précédés d'une barre (`Onglets.astro`). Un script vanilla (`site/public/js/onglets.js`) masque les panneaux inactifs et résout l'ancre de l'adresse. Les chiffres de Synthèse sont calculés par des fonctions pures (`site/src/lib/synthese.ts`) à partir des mêmes données que les onglets.

**Tech Stack :** Astro 7, Bun (tests `bun:test`), linkedom (tests sur le HTML produit), CSS `site/src/styles/obs.css`.

**Spec :** `docs/superpowers/specs/2026-11-25-observatoire-onglets-synthese-design.md` (à lire avant chaque tâche).

## Global Constraints

- Aucun changement du pipeline ni des données (`pipeline/`, `shared/src/donnees.ts`, `shared/src/types.ts` inchangés).
- Scripts navigateur : JavaScript vanilla ES5-compatible comme `fiche.js`, chargés en `<script is:inline src="/js/…" defer>`. Pas de framework client.
- Tous les libellés nouveaux dans `shared/src/libelles.ts`, objet `LIBELLES_ONGLETS` (tâche 1).
- Identifiants d'onglets préfixés `o-` (`#o-synthese`, `#o-colleges`, `#o-lycees`…) : aucune collision avec les `id` de sections existants, qui sont tous conservés.
- Sans JavaScript, tous les panneaux sont visibles et la barre est un sommaire par ancres.
- Un onglet sans contenu n'est pas rendu ; une page avec moins de trois onglets n'a ni barre ni panneaux masqués.
- Un chiffre de Synthèse vient de la même donnée et du même formatage que le chiffre de son onglet.
- Synthèse des fiches : la case Résultats a la taille des autres cases, sans classement ni couleur « bon / mauvais », la valeur ajoutée publiée à côté du taux.
- `bun test`, `bun run typecheck` et `bun run build` (garde-fous inclus) verts à la fin de chaque tâche.

## Review Focus

1. **Lien partagé vers une ancre historique** (`/departement/44/#lp`, `/departement/44/#premier-degre`, `/etablissement/X/#pial`) : l'onglet qui contient l'élément s'ouvre et la page y défile. Test : tâche 1 (`ancre interne`) et tâches 4 à 6 (une ancre historique par page).
2. **Impression depuis un onglet autre que Synthèse** : tous les panneaux sortent, y compris ceux portant `hidden="until-found"`. Test : tâche 2 (règle CSS d'impression).
3. **Navigateur sans `hidden="until-found"`** (Safari ancien) : les panneaux restent masqués par `hidden` simple, sans erreur de script. Test : tâche 1 (`repli hidden`).
4. **Effectif non publié dans une famille** : le total de la Synthèse territoire ne sous-compte pas en silence. Test : tâche 3 (`totalSecondDegre` avec un `null`).
5. **Commune sans second degré** (`seulementEcoles`) : moins de trois onglets → page d'un seul tenant, pas de barre. Test : tâche 6.

---

### Task 1 : mécanisme d'onglets (composants, script, styles)

**Files :**
- Create : `site/src/components/Onglets.astro`, `site/src/components/Panneau.astro`, `site/public/js/onglets.js`
- Modify : `site/src/layouts/Base.astro` (classe `js` posée dans `<head>`), `site/src/styles/obs.css` (styles de la barre et des panneaux), `shared/src/libelles.ts` (`LIBELLES_ONGLETS`)
- Test : `tests/onglets.test.ts`

**Interfaces :**
- Produces :
  - `LIBELLES_ONGLETS: { synthese: "Synthèse"; eleves: "Élèves"; elevesClasses: "Élèves et classes"; social: "Composition sociale"; enseignants: "Enseignants"; resultats: "Résultats"; moyens: "Moyens"; moyensCommune: "Moyens de la commune"; alentours: "Alentours"; colleges: "Collèges"; lycees: "Lycées"; ecoles: "Écoles"; transport: "Transport"; territoires: "Territoires"; sources: "Sources"; barre: "Sections de la page" }`.
  - `type Onglet = { id: string; libelle: string }` exporté depuis `site/src/lib/onglets.ts` (avec `onglets(liste: (Onglet | false | null | undefined)[]): Onglet[]` qui filtre les absents, et `avecOnglets(o: Onglet[]): boolean` = `o.length >= 3`).
  - `<Onglets onglets={Onglet[]} />` : `<nav class="onglets" aria-label={LIBELLES_ONGLETS.barre}><div role="tablist">` puis pour chaque onglet `<a role="tab" id={"tab-" + id} href={"#" + id} aria-controls={id}>libelle</a>`. Rien n'est rendu si `!avecOnglets`.
  - `<Panneau id libelle actif={boolean} avecOnglets={boolean}><slot/></Panneau>` : `<div class="panneau" id role="tabpanel" aria-labelledby={"tab-" + id} data-onglet>` avec en premier enfant `<p class="titre-impression">{libelle}</p>` ; sans onglets, un simple `<div>` sans rôle ni `data-onglet`.
  - `onglets.js` : un IIFE `(function (w) { … })(window);` qui n'utilise que `w` (pour pouvoir être exécuté en test avec une fenêtre linkedom).

- [ ] **Step 1 : écrire les tests qui échouent** dans `tests/onglets.test.ts`. Le test construit une page minimale avec linkedom (`parseHTML`) : une barre de trois onglets `o-a`, `o-b`, `o-c`, trois panneaux, un `<section id="profond">` dans `o-c`. Il exécute `new Function("window", readFileSync("site/public/js/onglets.js", "utf8"))(w)` où `w` est la fenêtre linkedom complétée de `location = { hash }`, `history.replaceState` espion, `scrollTo` et `Element.prototype.scrollIntoView` espions, puis déclenche `DOMContentLoaded`.
  - `sans ancre : premier onglet actif` : `aria-selected="true"` sur `#tab-o-a`, `o-b` et `o-c` ont l'attribut `hidden`, `o-a` ne l'a pas.
  - `ancre d'onglet` : `hash = "#o-b"` → `o-b` visible, les autres masqués.
  - `ancre interne` : `hash = "#profond"` → `o-c` visible, `scrollIntoView` appelé sur `#profond`.
  - `clic` : clic sur `#tab-o-c` → `o-c` visible, `replaceState` appelé avec `"#o-c"`, `aria-selected` mis à jour, `tabindex="-1"` sur les onglets inactifs.
  - `clavier` : `keydown` `ArrowRight` sur l'onglet actif `o-a` → `o-b` actif et focus ; `End` → `o-c` ; `Home` → `o-a`.
  - `hashchange` : changer `location.hash` puis déclencher `hashchange` → l'onglet suit.
  - `lien interne` : un `<a href="#o-b">` hors barre, cliqué, ouvre `o-b`.
  - `beforematch` : événement `beforematch` sur `o-c` → `o-c` actif.
  - `repli hidden` : avec `w.HTMLElement.prototype` sans `onbeforematch`, les panneaux inactifs ont `hidden=""` (pas `until-found`) ; avec `onbeforematch` présent, `hidden="until-found"`.
  - `page sans onglets` : aucun `[data-onglet]` → le script ne fait rien et ne lève pas d'erreur.
- [ ] **Step 2 :** `bun test tests/onglets.test.ts` → FAIL (fichier absent).
- [ ] **Step 3 : implémenter** `site/src/lib/onglets.ts`, `Onglets.astro`, `Panneau.astro`, `onglets.js`, `LIBELLES_ONGLETS`.
  - Script : à `DOMContentLoaded`, ne rien faire sans `[data-onglet]` ; résoudre la cible = panneau dont l'`id` est l'ancre, sinon panneau `closest("[data-onglet]")` de l'élément d'`id` égal à l'ancre, sinon le premier ; activer (aria, `tabindex`, `hidden` / `hidden="until-found"` selon `"onbeforematch" in w.HTMLElement.prototype`) ; défiler vers l'élément interne s'il y en a un. Écouter `click` sur les `a[href^="#"]` du document (onglet ou ancre interne résolue → activer, `history.replaceState(null, "", "#" + id)`, `preventDefault`, puis remonter la page au haut de la barre si elle est passée au-dessus), `hashchange`, `beforematch` sur chaque panneau, `keydown` dans la barre (flèches gauche/droite, `Home`, `End`). À la fin, `document.documentElement.classList.add("onglets-prets")` et faire défiler horizontalement la barre pour rendre l'onglet actif visible (`scrollIntoView({ block: "nearest", inline: "nearest" })`).
  - Base.astro : `<script is:inline>document.documentElement.classList.add("js")</script>` dans `<head>`, avant `theme.js`.
  - CSS : `.onglets` collant sous l'en-tête (`position: sticky; top: 56px; z-index: 4; background: var(--surface)`), défilement horizontal, onglet `[aria-selected=true]` souligné (reprendre le style `.tabs a`) ; anti-flash : `html.js:not(.onglets-prets) [data-onglet]:not(:first-of-type) { display: none }` ; `.titre-impression { display: none }` à l'écran.
- [ ] **Step 4 :** `bun test tests/onglets.test.ts` → PASS ; `bun run typecheck` → OK.
- [ ] **Step 5 : commit** `feat(onglets): barre d'onglets, panneaux et script de navigation`.

### Task 2 : impression complète et boutons d'impression

**Files :**
- Modify : `site/src/styles/obs.css` (blocs `@media print` des lignes ~100 et ~171), `site/src/components/Entete.astro` (boutons), `site/public/js/fiche.js` (bouton « Tout imprimer »), `shared/src/libelles.ts` (`LIBELLES_ONGLETS.ficheA4 = "⎙ Fiche A4"`, `LIBELLES_ONGLETS.toutImprimer = "⎙ Tout imprimer"`)
- Test : `tests/onglets.test.ts` (ajouts), `tests/site-pages.test.ts`

**Interfaces :**
- Consumes : `Panneau` (`[data-onglet]`, `.titre-impression`) et `.onglets` de la tâche 1.
- Produces : boutons `#imprimer` (fiche A4, libellé `LIBELLES_ONGLETS.ficheA4`) et `#imprimer-tout` dans `Entete.astro` ; classe `impression-complete` posée sur `<html>` pendant l'impression complète.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - `tests/onglets.test.ts` › `CSS d'impression` : le texte de `site/src/styles/obs.css` contient, dans un bloc `@media print`, une règle dont le sélecteur couvre `[data-onglet][hidden]` avec `display: block !important` et `content-visibility: visible`, une règle masquant `.onglets`, une règle affichant `.titre-impression`, une règle `break-inside: avoid` sur `.card`, et la règle qui masque tout sauf `.a4` est préfixée `html:not(.impression-complete)` ; une règle `html.impression-complete .a4 { display: none !important }` existe.
  - `tests/onglets.test.ts` › `tout imprimer` : exécuter `fiche.js` dans une fenêtre linkedom contenant `#imprimer-tout`, avec `w.print` espion ; clic → `impression-complete` présente sur `<html>` au moment de l'appel à `print` ; `afterprint` → classe retirée.
  - `tests/site-pages.test.ts` › fiche `etablissement/0440001A` : `#imprimer` a pour texte `LIBELLES_ONGLETS.ficheA4`, `#imprimer-tout` existe.
- [ ] **Step 2 :** `bun test tests/onglets.test.ts tests/site-pages.test.ts` → FAIL.
- [ ] **Step 3 : implémenter.** `fiche.js` : `#imprimer-tout` ajoute la classe, appelle `window.print()`, retire la classe à `afterprint`. Pages de territoire : le bouton `#imprimer` existant imprime toute la page (aucune `.a4`), seule la règle des panneaux s'applique.
- [ ] **Step 4 :** tests → PASS ; `bun run build` → OK.
- [ ] **Step 5 : commit** `feat(onglets): impression complète et bouton Fiche A4`.

### Task 3 : chiffres de Synthèse (fonctions pures)

**Files :**
- Create : `site/src/lib/synthese.ts`
- Modify : `shared/src/libelles.ts` (`LIBELLES_SYNTHESE`)
- Test : `tests/synthese.test.ts`

**Interfaces :**
- Consumes : `Fiche`, `ResultatsVoie` (`shared/src/types.ts`), `DonneesTerritoire`, `SyntheseFamille`, `BudgetCollectivite`, `MoyennesBudgetFrance` (`shared/src/donnees.ts`), `tauxEntier`, `vaSignee` (`site/src/lib/resultats.ts`), `montantBudget` (`site/src/lib/budget.ts`).
- Produces :
  - `resultatsSynthese(f: Fiche): { voie: string; session: number; taux: string | null; va: string | null }[]` — une ligne par voie de `f.resultats`, le taux de réussite (`code === "taux_reussite"`) via `tauxEntier`, la valeur ajoutée via `vaSignee` si `statutVa === "ok"`, sinon `null`. Libellé de voie : `LIBELLES_RESULTATS.voies[voie]` existant. `[]` si aucune voie.
  - `moyensSynthese(budget: BudgetCollectivite | null, france: MoyennesBudgetFrance | undefined, secteur: "public" | "prive", niveau: NiveauBudget): { exercice: number; texte: string; absent: boolean; france: string | null } | null` — dernier exercice ; public : `public.horsPersonnel`, privé : `prive.fonctionnement`, mis en forme par `montantBudget` ; `france` = moyenne France du même poste et du même exercice (`entier`), `null` si absente ; `null` si pas de budget.
  - `totalSecondDegre(familles: [Famille, SyntheseFamille][]): { eleves: number | null; prive: number | null; partPrive: number | null; nonPubliees: Famille[] }` — somme des `eleves.public` et `eleves.prive` connus ; `nonPubliees` = familles qui ont au moins un établissement et un effectif `null` dans un secteur ; `partPrive` = `prive / eleves` (null si `eleves` est nul ou 0).
  - `moyensTerritoire(d: DonneesTerritoire): ReturnType<typeof moyensSynthese> & { libelle: string } | null` — département : collectivité `niveau === "colleges"` de `d.budget.collectivites` (seule) ; région : collectivité `niveau === "lycees"` ; France : moyenne France collèges, poste `public.horsPersonnel` du dernier exercice ; académie et commune : `null`. `libelle` issu de `LIBELLES_SYNTHESE`.
  - `LIBELLES_SYNTHESE = { resultats: "Résultats"; va: "valeur ajoutée"; moyens: "Fonctionnement par élève"; moyensPrive: "Contribution par élève"; elevesSecondDegre: "Élèves en collège et lycée"; sommeFamilles: "somme des familles d'établissements"; horsFamilles: (f: string[]) => string /* « hors Lycées pro (effectif non publié) » */; partPrive: "Part du privé sous contrat"; ipsColleges: "IPS moyen des collèges" }`.

- [ ] **Step 1 : écrire les tests qui échouent** dans `tests/synthese.test.ts`, sur des objets construits à la main (pas de build) :
  - `resultatsSynthese` : brevet session 2025 taux 91,2 VA 2 → `[{ voie: <libellé brevet>, session: 2025, taux: tauxEntier(91.2), va: vaSignee(2) }]` ; VA `statutVa: "sans_objet"` → `va: null` ; taux absent (`statut` ≠ `ok`) → `taux: null` ; deux voies → deux lignes dans l'ordre de `f.resultats` ; aucune voie → `[]`.
  - `moyensSynthese` : public, dernier exercice 2024 `horsPersonnel.parEleve = 1280`, France 1100 → `{ exercice: 2024, texte: entier(1280), absent: false, france: entier(1100) }` ; statut `personnel_non_rattache` → `absent: true` et texte de `absenceBudget` ; privé → poste `prive.fonctionnement` ; `budget = null` → `null`.
  - `totalSecondDegre` : collèges 600/200 et lycées 400/100 → `{ eleves: 1300, prive: 300, partPrive: 300/1300, nonPubliees: [] }` ; lycées pro avec `eleves.prive = null` et `compte.prive = 2` → total sans eux pour le privé et `nonPubliees: ["lp"]` ; `compte.prive = 0` et `eleves.prive = null` → pas dans `nonPubliees`.
  - `moyensTerritoire` : niveaux département, région, France → valeur ; académie et commune → `null`.
- [ ] **Step 2 :** `bun test tests/synthese.test.ts` → FAIL.
- [ ] **Step 3 : implémenter** `site/src/lib/synthese.ts` et `LIBELLES_SYNTHESE`.
- [ ] **Step 4 :** `bun test tests/synthese.test.ts` → PASS ; `bun run typecheck` → OK.
- [ ] **Step 5 : commit** `feat(synthese): chiffres de synthèse des fiches et des territoires`.

### Task 4 : fiche collège, lycée, EREA en onglets

**Files :**
- Create : `site/src/components/SyntheseSecondDegre.astro`
- Modify : `site/src/components/FicheSecondDegre.astro` (remplacer `nav.toc` et le `Bandeau` en tête par `Onglets` + panneaux)
- Test : `tests/site-pages.test.ts`, `tests/site-resultats.test.ts:53`, `tests/site-budget.test.ts:26,389,409`, `tests/site-ecoles.test.ts:288` (passer de `nav.toc a` à `nav.onglets a` et des ancres de section aux `#o-…`, sans retirer d'assertion)

**Interfaces :**
- Consumes : `Onglets`, `Panneau`, `onglets()`, `avecOnglets()` (tâche 1) ; `resultatsSynthese`, `moyensSynthese` (tâche 3).
- Produces : panneaux `o-synthese` (Bandeau + cases Résultats et Moyens + courbes effectifs `svgBarres(iEleves.historique)` et IPS `svgCourbe(...)` comme dans `#eleves` et `#social`), `o-eleves` (`#eleves`), `o-social` (`#social`), `o-enseignants` (`#ens`, `#vs`), `o-resultats` (`BlocResultats`), `o-moyens` (`#moyens`), `o-alentours` (`Voisins`, `BlocEcolesSecteur`, `#pial`), `o-sources` (`Sources`). `FicheA4` reste hors panneaux, à la fin.

- [ ] **Step 1 : écrire les tests qui échouent** (`tests/site-pages.test.ts`, `describe("fiche en onglets")`) sur `etablissement/0440001A` et `etablissement/0440003C` (lycée) :
  - les `href` de `nav.onglets a` valent, dans l'ordre, `#o-synthese, #o-eleves, #o-social, #o-enseignants, #o-resultats, #o-moyens, #o-alentours, #o-sources` ;
  - `#o-synthese .kpis` contient la case Résultats : son texte contient la session et le taux affichés dans `#resultats` pour la même voie (lire les deux dans le HTML et comparer) et, si `#resultats` affiche une valeur ajoutée, la même valeur ;
  - `#o-synthese` contient deux `svg[role=img]` ;
  - la case Moyens de `#o-synthese` affiche le même montant par élève que la ligne « fonctionnement hors personnel » de `#moyens` ;
  - ancre historique : `#pial` (fiche qui a un PIAL) et `#voisins` sont à l'intérieur de `#o-alentours` ; `#vs` à l'intérieur de `#o-enseignants` ;
  - aucune case n'a de classe de couleur de jugement (pas de `.bon`, `.mauvais`, pas de rang) dans la case Résultats.
- [ ] **Step 2 :** `bun test tests/site-pages.test.ts` → FAIL.
- [ ] **Step 3 : implémenter** `SyntheseSecondDegre.astro` (props `f: Fiche`) et le découpage de `FicheSecondDegre.astro`. Ajouter `<script is:inline src="/js/onglets.js" defer>` dans `site/src/pages/etablissement/[uai].astro`.
- [ ] **Step 4 :** mettre à jour les tests existants listés plus haut ; `bun test` → PASS.
- [ ] **Step 5 : commit** `feat(onglets): fiche collège et lycée en onglets avec synthèse`.

### Task 5 : fiche école en onglets

**Files :**
- Create : `site/src/components/ChiffresEcole.astro` (le bloc `.kpis.chiffres` extrait de `FicheEcole.astro:82-100`, inchangé), `site/src/components/SyntheseEcole.astro`
- Modify : `site/src/components/FicheEcole.astro`
- Test : `tests/site-ecoles.test.ts:222-224` (ordre des onglets au lieu de `nav.toc`), `tests/site-pages.test.ts`

**Interfaces :**
- Consumes : tâches 1 et 3 (`moyensSynthese(f.budget.ecoles ?? null, france ecoles, "public", "ecoles")`).
- Produces : panneaux `o-synthese` (`ChiffresEcole` + case Moyens si budget + courbe `svgElevesClasses`), `o-eleves` (`#eleves`, `#classes`, avec `ChiffresEcole`), `o-social`, `o-enseignants`, `o-moyens` (si `f.budget.ecoles !== undefined`), `o-alentours` (`BlocRattachements`, `BlocEcolesProches`, si l'un existe), `o-sources`.

- [ ] **Step 1 : écrire les tests qui échouent** sur une école publique et une école privée des fixtures (`tests/site-ecoles.test.ts`) : ordre des `href` de `nav.onglets a` ; école privée sans `o-moyens` ; `#o-synthese .kpis` et `#o-eleves .kpis` ont le même texte ; `#rattachements` est dans `#o-alentours` quand il existe.
- [ ] **Step 2 :** `bun test tests/site-ecoles.test.ts` → FAIL.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 :** `bun test` → PASS.
- [ ] **Step 5 : commit** `feat(onglets): fiche école en onglets avec synthèse`.

### Task 6 : pages de territoire en onglets

**Files :**
- Create : `site/src/components/SyntheseTerritoire.astro`
- Modify : `site/src/components/Territoire.astro` (supprimer `nav.tabs`, ajouter `id="communes"` à la section Communes et `id="sources"` à la section Sources, découper en panneaux), `site/src/styles/obs.css` (retirer `.tabs` s'il n'est plus utilisé)
- Test : `tests/site-pages.test.ts:19`, `tests/site-territoires.test.ts:137`, `tests/site-transport.test.ts`, `tests/site-resultats.test.ts` (sélecteurs inchangés si les `id` de sections le sont ; seules les assertions sur `.tabs` changent)

**Interfaces :**
- Consumes : tâches 1 et 3 (`totalSecondDegre`, `moyensTerritoire`).
- Produces : panneaux, chacun rendu seulement s'il a du contenu :
  - `o-synthese` : carte (`CarteTerritoire`), `.kpis` actuels, case « Élèves en collège et lycée » (+ part du privé, + mention `horsFamilles` si `nonPubliees` non vide), case IPS moyen des collèges (le même rendu que la case IPS de `section#college`), case Moyens (`moyensTerritoire`), courbe IPS des collèges si `ipsHistorique.length >= 2`. Page `seulementEcoles` : la Synthèse n'a que la case Moyens de la commune et la case écoles de `BlocEcolesCommune` si elles existent.
  - `o-colleges` : `section#college`.
  - `o-lycees` : sections `#legt`, `#lpo`, `#lp`, `#erea` existantes.
  - `o-ecoles` : `BlocPremierDegre` ou `BlocEcolesCommune`.
  - `o-transport` : `BlocTransport` (un ou deux).
  - `o-resultats` : `#nuages`.
  - `o-territoires` : `#regions`, `#territoires`, `#academies`, `#communes`.
  - `o-moyens-commune` : `#moyens-commune`.
  - `o-sources` : `#sources`.

- [ ] **Step 1 : écrire les tests qui échouent** (`tests/site-territoires.test.ts`, `describe("territoires en onglets")`) :
  - `departement/44` : `href` de `nav.onglets a` = `#o-synthese, #o-colleges, #o-lycees, #o-ecoles, #o-transport, #o-territoires, #o-sources` (retirer ceux que les fixtures n'ont pas, en le constatant sur le build) ; `#premier-degre` dans `#o-ecoles` ; `#lp` (ou la famille de lycée présente) dans `#o-lycees` ; la case « Élèves en collège et lycée » vaut la somme des cases « Élèves » de chaque `section` de famille (lire et additionner dans le test) ;
  - `departement/44` : la case Moyens de `#o-synthese` affiche le même montant que le bloc Moyens de `#college` ;
  - `academie/17` : pas de case Moyens dans `#o-synthese` ;
  - `france` : `#regions` et `#territoires` dans `#o-territoires` ;
  - une commune `seulementEcoles` des fixtures : pas de `nav.onglets`, pas de `[data-onglet]` ;
  - `commune/44109` : `#o-moyens-commune` existe si `#moyens-commune` existe.
- [ ] **Step 2 :** `bun test tests/site-territoires.test.ts` → FAIL.
- [ ] **Step 3 : implémenter** `SyntheseTerritoire.astro` (props `d: DonneesTerritoire`, `familles`, `niveau`) et le découpage ; `onglets.js` chargé à côté de `liste.js`.
- [ ] **Step 4 :** mettre à jour `tests/site-pages.test.ts:19` (onglets au lieu de `.tabs`) et `tests/site-territoires.test.ts:137` (`nav.onglets a[href='#o-ecoles']`) ; `bun test` → PASS ; `bun run build` → OK (garde-fous).
- [ ] **Step 5 : commit** `feat(onglets): pages de territoire en onglets avec synthèse`.

### Task 7 : vérification dans le navigateur

**Files :** aucun (corrections éventuelles dans les fichiers des tâches précédentes, avec leur test).

- [ ] **Step 1 :** `bun run build`, puis servir `dist/` (configuration `.claude/launch.json` à créer si absente, par exemple `bunx serve dist -l 4321`) et l'ouvrir avec l'aperçu du navigateur.
- [ ] **Step 2 :** sur `/departement/44/`, `/france/`, une fiche collège et une fiche école : onglet par défaut Synthèse ; clic sur chaque onglet ; `/departement/44/#premier-degre` ouvre Écoles et y défile ; flèches clavier ; barre collante sous l'en-tête en défilant ; aucune erreur console (`read_console_messages`).
- [ ] **Step 3 :** largeur mobile (`resize_window` preset `mobile`) : barre défilante horizontalement, onglet actif visible ; thème sombre.
- [ ] **Step 4 :** JavaScript désactivé (charger la page avec le script bloqué, ou retirer la classe `js` et `onglets-prets` puis vérifier que les panneaux sont visibles via `read_page`).
- [ ] **Step 5 :** captures d'écran (bureau et mobile) de la Synthèse d'une fiche et d'un département, jointes au rapport. Commit des corrections s'il y en a.
