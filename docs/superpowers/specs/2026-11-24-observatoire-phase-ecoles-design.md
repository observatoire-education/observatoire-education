# Observatoire citoyen de l'éducation : phase Écoles (premier degré)

Date : 2026-11-24. Statut : validée par le porteur le 2026-11-24.
Complète : `2026-11-23-observatoire-citoyen-education-design.md` (la spec), `2026-11-23-observatoire-socle-et-maquettes-design.md` (le socle) et les specs des phases 2, 3 et 4. En cas de conflit sur le périmètre de la phase Écoles, ce document l'emporte.

## 1. Intention

Ajouter les écoles maternelles, élémentaires et primaires, publiques et privées sous contrat, avec la même posture que le reste du site : des chiffres sourcés et opposables, aucun palmarès, aucun commentaire.

Les usages, dans l'ordre donné par le porteur :
1. **Préparer un conseil d'école** : avoir tous les chiffres de *son* école, imprimables.
2. **Se mobiliser contre une fermeture de classe ou d'école** : l'évolution des effectifs et des classes, et le fait que l'école est parfois la seule à la ronde, même avec peu d'élèves.
3. **Comparer** avec d'autres écoles et d'autres territoires.

Lecteurs : équipes enseignantes, parents, élus locaux.

La spec d'origine prévoyait des pages « plus légères » (IPS non actualisé, pas de données de personnels). C'est dépassé : l'IPS des écoles est publié chaque année depuis 2022 et les personnels le sont par école (section 6.1). Les fiches peuvent être presque aussi riches que celles des collèges. La vraie contrainte devient le **volume** : environ 80 000 pages de plus.

Ordre des phases : le porteur a choisi Écoles après la phase 4 (les fermetures et successeurs de la phase 4 servent directement ici). La phase Transport scolaire suit ; une étude de ses données est menée en parallèle, dans une session séparée.

## 2. Découpage

Une phase, **cinq lots livrés et mis en ligne l'un après l'autre** :

| Lot | Contenu |
|---|---|
| 0. Hébergement | Passage de GitHub Pages à Cloudflare Workers, à contenu identique |
| 1. Fiches école | Sources du premier degré, fiche école complète, écoles fermées et successeurs |
| 2. Rattachements | Collège de secteur, écoles du secteur sur la fiche collège, PIAL, réseau REP/REP+ |
| 3. Autour et communes | Écoles les plus proches à vol d'oiseau ; pages commune étendues à toutes les communes qui ont ou ont eu une école |
| 4. Territoires et budget | Premier degré sur les pages département, académie, région, France ; dépenses des communes pour leurs écoles |

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Une fiche par école ouverte (environ 48 300) et par école fermée depuis 2012 qu'une source chiffrée mentionne (au plus 8 300).
- Sur chaque fiche : effectifs par niveau et nombre de classes dans le temps, type des classes, IPS, enseignants, rattachements, écoles proches, budget de la commune quand il est publié.
- Une version imprimable pour le conseil d'école.
- Sur chaque fiche collège : les écoles de son secteur et son PIAL.
- Une page par commune qui a ou a eu une école depuis 2012 (environ 23 200).
- Le premier degré sur les pages de territoire existantes.

**Non-objectifs**
- **RASED** : aucune donnée ouverte. Mentionné comme non couvert sur `/sources/`.
- **Évaluations nationales (CP à CM2)** : publiées par département au mieux, jamais par école. Pas affichées dans cette phase (idée gardée, section 8).
- **Rattachement officiel école → collège** (secteur fixé par l'inspection académique, conseil école-collège) : non publié. On affiche le collège de secteur **à l'adresse de l'école** (section 6.4), présenté comme tel.
- **Temps de trajet par la route** entre écoles : phase Transport. Cette phase donne les distances à vol d'oiseau.
- **Chiffres de la rentrée en cours** et décisions de carte scolaire (février) : non publiés. Le site affiche la dernière rentrée publiée, datée.
- Privé hors contrat : comme pour le second degré, en nombre seulement sur les pages de synthèse.

**Anti-objectifs** (ceux de la spec, avec ce qu'ils deviennent pour les écoles)
- **Un palmarès.** Aucun rang, tri par nom, aucune couleur selon la valeur. Les écoles proches sont triées par distance, pas par effectif ni par IPS.
- **Un chiffre sans source ni millésime.** La rentrée est affichée à côté de chaque chiffre, en évidence pour les effectifs (« rentrée 2025, dernière publiée »).
- **Une absence qui passe pour un zéro.** « IPS non publié pour les écoles maternelles », « carte scolaire non publiée par ce département », « budget non publié pour les communes de moins de 3 500 habitants », « plus d'école dans la commune depuis 2016 ».
- **Un lien déduit présenté comme officiel.** Le collège de secteur porte toujours la mention « à l'adresse de l'école ».
- **Un commentaire.** Aucune lecture du type « école menacée » ou « sous-dotée ».

## 4. Contraintes

- Celles des phases précédentes : site statique lisible sans JavaScript, impression propre, URL permanentes, quelques requêtes par source et par nuit, chaque version archivée avec son empreinte.
- **Volume.** Le build fait aujourd'hui 758 Mo pour 13 917 fichiers (fiche établissement : 59 Ko en moyenne, 26 % de SVG, 28 % de tableaux ; chaque page commune a aussi son `etablissements.csv`). Estimation de la phase, **une page HTML par nouvelle commune, sans CSV propre** (section 6.7) : environ 92 700 fichiers au total (13 900 + 48 300 écoles + 8 300 écoles fermées au plus + 22 200 communes nouvelles). Avec un CSV par nouvelle commune, on dépasserait 100 000 : c'est pourquoi la règle de 6.7 existe. GitHub Pages (1 Go) est exclu ; l'offre gratuite de Cloudflare aussi (20 000 fichiers).
- **Plafond Cloudflare Workers, offre payante** : 100 000 fichiers par version, 25 Mo par fichier, pas de plafond de poids total. Marge d'environ 7 000 fichiers ; tout nouveau type de fichier par page doit être compté avant d'être ajouté.
- **Budget de poids** : fiche école de 20 à 25 Ko de HTML visés. Pas de contrainte dure de poids total, mais le temps de build et d'envoi compte.

## 5. Approches envisagées

**Hébergement**
- **Cloudflare Workers, offre payante, compte pro du porteur (retenue par le porteur).** Environ 5 $ par mois. Déploiement depuis GitHub Actions, URL inchangées. R2 et D1 deviennent disponibles (section 6.9). Limite : 100 000 fichiers.
- **Stockage objet + CDN (Bunny, Scaleway, OVH).** Aucune limite de fichiers, quelques euros par mois, mais un compte de plus, un déploiement par synchronisation à écrire et un cache à gérer. Écartée ; R2 couvre le même besoin si le plafond est atteint.
- **Second site GitHub Pages pour les écoles.** Gratuit, mais 48 000 fiches ne tiennent pas dans 1 Go sans retirer les graphiques, et les pages commune seraient réparties entre deux sites. Écartée.

**Isolement d'une école**
- **Distance à vol d'oiseau maintenant (retenue par le porteur).** Calculée au build à partir des coordonnées de l'Annuaire. Contestable en montagne ou de part et d'autre d'une rivière : la méthode le dit.
- **Temps de route.** Plus parlant en mobilisation, mais demande un calcul d'itinéraire pour toutes les écoles : renvoyé à la phase Transport, qui posera cet outil.

**Pages commune**
- **Toutes les communes qui ont ou ont eu une école depuis 2012 (retenue par le porteur).** Une commune qui a perdu son école est un cas utile en mobilisation.
- Seulement les communes qui ont une école ouverte. Environ 2 000 pages de moins, mais les fermetures disparaissent du site. Écartée.

**Rattachement école → collège**
- **Collège de secteur à l'adresse de l'école, par la carte scolaire (retenue par le porteur).** Seule source ouverte qui lie un lieu à un collège ; présentée comme une déduction.
- Réseau REP/REP+ seul : officiel, mais limité aux écoles en éducation prioritaire et arrêté en 2019 dans les données ouvertes. Gardé en complément.
- PIAL comme rattachement principal : couvre 96 % des écoles, mais c'est un pôle d'accompagnement du handicap, pas un secteur. Affiché pour lui-même (section 6.5).

## 6. Ce qui est décidé

### 6.1 Sources nouvelles (vérifiées sur l'API le 2026-11-24)

Toutes sur data.education.gouv.fr, Licence Ouverte.

| Jeu | Contenu | Couverture constatée |
|---|---|---|
| `fr-en-annuaire-education` (déjà collecté) | Écoles : nature, secteur, adresse, coordonnées, PIAL, circonscription, éducation prioritaire, RPI | 48 328 écoles ouvertes ; PIAL renseigné pour 46 357 |
| `fr-en-ecoles-effectifs-nb_classes` | Élèves par niveau (préélémentaire, CP à CM2, ULIS, UEEA), nombre de classes | 859 372 lignes, environ 47 000 écoles par rentrée ; rentrées 2020 à 2025 confirmées, première rentrée à établir (voir section 9) |
| `fr-en-ips-ecoles-ap2022` | IPS des écoles | 2022-2023 à 2024-2025, environ 32 500 écoles par rentrée (public 27 962 et privé sous contrat 4 532 en 2024-2025) |
| `fr-en-ips_ecoles_v2` | IPS des écoles | 2016-2017 à 2021-2022 |
| `fr-en-indicateurs_personnels_etablissements1d` | ETP d'enseignants, femmes, âges, ancienneté dans l'école | rentrées 2024 et 2025, public et privé sous contrat |
| `fr-en-typologie-des-classes-dans-les-etablissements-du-premier-degre_v2` | Classes par type (un niveau, plusieurs niveaux jusqu'à cinq) | rentrées 2024 et 2025 |
| `fr-en-ecoles-ep` | Éducation prioritaire, collège tête de réseau REP/REP+, élèves et classes | rentrées 2011 à 2019 |
| `fr-en-carte-scolaire-colleges-publics` | Secteurs des collèges publics par commune, rue et numéro | 88 départements, 31 340 communes, 5 083 collèges ; mise à jour 2026-10-09 |
| `fr-en-etablissements-fermes` (déjà collecté) | Écoles fermées | 8 319 écoles fermées depuis 2012 ; filtre actuel à élargir |

L'IPS n'existe pas pour environ 15 000 écoles par rentrée (notamment les écoles maternelles, l'IPS des écoles portant sur l'élémentaire). La fiche le dit en toutes lettres ; la raison exacte est vérifiée par le builder et publiée sur `/methode/`.

Départements absents de la carte scolaire (constat du 2026-11-24) : notamment Ariège, Aveyron, Charente-Maritime, Côtes-d'Armor, Haute-Garonne, Gers, Lot, Hautes-Pyrénées, Tarn, Tarn-et-Garonne, Corse, Guadeloupe, Martinique, Mayotte. La liste exacte est recalculée à chaque collecte.

### 6.2 Lot 0 : hébergement sur Cloudflare Workers

- Site servi par un Worker avec fichiers statiques (offre payante, compte pro du porteur), domaine personnalisé sur `observatoireeducation.fr`. URL inchangées.
- **DNS** : la zone passe chez Cloudflare (changement des serveurs DNS chez OVH, fait par le porteur ; le domaine reste enregistré chez OVH). Avant la bascule, vérifier que les enregistrements importés comprennent les trois MX OVH (`mx1`, `mx2`, `mx3.mail.ovh.net`), le SPF et le DKIM : la messagerie `contact@observatoireeducation.fr` ne doit pas s'interrompre. Le builder fournit la liste des enregistrements à vérifier.
- **Déploiement** : le workflow `nightly` déploie sur Cloudflare au lieu de GitHub Pages ; les archives restent sur les GitHub Releases ; les liens « donnée brute » ne changent pas.
- Comportements de GitHub Pages à reproduire : redirection des UAI en minuscules (aujourd'hui par la page 404), `CNAME` sans objet, en-têtes de cache raisonnables.
- **Garde-fou de build** : 95 000 fichiers (marge sous les 100 000) ; plus de plafond de poids total, mais un plafond de poids **par fiche** (section 6.3).
- **Préalables du porteur** *(choix de conception)* : souscrire l'offre payante sur le compte pro, créer un jeton d'API limité au déploiement du Worker, l'enregistrer dans les secrets du dépôt GitHub, ajouter la zone `observatoireeducation.fr` dans Cloudflare. Le builder prépare tout le reste (configuration du Worker, workflow, liste des enregistrements DNS à vérifier) et dit précisément quoi créer.
- **Recette avant bascule** : le site est d'abord déployé sur l'adresse `*.workers.dev` et comparé au site en ligne (échantillon d'URL, redirections, 404, en-têtes). Les serveurs DNS ne changent qu'ensuite.
- **Validation du lot** : site identique, URL testées par échantillon, messagerie vérifiée, une nuit de collecte et de déploiement réussie. Seulement ensuite, le lot 1.

### 6.3 Lot 1 : fiche école

**URL** : `/etablissement/<UAI>/`, comme le second degré *(choix de conception : l'UAI identifie aussi les écoles, la recherche et les liens restent uniformes)*.

**Contenu, dans l'ordre** :
1. **En-tête** : nom, nature (maternelle, élémentaire, primaire), secteur, commune, département ; éducation prioritaire ; RPI s'il y a lieu ; « Fermée le <date> » et successeur pour une école fermée.
2. **Rattachements** (lot 2) : collège de secteur à l'adresse de l'école, PIAL, réseau REP/REP+, circonscription.
3. **Effectifs** : élèves, classes, élèves par classe, dernière rentrée publiée en évidence ; répartition par niveau (PS à CM2, ULIS, UEEA) ; **courbe des élèves et des classes** sur toute la série disponible, où les ouvertures et fermetures de classes se lisent directement ; **type des classes** (à un niveau, à plusieurs niveaux, avec leur composition).
4. **Autour** (lot 3) : écoles les plus proches (section 6.6).
5. **Composition sociale** : IPS de 2016-2017 à la dernière rentrée, situé par rapport à la commune, au département, à l'académie et à la France, public et privé séparés (gabarit du second degré).
6. **Enseignants** : ETP, part de femmes, âges, ancienneté dans l'école, situés par rapport aux mêmes territoires.
7. **Budget** (lot 4) : dépenses de la commune pour ses écoles (section 6.8).
8. **Sources** : une ligne par source avec millésime, lien vers la donnée brute archivée, mentions de correction (phase 4).

**Comparaisons** : moyennes publiées par la DEPP quand elles existent, sinon calculées par l'observatoire et signalées (« moyenne calculée par l'observatoire »), même règle qu'en phase 2.

**Version imprimable** : même mécanisme que la fiche du second degré, titrée pour le conseil d'école.

**Écoles fermées** : règles de la phase 4 (section 6.2 de sa spec) appliquées aux écoles. Fiche pour chaque école fermée depuis 2012 qu'une source chiffrée mentionne (effectifs, IPS, éducation prioritaire). Successeur déduit quand le lien est net ; cas fréquent : une maternelle et une élémentaire qui fusionnent en école primaire à la même adresse (plusieurs prédécesseurs). Séries jamais fusionnées. Fichier de corrections manuelles commun avec le second degré.

**Entre deux lots** *(choix de conception)* : un bloc qui relève d'un lot pas encore en ligne (Rattachements, Autour, Budget) est **absent**, sans mention d'attente ; ce n'est pas une donnée manquante, c'est une partie du site qui n'existe pas encore. Le nom de la commune est un lien seulement si sa page existe, sinon du texte simple (règle « fil d'Ariane sans lien mort » du socle).

**Recherche** : les écoles entrent dans l'index de recherche de l'accueil. *(Choix de conception ; le poids de l'index est à surveiller, voir section 9.)*

### 6.4 Lot 2 : collège de secteur à l'adresse de l'école

- **Calcul** : l'adresse de l'école (Annuaire) est rapprochée de la carte scolaire des collèges publics.
  - Commune entièrement rattachée à un collège ou à un groupe de collèges (environ 30 000 communes) : lien direct.
  - Commune découpée par rue et numéro (environ 1 100 communes, surtout des villes) : rapprochement de la voie et du numéro (parité comprise) avec les tronçons.
  - Secteur multi-collèges : tous les collèges du secteur sont nommés.
- **Affichage sur la fiche école** : « Collège de secteur à l'adresse de l'école : <nom> (<UAI>) », avec lien, et une note : « Le secteur de collège dépend de l'adresse de chaque famille, pas de l'école fréquentée. Source : carte scolaire des collèges publics, définie par le conseil départemental. »
- **Absences explicites** : « Carte scolaire non publiée pour ce département » ; « Adresse de l'école non rapprochée de la carte scolaire » (échec du rapprochement par rue).
- **Écoles privées sous contrat (décision du porteur)** : le lien est calculé aussi, comme un fait géographique. Libellé : « Située dans le secteur du collège public <nom> ». Note : « Les écoles privées ne sont pas soumises à la carte scolaire. Le collège public de secteur d'un élève dépend de l'adresse de sa famille. » Intention : une famille du privé qui envisage le public repère le collège du secteur.
- **Fiche collège, nouveau bloc « Écoles de son secteur »** : les écoles, **publiques et privées sous contrat** (décision du porteur), dont l'adresse relève du secteur du collège, avec nature, secteur, élèves et IPS ; tri par nom ; décompte par secteur (« 6 écoles publiques, 2 privées sous contrat »). Même note sur le sens du secteur. Les collèges privés n'ont pas de secteur : bloc absent, sans mention.

### 6.5 Lot 2 : PIAL et réseau REP/REP+

- **PIAL**, sur la fiche école **et** sur la fiche collège ou lycée : « PIAL du <type> <nom> », avec la liste des écoles et établissements du même pôle (lien vers chacun) et une phrase de définition renvoyant à `/methode/`. Le PIAL pointe vers un collège pour 40 000 écoles, sinon vers une école, un lycée ou une circonscription : le libellé suit la nature de l'établissement de tête.
- **Réseau REP/REP+** : l'appartenance actuelle vient de l'Annuaire. Le collège tête de réseau vient de `fr-en-ecoles-ep`, arrêté en 2019 : il n'est affiché que s'il est confirmé par une source à jour ; sinon, appartenance seule. *(La recherche d'une source à jour du réseau est au builder, section 9.)* Sur la fiche collège tête de réseau : la liste des écoles de son réseau, quand elle est établie.
- **Circonscription** : nom, en information sur la fiche école.

### 6.6 Lot 3 : écoles les plus proches

- Distance à vol d'oiseau entre coordonnées de l'Annuaire, calculée au build.
- **Liste** : les écoles ouvertes les plus proches, publiques et privées sous contrat, avec distance, nature, secteur, élèves et classes ; triées par distance.
- **Par niveau** *(choix de conception)* : la proximité qui compte est celle d'une école accueillant les mêmes niveaux. La liste distingue l'école maternelle ou primaire la plus proche (pour la maternelle) et l'école élémentaire ou primaire la plus proche (pour l'élémentaire).
- **Phrase factuelle** quand elle s'applique : « Aucune autre école à moins de <n> km ». Seuils au builder.
- Note de méthode : distance à vol d'oiseau, qui ne tient compte ni du relief ni des routes ; temps de trajet prévu avec la phase Transport.

### 6.7 Lot 3 : pages commune

- **Une page pour chaque commune qui a, ou a eu depuis 2012, au moins une école** (environ 23 200 ; 1 038 existent déjà).
- **Contenu ajouté** : ses écoles (nature, secteur, élèves, classes, IPS) ; évolution des élèves et des classes de la commune ; écoles fermées avec leur date ; carte des écoles.
- **Commune sans école** : « Plus d'école dans la commune depuis <année> », écoles fermées nommées, écoles les plus proches (même règle que 6.6, depuis le centre de la commune).
- Les pages commune existantes gardent leur contenu du second degré.
- **Fichiers CSV** *(choix de conception, imposé par le plafond de fichiers)* : les 1 038 `etablissements.csv` existants gardent leur URL et s'enrichissent des écoles de la commune. Les nouvelles pages commune n'ont pas de CSV propre : leurs écoles sont dans le CSV du département (`/departement/<dep>/etablissements.csv`, enrichi des écoles), signalé par un lien sur la page.
- **Communes nouvelles (fusions de communes)** *(choix de conception)* : les pages suivent le code commune **en vigueur** ; aucune page pour un code disparu. Une école fermée est rangée sous la commune d'aujourd'hui, avec le nom de son ancienne commune (commune déléguée). La page d'une commune nouvelle a une partie par commune déléguée quand il y en a, pour que la phrase « Plus d'école à <commune déléguée> depuis <année> » reste vraie et visible : la perte de l'école d'un village fusionné est justement un cas de mobilisation. La table de passage des codes vient du Code officiel géographique de l'Insee (source à ajouter au registre).

### 6.8 Lot 4 : territoires et budget

**Pages département, académie, région, France** : effectifs du premier degré (élèves, classes, élèves par classe) public et privé ; évolution ; distribution des IPS des écoles par secteur ; écoles et classes fermées dans le temps. Gabarits du second degré.

**Budget des communes pour leurs écoles** :
- Source : balances comptables DGFiP, présentation croisée nature-fonction, déjà collectées en phase 3 ; nouveau filtre sur les catégories `Commune` et `SYND` et les fonctions 21x (spec de phase 3, section 9.1).
- **Couverture partielle** : seules les communes de 3 500 habitants et plus présentent leurs comptes par fonction. Ailleurs : « Budget non publié pour les communes de moins de 3 500 habitants ».
- Affiché en euros par élève des écoles publiques de la commune, sur la fiche école et la page commune. Le traitement des compétences exercées par une intercommunalité ou un syndicat est au builder (section 9), publié sur `/methode/`.

### 6.9 R2 et D1 : marge disponible, pas une tâche

- **R2** : si le nombre de fichiers approche 100 000, le Worker sert une partie des pages depuis un bucket R2, sans changer les URL. Il accueillera aussi les fichiers Parquet de la phase 5.
- **D1** : option pour l'explorateur ou une API en phase 5 ; les limites qui l'avaient fait écarter (offre gratuite) ne s'appliquent plus.
- Rien de cela n'est construit dans cette phase.

### 6.10 Pages `/sources/` et `/methode/`

- `/sources/` : les nouveaux jeux, et les absences (RASED, évaluations nationales par école, départements sans carte scolaire).
- `/methode/` : collège de secteur à l'adresse de l'école (calcul, limites) ; PIAL (définition) ; distance à vol d'oiseau ; écoles sans IPS ; successeurs d'écoles ; budget communal (couverture, intercommunalités).

## 7. Tests

Même exigence que les phases précédentes : chaque règle de calcul a ses tests (rapprochement d'adresse avec la carte scolaire, y compris parité et secteurs multi-collèges ; écoles les plus proches par niveau ; successeurs par fusion ; moyennes calculées ; absences explicites). Le garde-fou de build vérifie le nombre de fichiers et le poids par fiche.

## 8. Idées gardées pour plus tard

- **Temps de trajet** vers les écoles les plus proches : phase Transport.
- **Évaluations nationales** par département sur les pages département.
- **RASED**, si une source ouverte apparaît.
- **Rattachement officiel école → collège** (conseil école-collège), si une source apparaît.

## 9. Laissé au builder

Ces choix ne changent pas ce que voit le lecteur ; le builder les tranche et les documente dans `/methode/` quand ils touchent aux chiffres.
- Première rentrée de la série des effectifs, et raccord éventuel avec `fr-en-ecoles-ep` (2011-2019) si la série est plus courte.
- Normalisation des adresses pour le rapprochement avec la carte scolaire (géocodage BAN ou comparaison des libellés de voie), et taux de rapprochement à publier.
- Règles de déduction du successeur pour les écoles (fusions, regroupements).
- Nombre d'écoles proches listées et seuils de la phrase « aucune autre école à moins de <n> km ».
- Source à jour du collège tête de réseau REP/REP+, si elle existe.
- Traitement des dépenses scolaires portées par une intercommunalité ou un syndicat.
- Moyen de tenir le budget de poids de la fiche école (graphiques allégés, tableaux repliés).
- Poids de l'index de recherche avec 48 000 écoles de plus (index découpé par département si besoin).
- Configuration du Worker (en-têtes, redirections, page 404) et du déploiement.
