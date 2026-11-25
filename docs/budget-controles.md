# Budget des collectivités : contrôles sur les données réelles

Contrôles faits le 24 novembre 2026 sur les balances comptables de la DGFiP (présentation croisée nature-fonction), exercices 2020 à 2025, avec les élèves de la rentrée précédente (DEPP). Ils fixent les règles de calcul avant toute publication.

Pour les refaire : `OBS_DEPOT=local bun scripts/budget-controles.ts --manifest <manifest>`. Le script imprime, pour chaque contrôle, son critère, les chiffres et un verdict. Il envoie au plus six requêtes : trois à l'OFGL (une par département), trois à data.economie.gouv.fr. L'option `--hors-ligne` les supprime.

Vocabulaire :
- **fonction** : le domaine d'une dépense dans les comptes. 221 = collèges, 222 = lycées publics, 223 = lycées privés, 22 = enseignement du second degré sans détail ;
- **compte** : la nature de la dépense. 64 = personnel, classe 6 = fonctionnement, 20 / 21 / 23 = investissement ;
- **collectivité** : celle qui paie (département, région, Métropole de Lyon, Ville de Paris, Collectivité européenne d'Alsace, collectivités uniques de Corse, de Martinique et de Guyane).

## Résumé des décisions

| Contrôle | Résultat | Décision |
|---|---|---|
| 1. Formule de la dépense | écart de 0,00 % avec l'OFGL pour Loire-Atlantique, Nord et Gironde | formule gardée |
| 2. Couverture | toutes les collectivités attendues ont des lignes ; le Département de Mayotte n'a pas de lignes | Mayotte : aucune collectivité de rattachement (décision du porteur du 2026-11-24) |
| 3. Personnel des collèges | deux groupes nets : 0,56 € ou moins par élève, 124 € ou plus | seuil de 50 € par élève |
| 4. Enseignement agricole | aucun compte ne le sépare | mention sur les pages (mode « mention ») |
| 5. Cités scolaires | 3 départements au-dessus de 3 % ; fonction 24 : 223 M€ en 2024 | Creuse, Meurthe-et-Moselle, Lot-et-Garonne signalés ; fonction 24 collectée, signalée, hors montants par élève (décision du porteur du 2026-11-24) |
| 6. Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon | absents des balances | « collectivité non identifiée » |
| 7. Compte 655122 | forfait des collèges privés de deux départements imputé au compte des lycées privés ; contribution au privé introuvable à La Réunion et en Martinique 2024 | 655122 compté au privé (correction du code) ; statut « aucune contribution au privé identifiée » (décision du porteur du 2026-11-24) |
| 8. Alsace, exercice 2025 | conformes ; 2025 complet | pas de changement |
| 9. Communes, dépenses pour leurs écoles | 2 913 à 3 185 communes par exercice ; 69 % des élèves du public en 2024 ; syndicats 5 à 8 M€, intercommunalités 258 à 359 M€ | fonctions 21x, même formule que les collèges ; 6558 et 2042 hors des écoles publiques ; seuil de personnel de 50 € gardé ; syndicats et intercommunalités non attribués |

Le porteur a tranché le 2026-11-24 les trois points ouverts : **Mayotte** (aucune collectivité, contrôle 2), la **fonction 24 « Cités scolaires »** (collectée et signalée, hors montants par élève, contrôle 5) et la **contribution au privé introuvable** (statut dédié, contrôle 7).

## 1. Formule de la dépense réelle

**Question.** Une ligne de balance contient des opérations budgétaires et des opérations d'ordre (écritures internes, sans sortie d'argent, comme les amortissements). La dépense réelle retenue est : débits nets − débits d'ordre − (crédits nets − crédits d'ordre).

**Critère.** Pour trois départements en 2024, la somme des comptes de fonctionnement (classe 6, hors 68, 675 et 676) de la fonction 221 doit être à moins de 1 % de l'agrégat « Dépenses de fonctionnement » de la fonction 221 publié par l'OFGL.

**Résultat.**

| Département | Balances | OFGL | Écart |
|---|---|---|---|
| Loire-Atlantique | 75,44 M€ | 75,44 M€ | 0,00 % |
| Nord | 167,83 M€ | 167,83 M€ | 0,00 % |
| Gironde | 98,07 M€ | 98,07 M€ | 0,00 % |

Pour information, sur les mêmes départements :
- investissement (comptes 20, 21, 23) comparé à l'agrégat OFGL « Dépenses d'investissement hors remboursements » : écarts de −0,01 %, −0,16 % et −0,01 % ;
- personnel (comptes 64) comparé à l'agrégat OFGL « Frais de personnel » : écarts de −1,81 %, −1,20 % et −0,63 %. L'agrégat de l'OFGL compte aussi d'autres comptes (personnel extérieur, taxes sur les salaires) ; l'observatoire garde les seuls comptes 64.

Les opérations d'ordre sont rares dans ces fonctions : de 6 à 19 lignes par exercice sur environ 7 000, pour 0,85 à 7,75 M€ (surtout des transferts entre comptes d'immobilisations en cours). La formule les retire.

**Décision.** Formule gardée sans changement.

## 2. Couverture

**Critère.** Chaque collectivité qui a des élèves (collèges : départements et assimilés ; lycées : régions et assimilées) a des lignes dans la bonne fonction, ou figure dans la liste des budgets non identifiés ou des fonctions non détaillées, avec une explication.

**Résultat.**

| Exercice | Collèges : collectivités avec des lignes / attendues | Lycées |
|---|---|---|
| 2020 | 101 / 101 | 17 / 18 |
| 2021 | 100 / 100 | 17 / 18 |
| 2022 | 99 / 100 | 17 / 18 |
| 2023 | 99 / 100 | 17 / 18 |
| 2024 | 99 / 100 | 17 / 18 |
| 2025 | 99 / 100 | 17 / 18 |

- Aucun budget non identifié, aucune fonction non détaillée (code 22 seul) sur les six exercices.
- 2020 compte une collectivité de plus : le Bas-Rhin et le Haut-Rhin ont chacun leur budget (voir 8).
- **La seule absence est le Département de Mayotte**, pour les lycées tous les ans et pour les collèges à partir de 2022. Depuis la décision du porteur du 2026-11-24, ce n'est plus une exception : Mayotte n'a aucune collectivité de rattachement, et le contrôle n'attend plus `dep-976`.

**Mayotte.** Les lignes du Département dans ces fonctions sont résiduelles :
- fonction 221 (collèges) : 429 € de personnel (comptes 64) en 2020, 527 € en 2021, rien ensuite ;
- fonction 222 (lycées) : de 0,13 à 0,70 M€ par an, en bourses (compte 6513 puis 65131) et en subventions de fonctionnement (6574, 65748, 65738, 65742), dont certaines lignes négatives (65738 : +280 000 € en 2020, −42 000 € en 2021 ; 65742 : −65 000 € en 2024).

Aucune dotation aux collèges ou aux lycées, aucun investissement.

Sources externes, **lues seulement à travers les résumés d'une recherche web, pas dans les documents eux-mêmes** (à vérifier avant de les citer) : une réponse ministérielle publiée par l'Assemblée nationale (question écrite n° 899, 15e législature) indiquerait que le Département de Mayotte n'exerce pas la compétence du second degré, qui ne lui a pas été transférée ; un dossier d'enquête publique de la préfecture de Mayotte (2022) indiquerait que c'est le rectorat qui construit les collèges et les lycées. Les comptes, eux, sont constatés directement : ils vont dans le même sens.

Le tableau de la spec (section 6.5) attribue les collèges et les lycées de Mayotte au Département. Les comptes montrent que ce n'est pas le cas. Le code actuel attribue les fiches de Mayotte à `dep-976`. Pour les lycées, `dep-976` n'a aucun montant (le filtre des lycées ne retient que les régions et les collectivités uniques). Pour les collèges, il n'a que les montants résiduels de personnel de 2020 et 2021 (429 € et 527 €, sous le seuil du contrôle 3), puis plus rien à partir de 2022 : les fiches afficheraient le personnel « non rattaché » en 2020-2021 et une absence de données ensuite. **Décision du porteur (2026-11-24).** Le Département de Mayotte ne finance ni les collèges ni les lycées dans les balances. Les établissements de Mayotte n'ont aucune collectivité de rattachement pour le budget, collèges comme lycées (`collectiviteDe` renvoie `null`, statut `aucune_collectivite`, libellé « aucune collectivité ne finance ces établissements dans les balances de la DGFiP »). Les fiches de Saint-Martin, Saint-Barthélemy et Saint-Pierre-et-Miquelon gardent « collectivité non identifiée dans les balances de la DGFiP » (`motifSansCollectivite` distingue les deux).

## 3. Personnel rattaché aux collèges

**Question.** Certaines collectivités inscrivent le personnel des collèges (entretien, restauration, accueil) dans la fonction 221, d'autres le laissent dans les services généraux. Il faut un seuil, en euros de comptes 64 par élève du public, sous lequel le personnel est dit « non rattaché ».

**Critère.** Le seuil est dans le creux entre les deux groupes.

**Résultat 2024** (99 collectivités) :
- 38 collectivités entre −51 € et 0,56 € par élève : 35 sans aucun compte 64, la Lozère avec un solde négatif (−0,13 M€, remboursements de personnel), la Moselle à 0,04 €, le Lot-et-Garonne à 0,56 € ;
- 61 collectivités entre 124 € et 1 436 € par élève.

Il n'y a aucune valeur entre 0,56 € et 124,52 €. La plus basse du second groupe est la Haute-Loire (124,52 € en 2024, entre 85 € et 133 € selon les années). La suivante est la Guyane (334 €), puis la Ville de Paris (542 €). Les autres sont toutes au-dessus de 540 €.

Le même seuil appliqué aux autres exercices :

| Exercice | Personnel rattaché | Non rattaché |
|---|---|---|
| 2020 | 59 | 40 |
| 2021 | 59 | 41 |
| 2022 | 60 | 39 |
| 2023 | 61 | 38 |
| 2024 | 61 | 38 |
| 2025 | 62 | 37 |

Seules valeurs entre 13 € et 200 € sur ces exercices : la Haute-Loire tous les ans, et l'Ain en 2020 (139 €).

**Décision.** `SEUIL_PERSONNEL_PAR_ELEVE = 50` € par élève du public. Le seuil est dans le creux de 2024 et sous la plus basse valeur du second groupe observée de 2020 à 2025 (Haute-Loire, 85 € en 2020).

**Lycées.** Les 16 régions et collectivités uniques qui ont des comptes 64 dans la fonction 222 sont entre 996 € (Île-de-France) et 1 962 € (La Réunion) par élève. La Martinique n'a de compte 64 ni en 222 ni en 221 : son personnel est non rattaché, aux collèges comme aux lycées.

**Signalement.** La Haute-Loire est rattachée selon ce seuil, mais son montant (0,73 M€ en 2024) vaut environ un sixième de la valeur courante par élève : son personnel n'est probablement rattaché qu'en partie. Elle n'est pas signalée sur le site.

## 4. Enseignement agricole

**Question.** Les dépenses des régions pour les lycées agricoles (publics et privés, dont les maisons familiales rurales) peuvent-elles être séparées dans les fonctions 222 et 223 ?

**Critère.** Un ensemble de comptes propre à l'enseignement agricole, présent dans toutes les régions, permettrait de retirer ces montants (mode « isole ») ; sinon, mode « mention ».

**Résultat 2024.** Les principaux comptes sont communs à tous les lycées :
- 655121, dotations de fonctionnement des lycées publics : 862 M€, 17 collectivités ;
- 655122, dotations de fonctionnement des lycées privés : 447 M€, 16 collectivités ;
- subventions d'équipement (20421, 20422, 20431, 20432) et subventions de fonctionnement (657381, 65748).

Les balances ne donnent ni le bénéficiaire ni un libellé par ligne. Aucun compte ne désigne l'enseignement agricole.

**Décision.** `AGRICOLE = { mode: "mention" }`. Les montants restent tels quels. La mention prévue s'affiche : « Les dépenses de la région incluent l'enseignement agricole, dont les élèves ne sont pas comptés ici : le montant par élève en est surestimé, surtout pour le privé. »

## 5. Cités scolaires

**Question.** Dans une cité scolaire (collège et lycée réunis), une collectivité gère l'ensemble et l'autre lui reverse sa part. Quelle part des dépenses retenues de chaque collectivité va à d'autres collectivités ?

**Mesure.** Reversements aux régions et aux départements :
- subventions de fonctionnement : comptes 65732 et 65733 ;
- subventions d'équipement : comptes 20412 et 20413, avec leurs sous-comptes.

Ils sont rapportés aux dépenses retenues du niveau (fonctionnement et investissement), exercice 2024.

**Résultat 2024.** 31 collectivités font de tels reversements. Trois dépassent 3 % :

| Collectivité | Part | Reversements / dépenses retenues |
|---|---|---|
| Département de la Creuse | 9,1 % | 1,29 M€ / 14,23 M€ |
| Département de Meurthe-et-Moselle | 7,3 % | 2,52 M€ / 34,60 M€ |
| Département de Lot-et-Garonne | 7,0 % | 1,75 M€ / 25,11 M€ |

Viennent ensuite la Moselle (2,5 %) et la Somme (1,9 %). Les autres sont sous 1,9 %. Côté lycées, les régions reversent moins de 0,3 %.

Ces reversements sont presque tous des subventions d'équipement aux régions (compte 204122, bâtiments et installations). Ils varient beaucoup d'une année à l'autre. Par exemple, Meurthe-et-Moselle a reversé 0,40 M€ en 2023, 2,52 M€ en 2024 et 0,37 M€ en 2025. La part est donc mesurée sur 2024, comme la spec le prévoit.

**Décision.** `CITES_SCOLAIRES = { "dep-23": 9,1 ; "dep-54": 7,3 ; "dep-47": 7,0 }`. Ces trois collectivités affichent la mention prévue : « Les comptes de la collectivité incluent des reversements entre collectivités pour des cités scolaires (environ {x} % des dépenses retenues). »

**À signaler au porteur : la fonction 24 « Cités scolaires ».** La nomenclature M57 a une fonction propre aux cités scolaires (24, et 9024 / 9324 selon le mode de vote). Elle est hors des fonctions 221, 222 et 223, donc hors de l'extrait collecté et des montants publiés. En 2024, elle porte environ 223 M€ de dépenses réelles (fonctionnement et investissement) dans les budgets principaux de 30 collectivités. Les onze montants les plus élevés, avec les dépenses retenues de chaque collectivité :

| Collectivité | Fonction 24 (2024) | Dépenses retenues 221 / 222 / 223 |
|---|---|---|
| Région Île-de-France | 97,30 M€ | 1 156,9 M€ |
| Région Nouvelle-Aquitaine | 41,84 M€ | 582,1 M€ |
| Région Grand Est | 25,77 M€ | 585,1 M€ |
| Région Auvergne-Rhône-Alpes | 13,21 M€ | 736,8 M€ |
| Ville de Paris | 10,66 M€ | 88,9 M€ |
| Région Hauts-de-France | 9,12 M€ | 564,6 M€ |
| Département de la Haute-Garonne | 4,85 M€ | 77,0 M€ |
| Département des Bouches-du-Rhône | 4,20 M€ | 265,0 M€ |
| Région Occitanie | 2,97 M€ | 591,3 M€ |
| Département de l'Ariège | 2,40 M€ | 6,8 M€ |
| Collectivité de Corse | 2,14 M€ | 54,0 M€ |

Ces dépenses ne se répartissent pas entre collèges et lycées dans les comptes. La règle actuelle (fonctions 221, 222, 223) les laisse de côté. Rapportées aux dépenses retenues, elles en représentent 8 % pour la région Île-de-France, 12 % pour la Ville de Paris et 35 % pour l'Ariège. **Décision du porteur (2026-11-24).** Ces dépenses restent hors des montants par élève, mais elles sont collectées pour être signalées sur la collectivité concernée. Le filtre de collecte ajoute la fonction 24 et ses formes préfixées (9024, 9124, 9224, 9324, 9424) ; la table `budget_cites` en donne le total par collectivité et par exercice (mêmes comptes retenus que le reste) ; `budget_postes` ne les contient jamais. Libellé : « {montant} dépensés par la collectivité pour des cités scolaires (collège et lycée réunis) ne sont pas comptés ici : les comptes ne les répartissent pas entre collèges et lycées. »

## 6. Saint-Martin, Saint-Barthélemy, Saint-Pierre-et-Miquelon

**Critère.** Si l'une de ces collectivités finance des collèges ou des lycées dans une fonction 221 ou 222, elle est ajoutée.

**Résultat.** Dans tout le jeu 2024 (toutes catégories de collectivités), les seuls codes d'outre-mer sont 101 Guadeloupe, 102 Guyane, 103 Martinique, 104 La Réunion et 106 Mayotte. Une recherche sur les libellés de budget (« MIQUELON », « BARTHELEMY », « SAINT-MARTIN », « ST MARTIN ») trouve 44 budgets, tous de communes, de CCAS, de groupements ou de syndicats de métropole (17 départements), aucun hors métropole.

**Décision.** Aucune règle ajoutée. Les fiches de ces trois territoires affichent « collectivité non identifiée dans les balances de la DGFiP ».

Le contrôle a aussi montré que la DGFiP code la Guyane 102 et la Martinique 103, alors que l'ordre des codes INSEE est inverse (972 Martinique, 973 Guyane). Le code supposait le même ordre. Cela restait sans effet, car ces deux collectivités sont reconnues par leur nom. La correspondance est maintenant écrite code par code, avec un test.

## 7. Compte 655122 dans la fonction des collèges

**Question.** Le compte M57 655122 est la dotation de fonctionnement des **lycées privés** : les régions l'utilisent en fonction 223 (447 M€ en 2024). Il apparaît aussi dans la fonction 221 (collèges) :

| Exercice | Collectivité | 655122 en fonction 221 | Compte des collèges privés (655112) |
|---|---|---|---|
| 2020 | Martinique | 1,40 M€ | 0,06 M€ |
| 2024 | Corrèze | 0,89 M€ | absent |
| 2025 | Corrèze | 0,90 M€ | absent |
| 2024 | Nièvre | 0,88 M€ | absent |
| 2025 | Nièvre | 0,89 M€ | absent |

La Corrèze (1 383 élèves de collèges privés) et la Nièvre (1 041) n'ont pas d'autre contribution aux collèges privés. Ce montant est leur forfait des collèges privés, imputé au compte voisin. Jusqu'ici, il était compté dans le fonctionnement du public.

**Décision.** Le compte 655122 en fonction 221 est compté comme contribution aux collèges privés (correspondance exacte, testée).

**Pour information :** collectivités qui ont des élèves du privé sous contrat mais aucune contribution au privé dans les comptes lus :
- **La Réunion, collèges**, tous les exercices (environ 5 700 élèves du privé). Le script constate l'absence de compte du privé dans la fonction 221 : en 2024, ses comptes 65 de cette fonction sont 655111 (collèges publics, 9,02 M€), 657381 (1,04 M€), 65748 (0,17 M€), 657382 (0,03 M€) et 65131 (bourses, 4 800 €). Un versement au privé imputé ailleurs (autre fonction ou autre compte) n'est pas exclu ;
- **la Martinique en 2024, collèges et lycées**. Elle n'a ni compte des collèges privés dans la fonction 221 ni aucune ligne dans la fonction 223 (lycées privés, environ 1 430 élèves à la rentrée 2023). Ses versements au privé sont irréguliers. Collèges : 1,58 M€ en 2021, 0,39 M€ en 2022, 0,37 M€ en 2023, rien en 2024, 1,66 M€ en 2025. Lycées : 1,29 M€ en 2021, 0,09 M€ en 2022 et 2023, rien en 2024, 1,23 M€ en 2025.

**Décision du porteur (2026-11-24).** Ces cas reçoivent le statut `aucune_contribution_identifiee`, avec le libellé « aucune contribution au privé identifiée dans les comptes de la collectivité pour cet exercice ». Il s'applique quand la collectivité a des élèves du privé sous contrat mais aucune ligne privée pour l'exercice, pour « Contribution aux collèges privés » comme pour « Contribution aux lycées privés ». Jamais 0 €.

## 8. Alsace et exercice 2025

**Alsace.** La Collectivité européenne d'Alsace a des montants de 2021 à 2025. Le Bas-Rhin et le Haut-Rhin n'ont des montants qu'en 2020. C'est conforme à la décision de ne rien fusionner : la série de la Collectivité européenne d'Alsace commence en 2021. Les montants 2020 des deux départements ne sont rattachés à aucune fiche.

**Exercice 2025.** 113 collectivités ont des montants, comme en 2024 (99 pour les collèges, 17 pour les lycées, 3 en commun). Le total des postes vaut 12 571 M€, contre 12 720 M€ en 2024 (−1,2 %). Les écarts portent sur des postes isolés :
- contribution aux collèges privés et contribution aux lycées privés de la Martinique : présentes en 2025, absentes en 2024 (96 collectivités pour les collèges privés en 2024, 97 en 2025 ; 16 pour les lycées privés en 2024, 17 en 2025) ;
- investissement des collèges privés : 60 départements en 2024, 56 en 2025 ;
- investissement des lycées privés : 16 collectivités en 2024, 15 en 2025. La région Guadeloupe en a un en 2024 (0,20 M€), pas en 2025 (elle en avait aussi en 2020 et 2023) ;
- personnel : le Lot-et-Garonne a un compte 64 résiduel en 2024 (6 849 €) et aucun en 2025 ; il reste sous le seuil. Le Val-d'Oise rattache son personnel aux collèges à partir de 2025 (44,08 M€), alors qu'il n'avait aucun compte 64 dans la fonction 221 de 2020 à 2024. Sa série « personnel compris » commence donc en 2025.

L'exercice 2025 est complet et utilisable.

## 9. Communes : dépenses pour leurs écoles (phase Écoles)

Contrôles faits le 24 novembre 2026 par des requêtes agrégées sur data.economie.gouv.fr (mêmes jeux, exercices 2020 à 2025) et sur les effectifs des écoles de la DEPP (rentrée 2023), rapprochés par l'Annuaire de l'éducation.

**Catégories.** Les valeurs exactes de `categ` sont `Commune` (avec cette casse) et `SYND` ; les autres catégories du jeu 2024 sont `CTU`, `DEPT`, `EPL`, `EPT`, `GFP` (intercommunalités à fiscalité propre), `ML`, `PARIS` et `REG`. Le code de la commune est donné par deux colonnes : `ndept` (département sur 3 caractères, `044`, `02A`, ou `101` à `106` outre-mer) et `insee` (commune dans son département, 3 chiffres). Code INSEE : `ndept` sans son 0 suivi de `insee` (`044` + `109` → `44109`) ; outre-mer, `97` suivi de `insee` (`101` + `101` → `97101`, `102` + `302` → `97302`, `106` + `611` → `97611`, vérifié sur les cinq territoires). Paris, Lyon et Marseille sont une seule commune dans les balances (`13055`, `69123`) ; Paris est la catégorie `PARIS` (`075` + `056`).

**Fonctions.** M14 (la plupart des communes jusqu'en 2023) et M57 (la plupart à partir de 2024) ont la même fonction 21 « enseignement du premier degré » : 211 écoles maternelles, 212 écoles primaires (élémentaires), 213 classes regroupées. Les communes ajoutent des détails locaux (2111, 2121, 21101…, une à quinze communes chacun) et, selon le mode de vote, un chapitre devant le code (90211, 93212 : 16 à 18 communes en 2024). Sont hors des écoles : 20 et 201 (services communs de l'enseignement, partagés entre niveaux), M14 25x et M57 28x (hébergement et restauration scolaires, transport, sport et médecine scolaires, classes de découverte), 22x (second degré). Nombre de communes (budget principal) avec des lignes en 2024 : 211 dans 2 955 communes, 212 dans 3 006, 213 dans 1 852.

**Règle retenue.** Fonction : 21 et tout code qui commence par 21, seul ou précédé d'un chapitre 90 à 94, ramené à « 21 ». Formule de la dépense réelle et comptes : les mêmes que pour les collèges (section 1 ; personnel = comptes 64 ; fonctionnement = classe 6 hors 68, 675 et 676 ; investissement = 20, 21, 23). Comme la part privée des collèges, deux comptes sont retirés des écoles publiques :
- **6558, autres contributions obligatoires** (M14 et M57) : 254 M€ dans 1 163 communes en 2024, environ 15 % du fonctionnement hors personnel. Il mêle le forfait communal des écoles privées sous contrat et les frais de scolarité versés à d'autres communes pour leurs élèves, que les comptes ne séparent pas. Ces dépenses ne vont pas aux écoles publiques de la commune ; les compter gonflerait le montant par élève, surtout là où le privé est important. Elles ne sont pas publiées à part (aucun montant fiable du privé) ;
- **2042, subventions d'équipement aux personnes de droit privé**, comme pour les collèges.

Les subventions aux associations (65748 : coopératives scolaires, associations sportives, parfois les organismes de gestion des écoles privées) restent comptées : les comptes ne disent pas le bénéficiaire.

**Filtre de collecte.** Ajout, au filtre de la phase 3 qui reste identique pour les départements et les régions : `categ in ("Commune","SYND","PARIS")` et une fonction qui commence par `21`, `9021`, `9121`, `9221`, `9321` ou `9421`. Vérifié sur 2024 : 209 488 lignes de 3 185 communes, 1 273 lignes de 60 syndicats, 124 lignes de la Ville de Paris ; départements et régions : mêmes lignes qu'avant. L'extrait passe d'environ 7 000 lignes à environ 217 000 par exercice.

**Couverture.**

| Exercice | Communes avec des lignes 21x | Dépenses nettes, tous comptes | Ville de Paris | Syndicats | Intercommunalités (GFP, non collectées) |
|---|---|---|---|---|---|
| 2020 | 2 913 | 5 159 M€ | 481 M€ | 28 · 8 M€ | 250 · 258 M€ |
| 2021 | 2 933 | 5 536 M€ | 442 M€ | 25 · 7 M€ | 250 · 278 M€ |
| 2022 | 3 003 | 6 097 M€ | 466 M€ | 29 · 7 M€ | 255 · 276 M€ |
| 2023 | 3 072 | 6 526 M€ | 483 M€ | 43 · 7 M€ | 245 · 310 M€ |
| 2024 | 3 185 | 6 962 M€ | 509 M€ | 60 · 6 M€ | 293 · 327 M€ |
| 2025 | 3 172 | 7 040 M€ | 538 M€ | 54 · 5 M€ | 297 · 359 M€ |

En 2024, 3 249 communes ont un budget principal dans le jeu ; 3 185 ont des lignes dans les fonctions des écoles. Rapprochées des 20 722 communes qui avaient au moins une école publique à la rentrée 2023 (élèves de la DEPP, commune de l'Annuaire) : 3 256 communes publiées (Paris compris), 69,2 % des élèves des écoles publiques. Quatre communes publiées n'avaient aucun élève du public à cette rentrée.

**Seuil de personnel.** Comptes 64 des fonctions 21x par élève du public, 2024, 3 255 communes : 540 sous 1 € (dont 36 négatifs), 30 entre 1 et 10 €, 26 entre 10 et 50 €, 23 entre 50 et 100 €, 41 entre 100 et 200 €, 59 entre 200 et 300 €, puis 2 536 au-dessus (la masse entre 500 et 2 000 €). Il n'y a pas de creux net comme pour les collèges ; la zone la moins dense va de 1 à 100 € (79 communes). **Décision :** le seuil des collèges (`SEUIL_PERSONNEL_PAR_ELEVE`, 50 € par élève) est gardé : 2 659 communes « personnel compris », 596 « personnel non rattaché aux écoles dans les comptes de la commune ». Les communes entre 50 et 300 € rattachent probablement une partie seulement de leur personnel (ATSEM, entretien) ; elles ne sont pas signalées. Pour information, fonctionnement hors personnel par élève en 2024 : médiane 406 €, 10 % sous 125 €, 10 % au-dessus de 782 €.

**Intercommunalités et syndicats.** Une commune peut confier ses écoles à une intercommunalité (communauté de communes avec la compétence scolaire) ou à un syndicat (SIVOS, regroupements pédagogiques). Leurs dépenses ne sont **attribuées à aucune commune** : les balances ne disent pas comment elles se répartissent entre les communes membres, ni entre leurs écoles ; une répartition par élève serait un calcul de l'observatoire, pas un chiffre de la source. Les syndicats sont collectés (catégorie `SYND`, regroupés sous `syndicats`, jamais dans les montants) pour que leur poids reste mesuré à chaque génération ; les intercommunalités (`GFP`) ne sont pas collectées, leur poids est donné ci-dessus. Conséquence : le montant d'une commune dont une partie des écoles est gérée par un syndicat ou une intercommunalité est **sous-estimé**, et une commune qui leur a tout confié est absente des balances par fonction : sa fiche affiche le même libellé qu'une commune de moins de 3 500 habitants. Les dépenses de la Métropole de Lyon (4,6 M€ en 2024) et de quelques départements et régions dans ces fonctions ne sont pas collectées.

**Absence.** Une commune qui n'a aucune ligne dans ces fonctions (pour l'exercice, ou pour tous) affiche « Budget par fonction non publié pour cette commune (seules les communes de 3 500 habitants et plus le publient) ». **Écart avec la spec** (section 6.8, « Budget non publié pour les communes de moins de 3 500 habitants ») : aucune source de population n'est collectée, et une commune absente peut avoir plus de 3 500 habitants (écoles confiées à un syndicat ou à une intercommunalité) ; le libellé ne dit pas une taille que l'observatoire ne connaît pas (décision du contrôleur, 2026-11-24).

**Limites propres aux communes.**
- Communes nouvelles : la balance d'un exercice porte la commune de l'époque, alors que les élèves sont comptés sous la commune d'aujourd'hui (Code officiel géographique), écoles des communes absorbées comprises. Diviser la balance d'avant la fusion par ces élèves sous-estimerait le montant. Pour une commune qui en a absorbé d'autres (mouvements 31, 32, 33 du Code officiel géographique) après le 1er janvier d'un exercice, cet exercice affiche « Commune fusionnée après cet exercice : montant par élève non calculé » et sort de la moyenne France. Les élèves ne sont pas recomptés par commune de l'époque : l'Annuaire donne la commune d'aujourd'hui de chaque école, et la colonne commune des effectifs des écoles contient en fait des codes postaux (constaté le 24 novembre 2026) ; la commune d'une école à une rentrée passée n'est donc pas connue exactement. Les balances des communes absorbées ne sont attribuées à aucune commune.
- Les frais de scolarité reçus d'autres communes (recettes) ne sont pas déduits, comme pour les collèges ; ceux qu'une commune verserait à un autre compte que 6558 (par exemple 6287, remboursements de frais ; non vérifié) resteraient comptés.
- Corrections de la DGFiP : la clé de comparaison des versions devient `categ|ndept|cregi|lbudg|insee|fonction`. `insee` rattache une correction à sa commune (fiches de ses écoles publiques et page de la commune) ; `fonction` sépare les écoles de la Ville de Paris (21x, commune 75056) de ses collèges (221) : une correction limitée aux unes ne marque pas les autres. Les clés à quatre parties restent lues comme avant (aucune correction archivée ne concernait une commune : les extraits antérieurs n'en contenaient pas).

## Limites connues

- **Établissements fermés.** Les élèves comptés sont ceux des établissements du périmètre actuel. Les élèves d'un établissement fermé depuis ne sont pas comptés dans les exercices anciens.
- **Personnel extérieur.** Le personnel retenu se limite aux comptes 64. Le personnel extérieur (621) n'est pas compté.

## 10. Transport scolaire (phase Transport, lot 1)

Inventaire fait le 2026-11-25 sur les balances 2020 à 2025 (API data.economie.gouv.fr, `cbudg = "1"`, catégories REG, CTU, DEPT, ML, PARIS, GFP, SYND). Montants : dépense nette (`obnetdeb − oobdeb − obnetcre + oobcre`), tous comptes confondus, en M€.

### Codes retenus selon la nomenclature

Le sens d'un code de fonction dépend de la nomenclature comptable de la collectivité (colonne `nomen`) :

| Nomenclature | Codes retenus | Motif |
|---|---|---|
| M57 (toutes catégories) et M52 (départements jusqu'en 2023) | `81`, `9081`, `9381` (fonction 81 « transports scolaires », seule ou après les chapitres 908 et 938) ; `252`, `90252`, `93252` (fonction 252 « transports scolaires » du bloc enseignement) | Nomenclature fonctionnelle : 8 Transports, 81 Transports scolaires, 82 Transports publics de voyageurs. |
| M14 (communes, intercommunalités, syndicats jusqu'en 2023) | `252`, `90252`, `93252` | En M14, la fonction 8 regroupe les services urbains : `811` eau et assainissement, `812` ordures ménagères (3,3 Md€ pour les GFP en 2020), `813` propreté. Retenir `81x` en M14 compterait les déchets comme du transport scolaire. |
| M71 (régions jusqu'en 2022) | aucun | Voir ci-dessous. |

Codes exclus : `82x` et `9382x` (transports publics de voyageurs : `93821` = 1,56 Md€ pour les régions en 2024, surtout le TER) ; `90281` (chapitre 902 + fonction 281, restauration et hébergement) ; `9025` et `9325` (fonction 25 des départements en M52) ; `93881` (fonction 881).

### Régions en M71 : exercices non comparables

En 2020, la plupart des régions tiennent leurs comptes en M71. La documentation de cette nomenclature n'a pas pu être consultée (les fichiers du site collectivites-locales.gouv.fr renvoient une erreur 404). Le code `93815`, candidat le plus proche, ne correspond pas aux montants des mêmes régions une fois passées en M57 (code `9381`) :

| Région | 2020, M71, `93815` | 2024, M57, `9381` |
|---|---|---|
| Auvergne-Rhône-Alpes | 268 | 220 |
| Grand Est | 42 | 202 |
| Nouvelle-Aquitaine | 11 | 218 |
| Occitanie | 55 | 209 |
| Bourgogne-Franche-Comté | 16 | 147 |
| Hauts-de-France | 234 | 43 |

L'imputation du transport scolaire varie donc d'une région à l'autre en M71 (une part est sans doute dans `93813`, transport routier). **Règle retenue** : aucun montant n'est tiré des comptes en M71 ; la source télécharge seulement des lignes marqueurs (`93811`, `93813`, `93815`) pour savoir quels exercices d'une région sont tenus en M71, et le site l'indique au lieu d'afficher une absence de dépense.

Le passage de Hauts-de-France de 234 M€ (M71) à 43 M€ (M57) montre aussi qu'en M57 une région peut imputer une part du transport scolaire ailleurs (transport interurbain). La note du site le dit : les montants sont ceux que la collectivité impute à cette fonction.

### Contrôle de vraisemblance (2024, régions, `9381` + `93252`, dépense nette)

| Région | Inventaire | Phase 3 (fonctionnement, fonction 81) | Écart |
|---|---|---|---|
| Auvergne-Rhône-Alpes | 226 | 219 | 3 % |
| Pays de la Loire | 182 | 175 | 4 % |

Écart inférieur à 10 % : il vient de l'investissement et de comptes hors classe 6, compris dans la dépense nette ci-dessus.

### Postes

- **Fonctionnement** : comptes de classe 6, hors `68`, `675` et `676` (même règle que le budget des établissements).
- **Investissement** : comptes `20`, `21` et `23`.
- **Produits des services** : recette nette (`obnetcre − oobcre − obnetdeb + oobdeb`) des comptes `70`, où figurent les participations des familles.

### Rattachement

Régions, CTU, départements, Métropole de Lyon, Collectivité européenne d'Alsace et Ville de Paris : comme pour le budget. Intercommunalités (GFP) et syndicats (SYND) : département de leur siège (`ndept`), un par SIREN ; ceux dont le département n'est pas reconnu sont listés dans la table `transport_inconnus`. Les communes ne sont pas comptées.
