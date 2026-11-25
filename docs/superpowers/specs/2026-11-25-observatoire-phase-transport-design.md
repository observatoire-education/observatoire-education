# Observatoire citoyen de l'éducation : phase Transport scolaire (financement et desserte publiée)

Date : 2026-11-25. Statut : conception, en attente d'approbation.
S'appuie sur l'étude `2026-11-24-observatoire-transport-etude.md` (données, tests, pièges), à lire avant ce document. Complète la spec, le socle et les specs des phases 2, 3, 4 et Écoles. En cas de conflit sur le périmètre du transport, ce document l'emporte.

## 1. Intention

Être factuel sur le **financement** du transport scolaire et sur la **desserte publiée** des collèges et lycées. Certaines régions sont accusées de tracer des lignes qui desservent le privé plus que le public : l'observatoire doit permettre de vérifier, depuis une commune donnée, quelles courses du matin partent vers quel établissement, public ou privé sous contrat, à quelle heure et en combien de temps, **sans commenter ni calculer d'écart**.

Cas de référence, qui doit pouvoir se lire sur le site (étude, section 7) : à Saint-Mars-de-Coutais, des courses du matin « SECONDAIRES BOUAYE » (7 h 45 et 7 h 50) vers le lycée public de Bouaye, et « SECONDAIRES MACHECOUL » (8 h 05) vers Machecoul.

Lecteurs : parents, élus locaux, journalistes, équipes des établissements.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Financement de la fonction 81 « Transports scolaires » sur les pages région et département, en euros, avec l'évolution depuis 2020.
- Depuis une **commune** : les courses directes du matin qui partent de la commune vers un collège ou un lycée, public et privé côte à côte.
- Depuis un **collège ou un lycée** : les lignes dont une course du matin le dessert, leurs communes d'origine, leurs heures, leur tracé.
- Chaque jeu GTFS utilisé est archivé et cité comme toute autre source.

**Non-objectifs (cette livraison)**
- Temps de trajet calculé (r5py, porte à porte, correspondances) : approche 2 de l'étude, plus tard.
- Réseaux urbains, TER, réseaux scolaires d'agglomération (AOM autres que la Région).
- Comparatif des règlements régionaux d'ayants droit et des tarifs : approche 3 de l'étude, plus tard.
- Écoles du premier degré.
- Nombre d'élèves transportés, € par élève transporté.

**Anti-objectifs** (échec même si tout fonctionne)
- Une absence de données (circuits non publiés, réseau absent) qui se lit comme une absence de desserte.
- Une commune sans course **directe** vers un établissement présentée comme non desservie.
- Le rattachement d'une course à un établissement présenté comme une donnée de la Région alors que c'est une inférence de l'observatoire.
- Une formulation, un tri ou un indicateur qui suggère une intention (« favorise le privé ») ou un palmarès.
- Un écart public/privé calculé et affiché par le site.
- Un € par élève transporté (motifs : phase 3, section 9.2).

## 3. Décisions du porteur

- Ordre : **financement puis desserte publiée** (approches 4 et 1 de l'étude) ; calcul d'accessibilité et règlements plus tard.
- Desserte vue **depuis la commune et depuis l'établissement** ; la vue commune est le cœur du sujet.
- **Collèges et lycées** inclus dès cette livraison (les mêmes circuits les desservent ; « SECONDAIRES », « Collège et lycée »).
- Réseaux comptés : **circuits scolaires et lignes régulières de la Région** (ou de l'organisateur régional délégué), chaque course portant son type. Pas d'urbain, pas de TER.
- Construction **dans le pipeline actuel** (Bun + DuckDB), pas d'étape Python.

## 4. Approches considérées (construction de la desserte)

| Approche | Gain | Coût | Verdict |
|---|---|---|---|
| **1. Pipeline actuel, liste de jeux tenue à la main** | Aucune technologie nouvelle ; mêmes tests, archives et garde-fous | Lecture des calendriers GTFS (jours, exceptions) à écrire en SQL | **Retenue** |
| 2. Étape Python (gtfs-kit / partridge) produisant du Parquet | Lecture des calendriers éprouvée ; prépare r5py | Deuxième langage dans le dépôt et la CI nocturne, pour un besoin couvert par DuckDB | Écartée pour cette livraison ; à reconsidérer avec le calcul d'accessibilité |
| 3. Découverte automatique par l'API transport.data.gouv.fr | Pas de liste à maintenir | Les agrégats réécrivent `route_type` ; les jeux Pays de la Loire et Corse n'y sont pas | Écartée ; l'API sert seulement à signaler les nouveaux jeux dans le journal |

## 5. Découpage

Quatre lots, livrés et mis en ligne l'un après l'autre :

| Lot | Contenu |
|---|---|
| 1. Financement | Fonction 81 dans les balances DGFiP ; blocs région et département ; `/methode/`, `/sources/` |
| 2. Collecte GTFS | Registre des jeux, archivage, statut de publication par département |
| 3. Rattachement | Courses du matin → établissement ; contrôle manuel du taux d'erreur avant toute publication |
| 4. Pages | Bloc commune, bloc fiche, tracés sur la carte, mentions d'absence, méthode et sources |

Le lot 3 n'est publié que si le contrôle manuel (section 8.4) est satisfaisant.

## 6. Lot 1 : financement

- **Source** : balances DGFiP déjà collectées par la phase 3 (extraits filtrés, archivés avec leur requête). Le filtre s'élargit à la fonction 81 et à ses sous-fonctions, pour les catégories Région, Département, CTU, GFP (intercommunalités) et syndicats (`SYND`). Les exercices 2020-2025 déjà collectés sont refiltrés ou recollectés : au builder.
- **Montants affichés** (en euros, jamais par élève) :
  - dépenses de fonctionnement de la fonction 81 ;
  - dépenses d'investissement, si non négligeables ;
  - recettes de la fonction 81 identifiables comme participation des usagers, si les comptes le permettent (sinon non affichées et dit dans `/methode/`).
- **Où** :
  - page **région** : la Région (ou la CTU) ;
  - page **département** : le Département (transport des élèves en situation de handicap, surtout), et le total des intercommunalités et syndicats dont le siège est dans le département, avec leur nombre et la liste dépliable ;
  - page **France** : tableau des régions, CSV téléchargeable.
- **Évolution** depuis 2020, sur le modèle du graphique de `BlocBudget` (`evolution={true}`).
- **Absence de ligne** (Île-de-France, La Réunion, ou toute collectivité sans fonction 81) : phrase dédiée, du type « Le transport scolaire n'apparaît pas dans les comptes de la Région : il est organisé par Île-de-France Mobilités », jamais 0 €. Le texte par cas est au builder, sourcé.
- **Note fixe** sous le bloc : la compétence peut être déléguée (départements, syndicats, agglomérations), la gratuité varie selon les régions, et aucun nombre d'élèves transportés n'est publié en données ouvertes : d'où l'absence de € par élève.

## 7. Lot 2 : collecte et archivage des GTFS

### 7.1 Registre des jeux

Une liste tenue à la main (dans `pipeline/src/sources.ts` ou un fichier voisin), une entrée par jeu :
- identifiant, titre, producteur (organisateur), URL de la page et URL du fichier ;
- région et départements couverts ;
- **type des courses** : `circuit` (jeu scolaire séparé), `regulier`, ou `mixte` (jeu commun où le type se lit dans `route_type` 712/713 ou un autre marqueur) ;
- marqueur scolaire propre au jeu, le cas échéant (`route_type` 712/713, suffixe `S` du Nord…).

Partir **toujours du jeu de l'organisateur, jamais de l'agrégat** (étude, section 3). Liste initiale : **dans toutes les régions**, les jeux de circuits scolaires recensés dans l'étude (section 3) **et** les jeux de lignes régulières de la Région (Aléop, Somme commercial, Cars Régionaux des 12 départements de Nouvelle-Aquitaine, BreizhGo, Nomad, Mobigo…), conformément à la décision du porteur (section 3). Un tableau de commune peut donc mêler circuits et lignes régulières : chaque ligne porte son type.

### 7.2 Statut de publication par département

Une table tenue à la main, par département : `publie` (circuits scolaires publiés et identifiables), `integre` (les courses scolaires sont publiées parmi les lignes régulières, sans marquage : Occitanie, Centre-Val de Loire), `partiel` (une partie seulement), `non_publie` (lignes régulières seulement). *Choix du concepteur* : le statut `integre` évite d'afficher « circuits non publiés » là où ils le sont sous forme de lignes régulières ; leurs courses portent le type « ligne régulière », puisque le jeu ne les distingue pas. Les cas non mesurés par l'étude (couverture liO par département, Nord et Oise avec le suffixe `S`, Rhône) sont **mesurés pendant le lot 2, avant toute publication** ; un département sans mesure n'a pas de statut et n'affiche aucune desserte. Elle pilote les mentions d'absence (section 9.3). Valeurs initiales d'après l'étude, section 3 (AURA : 6 départements `publie`, 5 `non_publie` ; Nouvelle-Aquitaine : Gironde `publie`, 11 `non_publie` ; etc.). Chaque valeur porte sa date de vérification.

### 7.3 Archivage

- Chaque version d'un jeu est archivée **telle quelle** (zip d'origine) dans les GitHub Releases, avec son empreinte, comme les autres sources ; `archive.ts` et `collect.ts` gèrent aujourd'hui du Parquet : le support du zip GTFS est à ajouter.
- Nouvelle version seulement si l'empreinte change. Fréquence : chaque nuit avec les autres sources, ou chaque semaine (au builder ; une fois par semaine suffit d'après l'étude).
- Validation : présence de `stops.txt`, `trips.txt`, `stop_times.txt`, `routes.txt`, et de `calendar.txt` ou `calendar_dates.txt` ; un jeu dont la période de validité est terminée (Martinique) est archivé mais **signalé** et ses courses affichées avec la mention de la période.
- La page `/sources/` liste chaque jeu, son producteur, sa licence, la date de la version utilisée et le lien vers l'archive.
- Journal : signaler les jeux de sous-type `school` présents sur transport.data.gouv.fr et absents du registre.

## 8. Lot 3 : rattachement des courses aux établissements

### 8.1 Jour de référence

Les courses sont lues pour **un jour de référence unique**, fixé à la main pour l'année scolaire dans la configuration du pipeline (un mardi hors vacances de toutes les zones, choisi en lisant le calendrier officiel), comme le millésime du COG. *Choix du concepteur* : une date unique évite une source de calendrier des vacances, garde la même date sur toute une page et ne régénère pas toutes les pages à chaque glissement, ce qui préserve les déploiements incrémentaux. Elle est changée à chaque rentrée ; la collecte journalise une erreur quand elle est passée depuis plus de 30 jours. Le calendrier GTFS (`calendar` + `calendar_dates`) est résolu pour ce jour. Un jeu dont la validité ne couvre pas ce jour n'est pas lu : son département affiche « Jeu publié hors période (validité du … au …) ». Le jour est affiché sur le site (« courses du mardi 1er décembre 2026 »). Les jeux à calendrier fictif (Corse, 2018-2050) sont lus tels quels, avec une mention.

### 8.2 Course du matin et terminus

- Une **course du matin** arrive à son dernier arrêt entre **6 h 30 et 9 h 30** le jour de référence (bornes au builder après lecture des horaires ; l'étude a vu 440 départs entre 6 h et 6 h 30 en Pays de la Loire).
- On retient le **dernier arrêt** et aussi les arrêts intermédiaires situés près d'un établissement (une course « Collège et lycée de Sartène » en dessert deux).

### 8.3 Règle de rattachement

**Établissements candidats** *(choix du concepteur)* : **tous** les établissements ouverts du second degré de l'Annuaire de l'éducation, publics et privés sous contrat, y compris ceux qui n'ont pas de fiche sur le site (lycées agricoles hors des familles retenues, maisons familiales rurales sous contrat…). Les exclure ferait rattacher à tort leurs courses à un voisin dans le rayon, et une bonne part de l'agricole est privée sous contrat : ce serait un biais public/privé. Un établissement sans fiche apparaît dans le tableau de commune avec son nom, son secteur et sa nature, sans lien ; il n'a pas de bloc « Desserte du matin ». Les établissements hors contrat sont exclus, comme partout sur le site.

Une course du matin est rattachée à un établissement candidat ouvert (coordonnées de l'Annuaire) si :
1. un arrêt desservi par la course, à l'arrivée ou avant, est à **moins de 300 m** de l'établissement (haversine, `HAVERSINE_SQL` de `pipeline/src/fiches.ts`) ;
2. et, quand plusieurs établissements sont dans ce rayon, la girouette, le nom de ligne ou le nom court confirme l'un d'eux ; sinon la course est rattachée à **tous** les établissements du rayon, et la fiche le dit (« arrêt commun à plusieurs établissements »).

Le rattachement est une **inférence de l'observatoire**, affichée comme telle et décrite dans `/methode/` avec ses paramètres.

### 8.4 Contrôle avant publication

- Échantillon tiré au hasard dans chaque jeu (dont Somme, ZOU !, Pays de la Loire), vérifié à la main (nom, horaire, calculateur régional).
- Les résultats (taux de bons rattachements, erreurs typiques) sont écrits dans un document de contrôle versionné, sur le modèle de `docs/budget-controles.md`, et résumés dans `/methode/`.
- Tests automatisés sur les cas connus de l'étude : Saint-Mars-de-Coutais (Bouaye 7 h 45 et 7 h 50, Machecoul 8 h 05), « Collège Louis Jouvet - Gamaches » (Somme).
- Seuil d'acceptation *(décision du porteur)* : **au moins 90 % de bons rattachements, jeu par jeu**. Chaque jeu du registre porte un drapeau `publiable` ; un jeu sous le seuil est mis de côté sans bloquer les autres, et son département affiche « Desserte en cours de vérification ». L'échantillon compte donc assez de rattachements par jeu pour juger chacun (au builder, au moins 20 par jeu).
- Le builder fait les vérifications et les consigne dans le document de contrôle ; le porteur le valide avant toute mise en ligne.

### 8.5 Communes de départ

La commune d'un arrêt est déterminée par les contours communaux déjà utilisés par le site (`site/src/lib/contours`) ou une source équivalente. Une course part d'une commune si elle y dessert au moins un arrêt **avant** l'arrêt de l'établissement. On retient, pour la commune, le **premier** passage de la course dans la commune (heure de départ) et l'heure d'arrivée à l'arrêt de l'établissement ; la **durée publiée** est leur différence.

## 9. Lot 4 : pages

### 9.1 Page commune : « Courses du matin au départ de la commune »

Placé après les blocs établissements et écoles, avant le budget et les sources.

```
Courses du matin au départ de Saint-Mars-de-Coutais
Courses directes publiées par la Région, mardi 1er décembre 2026

Établissement                          Secteur  Ville      Départ   Arrivée  Durée   Courses  Type
Lycée Alcide d'Orbigny                 public   Bouaye     07:12    07:45    33 min  2        circuit scolaire
Collège …                              privé    Machecoul  07:31    08:05    34 min  1        circuit scolaire
…
« Courses directes seulement : un élève peut aussi rejoindre un établissement
avec une correspondance, que ce tableau ne montre pas. »
« Le rattachement d'une course à un établissement est déduit par l'observatoire (méthode). »
```

- Une ligne par établissement (et par type de course) ; plusieurs courses → première heure de départ, plage des arrivées, nombre de courses.
- **Tri par nom de ville puis d'établissement** (ou par heure d'arrivée, au builder), **jamais par durée** : pas de palmarès.
- Public et privé dans le même tableau, secteur en colonne ; aucun écart calculé.
- Aucune course : selon le statut du département, « Aucune course directe vers un collège ou un lycée n'est publiée au départ de la commune » ou la mention de non-publication (9.3).

### 9.2 Fiche collège ou lycée : « Desserte du matin »

Placé après « Voisins » et les rattachements, avant les sources (même zone que les écoles du secteur).
- Les lignes dont une course du matin dessert l'établissement : nom de ligne, type, communes d'origine (liées à leur page quand elle existe), première arrivée, nombre de courses.
- Bouton « Afficher les tracés » sur la carte MapLibre déjà présente (`Entete.astro`, chargée au clic).
- Fiche imprimable A4 : le tableau, sans carte.
- Établissements fermés : pas de bloc.

### 9.3 Mentions d'absence

Pilotées par le statut du département de **l'établissement** (fiche) ou de **la commune** (page commune) :
- `non_publie` : en tête du bloc, avant toute ligne régulière : « Les circuits scolaires de ce département ne sont pas publiés en données ouvertes par la Région. Seules les lignes régulières apparaissent ici. »
- `integre` : « Dans ce département, les courses scolaires sont publiées parmi les lignes régulières, sans être distinguées. »
- `partiel` : « Les circuits scolaires de ce département ne sont publiés qu'en partie. »
- Département sans statut mesuré : pas de bloc de desserte, seulement « Desserte publiée non encore examinée pour ce département ».
- Commune ou établissement hors du périmètre de tout jeu : « Aucun réseau régional publié ne couvre … ».
- Le site constate sans qualifier (étude, section 8 bis).

### 9.4 Région et département

Le bloc financement (lot 1), plus une ligne de couverture : « Circuits scolaires publiés en données ouvertes : oui / en partie / non », la liste des jeux utilisés et leur date.

### 9.5 Méthode et sources

`/methode/` : jour de référence, bornes du matin, rayon de 300 m, règle de confirmation par le nom, communes de départ, durée publiée, résultat du contrôle manuel, ce que les tableaux ne montrent pas (correspondances, ayants droit, nombre d'élèves). `/sources/` : chaque jeu GTFS (section 7.3).

## 10. Contraintes

- **Plafond de fichiers** : environ 92 700 fichiers estimés pour 95 000 autorisés. **Aucun fichier par établissement ni par commune** n'est ajouté. Les tracés sont regroupés dans **un fichier par département** (ou par jeu), chargé avec la carte ; les géométries sont simplifiées (mapshaper est déjà une dépendance).
- **Pages commune** : elles n'existent que pour les communes qui ont ou ont eu une école (phase Écoles, environ 23 000 communes). Une commune de départ sans page n'est visible que **depuis la fiche** de l'établissement (nom sans lien). Créer de nouvelles pages commune est exclu par le plafond.
- **Poids des pages commune** : plafond `OCTETS_COMMUNE_MAX` (750 000 octets). Grandes villes : tronquer le tableau avec un renvoi au fichier de données, au builder.
- **Taille des GTFS** : de 0,4 à 43 Mo par jeu (IDFM exclu, non retenu). La lecture DuckDB se fait depuis le zip décompressé dans le cache.
- **Charge** : un téléchargement par jeu et par semaine au plus.

## 11. Laissé au builder

Ces choix ne changent pas ce que voit le lecteur ; le builder les tranche et les documente dans `/methode/` quand ils touchent aux chiffres.
- Emplacement exact du registre GTFS et du statut par département.
- Lecture SQL des calendriers GTFS (`calendar`, `calendar_dates`, heures au-delà de 24 h).
- Bornes exactes du matin, après lecture des horaires réels.
- Comptes exacts de la fonction 81 (fonctionnement, investissement, recettes des usagers) d'après la M57 ; consigner dans `docs/budget-controles.md`.
- Rattachement des GFP et syndicats à un département (siège).
- Formats des fichiers de données (`site/data/`), sur le modèle des phases précédentes.
- Simplification des tracés, regroupement par département ou par jeu.
- Mise en page exacte des blocs ; texte exact des mentions d'absence par cas.
- Ordre du tableau commune (ville puis établissement, ou heure d'arrivée).

## 12. Questions ouvertes

Aucune.
