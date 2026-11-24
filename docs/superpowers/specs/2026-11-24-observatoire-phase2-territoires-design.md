# Observatoire citoyen de l'éducation : phase 2, pages de territoire et cartes

Date : 2026-11-24. Statut : validé par le porteur le 2026-11-24.
Complète : `2026-11-23-observatoire-citoyen-education-design.md` (la spec) et `2026-11-23-observatoire-socle-et-maquettes-design.md` (le socle). En cas de conflit sur le périmètre de la phase 2, ce document l'emporte.

## 1. Intention

La phase 1 a mis en ligne les fiches établissement, les pages département, l'accueil, la recherche, `/sources/` et `/methode/`. Le site est indexé depuis le 2026-11-24 et n'a pas encore d'utilisateurs.

La phase 2 **termine le site public consultable**, et vite : chaque territoire (France, académie, département, grande commune) a sa page, et le fil d'Ariane devient entièrement cliquable. Les outils d'exploration libre des données attendront qu'il y ait un public.

## 2. Périmètre redécoupé (décision du porteur)

| Phase | Contenu |
|---|---|
| **2 (ce document)** | Pages France, académie et commune ; cartes SVG des territoires ; fil d'Ariane complet |
| 3 | Budget des collectivités en euros par élève (inchangé) |
| 4 | IVAC / IVAL, indice de ségrégation, IPS 2016-2022, successeurs, corrections de millésime (inchangé) |
| **5 (nouvelle)** | Exploration des données : `/donnees/` (Parquet par millésime), explorateur, éventuellement API. Peut devenir un outil séparé, dynamique, relié à une base de données, sur un sous-domaine. À concevoir le moment venu (le MCP open data de l'État existe déjà : l'intérêt d'un MCP propre est à discuter). |

**Sortis de la phase 2** (ils étaient prévus par le socle, section 2.4 et 2.7) : explorateur DuckDB-WASM, `/explorer/`, `/donnees/`, publication des Parquet. Conséquence : aucun fichier lourd à héberger, la contrainte de taille de GitHub Pages reste lointaine.

**À noter pour plus tard (idée du porteur)** : des données comparatives par agglomération (intercommunalité, métropole), qui regrouperaient plusieurs communes. Hors phase 2. Piste repérée le 2026-11-24 : l'Annuaire de l'éducation, déjà collecté, porte un **bassin de formation** (`code_bassin_formation`, `libelle_bassin_formation`), renseigné pour environ 72 % des collèges. C'est un découpage de l'Éducation nationale propre au second degré, plus proche des secteurs de recrutement qu'une intercommunalité. Il porte aussi la **circonscription** (`code_circonscription`), notion du premier degré, utile pour les écoles en v2. La DEPP ne publie pas de moyenne d'IPS à ces échelles : il faudrait la calculer et l'annoncer comme telle.

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Une page **France** (`/france/`), une page par **académie** (`/academie/<code>/`, 31 pages, Saint-Pierre-et-Miquelon compris), une page par **commune comptant au moins 3 établissements** couverts (`/commune/<INSEE>/`, environ 1 040 pages).
- Des **cartes SVG statiques** sur les pages France, académie, département et commune.
- Le **fil d'Ariane** France › Académie › Département › Commune devient cliquable à chaque maillon qui a une page ; une commune sans page reste du texte simple.
- Les liens d'entrée : l'accueil (« Parcourir par territoire ») pointe vers les pages France et académie ; la liste des communes de la page département pointe vers les pages communes qui existent ; la recherche propose les communes qui ont une page.

**Non-objectifs**
- Tout ce qui est passé en phase 5 (section 2).
- Les pages communes sous le seuil de 3 établissements.
- Les pages par agglomération.
- Les indicateurs des phases 3 et 4 (budget, ségrégation, valeur ajoutée) : leurs emplacements restent absents, comme en phase 1.

**Anti-objectifs** (ceux de la spec s'appliquent tous ; rappel de ceux que la phase 2 touche directement)
- **Pas de palmarès** : aucune carte ni liste ne met en avant les extrêmes. Tri par nom par défaut, aucun rang affiché. Les cartes colorent des territoires sur une échelle continue, sans classes « meilleurs / pires » ni mise en valeur des premiers ou derniers.
- **Pas de chiffre sans source ni millésime**, y compris sur les cartes (légende avec source et rentrée).
- **Pas d'absence qui passe pour un zéro** : un territoire sans valeur est grisé avec la mention « non disponible » dans la légende.
- **Pas de page creuse** : le seuil de 3 établissements évite des pages communes qui répéteraient une seule fiche, alors que le site est désormais indexé.

## 4. Contraintes

- Celles de la phase 1 : site statique sur GitHub Pages, zéro JavaScript requis pour lire une page, impression propre, collecte limitée à quelques requêtes par source et par nuit.
- **Poids** : le build fait 525 Mo pour 11 440 fichiers ; garde-fou à 900 Mo et 50 000 fichiers. Estimation de la phase 2 : environ 1 070 pages de plus, de l'ordre de 50 à 100 Mo. À vérifier au build ; si le garde-fou est atteint, la règle du socle s'applique (passage à Cloudflare Pages sans changer les URL).
- **URL permanentes** : celles du socle, section 2.6 (`/france/`, `/academie/17/`, `/commune/44109/`).

## 5. Approches envisagées

**Organisation des pages de territoire**
- **A. Gabarit unique de territoire (retenue par le porteur).** La page département devient un gabarit commun aux quatre niveaux ; le pipeline produit un seul format de données par territoire. Les règles (moyennes, absences, anti-palmarès) sont écrites une fois et les phases 3 et 4 n'auront qu'un endroit à modifier. Coût : réorganiser d'abord la page département.
- **B. Une page par niveau, copiée sur la page département.** Plus rapide au départ, mais quatre copies qui divergent et que chaque phase suivante doit modifier. Écartée.

**Cartes** : une seule voie raisonnable. Contours IGN, simplifiés par le pipeline, rendus en SVG par Plot au build, sans fond de carte ni JavaScript (conforme au socle, section 2.3). Les cartes interactives MapLibre restent réservées à la carte d'une fiche, chargée au clic.

**Pages communes** : seuil de 3 établissements (retenu par le porteur) plutôt que les 22 métropoles (pages intercommunales, nouvelle source, aucune page pour les villes moyennes).

## 6. Ce qui est décidé

### 6.1 Gabarit de territoire

Un gabarit pour les quatre niveaux, dérivé de la page département actuelle (onglets par type d'établissement, bandeau, composition sociale, moyennes, liste, sources). Chaque niveau active ou non des blocs :

| Bloc | France | Académie | Département | Commune |
|---|---|---|---|---|
| Bandeau (établissements public / privé, élèves, part du privé, IPS moyens, hors contrat) | oui | oui | oui (existant) | oui, IPS moyens calculés (6.4) |
| Carte | départements colorés (A / B) | départements de l'académie colorés (A / B) | établissements en points (D) | établissements en points (D) |
| Distribution des IPS public / privé | oui | oui | oui (existant) | non |
| Moyennes face aux niveaux supérieurs | — (niveau le plus haut) | face à la France | face à l'académie et à la France (existant) | non |
| Liste | académies, avec leurs chiffres et liens | départements de l'académie, avec leurs chiffres et liens | établissements (existant) | établissements, valeurs brutes |
| Liste des communes ayant une page | non | non | oui (existant, avec liens) | non |
| Téléchargement CSV | oui (une ligne par académie) | oui (une ligne par département) | oui (existant) | oui |

La page commune se limite, comme le prévoit le socle (section 4.4), à la liste de ses établissements avec leurs valeurs brutes, une carte, un court bandeau (dont les IPS moyens calculés, section 6.4, situés face à la moyenne DEPP du département) et un lien vers son département.

### 6.2 Cartes (choisies par le porteur sur maquettes)

- **Pages France et académie : carte des départements colorée**, avec deux vues au choix :
  - **A. Part des élèves scolarisés dans le privé sous contrat** (tous établissements de second degré couverts) ;
  - **B. Écart d'IPS moyen privé − public des collèges**, en points d'IPS. *(Choix de conception, d'après la règle du socle « moyennes d'IPS publiées par la DEPP, non recalculées ») :* l'écart se calcule entre les deux moyennes départementales publiées par la DEPP pour les collèges (`dep_prive − dep_public`), déjà lues par `ipsMoyens()` dans `pipeline/src/fiches.ts`. Aucune moyenne d'IPS n'est recalculée.
  Échelle de couleur continue, une teinte par vue (orangé pour A, violet pour B, cohérents avec les couleurs du privé et du public du site), légende avec bornes, source et rentrée. Un département sans valeur (par exemple sans collège privé) est grisé et dit « non disponible ».
- **Pages département et commune : un point par établissement**, plein pour le public, anneau pour le privé, taille selon le nombre d'élèves (vue D, celle de la maquette validée). Fond : contour du territoire (et des communes pour la page département). Pas de couleur selon un indicateur.
- La France affiche la métropole (Corse comprise, à sa place) et les **cinq DROM en encarts**. Un territoire sans contour IGN est cité sous la carte, pas dessiné.
- Écarté (maquettes) : un point par établissement sur la carte de France (illisible, lourd) ; des points colorés selon l'IPS sur les pages département (attire l'œil vers les extrêmes).

### 6.3 Pages communes

- Une page pour chaque commune qui compte **au moins 3 établissements couverts** (publics et privés sous contrat, hors établissements disparus) ; environ 1 040 communes avec les données actuelles. Le seuil est recalculé à chaque build : une commune qui passe sous le seuil perd sa page.
- **Paris, Lyon et Marseille** : une seule page par ville (codes INSEE 75056, 69123, 13055), l'arrondissement figurant dans la liste des établissements.
- Identifiant : code INSEE de la commune (`codeCommune` de la fiche).

### 6.4 Moyennes que la DEPP ne publie pas (décision du porteur)

La règle du socle (« moyennes d'IPS publiées par la DEPP, non recalculées ») est précisée :
- **Quand la DEPP publie une moyenne** (département, académie, France), c'est elle qu'on affiche. On ne la recalcule pas.
- **Quand elle n'en publie pas** (commune en phase 2 ; bassin de formation ou circonscription plus tard), l'observatoire la calcule lui-même et l'affiche comme telle. Pour la phase 2, cela concerne l'**IPS moyen public et privé dans le bandeau de la page commune**.

Modalités *(choix de conception)* :
- **Pondération par les effectifs**, comme les moyennes de la DEPP. Contrôle dans les tests : la même formule appliquée aux départements doit retrouver les moyennes publiées par la DEPP, à l'arrondi près. Si l'écart est systématique, la formule est revue avant toute publication.
- **Mention visible** à côté du chiffre : « moyenne calculée par l'observatoire », avec le nombre d'établissements sur lequel elle porte (par exemple « 2 collèges privés »). Le champ `calculee` des types partagés sert à cela.
- **Par type d'établissement et par secteur**, comme partout ailleurs. S'il n'y a aucun établissement avec un IPS publié pour un secteur, l'absence est dite (« aucun collège privé dans la commune »), jamais un zéro.
- **Aucun rang**, contrairement à certains outils publics qui calculent ces moyennes : on situe la moyenne de la commune face au département, on ne classe pas.
- La formule est publiée dans `/methode/`.

### 6.5 Fil d'Ariane et maillage

- Le fil d'Ariane de chaque page relie France › Académie › Département › Commune ; tout maillon dont la page existe est un lien.
- L'accueil pointe vers `/france/` et vers chaque académie ; la page France liste les académies, la page académie liste ses départements.
- La recherche (`/recherche.json`) indexe les communes qui ont une page.
- Le sitemap inclut les nouvelles pages.

### 6.6 Saint-Barthélemy, Saint-Martin et Saint-Pierre-et-Miquelon (décision du porteur, 2026-11-24)

La phase 1 les excluait avec le motif `hors_perimetre_geographique`, et `/methode/` disait « faute de statistiques comparables ». C'est inexact : la DEPP publie leurs IPS, leurs effectifs et leurs personnels. Ils entrent dans le périmètre.

- **Saint-Barthélemy (977) et Saint-Martin (978) : rattachés à la Guadeloupe**, comme le font l'Annuaire (académie 32) et la DEPP (département « 971 GUADELOUPE » dans les jeux IPS). Leurs établissements apparaissent sur la page de la Guadeloupe et sont comparés à ses moyennes. Leur code commune (97701, 97801) est conservé : Saint-Martin peut avoir une page commune si elle atteint le seuil. La page `/methode/` explique ce rattachement : anciennes communes de la Guadeloupe, devenues collectivités d'outre-mer en 2007, toujours rattachées au rectorat de Guadeloupe.
- **Saint-Pierre-et-Miquelon (975) : page département propre** (`/departement/975/`), dans sa propre académie (code 44), avec les moyennes que la DEPP publie pour lui. Pas de contour IGN : il est cité sous la carte de France (section 6.2).
- Le Pacifique (98x) reste exclu en phase 2 : ses systèmes éducatifs relèvent en grande partie des collectivités, et sa présence dans les jeux de la DEPP n'a pas été examinée. La phrase de `/methode/` est réécrite pour ne citer que lui, sans affirmer d'absence de statistiques non vérifiée.

## 7. Laissé au builder

Les choix ci-dessous ne changent pas ce que voit le lecteur ; le builder les tranche et les documente dans `/methode/` quand ils touchent aux chiffres.

- **Source exacte des contours** : ADMIN EXPRESS COG CARTO (IGN, Licence Ouverte), millésime le plus récent ; outil et niveau de simplification ; format stocké dans le dépôt (TopoJSON ou GeoJSON simplifié). Les contours changent une fois par an : ils peuvent être committés plutôt que collectés chaque nuit, avec leur source et leur millésime dans `/sources/`.
- **Formule exacte** de la vue A (part des élèves du privé : somme des élèves du privé sous contrat sur la somme des élèves couverts, dernière rentrée). À écrire dans `/methode/`, avec celle de la vue B (section 6.2).
- **Bascule entre A et B** : de préférence sans JavaScript (boutons radio et CSS) ; à l'impression, les deux cartes ou seulement la première.
- **Format des fichiers de données** des nouveaux territoires (`site/data/academies/`, `communes/`, `france.json` enrichi), sur le modèle de `DonneesDepartement`.
- Mise en page exacte des pages France, académie et commune dans le gabarit.
- Version exacte des dépendances ajoutées.
- Report du nouveau découpage des phases dans le plan de phase 1 (section « Phases suivantes ») et dans le socle (sections 2.4 et 2.7).
