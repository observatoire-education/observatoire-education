# Observatoire citoyen de l'éducation : phase 4, réussite, historique et fiabilité

Date : 2026-11-24. Statut : livrée (validée par le porteur le 2026-11-24, mise en ligne à décider).
Complète : `2026-11-23-observatoire-citoyen-education-design.md` (la spec), `2026-11-23-observatoire-socle-et-maquettes-design.md` (le socle), `2026-11-24-observatoire-phase2-territoires-design.md` (phase 2) et `2026-11-24-observatoire-phase3-budget-design.md` (phase 3). En cas de conflit sur le périmètre de la phase 4, ce document l'emporte.

## 1. Intention

La valeur ajoutée est une mesure de l'Éducation nationale : l'observatoire la reprend avec sa source, il ne note pas. Ce qui intéresse le porteur, c'est de **la lire à côté du reste** : l'IPS, les effectifs, les moyens en personnel (part d'agrégés, non-titulaires, ancienneté). Une forte réussite dans un lycée à IPS élevé et très doté en agrégés ne raconte pas la même chose qu'une réussite égale dans un lycée à IPS bas. La phase 4 met ces chiffres **côte à côte**, sur la fiche et sur les pages de territoire, pour que chacun fasse le croisement lui-même.

Elle complète aussi deux promesses du socle restées en suspens : l'historique de l'IPS avant 2023, et la fiabilité des fiches dans le temps (établissements fermés et leur successeur, millésimes corrigés par le producteur).

Ordre décidé par le porteur le 2026-11-24 : la phase 4 passe avant les phases Écoles, Transport et 5, parce que les successeurs et les corrections servent aussi aux écoles (fermetures et fusions plus fréquentes) et que les méthodes se fixent d'abord sur les données les plus riches.

## 2. Découpage

Une seule phase, **quatre lots livrés et mis en ligne l'un après l'autre** (décision du porteur), dans cet ordre :

| Lot | Contenu |
|---|---|
| 1. Fiabilité | Établissements fermés et successeurs ; signalement des corrections de millésime |
| 2. IPS ancien | IPS de 2016-2017 à 2022-2023 sur les fiches et dans les moyennes de territoire |
| 3. Résultats | IVAC (collèges) et IVAL (lycées GT et pro) sur la fiche ; voisins enrichis ; nuage IPS × réussite sur les pages de territoire |
| 4. Ségrégation | Indicateurs de ségrégation sociale entre collèges sur les pages département |

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Sur chaque fiche de collège : réussite au brevet et valeur ajoutée (IVAC), sessions **2022 à 2025**.
- Sur chaque fiche de lycée GT ou pro : réussite au bac, accès de la seconde au bac, mentions, et leurs valeurs ajoutées (IVAL), sessions **2012 à 2025**.
- Pouvoir lire ces résultats à côté de l'IPS et des moyens en personnel, sur la fiche (bloc Résultats, voisins) et sur les pages de territoire (nuage de points).
- Une série IPS continue de 2016-2017 à la dernière rentrée.
- Une fiche fermée qui dit quand elle a fermé et, quand c'est établi, qui lui succède ; une fiche qui succède qui dit à qui.
- Un chiffre corrigé par son producteur qui est signalé comme tel, avec les deux versions accessibles.
- La ségrégation sociale entre collèges de chaque département, de 2014 à 2025.

**Non-objectifs**
- Le brevet par établissement 2006-2021 (taux bruts, sans valeur ajoutée). **Idée gardée** pour une demande ultérieure (section 9).
- La ségrégation pour les académies, les régions, la France ou les communes : la DEPP ne la publie que par département ; l'observatoire ne la recalcule pas (décision du porteur, section 6.4).
- Un nuage de points interactif (filtres, zoom, sélection) : il relève de l'exploration des données (phase 5).
- Fusionner les séries d'un établissement fermé et de son successeur.

**Anti-objectifs** (ceux de la spec, rappelés parce que la valeur ajoutée y expose le plus)
- **Un palmarès.** Pas de rang, pas de « meilleurs » ni de « pires », pas d'extrêmes mis en avant, pas de couleur réservée aux premiers ou aux derniers. Dans le nuage, aucun nom n'est écrit sur le graphique ; tri par défaut des tableaux par nom.
- **Un chiffre sans source ni millésime.** La session (brevet, bac) est affichée à côté de chaque résultat.
- **Une absence qui passe pour un zéro** : « non publié » (secret statistique, effectif trop faible), « pas de candidats cette session », « établissement ouvert après cette session ».
- **Un commentaire.** La lecture de la valeur ajoutée est expliquée sur `/methode/`, pas sur les fiches.

## 4. Contraintes

- Celles des phases précédentes : site statique lisible sans JavaScript, impression propre, garde-fou de poids (900 Mo, 50 000 fichiers), URL permanentes, quelques requêtes par source et par nuit, chaque version archivée avec son empreinte.
- **Poids des pages de territoire** : un nuage de plusieurs milliers de points en SVG alourdit la page (voir le commit « cartes de territoires à une décimale »). Les nuages vont là où le nombre de points reste raisonnable (section 7.2).

## 5. Approches envisagées

**Découpage**
- **Une phase en quatre lots (retenue par le porteur).** Une spec, un plan, mise en ligne par lot. La fiabilité passe en premier : les résultats arrivent sur des fiches dont l'historique et les fermetures sont propres.
- **Deux phases « 4a fiabilité » et « 4b réussite ».** Documents plus courts, mais sources et règles d'affichage dites deux fois, pour un gain faible puisque les lots sont déjà publiés séparément. Écartée.

**Nuage de points**
- **SVG généré au build avec Plot, infobulle native `<title>` (retenue par le porteur).** Cohérent avec les autres graphiques, aucun script, imprimable. Limite : l'infobulle native est peu commode au toucher ; le tableau filtrable de la page porte les mêmes chiffres.
- **Nuage interactif dans le navigateur.** Plus riche, mais il charge les données de chaque établissement et une bibliothèque de graphique. Renvoyé à la phase 5.

**Profondeur des résultats des collèges**
- **IVAC seul, à partir de 2022 (retenue par le porteur).** Série courte, méthode unique.
- **IVAC + brevet 2006-2021.** Série longue, mais deux indicateurs différents et une jonction trompeuse en 2022. Écartée, gardée en idée (section 9).

## 6. Ce qui est décidé

### 6.1 Sources nouvelles (vérifiées sur l'API le 2026-11-24)

Toutes sur data.education.gouv.fr, Licence Ouverte, producteur MEN-DEPP, ajoutées au registre `pipeline/src/sources.ts` avec leurs colonnes requises.

| Jeu | Identifiant | Couverture | Usage |
|---|---|---|---|
| Indicateurs de valeur ajoutée des collèges | `fr-en-indicateurs-valeur-ajoutee-colleges` | sessions 2022-2025 | lot 3 |
| Indicateurs de résultat des lycées GT | `fr-en-indicateurs-de-resultat-des-lycees-gt_v2` | sessions 2012-2025 | lot 3 |
| Indicateurs de résultat des lycées pro | `fr-en-indicateurs-de-resultat-des-lycees-pro_v2` | sessions 2012-2025 | lot 3 |
| Ségrégation sociale entre collèges dans les départements | `fr-en-indicateur_segregation_sociale_colleges` | 2014-2025, 132 lignes par an | lot 4 |
| IPS des collèges 2016-2021 | `fr-en-ips_colleges` | rentrées 2016-2017 à 2021-2022 | lot 2 |
| IPS des collèges 2022 | `fr-en-ips-colleges-ap2022` | rentrée 2022-2023 | lot 2 |
| IPS des lycées 2016-2021 | `fr-en-ips_lycees` | rentrées 2016-2017 à 2021-2022 | lot 2 |
| IPS des lycées 2022 | `fr-en-ips-lycees-ap2022` | rentrée 2022-2023 | lot 2 |
| IPS des EREA 2016-2021 | `fr-en-ips_erea` | rentrées 2016-2017 à 2021-2022 | lot 2 |
| IPS des EREA à partir de 2022 | `fr-en-ips-erea-ap2022` | 2022-2023 à 2025-2026 | lot 2 |
| Établissements fermés | `fr-en-etablissements-fermes` | toutes natures, date de fermeture | lot 1 |

Les jeux 2016-2021 ne bougent plus (dernière modification 2024) : ils seront collectés une fois puis seulement surveillés, comme les autres.

### 6.2 Lot 1 : établissements fermés et successeurs

- **Volume** : environ 870 collèges et lycées fermés depuis 2016 (400 collèges, 245 lycées professionnels, 109 lycées généraux…), trop pour une saisie manuelle.
- Le jeu « Établissements fermés » donne la **date de fermeture** mais **aucun successeur**.
- **Successeur déduit** quand le lien est net : un établissement du second degré ouvert dans la même commune autour de la date de fermeture, de nature compatible (par exemple un LGT et un LP qui ferment le jour où un LPO ouvre à la même adresse). Les règles exactes sont au builder (section 10), elles sont publiées sur `/methode/`.
- **Fichier de corrections manuelles**, versionné dans le dépôt, qui ajoute, retire ou corrige un lien. Il l'emporte sur la déduction.
- **Affichage** :
  - fiche fermée : « Fermé le <date> » dans l'en-tête et, si le lien est établi, « Successeur : <nom> (<UAI>) » avec lien ; sinon « Fermé le <date> » seul ;
  - fiche du successeur : « Succède à <nom> (<UAI>), fermé le <date> », avec lien ; plusieurs prédécesseurs possibles ;
  - les séries ne sont **jamais** fusionnées : chaque fiche garde ses propres chiffres.
- **Quelles fiches fermées existent** : celles que le site connaît déjà (établissements vus dans une collecte puis disparus), plus celles **qu'une source historique de la phase 4 mentionne** (IPS 2016-2022, IVAL 2012-2025, IVAC 2022-2025) et que le jeu des fermés situe : elles ont une page, avec les données de ces sources. Cela inclut des lycées fermés entre 2012 et 2016 qui n'ont que des résultats IVAL. Les fermés que rien ne cite n'ont pas de page. *(Choix de conception : une page ne vaut que si elle porte des chiffres.)*
- La date de fermeture du jeu officiel remplace la date « disparu le » déduite des collectes, quand elle existe.

### 6.3 Lot 1 : corrections de millésime

- **Définition** : une nouvelle version d'une source **millésimée** (IPS, effectifs, personnels, résultats, ségrégation, budget) dans laquelle au moins une valeur d'un millésime **déjà publié** change. L'Annuaire, qui n'a pas de millésime, n'est pas concerné.
- Le pipeline compare la nouvelle version à la précédente, par établissement ou par territoire, sur les champs affichés.
- **Affichage** *(choix de conception)* : seulement sur les pages dont **un chiffre affiché** a changé. Dans le bloc Sources, à la ligne de la source : « Millésime <x> corrigé par le producteur le <date de collecte de la nouvelle version> », avec un lien vers chacune des deux versions archivées. Le chiffre affiché est toujours celui de la version la plus récente.
- La mention reste tant que le millésime corrigé est affiché.
- **Seules les valeurs publiées par le producteur déclenchent la mention** *(choix de conception)* : une moyenne calculée par l'observatoire qui bouge par ricochet ne la déclenche pas. Sinon, une seule correction ferait apparaître la mention sur des dizaines de pages de territoire.
- **Rattrapage** *(choix de conception)* : à la mise en ligne du lot 1, la comparaison est faite aussi entre les versions déjà archivées (manifest). L'archive ne remonte qu'au 2026-11-23, l'effet est donc limité.

### 6.4 Lot 2 : IPS de 2016-2017 à 2022-2023

- Les fiches gagnent les rentrées 2016-2017 à 2022-2023 dans le graphique d'évolution et le tableau des écarts. 2022-2023 manque aujourd'hui (le site commence à 2023-2024).
- **Lycées** *(choix de conception)* : la fiche garde l'**IPS de l'ensemble de l'établissement**, comme aujourd'hui (`ips_etab` du jeu actuel, `ips_ensemble_gt_pro` des anciens jeux), sur toute la série, avec les moyennes de référence par type de lycée publiées par la DEPP. L'IPS par voie ne sert qu'aux nuages (section 6.6).
- **Établissements fermés dans les moyennes** *(choix de conception)* : un établissement fermé compte dans les moyennes calculées des rentrées et des sessions où il était ouvert ; il ne compte pas dans les listes, compteurs et agrégats de la dernière rentrée (comportement actuel de `territoires.ts`).
- **Moyennes de référence** : les anciens jeux n'en publient pas. Pour les rentrées où la DEPP n'en publie pas, l'observatoire les calcule à partir des établissements (même règle que pour les communes en phase 2, section 6.4) et l'indique : « moyenne calculée par l'observatoire ». Les moyennes publiées par la DEPP restent affichées telles quelles quand elles existent.
- Une **rupture de série** est signalée sous le graphique si la DEPP l'indique entre les deux familles de jeux (changement de méthode de l'IPS) ; le builder le vérifie dans la documentation des jeux.

### 6.5 Lot 3 : résultats sur la fiche

**Collèges (IVAC, sessions 2022 à 2025)**, séparément pour la série générale et la série professionnelle quand les deux existent :
- nombre de candidats, taux de réussite et sa valeur ajoutée ;
- note moyenne à l'écrit et sa valeur ajoutée ;
- taux d'accès de la 6e à la 3e ;
- mentions (assez bien, bien, très bien).

**Lycées GT et pro (IVAL, sessions 2012 à 2025)** :
- nombre de présents, taux de réussite et sa valeur ajoutée ;
- taux d'accès de la seconde au bac et sa valeur ajoutée ;
- taux de mentions et sa valeur ajoutée ;
- le détail par série ou par spécialité n'est pas affiché (section 10).
- Rupture signalée à la **session 2021** (réforme du bac : les séries L, ES, S disparaissent).

Un lycée polyvalent présent dans les deux jeux affiche deux sous-blocs, « voie générale et technologique » et « voie professionnelle ».

**Gabarit** : le bloc « Résultats et moyens » prévu par le socle (section 4.1, point 8), qui contient déjà le budget de la phase 3.
- Taux (réussite, accès, mentions) : règle d'affichage du socle, **écart en premier, moyenne entre parenthèses**, par rapport aux moyennes département, académie et France, public et privé. Ces moyennes ne sont pas publiées dans les jeux : l'observatoire les calcule, pondérées par les candidats ou présents, et l'indique.
- **Valeur ajoutée** : affichée telle que publiée, avec son signe (« +3 », « −2 »), **sans moyenne ni écart** : c'est déjà un écart à un attendu.
- Petit graphique d'évolution du taux de réussite sur les sessions disponibles (SVG au build), comme les autres séries.
- Une phrase fixe renvoie à `/methode/` pour la lecture de la valeur ajoutée, identique sur toutes les fiches.
- **Fiche A4** : la dernière session seulement, moyennes seules (règle du socle).

**Un seul chiffre par établissement** (voisins, tableaux de territoire) *(choix de conception)* : collège, série générale ; LEGT, voie GT ; LP, voie pro ; LPO, les deux valeurs dans la même cellule (« GT 92 % · pro 85 % »). La fiche, elle, montre tout (sous-blocs par série et par voie).

**Voisins** : le tableau des six voisins gagne quatre colonnes : IPS (existe déjà), taux de réussite (dernière session), valeur ajoutée du taux de réussite, part d'agrégés. Valeurs brutes, sans écart, tri par distance (règle du socle). La part d'agrégés existe pour le public et le privé sous contrat (le jeu des personnels couvre les deux, vérifié le 2026-11-24).

### 6.6 Lot 3 : nuage IPS × réussite sur les territoires

- **Pages** : département et académie. Pas de nuage sur la page France (plusieurs milliers de points, poids) ni sur la région, ni sur la commune (trop peu de points).
- **Trois nuages distincts**, chacun sur la dernière session : collèges (IPS × taux de réussite au brevet, série générale), lycées GT (IPS voie GT × taux de réussite au bac GT), lycées pro (IPS voie pro × taux de réussite au bac pro). Un LPO apparaît dans les deux nuages de lycées. Si le jeu IPS de la dernière rentrée ne publie pas l'IPS par voie, le nuage utilise l'IPS de l'ensemble et le dit en note. Un nuage sans au moins quelques points n'est pas affiché.
- **Marques** : formes pleines pour le public, en contour pour le privé (convention des cartes et histogrammes) ; taille fixe ; aucune couleur selon la valeur ; aucun nom écrit sur le graphique.
- **Infobulle native** (`<title>`) par point : nom, commune, secteur, IPS, taux de réussite, valeur ajoutée, candidats ou présents.
- **Repères** : lignes de la moyenne du territoire pour l'IPS et pour le taux de réussite. Pas de droite de régression (ce serait un calcul de l'observatoire qui oriente la lecture).
- Le **tableau filtrable** des établissements du territoire gagne les colonnes taux de réussite et valeur ajoutée (tri libre, tri par défaut par nom), ce qui rend les chiffres du nuage accessibles sans survol et au toucher.
- Source et session sous chaque nuage.

### 6.7 Lot 4 : ségrégation sociale entre collèges

- **Pages département**, de 2014 à 2025 : indice d'entropie total, indice à l'intérieur du public, à l'intérieur du privé, et part de la ségrégation due à l'écart entre public et privé (contributions publiées). Nombre de collèges pris en compte et poids du privé, tels que publiés.
- Petit graphique d'évolution (SVG au build) et tableau des valeurs.
- **Pas de ségrégation** sur les pages académie, région, France et commune (décision du porteur) : ces pages renvoient aux départements, avec une phrase qui dit pourquoi (la DEPP ne la publie que par département).
- `/methode/` explique en quelques lignes ce que mesure l'indice d'entropie et renvoie à la note de la DEPP.

### 6.8 Page `/methode/`

Elle gagne :
- **Résultats des collèges à partir de 2022** : l'IVAC a changé de méthode à la session 2022, les séries d'avant ne se comparent pas ; le brevet par établissement existe de 2006 à 2021, sans valeur ajoutée, et n'est pas repris (décision du porteur).
- **Lecture de la valeur ajoutée** : c'est l'écart entre le taux constaté et le taux attendu compte tenu des caractéristiques des élèves (âge, origine sociale, sexe…, selon la note de la DEPP). Une valeur ajoutée positive dans un établissement à IPS élevé veut dire « mieux qu'attendu pour ce public ».
- La rupture de 2021 pour les lycées.
- La rupture de série de l'IPS à la rentrée 2022, annoncée par la DEPP dans la documentation des jeux IPS (nouvelles valeurs de référence ; élèves sans PCS renseignée exclus du calcul) : mention sous les courbes d'IPS et ancre `#ips-ancien`.
- Les moyennes de taux calculées par l'observatoire (pondération).
- Les règles de déduction des successeurs et l'existence du fichier de corrections manuelles.
- La définition d'une correction de millésime.
- L'indice de ségrégation (section 6.7).

## 7. Affichage, récapitulatif

| Page | Ajouts de la phase 4 |
|---|---|
| Fiche | En-tête fermé / successeur ; IPS dès 2016-2017 ; bloc Résultats ; voisins enrichis ; mentions de correction |
| Fiche A4 | Résultats de la dernière session ; mention « fermé » |
| Département | Nuages ; colonnes résultats du tableau ; ségrégation ; moyennes IPS historiques |
| Académie | Nuages ; colonnes résultats du tableau ; moyennes IPS historiques ; renvoi ségrégation |
| Région, France | Colonnes résultats du tableau ; moyennes IPS historiques ; renvoi ségrégation |
| Commune | Colonnes résultats du tableau ; moyennes IPS historiques |
| `/methode/`, `/sources/` | Section 6.8 ; nouvelles sources |

## 8. Tests

Comme les phases précédentes (`bun test`, tests sur le HTML généré), avec en plus :
- un format de jeu de résultats qui change ne publie jamais de faux chiffres (colonnes requises) ;
- aucune page ne contient de rang, de « top », ni de classement par défaut autre que par nom ;
- une valeur ajoutée absente ou sous secret s'affiche « non publié », jamais 0 ;
- un lien successeur n'existe que dans un sens cohérent (le successeur pointe vers le prédécesseur et inversement) ;
- une correction de millésime simulée produit la mention sur la seule page concernée.

## 8 bis. Écarts constatés à la livraison

Écarts entre cette spec et ce qui a été livré, décidés en cours de phase :
1. Les pages académie, région et France n'ont pas de liste d'établissements : les colonnes de résultats vont dans la liste des pages **département et commune** seulement (la section 7 les mettait partout).
2. Les **EREA** n'avaient aucun IPS (aucune source) : le lot 2 leur en donne un, de 2016-2017 à la dernière rentrée.
3. Les effectifs ne remontent qu'à la rentrée **2019** : les moyennes d'IPS calculées des rentrées 2016 à 2018 sont pondérées par les élèves de 2019.
4. La déduction des successeurs a besoin de la **date d'ouverture** des établissements actifs : `date_ouverture` rejoint les colonnes requises de l'Annuaire (une nouvelle version de l'Annuaire est archivée à la première collecte).
5. **Poids d'une fiche** : le budget de poids d'une fiche complète du site d'essai est fixé à 60 000 octets (tâches 10 et 11, bloc Résultats et IPS historique). Build mesuré sur données réelles : 769,1 Mo et 13 917 fichiers, sous les garde-fous de 900 Mo et 50 000 fichiers.
6. **Sessions** : un résumé de réussite porte la dernière session **de sa source** (et non une session commune à toutes les sources) ; les valeurs plus anciennes ne sont pas mélangées dans les listes, voisins et nuages.
7. **Nuages** : chaque point associe les résultats d'une session à l'IPS de la rentrée session − 1 ; l'IPS par voie des lycées est utilisé quand il est publié pour cette rentrée, sinon l'IPS de l'ensemble de l'établissement pour tous les points, avec une note sous le graphique. Le tableau des établissements donne l'IPS de la dernière rentrée, qui peut différer de celui du nuage : la note sous le nuage le dit (« … le tableau des établissements donne le taux de réussite et la valeur ajoutée, et l'IPS de la dernière rentrée. ») au lieu d'annoncer « les mêmes chiffres ».
8. **Secteur des fermés** : lorsque le jeu des établissements fermés ne le donne pas, le secteur est repris des sources qui citent l'établissement fermé.
9. **IPS** : la DEPP annonce une rupture de série à la rentrée 2022 (voir 6.8) ; les titres des jeux `ips_colleges_2022` et `ips_lycees_2022` suivent ceux du portail (« … dans les collèges (2022) », « … dans les lycées (2022) »).
10. **Fermés avant 2019** : sans effectifs avant la rentrée 2019, un établissement fermé avant la rentrée 2019 ne compte pas dans les moyennes calculées des rentrées 2016 à 2018 (pondérées par les élèves de 2019) ; aucun changement de calcul, /methode/ le dit.

## 9. Idées gardées pour plus tard

- **Brevet par établissement 2006-2021** (`fr-en-dnb-par-etablissement`) : taux de réussite bruts, mentions ; à reprendre si des lecteurs demandent une série longue pour les collèges, présentée comme un indicateur distinct de l'IVAC.
- Nuage interactif et croisements libres : phase 5. Les graphiques de la phase 4 sont produits par Plot au build ; la même bibliothèque tourne dans le navigateur. Le code de chaque graphique (marques, échelles) est donc écrit pour pouvoir être réutilisé tel quel côté navigateur le jour où un graphique devient filtrable (intention du porteur).

## 10. Laissé au builder

Ces choix ne changent pas ce que voit le lecteur ; le builder les tranche et les documente dans `/methode/` quand ils touchent aux chiffres.
- Règles exactes de déduction du successeur (fenêtre de dates, natures compatibles, adresse) et format du fichier de corrections manuelles.
- Champs comparés pour détecter une correction de millésime, et stockage du résultat de la comparaison.
- Pondération exacte des moyennes calculées (candidats, présents, effectifs) et traitement des établissements sans candidats.
- Choix de la série affichée dans le nuage des collèges si la série générale manque pour un établissement (exclusion, signalée en note).
- Seuil minimal de points pour afficher un nuage.
- Présentation exacte du détail des résultats (séries de bac, spécialités de bac pro) : non affiché en phase 4 ; le builder peut l'archiver sans l'afficher.
- Format des nouveaux champs dans les fichiers de fiche et de territoire, sur le modèle des phases 2 et 3.
- Mise en page exacte du bloc Résultats, des nuages et du bloc Ségrégation.
