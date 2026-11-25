# Transport scolaire : étude des données

Date : 2026-11-24 · Statut : **étude préalable, pas encore une spec de conception**. Elle recense les données et teste leurs croisements. La conception (pages, méthode, sources) viendra après la livraison de la phase Écoles, pour ne pas toucher en parallèle `/methode/`, `/sources/`, le README et le pipeline.

Constats vérifiés le 2026-11-24 sauf mention contraire. Statuts : **[V]** vérifié (fichier ouvert ou page consultée) ; **[S]** vu seulement dans un extrait de moteur de recherche ; **[NV]** non vérifié.

## 1. Rappel de l'intention

Reprise de la spec phase 3, section 9.2 : être factuel sur le **financement** et sur les **parcours** des lignes scolaires (tracés, arrêts desservis, temps de trajet), d'abord pour les lycées, qui relèvent de la région. Certaines régions sont accusées de tracer des lignes qui desservent le privé plus que le public. L'observatoire doit permettre de vérifier, sans commenter.

Anti-objectifs du socle qui pèsent particulièrement ici :
- un chiffre de méthode présenté comme un chiffre de source ;
- une absence (ligne non publiée, réseau sans GTFS) qui passe pour une absence de desserte ;
- une formulation qui conclut à une intention (« favorise le privé »).

## 2. Les sources, en bref

| Besoin | Source | Statut | Verdict |
|---|---|---|---|
| Tracés, arrêts, horaires | GTFS publiés sur transport.data.gouv.fr (API `/api/datasets`), plus deux jeux scolaires qui n'y sont pas référencés : Pays de la Loire (data.paysdelaloire.fr) et Corse (data.corsica) | [V] | Lignes régulières disponibles partout. Circuits scolaires publiés dans 7 régions sur 13 en métropole, dont 2 seulement en partie (section 3). |
| Financement | Balances DGFiP, fonction 81 « Transports scolaires » (régions, départements, GFP, syndicats) | [V] (phase 3) | Prêt : même mécanisme d'extraits que la phase 3. |
| Élèves transportés | Aucune source ouverte nationale | — | Trou. Seulement des chiffres régionaux dans des communiqués (PDF). |
| Flux domicile → études | INSEE, *Mobilités scolaires* 2022, fichier détail (`RP2022_mobsco.parquet`, 26 Mo) | [V] | Commune de résidence → commune d'études, âge en 10 classes dont **15-17 ans**. **Sans mode de transport ni secteur public/privé.** |
| Règles d'ayants droit | Règlements régionaux en PDF, un par région (parfois par département) | [S] | Aucun comparatif ouvert : à construire à la main. |
| Secteurs des lycées | Carte scolaire des collèges et lycées publics d'Occitanie (data.gouv.fr, Licence Ouverte 2.0) | [V] page, fichier non ouvert | Seule source trouvée. Publiée par une personne et non par un rectorat, ce qui pose une question d'opposabilité. |
| Établissements | Annuaire de l'éducation (déjà dans le pipeline : UAI, secteur, coordonnées) | [V] | Prêt. |

## 3. Les GTFS région par région

Catalogue de transport.data.gouv.fr : 499 jeux de transport en commun, dont **25 portent le sous-type `school`** [V]. Les jeux régionaux ont été téléchargés et inspectés : lignes, `route_type`, girouettes (`trip_headsign`) qui nomment un établissement. Cela fait 52 jeux départementaux ou régionaux, plus les agrégats de 5 régions et le GTFS d'IDFM (129 Mo).

Deux façons de repérer le scolaire dans un GTFS :
- un **jeu séparé** (sous-type `school` sur transport.data.gouv.fr) ;
- le **`route_type` étendu** : `712` « School Bus Service », `713` « School and Public Service Bus ».

**Piège des agrégats :** les agrégats régionaux réécrivent le `route_type` en `3` (bus). En Gironde, les 41 lignes `712` du jeu départemental deviennent du `3` dans l'agrégat Nouvelle-Aquitaine. Il faut donc toujours partir du **jeu de l'organisateur**, pas de l'agrégat.

| Région | Jeux inspectés | Circuits scolaires régionaux publiés ? |
|---|---|---|
| Auvergne-Rhône-Alpes | Cars Région, 12 départements + Cars Région Express | **Oui dans 6 départements sur 12**, typés `712`/`713` : Allier (107 lignes sur 132), Ardèche (82 sur 112), Drôme (95 sur 134), Isère (454 `713` sur 502), Loire (334 sur 357), Puy-de-Dôme (555 sur 584). **Non** dans l'Ain, le Cantal, la Haute-Loire, la Haute-Savoie et la Savoie (lignes régulières seulement, 8 à 31 lignes). Rhône non vu (réseau de la métropole ou du département). |
| Bourgogne-Franche-Comté | Mobigo, 8 jeux départementaux | **Non.** Lignes régulières et transport à la demande. La Région renvoie, pour les horaires des circuits scolaires, à son calculateur d'itinéraire, qui utilise le même logiciel que celui de la Normandie et n'a pas d'export [V]. |
| Bretagne | BreizhGo Car 22, 29, 35, 56 ; agrégat KORRIGO ; data.bretagne.bzh | **Non.** Les jeux ouverts (GTFS, arrêts et tracés BreizhGo sur data.bretagne.bzh) ne couvrent que les lignes régulières. Les circuits scolaires ne sont publiés qu'en **fiches horaires PDF par établissement** sur breizhgo.bzh [S]. Dans l'agrégat, seuls des réseaux urbains portent du scolaire (STAR, Kicéo, Izilo, MAT, QUB…). |
| Centre-Val de Loire | Rémi ; agrégat JVMALIN | **Partiel.** Une ligne « Navettes scolaires » et 310 courses vers un établissement, surtout dans le Cher (193) et l'Indre (49) ; presque rien en Eure-et-Loir, Loir-et-Cher et Loiret. |
| Corse | Via Strada (interurbain) ; **GTFS scolaires Pumonte (2A) et Cismonte (2B)** sur data.corsica, Licence Ouverte 2.0, créés le 20/11/2026 et absents de transport.data.gouv.fr | **Oui, jeux séparés.** 190 et 202 lignes, dont les noms désignent l'établissement (« Tirolo / Granace / Sartène (Collège et Lycée) »). Calendrier fictif de 2018 à 2050, donc les jours de circulation réels ne sont pas fiables. |
| Grand Est | Fluo interurbain | **Oui, typé.** 2 162 lignes, dont 694 `712` et 1 199 `713`. |
| Hauts-de-France | Jeux **scolaires séparés** pour l'Aisne, le Pas-de-Calais et la Somme ; jeux « commercial et scolaire » pour le Nord et l'Oise | **Oui.** Somme : 783 lignes scolaires. Pas-de-Calais : 212. Nord : variantes suffixées `S` (901S…), à confirmer. |
| Île-de-France | GTFS IDFM (2 026 lignes) ; référentiel des lignes | **Non.** Aucun circuit spécial scolaire dans le GTFS ni dans le référentiel [V]. Les quelque 750 circuits (42 000 élèves) ne sont publiés qu'en dépliants PDF [S]. |
| Normandie | Nomad Car ; agrégat Atoumod | **Non.** 118 lignes régulières. Les circuits (de 2 200 à 4 330 selon les communiqués) ne sont consultables que dans un **moteur de recherche** (transport-scolaire.normandie.fr), sans export [V]. Dans l'agrégat, le scolaire n'apparaît que dans les réseaux urbains (Astuce, Twisto, LiA…). |
| Nouvelle-Aquitaine | Cars Régionaux, 12 départements ; agrégat | **Gironde seulement** : 41 lignes `712`. Les 11 autres départements n'ont que 6 à 33 lignes régulières. |
| Occitanie | liO | **Partiel ou intégré.** 304 lignes `3` sans typage, mais 380 courses avec une girouette vers un collège ou un lycée. Couverture par département à mesurer. |
| Pays de la Loire | Aléop ; agrégat Destineo ; **« Arrêts, horaires et circuits des lignes de transports Aléop scolaires » (GTFS)** sur data.paysdelaloire.fr, Licence Ouverte 2.0, absent de transport.data.gouv.fr | **Oui, mais hors du point d'accès national.** Le fichier complet `pdlscoFull.zip` compte 671 lignes, 8 875 courses et 28 173 arrêts, avec des tracés ; ses calendriers couvrent l'année 2026-2027 (régénéré le 22/10/2026). Il existe aussi des fichiers par département, de structure inégale : en Vendée et en Mayenne, une seule « ligne » regroupe toutes les courses. Les girouettes désignent la destination (« SECONDAIRES BOUAYE JO ET ME 07H45 »). Les lignes Aléop régulières n'ont, elles, aucun circuit scolaire. |
| Provence-Alpes-Côte d'Azur | ZOU ! Scolaire, **jeu séparé** | **Oui.** 528 lignes. |
| Martinique | Réseau scolaire, jeu séparé | Oui, 554 lignes. **Validité terminée le 2026-07-10** : le jeu n'est pas à jour. |
| La Réunion | Car Jaune | **Non.** 16 lignes régulières. Les 204 courses vers un établissement sont des arrêts « lycée » de lignes ordinaires. Le transport scolaire relèverait surtout des intercommunalités [S]. |
| Guadeloupe, Guyane, Mayotte | — | Aucun jeu régional. Seul le réseau urbain de Cayenne (Agglobus) est publié. |

S'ajoutent des réseaux scolaires d'agglomérations (Pau, Dracénie, Thonon, Puy-en-Velay, Saint-Lô, Redon, Flers, Soissons, Annonay, Privas…), qui relèvent de leur AOM et non de la région.

**Conclusion.** Sur les 13 régions de métropole, le paysage est en trois groupes :
1. **Circuits scolaires publiés et identifiables** : Provence-Alpes-Côte d'Azur, Hauts-de-France, Grand Est, Pays de la Loire et Corse (ces deux dernières hors de transport.data.gouv.fr). Couverture partielle en Auvergne-Rhône-Alpes (6 départements sur 12) et en Nouvelle-Aquitaine (Gironde seulement).
2. **Mêlés aux lignes régulières, sans marquage** : Occitanie, Centre-Val de Loire (surtout le Cher et l'Indre).
3. **Non publiés en données ouvertes** : Bretagne (PDF), Normandie et Bourgogne-Franche-Comté (moteur de recherche sans export), Île-de-France (PDF).

Les Pays de la Loire et la Corse rejoignent le groupe 1, avec des **jeux absents de transport.data.gouv.fr**. Tout recensement fondé sur le seul point d'accès national les manque : il faut chercher aussi sur les portails régionaux.

Les lignes régulières, qui transportent aussi des élèves, sont publiées partout. Ce qui manque, ce sont les **circuits réservés aux élèves**.

Le groupe 3 compte la Bretagne et la Normandie, où le privé sous contrat pèse beaucoup. Dans ces régions, une page lycée « lignes qui le desservent » resterait vide. Cette absence devrait être affichée comme telle (« circuits scolaires non publiés par la Région »), jamais comme une absence de desserte. Pour ces régions, une demande d'ouverture peut être faite au titre de l'article L1115-1 du code des transports (section 8 bis).

## 4. Tests de croisement avec les établissements

Des scripts jetables, non versionnés, ont croisé les GTFS avec les lycées (LEGT, LP, LPO) des fiches de l'observatoire. Ce sont des **tests de faisabilité, pas des résultats publiables**.

### 4.1 Proximité d'arrêt (rayon de 300 ou 500 m)

Méthode : on compte, pour chaque lycée, les lignes et les fins de course dont un arrêt est situé dans le rayon.

Exemple de la Somme, rayon de 500 m :

| Jeu | Lycées publics sans arrêt desservi | Lycées privés sans arrêt desservi |
|---|---|---|
| Scolaire seul | 15 sur 28 | 13 sur 17 |
| Commercial seul | 2 sur 28 | 7 sur 17 |

Les grands lycées d'Amiens n'ont aucun arrêt scolaire à proximité. Les circuits déposent les élèves à un pôle, et le réseau urbain (Ametis) ou la marche prend le relais.

**Leçon :** un indicateur de proximité calculé sur un seul jeu donne des écarts public/privé qui reflètent **l'organisation des réseaux**, pas la desserte. Toute comparaison doit fusionner les jeux scolaire, interurbain, urbain et TER, et raisonner en **trajet complet**.

### 4.2 Rattachement d'une ligne à un établissement par son nom

Beaucoup de lignes scolaires nomment leur destination :
- Somme : « Collège Louis Jouvet - Gamaches » ;
- Pas-de-Calais : « Lycée / Estaires » ;
- Martinique : « SCO 930 … / LPO JOSEPH ZOBEL » ;
- Gironde : « COLLEGE DE CREON ».

Test par mots du nom, établissement par établissement :

| Jeu | Lignes rattachées à un seul établissement | Lignes ambiguës |
|---|---|---|
| Somme | 197 sur 783 | 198 |
| Martinique | 220 sur 554 | 182 |
| Pas-de-Calais | 25 sur 212 | 15 |
| ZOU ! | 20 sur 528 | 17 |

Il y a beaucoup de faux positifs : les noms de communes coïncident avec des noms d'établissements (« Collège du Verdon », « Collège Saint-Loup »).

**Leçon :** le nom seul ne suffit pas. Piste à tester : **terminus des courses du matin** (arrivée entre 7 h et 9 h, jours scolaires) situé à moins de 300 m d'un établissement, le nom de ligne ou la girouette servant de confirmation. Ce rattachement reste une **inférence de l'observatoire** et doit être présenté comme tel.

### 4.3 Calcul test d'accessibilité : la Somme (2026-11-24)

**Montage**
- Outil : r5py 1.1.7, moteur R5 de Conveyal, avec Java 21 dans un environnement isolé.
- Réseau :
  - carte OpenStreetMap de Picardie (Geofabrik, 134 Mo) ;
  - quatre GTFS : scolaire de la Somme, commercial de la Somme, Ametis (Amiens, qui inclut ses propres services scolaires) et TER Hauts-de-France.
- Origines : centres des 771 communes (geo.api.gouv.fr).
- Destinations : les 45 lycées de la Somme (LEGT, LP, LPO, public et privé sous contrat).
- Créneau : mardi 1er décembre 2026, départs de 6 h 30 à 8 h, temps plafonné à 150 minutes.

**Coût**
- Construction du réseau : 20 à 25 s. Matrice de 34 695 paires : 10 à 18 s.
- Le même calcul **en voiture** prend environ 6 minutes : plus long, mais faisable.
- À l'échelle de la France, en découpant par département avec une marge sur les départements voisins, ce serait de l'ordre de l'heure par passage. C'est compatible avec un calcul hebdomadaire.

**Résultats bruts** (test, non publiables tels quels)

| Scénario | Lycée public le plus proche à 60 min ou moins | Lycée privé le plus proche à 60 min ou moins | Communes sans lycée public joignable en 150 min |
|---|---|---|---|
| Tous réseaux, percentile 5 | 56 % des communes (79 % de la population) | 29 % (60 %) | 7 % |
| Sans le réseau scolaire, percentile 5 | 33 % (67 %) | 20 % (54 %) | 21 % |
| Tous réseaux, médiane | 10 % (48 %) | 5 % (40 %) | 28 % |

**Leçons**

1. **Le réseau scolaire change tout.** Sans lui, 21 % des communes n'atteignent aucun lycée public en 150 minutes, contre 7 % avec. Pour 376 communes sur 771, le lycée public le plus proche est atteint plus vite grâce aux circuits. Un calcul fait sans les circuits (régions du groupe 3) serait donc faux, pas seulement incomplet.
2. **Le choix de la statistique pèse autant que les données.** R5 calcule un temps pour chaque minute de départ du créneau. Le **percentile 5** correspond à un élève qui part à la bonne heure ; la **médiane** compte l'attente d'un car qui ne passe qu'une fois. Pour des circuits scolaires, seul le percentile bas a un sens. Le temps médian d'une commune vers son lycée public passe de 55 à 89 minutes selon ce choix. Ce paramètre devra être publié, et il faudra peut-être un calcul de type « arriver avant 8 h 15 », que R5 ne fait pas directement.
3. **Un écart entre public et privé reflète d'abord l'implantation des établissements.** La Somme compte 28 lycées publics et 17 privés : le privé est en moyenne plus loin (écart médian de 11 minutes), sans que cela dise quoi que ce soit des lignes. Pour isoler l'effet des tracés, on a testé le **rapport temps en transport en commun / temps en voiture**, sur les paires distantes de 10 à 35 minutes en voiture.
   - Résultat : 3,14 vers le public et 2,93 vers le privé.
   - Ce rapport dépend fortement des paires retenues, et la plupart ne correspondent à aucun trajet réel.
   - Il faudrait le restreindre aux trajets effectivement faits : flux INSEE des 15-17 ans, ou secteur du lycée quand il est connu.
   - **Aucune conclusion à tirer de ces chiffres** ; ils montrent seulement que l'indicateur est calculable et qu'il est sensible à sa définition.
4. **Contrôle de vraisemblance** : Amiens rejoint un lycée public en 15 minutes, Doullens en 6 minutes (lycée en ville), Corbie en 52 minutes (pas de lycée sur place). Une vérification à la main sur une dizaine de trajets, avec un calculateur régional, reste à faire.
5. **Limites du montage** : on part du centre de la commune, pas des domiciles. On ne distingue pas la voie (LEGT ou LP) ni les options. Les élèves du privé n'ont pas forcément droit aux circuits (règlements, section 6). Le calendrier choisi est un seul jour de semaine scolaire.

### 4.4 Calcul test d'accessibilité : Pays de la Loire (2026-11-24)

**Montage**
- Réseau :
  - carte OpenStreetMap des Pays de la Loire (Geofabrik, 375 Mo) ;
  - GTFS scolaire régional `pdlscoFull.zip`. Contrôle fait : il contient bien les 8 875 courses des 5 fichiers départementaux.
  - agrégat Destineo : Aléop, réseaux urbains, TER.
- Origines : 1 228 communes. Destinations : 231 lycées (119 publics, 112 privés sous contrat).
- Les lycées sont regroupés par voie : général et technologique (LEGT et LPO), professionnelle (LP et LPO).
- Mardi 1er décembre 2026, temps plafonné à 150 minutes.

**Coût**
- Construction du réseau : 2 minutes.
- Matrice de 283 668 paires : 3 minutes sans les circuits scolaires, 10 à 14 minutes avec. C'est le volume de courses scolaires qui alourdit le calcul.
- Une région entière tient donc dans un calcul hebdomadaire.

**Sensibilité au créneau de départ**
- Un premier calcul (départs de 6 h 30 à 8 h) a laissé 106 communes sans aucun lycée joignable.
- Le diagnostic a montré que **440 courses scolaires partent entre 6 h et 6 h 30**.
- Avec des départs de 5 h 45 à 8 h 15, il ne reste plus que 51 communes. Celles qui restent sont surtout en Mayenne et en Sarthe, en bordure de région : leurs élèves vont sans doute dans des lycées hors région, que ce test ne compte pas.
- **Le créneau doit couvrir les premiers départs réels, à lire dans les horaires, et le calcul doit inclure les lycées des départements voisins.**

**Comparaison public et privé, à distance égale** (départs de 5 h 45 à 8 h 15, percentile 5)

Pour chaque commune et chaque voie, on prend le lycée public et le lycée privé les plus proches à vol d'oiseau, puis on compare les temps en transport en commun. Pour isoler l'effet des lignes, on se limite aux communes où ces deux lycées sont à **moins de 2 km d'écart de distance**.

| Voie | Communes comparables | Écart médian (temps vers le privé moins temps vers le public) | Privé plus rapide | Public plus rapide |
|---|---|---|---|---|
| Générale et technologique | 621 | −1 min (quartiles : −9 et +7) | 52 % | 43 % |
| Professionnelle | 669 | +1 min (quartiles : −6 et +9) | 46 % | 52 % |

Sans ce filtre de distance :
- le lycée public général le plus proche est à 11,7 km en médiane, le privé à 13,8 km ;
- temps médian en transport en commun : 65 minutes vers le public, 67 vers le privé ;
- part des communes qui ne peuvent pas atteindre ce lycée en 150 minutes : 13,5 % pour le public, 21,3 % pour le privé.

**Lecture prudente.** À l'échelle de la région et à distance comparable, ce test ne montre **aucun écart systématique** de desserte entre public et privé. Cela ne dit rien des cas locaux. Les quartiles montrent des écarts de 6 à 9 minutes dans un sens comme dans l'autre, et ce sont ces écarts commune par commune qu'une page devrait rendre lisibles.

**Saint-Mars-de-Coutais (pays de Retz)**
- Lycée général public Alcide d'Orbigny (Bouaye, 9,9 km) : 42 minutes.
- Lycée général privé Saint-Joseph (11,1 km) : 75 minutes.
- Lycée professionnel agricole privé Daniel Brottier : 59 minutes.
- Les horaires montrent des courses directes vers Bouaye et vers Machecoul (section 7).
- L'écart de 33 minutes avec le privé reste à expliquer, en vérifiant l'itinéraire à la main dans Destineo, avant toute lecture.

**Limites propres au test**
- On part du centre de la commune.
- Pas de lycées hors région.
- Un seul jour de calcul.
- Le percentile 5 sur une fenêtre plus large rallonge légèrement les temps. Le temps médian vers le meilleur lycée passe de 55 à 58 minutes : la règle exacte de calcul devra être fixée et publiée.
- Les élèves du privé ne sont pas forcément ayants droit (section 6). Un circuit qui existe ne veut pas dire qu'il est accessible à tous.

## 5. Ce qu'on pourra montrer, et ce qu'on ne pourra pas

**Faisable en source directe**, dans les régions du groupe 1 :
- par lycée, les lignes dont une course du matin s'arrête près de l'établissement ;
- leurs tracés (`shapes.txt`, présent dans presque tous les jeux inspectés) ;
- les communes desservies ;
- les heures de départ et d'arrivée, donc la durée de chaque course telle que publiée.

**Faisable par calcul**, ce qui fait un chiffre de méthode à afficher comme tel :
- le temps de trajet en transport en commun, de chaque commune vers le lycée public le plus proche et vers le privé sous contrat le plus proche proposant la même voie ;
- ce temps pondéré par le nombre de 15-17 ans scolarisés qui font réellement le trajet entre ces communes (fichier INSEE des mobilités scolaires).

Outils candidats [NV sur les licences] : **r5py** (matrices de temps de trajet en lot, le plus adapté), OpenTripPlanner 2, MOTIS.

**Pas faisable avec des données ouvertes :**
- le nombre d'élèves transportés par ligne ou par établissement ;
- le secteur (public ou privé) des élèves transportés ;
- les inscrits par circuit ;
- les secteurs de recrutement des lycées, hors Occitanie.

Une affirmation du type « cette ligne sert surtout le privé » n'est donc **pas démontrable** à partir des données ouvertes. Ce qu'on peut montrer, c'est quels établissements une ligne dessert le matin, et en combien de temps.

## 6. Règles d'ayants droit et tarifs

C'est le facteur qui détermine le plus directement la desserte du privé. Ces règles ne sont publiées que dans les règlements régionaux en PDF. Exemples relevés [S] :
- AURA, Allier : l'élève est pris en charge s'il fréquente l'établissement public ou privé sous contrat d'association **le plus proche** proposant l'enseignement choisi, ou un établissement à 50 km au plus.
- Occitanie, règlement 2026-2027 : clause propre à la sectorisation du privé.
- Bourgogne-Franche-Comté : gratuité maintenue, mais en 2024 la Région a cessé de financer les lignes **desservant uniquement des établissements privés** dans le Doubs, en l'alignant sur la règle des autres départements de la région [V, presse].
- Tarifs relevés [S], à confirmer sur les pages officielles :

| Région ou département | Tarif |
|---|---|
| Pays de la Loire | 170 €, gratuit dès le 3e enfant |
| Grand Est | 105 € pour les ayants droit, 252 € pour les autres |
| Puy-de-Dôme (AURA) | 167 € pour les ayants droit, 225 € pour les autres |
| Région Sud | 90 € |
| Île-de-France | Imagine R à 142,93 € pour les boursiers ; carte Scol'R de 224 à 384 € ailleurs |

Un **tableau comparatif des règlements régionaux** (distance minimale, établissement de référence, traitement du privé sous contrat, tarif, date du règlement, lien archivé) serait une donnée originale. Elle resterait sourcée : chaque cellule renvoie à l'article du règlement. C'est un travail manuel d'environ 18 régions, puis de leurs variantes départementales.

## 7. Cas cités dans la presse

Ces cas sont relatés ici pour savoir quoi pouvoir vérifier, pas pour être repris sur le site.

- **Pays de Retz (Loire-Atlantique), 2026** [S] : selon Ouest-France, des parents protestent contre le nouveau réseau. À Saint-Mars-de-Coutais, 3 arrêts sont prévus au lieu de 10 vers le lycée public de Bouaye, comme vers le lycée privé de Machecoul. Dans le même secteur, la Région expose à France 3 sa règle : arrêts espacés de 1 000 m au moins pour les collégiens, regroupement en centre-bourg pour les lycéens.
- **Doubs, rentrée 2024** [V] : la Région Bourgogne-Franche-Comté arrête de financer les lignes qui ne desservent que le privé (environ 500 nouveaux élèves), ce que conteste l'Enseignement catholique.
- **Proposition de loi n° 1214** (avril 2025) [V] : plafonner à 45 minutes le trajet entre la commune et le lycée général.
- **Étude ANATEEP × Matawan** (janvier 2026) [V, article] : 717 000 élèves de 67 réseaux, temps de trajet moyen des lycéens de 39 à 41 minutes, maximum 73 minutes. Pas de données brutes ouvertes.

Aucune source trouvée n'accuse nommément une région d'un tracé systématiquement favorable au privé. **Le cas du pays de Retz se vérifie avec le GTFS scolaire des Pays de la Loire** [V, test du 2026-11-24]. À Saint-Mars-de-Coutais, on lit les courses du matin et leur destination : « SECONDAIRES BOUAYE JO ET ME 07H45 » et « 07H50 », « SECONDAIRES MACHECOUL JO ET ME 08H05 ». On lit aussi les arrêts desservis dans la commune. Il s'agit d'un test de lecture, sans comparaison avec la situation antérieure : l'ancien réseau n'est pas archivé, ce qui montre à nouveau l'intérêt de l'archivage (section 8).

## 8. Opposabilité et archivage

- Les GTFS changent à chaque rentrée et parfois en cours d'année. Un temps de trajet n'est opposable que si le jeu utilisé est **archivé** à la date du calcul (hash, date de validité).
- Volume : 0,4 à 43 Mo par jeu, soit de l'ordre d'un gigaoctet par an pour toutes les régions [estimation].
- transport.data.gouv.fr conserverait un historique des ressources [NV] : à vérifier, cela éviterait d'archiver nous-mêmes.
- Collecte : un téléchargement par jeu et par semaine suffit. C'est compatible avec l'anti-objectif « charge excessive ».

## 8 bis. Cadre juridique de la publication

- **Article L1115-1 du code des transports** [V, version en vigueur depuis le 03/05/2025] : il applique le règlement délégué (UE) 2017/1926 et charge les autorités organisatrices de fournir les données de leurs services. Il ne mentionne ni n'exclut les services scolaires.
- **Règlement 2017/1926** [NV, texte non lu] : il vise les services réguliers et le transport à la demande. Le cas des services réguliers *spécialisés*, réservés à une catégorie de voyageurs comme les élèves, n'y semble pas tranché, et aucune position de transport.data.gouv.fr ou de l'ART n'a été trouvée.
- **En pratique**, beaucoup d'autorités publient leurs circuits : Hauts-de-France, Région Sud, Grand Est, une partie de l'AURA, Pays de la Loire, Corse, Martinique. Aucune région n'a avancé publiquement de motif de non-publication (sécurité des mineurs ou autre).
- **Pour l'observatoire** : le site constate la non-publication sans la qualifier. Une demande d'ouverture adressée aux Régions concernées relève du porteur, hors du site.

## 9. Approches possibles pour la future conception (à trancher plus tard)

1. **Desserte publiée, par lycée** : lignes du matin, tracés, communes desservies, durées affichées par l'horaire. On reste au plus près de la source. Couverture limitée aux régions qui publient le scolaire, avec une absence explicite ailleurs.
2. **Accessibilité calculée** : temps de trajet commune → lycée public ou privé de la même voie, pondéré par les flux INSEE. C'est le plus parlant pour la question public/privé, mais c'est un chiffre de méthode, à publier comme tel avec ses paramètres.
3. **Comparatif des règlements régionaux** : simple techniquement, long à constituer, et c'est probablement ce qui explique le plus de choses.
4. **Financement** (fonction 81) : le plus rapide, réutilise la phase 3, sans € par élève (motifs en phase 3, section 9.2).

Ces approches se cumulent. L'ordre naturel serait 4, puis 1, puis 3, puis 2.

## 10. Études restant à mener avant la conception

- ~~Confirmer, région par région, si les circuits scolaires existent dans un autre jeu ou format~~ : **fait le 2026-11-24** (section 3). Restent à voir les départements du Nord et de l'Oise (variantes `S`), la couverture par département de liO en Occitanie, le Rhône, et les jeux NeTEx de l'AURA.
- Vérifier que `pdlscoFull.zip` couvre bien les 5 départements, en le comparant aux fichiers départementaux, et comprendre la structure à « ligne unique » de la Vendée et de la Mayenne.
- Corse : retrouver les jours de circulation réels (le calendrier va de 2018 à 2050).
- Tester le rattachement par terminus du matin (section 4.2) sur la Somme et ZOU !, et mesurer son taux d'erreur à la main sur un échantillon.
- ~~Monter un premier calcul r5py sur la Somme~~ : **fait le 2026-11-24** (section 4.3). Suites :
  - vérifier une dizaine de trajets à la main ;
  - tester un calcul « arrivée avant 8 h 15 » ;
  - pondérer par les flux INSEE des 15-17 ans ;
  - distinguer les voies (LEGT, LP) ;
  - ~~refaire le test en Pays de la Loire~~ : **fait le 2026-11-24** (section 4.4). Restent :
    - inclure les lycées des départements voisins ;
    - caler le créneau sur les premiers départs réels ;
    - vérifier à la main le cas de Saint-Mars-de-Coutais dans Destineo ;
    - pondérer par les flux INSEE.
- Ouvrir le fichier de carte scolaire d'Occitanie : colonnes, millésime, producteur réel.
- Recenser les 18 règlements régionaux : liens, dates, clause sur le privé.
- Vérifier l'historique des ressources de transport.data.gouv.fr.
