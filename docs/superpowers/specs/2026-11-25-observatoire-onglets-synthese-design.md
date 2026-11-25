# Observatoire citoyen de l'éducation : pages en onglets avec synthèse

Date : 2026-11-25. Statut : conception, en attente d'approbation.
Concerne toutes les pages de fiche et de territoire du site (`site/`). Ne change ni le pipeline ni les données.

## 1. Intention

Les pages s'allongent à chaque phase (budget, résultats, écoles, transport) : on ne voit plus ce qu'elles contiennent ni ce qui compte. Chaque page s'ouvre désormais sur une **Synthèse** (les chiffres forts, une ou deux courbes), et le reste est rangé dans des **onglets**. L'impression peut toujours sortir **toutes** les données, sur autant de pages qu'il faut.

Lecteurs : parents, élus locaux, journalistes, équipes des établissements.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Une Synthèse en tête de chaque page de fiche (collège, lycée, EREA, école) et de territoire (commune, département, académie, région, France).
- Le détail en onglets, une barre d'onglets qui reste visible en haut de l'écran et sert de sommaire.
- Impression complète de la page, tous onglets dépliés. Sur les fiches, la fiche A4 d'une page existante reste disponible à côté.
- Les liens existants vers une ancre (`#college`, `#lycee_pro`, `#transport`, `#pial`, `#resultats`…) ouvrent le bon onglet et descendent jusqu'au bloc.

**Non-objectifs**
- Alléger le poids des pages (page France 1,2 Mo) : tout le contenu reste dans le HTML. Sujet séparé.
- Une adresse par onglet (pages distinctes).
- Changer le contenu des blocs eux-mêmes, hors Synthèse.
- Toucher aux pages Accueil, Sources, Méthode.

**Anti-objectifs** (échec même si tout fonctionne)
- Une Synthèse qui fait la course aux établissements : la réussite y figure, mais comme un chiffre parmi d'autres (voir 5.1).
- Du contenu inaccessible sans JavaScript, à l'impression, aux moteurs de recherche ou à la recherche dans la page (Ctrl+F).
- Un lien partagé (`…/departement/44/#lycee_pro`) qui ouvre la page sur le mauvais onglet.
- Un chiffre de Synthèse qui contredit le chiffre détaillé de son onglet (même source, même millésime, même formatage).

## 3. Contraintes

- Site statique Astro, scripts « vanilla » chargés en `is:inline` depuis `site/public/js/` (comme `fiche.js`, `liste.js`). Pas de framework client.
- Les graphiques sont des SVG rendus au build (`lib/plot.ts`) : la Synthèse réutilise ces fonctions, pas de nouvelle bibliothèque.
- L'en-tête `.top` est déjà collant (`position:sticky; top:0`, 56 px) : la barre d'onglets se colle juste en dessous.
- Garde-fous de build (`scripts/garde-fous.ts`) et tests de pages (`tests/site-*.test.ts`) à garder verts ; les tests qui vérifient des ancres sont à mettre à jour, pas à affaiblir.
- Libellés dans `shared/src/libelles.ts`, comme le reste du site.

## 4. Approches

| Approche | Principe | Pour | Contre |
|---|---|---|---|
| **A. Onglets côté client (retenue)** | Tout le contenu reste dans la page ; un petit script affiche l'onglet désigné par l'ancre et masque les autres. | Conforme à l'architecture actuelle ; sans JS tout s'affiche ; impression et référencement inchangés ; liens existants préservés. | Pages aussi lourdes qu'aujourd'hui. |
| B. Une adresse par onglet | `/departement/44/colleges/`… | Pages légères, référencement par onglet. | Pages ×5 à ×6 (build, sitemap, garde-fous), page d'impression à part, liens existants cassés. |
| C. CSS seul (`:target`) | Aucun script. | Zéro JS. | Pas d'onglet ouvert par défaut, saut d'ancre au clic, onglet actif difficile à surligner. |

Choix de l'utilisateur : **A**.

## 5. Contenu des pages

Principe : un onglet sans contenu n'est pas affiché. Les blocs existants sont déplacés tels quels dans leur onglet ; leurs `id` de section sont conservés.

### 5.1 Fiche collège, lycée, EREA (`FicheSecondDegre.astro`)

Onglets : **Synthèse** · Élèves · Composition sociale · Enseignants (avec la vie scolaire) · Résultats · Moyens · Alentours (voisins, écoles du secteur, PIAL) · Sources.

Synthèse :
- Cases de chiffres (`.kpis`) : élèves (dernière rentrée, et évolution sur la période disponible) ; IPS (avec la moyenne du département en repère) ; **Résultats** ; élèves par enseignant ou ratio équivalent déjà affiché dans l'onglet Enseignants ; dépense par élève de la collectivité (onglet Moyens).
- Deux graphiques côte à côte : la courbe des effectifs et la courbe de l'IPS avec ses références (département, France), reprises des blocs Élèves et Composition sociale.
- Case Résultats : taux de réussite au brevet ou au bac de la dernière session, avec la **valeur ajoutée publiée juste à côté** et l'année de session. Même taille que les autres cases, aucun classement, aucune couleur « bon / mauvais ». Un lycée à plusieurs voies (GT et pro) : une ligne par voie dans la même case. Sans résultat publié : l'absence est dite (comme dans le bloc Résultats).

### 5.2 Fiche école (`FicheEcole.astro`)

Onglets : **Synthèse** · Élèves et classes · Composition sociale · Enseignants · Moyens · Alentours (rattachements RPI, écoles proches) · Sources.

Synthèse : élèves, nombre de classes et élèves par classe, IPS (repère département), dépense de la commune par élève ; courbe des effectifs.

### 5.3 Département, académie, région, France (`Territoire.astro`)

Onglets : **Synthèse** · Collèges · Lycées · Écoles · Transport · Résultats · Territoires · Sources.

- **Lycées** regroupe lycées GT, polyvalents, professionnels et EREA, un intertitre (`h2`, `id` de famille conservé) par catégorie. Les « moyens des régions » y figurent une fois, comme aujourd'hui (`premierLycee`).
- **Territoires** : départements, académies, régions ou communes selon le niveau (sections `regions`, `territoires`, `academies`, `Communes`).
- Synthèse : la carte ; les cases actuelles (établissements par famille, privé hors contrat, déplacées telles quelles) ; élèves en collège et lycée et part du privé sous contrat ; IPS moyen public et privé des collèges (la valeur de la case de l'onglet Collèges) ; une case Moyens ; courbe de l'IPS des collèges public et privé (`ipsHistorique` de la famille collège). Pas de case Résultats.
- **Élèves en collège et lycée** et **part du privé** : somme, au build, des effectifs par famille déjà affichés dans les onglets (second degré seulement, écoles exclues). Il n'apparaît qu'en Synthèse, et son libellé dit qu'il est la somme des familles, ce qui le rend vérifiable onglet par onglet. Si une famille a un effectif non publié, le total le dit (« hors … ») plutôt que de sous-compter en silence. Aucun changement de pipeline.
- **Case Moyens** selon le niveau : département → dépense par collégien du département ; région → dépense par lycéen de la région ; France → moyenne France des collèges (celle du bloc Moyens) ; académie → pas de case (plusieurs collectivités, aucune valeur unique ; le tableau reste dans l'onglet Collèges).

### 5.4 Commune (`Territoire.astro`, niveau commune)

Même liste d'onglets que 5.3 (un onglet vide est masqué), plus **Moyens de la commune** avant Sources. Tous les blocs affichés aujourd'hui sur une page commune gardent leur place dans l'onglet de leur famille ou de leur thème : rien n'est supprimé. La carte et les cases actuelles vont dans la Synthèse.

Synthèse : carte et cases actuelles, élèves en collège et lycée (même règle qu'en 5.3), IPS moyen calculé des collèges (public, privé), écoles de la commune, dépense de la commune par élève.
Commune sans second degré (`seulementEcoles`) : mêmes règles ; s'il reste moins de trois onglets, pas de barre d'onglets, la page reste d'un seul tenant.

## 6. Comportement

**Onglets**
- Motif ARIA des onglets : `role="tablist"`, `tab`, `tabpanel`, `aria-selected`, flèches gauche/droite, Début/Fin.
- Chaque onglet a une ancre ; ses `id` ne doivent pas entrer en collision avec les `id` de sections existants (`ecoles` existe déjà, par exemple).
- À l'arrivée et à chaque `hashchange` : si l'ancre désigne un onglet, il s'ouvre ; si elle désigne un élément **à l'intérieur** d'un onglet, cet onglet s'ouvre puis la page défile jusqu'à l'élément. Sans ancre : Synthèse.
- Changer d'onglet met à jour l'adresse (`history.replaceState`, pas d'entrée d'historique par clic) et remonte en haut de la barre d'onglets.
- Les liens internes à la page (cases de Synthèse vers leur onglet, `segregation-renvoi`…) passent par le même mécanisme.
- Barre collante sous l'en-tête, défilement horizontal sur mobile, onglet actif ramené dans la zone visible.

**Sans JavaScript** : tous les panneaux visibles les uns sous les autres, la barre sert de sommaire par ancres (comportement actuel). Pas de flash de tout le contenu au chargement quand le JS est actif.

**Recherche dans la page** : panneaux masqués avec `hidden="until-found"` là où le navigateur le prend en charge ; l'événement `beforematch` ouvre l'onglet qui contient le résultat.

**Impression**
- Pages de territoire : un bouton « Imprimer / PDF » qui imprime toute la page, tous panneaux visibles, barre d'onglets masquée, chaque panneau précédé de son titre.
- Fiches : deux boutons dans `Entete.astro`. L'actuel « ⎙ Imprimer / PDF » devient « ⎙ Fiche A4 » (même comportement, la fiche `FicheA4.astro` inchangée) ; un nouveau « Tout imprimer » pose une classe sur `<html>` qui bascule le CSS d'impression en mode « page complète », lance `window.print()` et retire la classe à `afterprint`. Ctrl+P garde le comportement actuel (fiche A4).
- Les graphiques ne sont pas coupés entre deux pages (`break-inside: avoid` sur les cartes).

## 7. Ce qui est laissé au constructeur

- Nommage des `id` d'onglets, découpage en composants (un composant `Onglets` commun est attendu), nom du script (`onglets.js` ou ajout à `fiche.js`).
- Choix exact du ratio « élèves par enseignant » de la Synthèse parmi ceux déjà calculés.
- Mise en page de la Synthèse (grille des cases et des graphiques), dans le style existant (`.kpis`, `.card`, `.cols2`).
- Mise à jour des tests de pages et ajout de tests : présence de la Synthèse, ancres historiques résolues vers le bon onglet, contenu complet présent dans le HTML.
