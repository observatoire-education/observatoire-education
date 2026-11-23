# Observatoire citoyen de l’éducation en France : conception

Date : 2026-11-23 · Statut : approuvé par le porteur
Nom du projet : **Observatoire citoyen de l’éducation en France** · domaine : `observatoireeducation.fr` (décidé le 2026-11-23).

## 1. Intention

En 2025, pendant la mobilisation des AED de Loire-Atlantique, un tableau de bord a été monté dans l'urgence (dépôt `AED` : un script Python qui croise trois CSV, une page statique sur GitHub Pages). Le nouveau projet généralise l'idée :

> Donner aux parents d'élèves, aux personnels et à toute personne intéressée des **chiffres fiables et opposables** sur chaque collège et lycée de France, public et privé sous contrat, pour s'appuyer dessus en conseil d'administration et en mobilisation.

**Opposable** veut dire que personne en face ne peut contester un chiffre : chacun indique sa source, son millésime et un lien vers la donnée brute, et reste consultable à l'identique plus tard.

**Posture : un observatoire froid, centré sur les données.** Le porteur du projet milite pour l'école publique, mais le site ne commente pas : il montre, source à l'appui. Ton neutre, vocabulaire des producteurs de données, aucun éditorial sur les pages.

## 2. Public

- Parents élus (FCPE et autres) qui préparent un conseil d'administration.
- Personnels de l'Éducation nationale (enseignants, vie scolaire, AED) et leurs représentants.
- Journalistes et élus locaux, à titre secondaire.

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs v1**
- Une page par établissement du second degré (collèges, lycées GT, lycées pro, lycées polyvalents, EREA), publics et privés sous contrat, France entière (métropole et DROM), soit environ 11 000 pages.
- Sur chaque page, chaque indicateur est situé par rapport à la moyenne du département, de l'académie et de la France, en séparant public et privé.
- Les **établissements voisins sont nommés**, notamment les privés du secteur, avec leur IPS et leurs sources.
- Des pages de synthèse (département, académie, France) : statistiques globales et écarts public/privé, en particulier sur l'IPS et la ségrégation sociale.
- Le budget des collectivités en euros par élève (départements pour les collèges, régions pour les lycées), comparable entre territoires et dans le temps.
- Une fiche imprimable par établissement, à apporter en conseil d'administration.
- Des données fraîches à 24 h près après la publication d'un nouveau millésime, sans import manuel.

**Non-objectifs v1**
- Écoles du premier degré : prévues en v2, avec des pages plus légères (IPS non actualisé, pas de données sur les personnels, budget éclaté entre environ 35 000 communes).
- Privé hors contrat : absent des sources statistiques. *(Choix de conception : pas de page en v1 et pas de présence parmi les voisins, où il n'apporterait aucune valeur comparable. Sur les pages de synthèse, il apparaît seulement en nombre d'établissements et d'élèves quand l'annuaire le permet, avec la mention « non couvert par les statistiques publiques ».)*
- API publique réutilisable.
- Comptes utilisateurs, contributions, commentaires.

**Anti-objectifs : ce qui ferait échouer le projet, même s'il fonctionne techniquement**
- **Un palmarès ou un classement.** On compare pour objectiver, on ne note pas. Les tableaux de synthèse peuvent être filtrés et triés librement sur toutes les colonnes, IPS compris : c'est de la donnée brute. En revanche, on ne met jamais les extrêmes en avant : pas de « top 10 », pas de « meilleurs » ni de « pires », pas de rang affiché, pas de mise en couleur des premiers ou des derniers. Le tri par défaut se fait par nom.
- **Un chiffre sans source ou sans millésime affiché.**
- **Une donnée manquante qui passe pour un zéro.** Toute absence est explicite : « non publié pour le privé », « établissement ouvert après ce millésime »…
- **Un commentaire ou une formulation militante sur les pages.**
- **Une charge excessive sur les API publiques** : la collecte est limitée à quelques requêtes par source et par nuit.

## 4. Contenu

### 4.1 Sources retenues

Toutes les sources sont en open data. Les identifiants exacts des jeux (data.education.gouv.fr, data.gouv.fr, data.economie.gouv.fr) sont à confirmer par le builder.

| Domaine | Source | Couverture | Rythme |
|---|---|---|---|
| Référentiel (clé UAI, nom, adresse, coordonnées, secteur, nature, éducation prioritaire, internat, ULIS, SEGPA) | Annuaire de l'éducation (MEN) | public et privé, y compris hors contrat | quotidien |
| IPS et écart-type | IPS collèges / lycées / EREA « à partir de 2023 » (DEPP) + séries 2016-2022 pour l'historique | public et privé sous contrat | annuel |
| Ségrégation sociale | Indicateurs de ségrégation sociale entre collèges, par département | public et privé | annuel |
| Effectifs | Effectifs par niveau des collèges, lycées GT et lycées pro | public et privé sous contrat | annuel (octobre) |
| Personnels | Les personnels dans les établissements du second degré (ETP vie scolaire, enseignants, statuts, âges, ancienneté) | public et privé sous contrat pour les enseignants ; **vie scolaire : public uniquement** (vérifié le 2026-11-23) | annuel |
| Résultats et valeur ajoutée | IVAC (collèges, intègre le DNB), IVAL GT et pro (nouvelles versions) | public et privé | annuel |
| Éducation prioritaire | Établissements de l'éducation prioritaire | public | ponctuel |
| Budget | Balances comptables DGFiP avec présentation croisée nature × fonction (départements : fonction collèges ; régions : fonction lycées), complétées par les agrégats OFGL | collectivités | annuel |

Le budget est **par collectivité, pas par établissement** : aucune source nationale ne publie les dotations établissement par établissement. La page d'un établissement affiche donc le budget en euros par élève de sa collectivité de rattachement, situé par rapport aux autres départements ou régions. Les jeux départementaux de dotations par collège, comme celui de la Gironde, pourront s'ajouter plus tard, source par source.

### 4.2 Page établissement

Dans l'ordre :
1. **Identité** : nom, UAI, secteur, nature, commune, académie, éducation prioritaire, dispositifs (SEGPA, ULIS, internat), carte.
2. **Indicateurs clés, chacun situé.** Pour chaque indicateur : la valeur, puis l'écart à la moyenne départementale, académique et nationale du même type d'établissement, calculée séparément pour le public et pour le privé sous contrat. *(Choix de conception : les écarts calculés sont toujours rapportés à des moyennes territoriales issues directement des sources. Ils ne dépendent jamais de la définition du voisinage, pour que le chiffre le plus cité reste un chiffre de source et pas un choix de méthode. Les voisins, bloc 3, sont affichés avec leurs valeurs brutes, sans écart calculé.)*
   - IPS et écart-type, avec historique.
   - Effectifs, avec historique.
   - Personnels (public) : ETP vie scolaire, élèves par ETP de vie scolaire, ETP enseignants, élèves par ETP enseignant, part des non-titulaires, ancienneté.
   - Valeur ajoutée et résultats (IVAC, IVAL).
   - Budget en euros par élève de la collectivité.
3. **Établissements voisins, nommés** : les plus proches du même type, publics et privés, avec IPS, effectifs, distance et lien vers leur page.
4. **Sources et méthode** : la liste des sources de la page, chacune avec son millésime, la date de collecte et un lien vers le jeu d'origine.

Croquis :

```
Collège X (public) · Nantes · REP · UAI 0440xxxA
IPS 92,4   ▼ −14 vs moyenne dép. public   ▼ −29 vs moyenne dép. privé
Vie scolaire : 1 ETP pour 118 élèves   (dép. public : 1 pour 96)
Source : DEPP, IPS 2025 · collecté le 2026-11-22 · lien vers la donnée
Voisins : Collège privé Y (0,8 km) IPS 123 · Collège Z (1,9 km) IPS 101
```

### 4.3 Pages de synthèse

France, académie et département : distribution des IPS public et privé, indice de ségrégation, moyennes des indicateurs, budget en euros par élève et son évolution, liste filtrable des établissements du territoire.

### 4.4 Fiche imprimable

Une mise en page dédiée à l'impression de la page établissement, générée par le navigateur (bouton « Imprimer / PDF »). Elle tient sur une page A4 si possible et porte toujours les sources, les millésimes et la date d'édition.

## 5. Contraintes

- **Coût : 0 € par mois**, en dehors du nom de domaine. Le projet est porté bénévolement.
- Aucune machine personnelle allumée la nuit.
- Respect des API publiques : on vérifie les dates de mise à jour, et on ne télécharge que ce qui a changé.
- Licences : sources sous Licence Ouverte (Etalab), mentionnée sur le site. Licence du projet à décider par le porteur (le dépôt AED est en CC BY-NC 4.0).
- Accessibilité : contrastes et navigation au clavier, publics non techniciens, consultation fréquente sur téléphone.

## 6. Approches envisagées

- **A. Site statique régénéré automatiquement (retenue).** Une tâche nocturne collecte les sources, les croise par UAI, calcule les comparaisons et génère le site, qui est ensuite publié tel quel. Ce choix ne coûte rien, ne sollicite les API publiques qu'une fois par nuit, permet d'archiver les versions, et le site est rapide.
- **B. Site dynamique interrogeant les API à chaque visite, avec cache.** Écartée : le site dépendrait de la disponibilité et des quotas des API (c'était la crainte du porteur), les croisements entre sources à la volée sont lourds, et on ne pourrait pas garantir qu'un chiffre cité reste identique. Les sources étant annuelles, cette approche n'apporterait de toute façon aucune fraîcheur.
- **C. Base de données hébergée et API, sur l'offre gratuite Cloudflare.** Écartée pour la v1 : limites trop serrées (10 ms de CPU par exécution, 100 000 lignes écrites et 100 000 requêtes par jour, que les robots d'indexation pourraient consommer seuls), et l'API n'est pas un besoin v1. Elle reste possible plus tard sans refonte, en ajoutant un Worker qui lit les mêmes fichiers de données.

Hébergement : GitHub Pages plutôt que Cloudflare pour la v1. Le porteur l'utilise déjà, aucun compte supplémentaire n'est nécessaire, et collecte et hébergement sont au même endroit. Les limites (1 Go par site, 100 Go de trafic par mois) sont compatibles à deux conditions : aucun PDF stocké, et des archives conservées sous forme de données. Le passage à Cloudflare reste possible en une étape de déploiement.

## 7. Décisions prises par le porteur

- Second degré d'abord ; écoles en v2.
- Public et privé sous contrat, France entière, une page par établissement.
- Établissements voisins nommés, avec leurs sources.
- Observatoire froid, sans éditorial.
- Approche A : collecte et génération nocturnes sur GitHub Actions, site statique sur GitHub Pages, fiche imprimable générée par le navigateur.
- Pas d'API en v1.
- Tableaux de synthèse : tri libre, sans mise en avant des extrêmes.
- Publication sous une organisation GitHub dédiée et neutre, sans la marque FCPE, avec un domaine propre dès la v1. Les liens cités doivent rester valides quels que soient l'hébergeur et le mainteneur.

## 8. Architecture (approche A)

```
GitHub Actions (cron nocturne)
  1. vérifier  → date « modified » de chaque source via les API des portails
  2. collecter → télécharger les sources modifiées (le budget DGFiP est filtré côté API : départements et régions, fonctions collèges et lycées)
  3. croiser   → base locale, jointure par UAI, calcul des moyennes et des voisins
  4. publier   → fichiers de données versionnés par millésime + génération des pages
  5. déployer  → GitHub Pages ; journal de collecte enregistré dans le dépôt
```

- **Nouveau dépôt**, distinct du dépôt `AED`, dans une organisation GitHub dédiée. Ce document y sera déplacé.
- **Domaine propre** configuré sur GitHub Pages dès la première mise en ligne. Les URL (par exemple `/etablissement/<UAI>`) sont considérées comme permanentes. Domaine retenu : `observatoireeducation.fr`, à acheter par le porteur (environ 10 € par an, seul coût du projet).
- **Une collecte nocturne qui n'a rien trouvé de nouveau ne régénère rien.** Le journal est quand même enregistré, ce qui évite la suspension automatique des tâches planifiées après 60 jours d'inactivité.
- **Archivage** *(choix de conception)* : les pages ne sont pas figées par date. Chaque établissement a une URL stable qui montre toujours le dernier millésime, avec l'historique des millésimes précédents sur la même page. Chaque version téléchargée d'une source est conservée sous forme de données, avec sa date de collecte et son empreinte. Si un producteur corrige un millésime déjà publié, les deux versions sont gardées et la page signale la correction. On peut ainsi retrouver un chiffre cité à une date donnée, sans multiplier les copies du site.
- **Statistiques à la carte** dans le navigateur, sur des fichiers de données compacts, chargés uniquement sur les pages de synthèse.
- **Robustesse** : si une source est indisponible ou si son format change, la collecte garde la version précédente, le signale dans le journal et ne publie pas de page cassée.

## 9. Laissé au builder

- Choix des outils : langage de collecte (Python, dans la continuité du script AED, est le choix par défaut), moteur de croisement, générateur de site, bibliothèque de graphiques, format des fichiers de données.
- Définition précise du voisinage (rayon, nombre de voisins, même type d'établissement), à documenter sur le site.
- Méthode de calcul du budget en euros par élève : postes comptables retenus d'après la notice DGFiP, effectifs utilisés, traitement de la contribution des départements et régions au fonctionnement du privé sous contrat. La méthode est publiée sur le site.
- Gestion des UAI qui changent (fusions, cités scolaires) et des établissements fermés.
- Structure des URL, plan du site, référencement.
- Tests de la chaîne de collecte : un format de source qui change ne doit jamais publier de faux chiffres.
