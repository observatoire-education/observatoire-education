# Observatoire citoyen de l'éducation : phase 3, budget des collectivités par élève et pages région

Date : 2026-11-24. Statut : livrée (validé par le porteur le 2026-11-24).
Complète : `2026-11-23-observatoire-citoyen-education-design.md` (la spec), `2026-11-23-observatoire-socle-et-maquettes-design.md` (le socle) et `2026-11-24-observatoire-phase2-territoires-design.md` (phase 2). En cas de conflit sur le périmètre de la phase 3, ce document l'emporte.

## 1. Intention

La spec prévoit « le budget des collectivités en euros par élève (départements pour les collèges, régions pour les lycées), comparable entre territoires et dans le temps ». Les parents et personnels doivent pouvoir dire, source à l'appui, combien leur département ou leur région dépense pour chaque élève, et combien elle verse au privé sous contrat par élève du privé, sans que le site commente.

Le budget est **par collectivité, pas par établissement** (spec 4.1) : aucune source nationale ne publie le budget de chaque collège ou lycée. Vérifié le 2026-11-24 : les comptes des établissements (EPLE) ne figurent pas dans les balances de la DGFiP.

La phase 3 ajoute aussi des **pages région** (décision du porteur), parce que la région est la collectivité des lycées et n'avait pas de page.

## 2. Découpage des phases (mis à jour)

| Phase | Contenu |
|---|---|
| 3 (ce document) | Budget des collectivités en euros par élève ; pages région |
| 4 | IVAC / IVAL, indice de ségrégation, IPS 2016-2022, successeurs, corrections de millésime (inchangé) |
| 5 | Exploration des données (inchangé) |
| **Écoles** (v2 de la spec) | Écoles du premier degré. Le porteur souhaite l'enchaîner rapidement. |
| **Transport scolaire** (nouvelle) | Financement, tracés des lignes et temps de trajet, d'abord pour les lycées (compétence régionale). Le porteur souhaite l'enchaîner rapidement. |

L'ordre entre 4, 5, Écoles et Transport reste à fixer par le porteur. Les données repérées pour les phases Écoles et Transport sont en section 9.

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Pour chaque collectivité qui finance des collèges ou des lycées, et chaque exercice comptable de **2020 à 2025** (section 6.4), des montants **en euros par élève, séparés public / privé** :
  - **Public** : fonctionnement hors personnel ; fonctionnement personnel compris (seulement là où les comptes rattachent le personnel aux collèges ou lycées, section 6.3) ; investissement, à part.
  - **Privé sous contrat** : contribution de la collectivité (forfait d'externat et autres versements identifiables), par élève du privé ; investissement à part s'il existe.
- Ces montants sur les fiches établissement, les pages département, académie, région et France (section 7).
- **18 pages région** (`/region/<code>/`), sur le gabarit de territoire de la phase 2 (section 8).
- La méthode de calcul publiée sur `/methode/`, la source et ses archives sur `/sources/`.

**Non-objectifs**
- **Estimation du personnel non rattaché** : pour les départements qui ne rattachent pas le personnel des collèges à la fonction collèges, on pourrait l'estimer (par exemple d'après la moyenne de ceux qui le rattachent). Écarté de la phase 3 parce que ce serait un chiffre de l'observatoire et non de la source. **Idée gardée de côté par le porteur**, à rediscuter ; si elle est reprise, l'estimation serait affichée comme telle, à part du chiffre de source.
- **Transports scolaires** : renvoyés à leur phase (section 9.2).
- Budget par établissement, budgets des communes, des intercommunalités et des syndicats.
- Exercices antérieurs à 2020 (section 6.4).

**Anti-objectifs** (ceux de la spec s'appliquent tous ; rappel de ceux que la phase 3 touche)
- **Pas de palmarès** : ni rang des collectivités, ni « qui dépense le plus / le moins », ni mise en couleur des extrêmes. Tableaux triés par nom par défaut. La carte de la page France utilise une échelle continue, comme en phase 2.
- **Pas d'absence qui passe pour un zéro** : un département qui ne rattache pas son personnel aux collèges affiche « personnel non rattaché aux collèges dans les comptes de la collectivité », jamais 0 € ni un chiffre partiel présenté comme complet.
- **Pas de comparaison public / privé trompeuse** : la contribution au privé inclut une part correspondant au personnel ; elle ne se compare qu'au public **personnel compris** (section 6.3). La page ne met jamais côte à côte « public hors personnel » et « privé » comme s'ils étaient comparables.
- **Pas de chiffre sans source ni exercice** : chaque montant indique « DGFiP, balances comptables, exercice 2024 » et les effectifs utilisés (« élèves à la rentrée 2023, DEPP »).
- **Pas de commentaire** : aucune phrase sur le caractère suffisant, généreux ou faible d'un budget.

## 4. Contraintes

- Celles des phases 1 et 2 : site statique, aucune page qui dépend de JavaScript pour être lue, impression propre, garde-fou de poids (900 Mo, 50 000 fichiers), URL permanentes.
- **Sobriété** : quelques requêtes par source et par nuit (spec, section 3).
- **Archivage** : chaque version collectée est archivée avec son empreinte (socle), et la page renvoie à la donnée archivée.

## 5. Approches envisagées

**Source**
- **A. Balances DGFiP « présentation croisée nature-fonction », extraits filtrés par l'API (retenue par le porteur).** Pour chaque exercice, une requête à l'API Opendatasoft de data.economie.gouv.fr ne ramène que les budgets et les fonctions utiles (quelques milliers de lignes par an sur environ 5 millions). L'extrait est archivé avec son empreinte **et la requête exacte** qui l'a produit, pour que chacun puisse la rejouer sur la source officielle.
- **B. Fichiers complets, filtrés localement.** Archive la publication telle quelle, mais environ 5 millions de lignes par an, des centaines de Mo d'archives et une charge sur l'API contraire à la règle de sobriété. Écartée : tout ce qui sert à la phase 3 est dans l'extrait, et le reste des fichiers (section 9) reste en ligne, exercice par exercice depuis 2012, pour un filtre ultérieur. Critère du porteur : on filtre parce que rien d'utile pour la phase 3 n'est perdu.
- **Écartée : la base OFGL « Comptes des départements – présentation fonctionnelle ».** Simple à collecter, mais elle donne la fonction 221 (collèges) sans le détail par compte : elle ne sépare pas les dotations aux collèges publics du forfait versé au privé. Elle n'existe pas pour les régions.

**Public / privé** : séparés (décision du porteur), plutôt qu'un chiffre unique dépenses ÷ tous les élèves, qui mélangerait des dépenses de natures différentes.

**Personnel** : deux niveaux (décision du porteur), plutôt qu'exclure le personnel partout (la comparaison avec le forfait du privé pencherait) ou l'estimer (écarté de la phase 3, gardé de côté, section 3).

## 6. Ce qui est décidé

### 6.1 Source et collecte

- **Jeux** : « Balances comptables des collectivités et des établissements publics locaux avec la présentation croisée nature-fonction <exercice> », un jeu par exercice sur data.economie.gouv.fr (même API Opendatasoft v2.1 que data.education.gouv.fr). Les identifiants sont irréguliers (vérifiés le 2026-11-24) :

  | Exercice | Identifiant |
  |---|---|
  | 2020 | `balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec7` |
  | 2021 | `…-avec8` |
  | 2022 | `balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-2022` |
  | 2023 | `balances-comptables-des-collectivites-et-des-epl-avec-fonction-2023` |
  | 2024 | `balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-croisee-nature-fonction-2024` |

  Les identifiants sont tenus dans le registre des sources. Pour un exercice nouveau, la collecte cherche dans le catalogue un jeu dont le titre contient « nature-fonction <exercice> » ; si elle n'en trouve pas exactement un, elle le signale dans le journal et n'invente rien. L'exercice 2025 est publié par la DGFiP et utilisé.
- **Filtre** : catégories `DEPT`, `REG`, `CTU`, `ML` (Métropole de Lyon), `PARIS`, budget principal de la collectivité (pas les budgets annexes) ; fonctions collèges (221), lycées (222, 223), non détaillée (22) et cités scolaires (24) sous toutes leurs formes codées (section 6.2) ; toutes les natures (comptes) de ces fonctions.
- **Rythme** : la date de modification de chaque jeu est lue chaque nuit, l'extrait n'est retéléchargé que si elle change (comme les autres sources). Un exercice déjà publié qui change est une correction : les deux versions sont gardées (règle du socle).
- **Validation** : colonnes requises, nombre de collectivités attendu par catégorie, présence des fonctions 221 / 222. Un extrait qui ne passe pas est rejeté et la version précédente reste en ligne.

### 6.2 Ce qu'on additionne

Constats sur l'exercice 2024 (vérifiés le 2026-11-24) :
- **Codes de fonction** : selon le mode de vote, la fonction apparaît seule (`221`) ou préfixée par un chapitre (`93221` en fonctionnement, `90221` en investissement, `91221`…). Les régions utilisent `90222` / `93222` (lycées publics) et `90223` / `93223` (lycées privés), sauf Provence-Alpes-Côte d'Azur (`222` / `223`). La normalisation ramène tout à `221`, `222`, `223` avec la section (fonctionnement / investissement).
- **Départements, public et privé dans la même fonction 221**, séparés par la nature : `655111` dotations de fonctionnement des collèges publics, `655112` contribution aux collèges privés (forfait d'externat). En Loire-Atlantique 2024 : 12,4 M€ et 17,2 M€.
- **Régions** : public en 222, privé en 223.

Règles :
- **Fonctionnement** : dépenses réelles de la section de fonctionnement (comptes de classe 6, hors opérations d'ordre comme les dotations aux amortissements).
- **Investissement** : dépenses réelles d'équipement (comptes 20, 204, 21, 23), hors remboursement d'emprunts et opérations d'ordre.
- **Part privée** : pour les départements, les comptes qui désignent un versement au privé (`655112` et, s'ils existent, les subventions d'investissement aux établissements privés) ; pour les régions, la fonction 223. **Part publique** : tout le reste de la fonction.
- **Personnel** : comptes 64 (et 621, personnel extérieur, si le builder le juge pertinent d'après la notice).
- La liste exacte des comptes retenus est publiée dans `/methode/`, d'après la notice DGFiP de l'instruction M57.

### 6.3 Les deux niveaux du personnel

En 2024, environ 56 collectivités sur 93 qui gèrent des collèges rattachent le personnel des collèges (agents d'entretien, de restauration, d'accueil) à la fonction 221 ; les autres le laissent dans les frais de personnel non ventilés. Toutes les régions le rattachent aux lycées (entre 10 et 268 M€).

- Pour le public, deux montants :
  - **Fonctionnement hors personnel** : comparable partout.
  - **Fonctionnement personnel compris** : seulement quand la collectivité rattache son personnel à la fonction. Sinon : « personnel non rattaché aux collèges dans les comptes de la collectivité ».
- **Critère de rattachement** *(choix du builder, documenté dans `/methode/`)* : présence de comptes 64 dans la fonction pour un montant qui n'est pas résiduel (par exemple, au-delà d'un seuil par élève à fixer en regardant la distribution).
- **Contribution au privé introuvable** : si la collectivité a des élèves du privé sous contrat mais aucune ligne privée pour l'exercice (La Réunion pour les collèges, la Martinique en 2024), l'absence s'affiche : « aucune contribution au privé identifiée dans les comptes de la collectivité pour cet exercice ». Jamais 0 €.
- **Privé** : un seul montant de fonctionnement, la contribution totale. Le forfait d'externat couvre une part « matériel » et une part « personnel » que les comptes ne distinguent pas.
- **Règle d'affichage** : le privé se place à côté du public **personnel compris**. Si celui-ci n'existe pas pour la collectivité, la page le dit et ne met pas le public hors personnel en face du privé.

### 6.4 Élèves et exercices

- **Dénominateur** : élèves de la **rentrée de septembre N−1** pour l'exercice N (rentrée 2023 pour les comptes 2024), car elle couvre huit mois de l'année comptable. Effectifs déjà collectés (DEPP), par collectivité et par secteur :
  - collèges : élèves des collèges publics / privés sous contrat du territoire de la collectivité ;
  - lycées : élèves des lycées GT, professionnels et polyvalents publics / privés sous contrat de la région.
- **Exercices 2020 à 2025** : les jeux d'effectifs collectés commencent à la rentrée 2019. Les comptes existent depuis 2012 ; aller plus loin exigerait une autre source d'effectifs (laissé au builder, section 10). L'exercice 2025 est publié par la DGFiP et utilisé (élèves de la rentrée 2024).
- **Moyenne France** : Σ dépenses ÷ Σ élèves sur toutes les collectivités (même principe Σ/Σ que les autres moyennes calculées). Pour le niveau « personnel compris », la moyenne ne porte que sur les collectivités qui rattachent leur personnel, et le dit (« moyenne de 56 départements »). C'est une moyenne calculée par l'observatoire, marquée comme telle (spec phase 2, 6.4).

### 6.5 Collectivités particulières

| Territoire | Collèges | Lycées |
|---|---|---|
| Rhône (69) | **Département du Rhône** hors métropole ; **Métropole de Lyon** (`ML`) pour les communes de la métropole | Région Auvergne-Rhône-Alpes |
| Paris (75) | Ville de Paris (`PARIS`) | Région Île-de-France |
| Bas-Rhin, Haut-Rhin (67, 68) | Collectivité européenne d'Alsace | Région Grand Est |
| Corse (2A, 2B) | Collectivité de Corse (`CTU`) | Collectivité de Corse |
| Martinique, Guyane | collectivité unique (`CTU`) | collectivité unique |
| Mayotte | aucune collectivité : le Département ne finance ni collèges ni lycées dans les balances | aucune collectivité |
| Guadeloupe (avec Saint-Barthélemy et Saint-Martin), La Réunion | département | région |
| Saint-Pierre-et-Miquelon | à vérifier par le builder (collectivité territoriale ; présence dans les balances non examinée) | idem |

- Une fiche d'établissement est rattachée à sa collectivité par sa commune : liste des communes de la Métropole de Lyon pour le Rhône ; Saint-Barthélemy et Saint-Martin ne sont pas des communes de la Guadeloupe depuis 2007 et ont leurs propres compétences : le builder vérifie qui finance leurs collèges et lycées, et à défaut d'une collectivité identifiable dans les balances, la fiche affiche l'absence avec son motif. Mayotte, où le Département ne finance rien dans les balances, affiche « aucune collectivité ne finance ces établissements dans les balances de la DGFiP » ; Saint-Martin, Saint-Barthélemy et Saint-Pierre-et-Miquelon affichent « collectivité non identifiée dans les balances de la DGFiP ».
- La page département du Rhône montre deux collectivités (Département, Métropole) ; celles du Bas-Rhin et du Haut-Rhin montrent la Collectivité européenne d'Alsace.
- Une collectivité sans données pour un exercice affiche l'absence avec son motif.
- **L'unité est la collectivité, pas le département** *(choix de conception, pour rester un chiffre de source)* : les fichiers de données, les tableaux et les CSV ont une ligne par collectivité ; « moyenne de 56 collectivités ». Aucune valeur n'est fusionnée entre deux collectivités. Sur la carte de la page France, la Métropole de Lyon et le reste du Rhône sont dessinés et colorés séparément (contours communaux déjà disponibles) ; le Bas-Rhin et le Haut-Rhin portent la valeur de la Collectivité européenne d'Alsace, la Corse-du-Sud et la Haute-Corse celle de la Collectivité de Corse, avec une note sous la carte.

### 6.6 Enseignement agricole (décision du porteur)

Les régions financent aussi les lycées agricoles : environ 232 publics et 600 privés dans l'Annuaire, dont les maisons familiales rurales. Leurs dépenses figurent très probablement dans les fonctions 222 et 223, alors que les effectifs DEPP utilisés ne comptent que les élèves de l'Éducation nationale. Aucun jeu ouvert d'effectifs de l'enseignement agricole n'a été trouvé le 2026-11-24.

- **Isoler d'abord** : le builder cherche si les comptes permettent de séparer ce qui va à l'enseignement agricole (comptes ou bénéficiaires distincts dans les fonctions 222 / 223). Si oui, ces montants sont retirés et `/methode/` dit comment.
- **Sinon, signaler** : les montants restent tels quels ; `/methode/` et le bloc budget de chaque région disent que les dépenses incluent l'enseignement agricole, dont les élèves ne sont pas comptés, et que le montant par élève en est surestimé, surtout pour le privé. La mention figure aussi sur les fiches lycée.
- Le résultat de la recherche est rapporté au porteur avant publication.

### 6.7 Cités scolaires et flux entre collectivités

Dans une cité scolaire (collège et lycée réunis), une collectivité gère souvent l'ensemble et l'autre lui rembourse sa part : le même argent peut figurer dans la fonction 221 d'un département et dans la 222 d'une région. *(Choix de conception :)* on retient les **dépenses brutes** de chaque collectivité, sans neutraliser ces flux, et `/methode/` le dit. Le builder mesure, sur l'exercice 2024, le poids des reversements entre collectivités dans ces fonctions (comptes de subventions et participations versées aux départements et régions) ; si une collectivité est déplacée de plus de quelques pour cent, la fiche de cette collectivité le signale et le porteur est prévenu avant publication.

**Fonction 24 « Cités scolaires » (M57), décision du porteur du 2026-11-24.** Ces dépenses (environ 223 M€ en 2024) restent hors des montants par élève, car les comptes ne les répartissent pas entre collèges et lycées. Elles sont collectées (fonction 24 et formes préfixées) et signalées sur la collectivité concernée : « {montant} dépensés par la collectivité pour des cités scolaires (collège et lycée réunis) ne sont pas comptés ici : les comptes ne les répartissent pas entre collèges et lycées. »

## 7. Affichage

Nouveau bloc **« Moyens de la collectivité »** à l'emplacement prévu par le socle (section 4.1, bloc 8 « Résultats et moyens »), dans le gabarit de territoire et sur la fiche.

**Fiche collège public** (croquis) :
```
Moyens de la collectivité · Département de Loire-Atlantique · comptes 2024
                                     Collèges publics        France
Fonctionnement hors personnel        xxx € par élève         (xxx €)
Fonctionnement, personnel compris    xxx € par élève         (xxx €, 56 départements)
Investissement                       xxx € par élève         (xxx €)
Contribution aux collèges privés     xxx € par élève du privé (xxx €)
Élèves : rentrée 2023 (DEPP) · Source : DGFiP, balances comptables 2024 · donnée archivée
```
- **Fiche privée** : la contribution au privé en premier, le public personnel compris à côté pour situer.
- **Fiche lycée** : la même chose avec la région.
- Règle d'affichage du socle : écart puis moyenne entre parenthèses sur la page web ; moyenne seule sur la fiche A4, où le bloc entre dans le tableau central.
- **Évolution 2020-2025** : petit graphique (SVG Plot, au build) public / privé en euros courants, sur les pages de territoire. *(Choix de conception : euros courants, comme la source ; pas de correction de l'inflation, qui serait un calcul de l'observatoire.)*
- **Page département** : le bloc pour les collèges (onglet collèges) et celui de la région pour les lycées (onglets lycées).
- **Page académie** : tableau de ses départements (collèges) et rappel de la région (lycées).
- **Page France** : carte des départements en euros par élève du public, hors personnel (échelle continue, sans extrêmes mis en avant) ; tableaux des départements et des régions, triés par nom, téléchargeables en CSV.
- **Page région** : section 8.

## 8. Pages région

- **18 pages** `/region/<code>/` (code INSEE de région) : 13 régions de métropole (Corse comprise) et Guadeloupe, Martinique, Guyane, La Réunion, Mayotte. Saint-Pierre-et-Miquelon n'est pas une région : il garde ses pages académie et département.
- **Fil d'Ariane** : France › Région › Académie › Département › Commune. Chaque académie appartient à une seule région académique, dont les limites sont celles de la région. Corse, Martinique et Guyane ont une page région et une page académie qui couvrent le même territoire : les deux existent, pour garder le fil régulier.
- **Contenu** : le gabarit de territoire de la phase 2, comme la page académie : bandeau (établissements, élèves, part du privé, IPS moyens **calculés par l'observatoire et marqués comme tels**, la DEPP ne publiant pas de moyenne régionale), carte (départements de la région), liste de ses académies et départements avec leurs chiffres, téléchargement CSV ; plus le bloc **Moyens de la collectivité** : budget des lycées de la région (public, privé, niveaux, 2020-2025) et tableau du budget des collèges de chacun de ses départements.
- **Maillage** : la page France liste les régions ; l'accueil (« Parcourir par territoire ») les propose ; la recherche et le sitemap les incluent.
- **Contour** : obtenu par fusion des contours départementaux déjà simplifiés, ou ADMIN EXPRESS régions (choix du builder).

## 9. Pour les phases suivantes : données repérées

Le porteur veut enchaîner rapidement les phases Écoles et Transport. Constats du 2026-11-24, à revérifier le moment venu.

### 9.1 Phase Écoles

- **Budgets des communes pour les écoles** : les mêmes balances nature-fonction contiennent environ 5 200 communes, dont environ 3 000 avec des dépenses sur les fonctions écoles (21x). **Couverture partielle** : seules les communes de 3 500 habitants et plus sont tenues de présenter leurs comptes par fonction. Les petites communes n'y figurent pas ; les balances communales générales (jeux « balances comptables des communes en <exercice> ») n'ont pas de fonction.
- **Syndicats scolaires** (SIVOS et autres, catégorie `SYND`) : une quarantaine dans les balances 2024.
- Récupération : même mécanisme d'extraits filtrés, avec un nouveau filtre (catégories `Commune`, `SYND`, fonctions 21x). Rien n'est perdu à filtrer en phase 3 : les fichiers restent en ligne, exercice par exercice depuis 2012.

### 9.2 Phase Transport scolaire

**Intention du porteur** : être factuel sur le financement **et sur les parcours** des lignes scolaires. Certaines régions sont accusées de tracer des lignes qui desservent le privé plus que le public ; l'observatoire doit pouvoir montrer les tracés, les arrêts desservis et les temps de trajet, d'abord pour les lycées, qui dépendent directement de la région. Une vraie phase projet, à concevoir à part.

Constats sur le financement (balances 2024, fonction 81 « Transports scolaires ») :
- **Régions**, dépenses de fonctionnement en M€ : Auvergne-Rhône-Alpes 219, Nouvelle-Aquitaine 217, Occitanie 209, Grand Est 201, Pays de la Loire 175, Bourgogne-Franche-Comté 139, Normandie 106, Bretagne 99, Provence-Alpes-Côte d'Azur 83, Centre-Val de Loire 71, Hauts-de-France 43, Guadeloupe 12 ; Île-de-France et La Réunion sans ligne.
- **Départements** : 52 avec plus de 0,1 M€ (272 M€ au total, médiane 3 M€), surtout le transport des élèves en situation de handicap, qui leur reste depuis la loi NOTRe.
- **Pourquoi un € par élève serait trompeur** : l'organisateur varie (Île-de-France Mobilités, intercommunalités dans les agglomérations, délégations aux départements ou à des syndicats) ; la participation des familles aussi (gratuité en Occitanie et en Bourgogne-Franche-Comté, recettes des usagers de 0 à 32 M€ selon la région) ; aucune source nationale ouverte du nombre d'élèves transportés ; les écoliers sont aussi transportés.
- Les mêmes balances couvrent les intercommunalités (`GFP`) et syndicats qui organisent du transport : un filtre sur la fonction 81 suffira.

Pistes pour les parcours (non vérifiées) : les données GTFS (horaires, arrêts, tracés) des réseaux régionaux publiées sur transport.data.gouv.fr ; les lignes scolaires y sont parfois séparées des lignes régulières. Croisement avec les coordonnées des établissements, déjà dans l'Annuaire.

## 10. Laissé au builder

Ces choix ne changent pas ce que voit le lecteur ; le builder les tranche et les documente dans `/methode/` quand ils touchent aux chiffres.
- Liste exacte des comptes retenus pour chaque montant, d'après la notice M57 (et M52 / M71 si un exercice 2020-2023 utilise encore ces nomenclatures pour certaines collectivités).
- Critère exact de rattachement du personnel (section 6.3).
- Requête exacte de filtre (clauses `where`, format d'export Parquet), stockage de la requête avec l'archive.
- Rattachement commune → collectivité (Métropole de Lyon, Alsace, Saint-Barthélemy, Saint-Martin, Saint-Pierre-et-Miquelon).
- Traitement des EREA (financés par les régions) : inclus dans les lycées publics si leurs effectifs sont disponibles, sinon exclus et dit dans `/methode/`.
- Source d'effectifs plus ancienne pour remonter avant 2020, si elle existe et se raccorde proprement aux jeux actuels ; sinon, 2020-2025.
- Format des fichiers de données (`site/data/regions/`, champs budget dans les fichiers de territoire et de fiche), sur le modèle de la phase 2.
- Contours des régions (section 8).
- Mise en page exacte du bloc et du graphique d'évolution.
