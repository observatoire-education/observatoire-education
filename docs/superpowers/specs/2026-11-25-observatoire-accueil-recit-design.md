# Accueil et page Sources : montrer le travail d'agrégation

Date : 2026-11-25 · Maquettes : `maquettes-2026-11-25-accueil/accueil-c.html` (accueil) et `accueil-c-sources.html` (/sources/)

## 1. Intention

Le site agrège plus de trente jeux de données publiques, éparpillés entre cinq producteurs et trois portails, avec des nomenclatures qui changent. Il les recoupe établissement par établissement et territoire par territoire. L'accueil actuel ne dit rien de ce travail. Il annonce un résultat (« les chiffres publics de chaque école ») sans montrer ce qui le distingue d'un portail officiel ou d'un site commercial.

Le porteur veut que le visiteur, en arrivant sur l'accueil :

1. comprenne la richesse des données agrégées ;
2. voie l'intérêt du site par rapport aux portails de l'Éducation nationale et aux sites commerciaux ;
3. cherche son école ou sa commune.

Les publications du porteur sur ses réseaux amèneront de nouveaux visiteurs. Les habitués (parents élus, personnels avant un CA) doivent pouvoir chercher sans faire défiler la page.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Un accueil qui montre, dans cet ordre : des chiffres, la recherche, puis la preuve du travail d'agrégation.
- Une page /sources/ qui démontre en un écran l'ampleur de ce travail. C'est elle que le porteur partagera.
- Des compteurs calculés au build, qui suivent l'arrivée de nouvelles sources (le bâti est en cours dans une autre session) sans retoucher les pages.

**Non-objectifs**
- La communication sur les réseaux, que le porteur porte lui-même.
- Une refonte des fiches, des pages de territoire ou de la page Méthode (en dehors d'un renvoi).

**Anti-objectifs**, ce qui ferait échouer la refonte même si elle marche techniquement :
- **Du militantisme ou un commentaire sur les chiffres.** Le site reste un observatoire froid (spec du 2026-11-23, § 1). L'accroche et le comparatif décrivent ce que fait le site, jamais ce qu'il faut en penser.
- **Retirer les chiffres de l'accueil.** La rangée Écoles / Collèges / Lycées / EREA / Élèves reste en tête : elle rassure le visiteur (« ici, des chiffres »).
- **Nommer un site commercial**, ou employer un mot de palmarès (« rang », « classement », « top », « meilleur », « pire »). Les tests anti-palmarès en vigueur s'appliquent aux nouveaux blocs.
- **Écrire un chiffre en dur** (nombre de jeux, producteurs, portails, valeurs de la fiche vitrine).

## 3. Approches envisagées

- **A. Le chantier en chiffres.** Une accroche et des compteurs du travail, puis un comparatif et la recherche. Simple, mais abstrait : des chiffres sur des chiffres.
- **B. La fiche démontée.** Une vraie fiche dont chaque bloc porte sa source. C'est la plus parlante, mais longue sur l'accueil.
- **C. Hybride (retenue).** Les chiffres et la recherche tiennent au-dessus de la ligne de flottaison, puis une version courte de la fiche démontée, puis le comparatif. La démonstration complète part sur /sources/.

**Ajustements du porteur sur C :**
- **La rangée de chiffres actuelle reste en tête.** Elle était d'abord descendue en bas de page.
- **Les compteurs du travail deviennent un bandeau fin sous la recherche**, pour ne pas concurrencer les chiffres.
- **La fiche démontée est raccourcie sur l'accueil**, et sa version complète va sur /sources/, pas sur la page Méthode. Méthode s'adresse au lecteur déjà convaincu qui veut vérifier les calculs ; la fiche démontée sert à donner envie.

## 4. Accueil

Ordre des blocs :

1. **Accroche**
   - H1 : « Toutes les données publiques sur l'école, rassemblées établissement par établissement. » (la seconde moitié en couleur d'accent).
   - Paragraphe : « Effectifs, composition sociale, enseignants, résultats, budget des collectivités : l'État publie ces chiffres dans des dizaines de fichiers, sur trois portails, avec des nomenclatures qui changent d'une année à l'autre. L'observatoire les rassemble, les met bout à bout et les situe par rapport aux moyennes du département, de l'académie et de la France. Chaque chiffre garde sa source et son millésime. »
   - « dizaines » et « trois portails » se règlent sur les compteurs (§ 6).
2. **Rangée de chiffres** : celle d'aujourd'hui, inchangée dans son contenu et sa source (Écoles, Collèges, Lycées, EREA, élèves des premier et second degrés, partage public / privé), avec sa ligne de sources et la mention sur le hors contrat.
3. **Recherche** : la grande recherche actuelle, avec le placeholder « Votre école, votre collège, votre commune, votre département… » et les exemples.
4. **Bandeau « fabrique »** (une ligne, discret) : N jeux de données publiques · N producteurs (liste) · N portails · séries depuis AAAA · dernière collecte (date, ou « cette nuit » si elle date de moins de 24 h au build) · lien « Toutes les sources → » vers /sources/.
5. **« Une fiche, N sources »** (version courte)
   - À gauche, la mini-fiche de l'établissement vitrine : 6 tuiles reprenant ses vrais chiffres, chacune avec une pastille numérotée qui renvoie à sa source.
   - À droite :
     - la phrase « Cette page rassemble N jeux de données de N producteurs, publiés sur N portails. » ;
     - les producteurs en étiquettes ;
     - la phrase « Ailleurs : N fichiers de milliers de lignes, des séries coupées, aucune moyenne. Ici : une page, imprimable en A4, chaque chiffre relié à sa donnée brute. » ;
     - un bouton « Voir d'où vient chaque chiffre → » vers /sources/#fiche.
   - La mini-fiche renvoie aussi à la fiche réelle.
6. **« Pourquoi pas directement à la source ? »** : un comparatif en trois colonnes, texte fixe repris de la maquette.
   - **Portails officiels** : données de référence complètes / un fichier par thème et par année / des milliers de lignes, des codes à décoder / nomenclatures qui changent, séries coupées / aucune moyenne pour situer un établissement.
   - **Sites commerciaux** : lisibles et rapides / quelques indicateurs, souvent les résultats seuls / des notes et des tableaux d'honneur / source et date rarement indiquées / publicité, comptes, cookies.
   - **L'observatoire** (colonne mise en avant) : N jeux recoupés sur une seule fiche / séries remises bout à bout depuis AAAA / chaque chiffre situé : département, académie, France / source, millésime et donnée brute archivée / aucune note, aucune publicité, mis à jour chaque nuit.
7. **Suite inchangée** : Parcourir par territoire, Dernières mises à jour des sources, Principes.

Description `<meta>` : à réécrire dans l'esprit de l'accroche, avec le nombre de jeux.

## 5. Page /sources/

- H1 : « D'où viennent les chiffres » (le titre de navigation reste « Sources »).
- **Paragraphe d'ouverture.** Il reprend et remplace l'actuel. Il dit qui publie, sur quels portails, la collecte nocturne, l'archivage de chaque version et le recoupement par établissement. Il garde la mention Licence Ouverte et celle sur les données retraitées.
- Le bandeau « fabrique » (§ 4.4), sans le lien.
- **« Exemple : une fiche, N sources »** (ancre `#fiche`) : la mini-fiche, et en face la liste numérotée complète. Pour chaque source : son titre, son producteur, son portail et une précision utile (« deux jeux, méthode changée en 2022 », « relu chaque nuit »…). Chaque élément pointe vers la section du jeu plus bas sur la page (`#<id>`).
- Puis le contenu actuel de la page, inchangé : chaque jeu, ses versions archivées, le journal.
- La page Méthode gagne un renvoi vers /sources/#fiche dans son introduction.

## 6. Compteurs : définitions

Tous les compteurs sont calculés au build à partir de `sources.json`, et de toute autre source affichée sur /sources/ (les contours IGN, par exemple).

- **Jeu de données** : une page d'origine distincte (`pageUrl`).
  - Les extraits budget et transport d'un même exercice DGFiP comptent pour un seul jeu.
  - Les fichiers du COG comptent pour un ou deux selon leur page : au builder de trancher, en restant cohérent avec ce que montre /sources/.
  - Le décompte actuel est d'environ 33. Il bougera avec le bâti.
- **Producteur** : un organisme. MEN, MEN-DEPP et MEN-DGESCO sont affichés séparément (MEN, DEPP, DGESCO), comme dans la maquette. On y ajoute DGFiP, Insee et IGN s'il est retenu.
- **Portail** : le nom d'hôte distinct des pages d'origine.
- **Séries depuis** : la plus ancienne année réellement affichée sur une fiche (2009 aujourd'hui, effectifs des écoles).
- **Dernière collecte** : la date de collecte la plus récente, comme aujourd'hui.

Les chiffres de l'accroche suivent ces compteurs. Dans le texte, on garde « des dizaines de fichiers » plutôt qu'un nombre, pour éviter les accords bancals.

## 7. Établissement vitrine

*Choix du rédacteur, à confirmer par le porteur :* **un établissement fixe**, déclaré dans `observatoire.config.json`. Par défaut, le collège Jules Verne du Pouliguen (0440061C).

- **Pourquoi fixe :** une page stable se partage et se cite mieux, et le tirage au hasard mettrait parfois en avant un établissement aux données lacunaires.
- **Les sources d'un collège public.** Le builder vérifie que la vitrine en couvre le maximum : Annuaire, effectifs, personnels, IPS (deux séries), valeur ajoutée, budget, carte scolaire. Le N de « Une fiche, N sources » est le nombre réel de jeux utilisés par cette fiche, lu dans ses données, et non 9 en dur.
- **Les pastilles.** Les tuiles et leurs numéros sont générés à partir des sources que la fiche cite réellement.
- **Si la vitrine ferme ou perd une source :** le build ne casse pas. Le bloc s'affiche avec ce qui est disponible et le build émet un avertissement.

## 8. Contraintes

- Les tests anti-palmarès (`tests/site-transverse.test.ts`) couvrent l'accueil et /sources/.
- **Le test `site-pages` qui attend « Sans palmarès » sur l'accueil reste vert.** Le bloc Principes est conservé.
- Mise en page : la ligne de flottaison sur un portable (env. 1366×768) comprend l'accroche, la rangée de chiffres et la recherche. Sur mobile, l'ordre reste le même.
- Pas de nouveau JavaScript. Le bloc vitrine et les compteurs sont rendus au build.
- Clair et sombre : uniquement des tokens existants de `obs.css`. Les classes propres à la maquette (`.fabrique`, `.resume`, `.compare`, `.tile`, `.tag`) passent dans `obs.css`, et les annotations de maquette (`.note`) sont supprimées.

## 9. Laissé au builder

- Le découpage en composants (par exemple `FicheVitrine.astro`, partagé entre l'accueil et /sources/, avec une variante courte et une variante complète).
- Le texte exact des précisions par source sur /sources/, dans le vocabulaire des producteurs.
- Le libellé et le style exacts de la mise en avant de la colonne « L'observatoire », dans le système visuel existant.
- Les tests : la présence des blocs, les compteurs égaux au décompte de `sources.json`, l'absence de mot de palmarès et le comportement quand la vitrine est incomplète.
