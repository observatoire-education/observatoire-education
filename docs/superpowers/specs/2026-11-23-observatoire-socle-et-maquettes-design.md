# Observatoire citoyen de l'éducation en France : socle technique et maquettes

Date : 2026-11-23 · Statut : validé par le porteur le 2026-11-23 (relu par un regard extérieur)
Complète : `2026-11-23-observatoire-citoyen-education-design.md` (la spec). Remplace les choix techniques du brouillon `../plans/2026-11-23-observatoire-phase1-socle.md`, qui sera réécrit ensuite.
Maquettes : `maquettes-2026-11-23/` (HTML autonomes ; ouvrir `fiche-public.html` dans un navigateur, ◐ bascule clair / sombre).

## 1. Pourquoi ce document

La spec fixe le quoi (un observatoire froid, opposable, ~11 000 fiches, sans palmarès) et laisse les outils au builder. Le brouillon de plan proposait une chaîne Python (uv, DuckDB, Jinja2). Le porteur, qui maintiendra le code, est **à l'aise en TypeScript, peu en Python**, monte en compétence sur Rust et veut **une stack moderne et rapide** ainsi qu'**une interface dépouillée qui met les données en valeur, aux couleurs modernes, « 2026 intemporel »**. Ce document arrête le socle et la forme des pages en conséquence.

Rien ne change aux décisions de la spec (statique, GitHub Actions nocturne, GitHub Pages, organisation neutre, domaine propre, pas d'API v1, tri libre sans mise en avant des extrêmes, fiche imprimable par le navigateur), sauf les écarts listés en section 6.

## 2. Socle technique

### 2.1 Collecte et croisement : Bun + TypeScript + DuckDB + Parquet

**Retenu (choix du porteur) :** tout en TypeScript sur Bun.
- Collecte : scripts Bun (`fetch`) qui interrogent les portails, téléchargent en Parquet et valident (colonnes requises, baisse de lignes) comme décrit dans le brouillon de plan.
- Croisement : DuckDB, la logique métier étant écrite en **fichiers `.sql`** lisibles et testables (normalisation des codes département, rentrées, familles, secteurs ; moyennes Σ/Σ ; voisins).
- Exécution de DuckDB : le module `@duckdb/node-api` sous Bun ; si sa compatibilité pose problème au premier essai, repli sur le binaire `duckdb` appelé par le script (les `.sql` restent identiques).
- Tests : `bun test`, couverture mesurée (`bun test --coverage`). Deux niveaux : (1) pipeline et SQL sur de petits jeux d'essai (cas du brouillon : `"NA"`, ETP nul, `02A`/`001`/`977`, schéma qui change, téléchargement tronqué, établissement sans coordonnées) ; (2) **tests sur le HTML généré** : on construit un site d'essai et on vérifie les pages produites (mentions « non publié pour le privé », aucun mot de palmarès, sources présentes, aucun zéro à la place d'une absence). Ces tests ne dépendent pas du générateur.

**Écartés :**
- *Python (uv, DuckDB, Jinja2)* du brouillon : chaîne que le porteur maintiendrait mal.
- *Rust pour la collecte et le croisement + Astro* : deux langages, développement plus lent, aucun gain perceptible (le volume est petit, la vitesse vient de DuckDB). Rust reste envisageable plus tard pour une brique isolée.

### 2.2 Générateur du site : Astro (sortie statique)

**Retenu :** Astro en mode statique. Pages `.astro` typées, HTML pur sans JavaScript par défaut ; JavaScript ajouté seulement où il sert (recherche, carte au clic, tableaux filtrables, explorateur). Les ~11 000 fiches et ~5 000 pages communes sont générées par `getStaticPaths` à partir des fichiers produits par le pipeline.

**Écartés :**
- *Observable Framework* : intègre Plot, DuckDB-WASM et des pages paramétrées, mais son activité ralentit (dernière version v1.13.4 du 02/03/2026, dernier commit en mai 2026 d'après l'API GitHub), son esthétique « carnet de données » se personnalise mal, et générer 11 000 fiches n'est pas son usage principal. On en garde l'esprit et Observable Plot.
- *Jinja2* : lié au choix Python.
- *Eleventy* : cité comme alternative, non approfondi ; Astro retenu pour le TypeScript typé de bout en bout.

### 2.3 Graphiques et cartes

**Retenu :**
- **Observable Plot, rendu en SVG au moment du build** et inséré tel quel dans le HTML : zéro JavaScript sur les fiches, affichage instantané sur téléphone, impression nette. Sur les pages de synthèse, le même Plot tourne dans le navigateur pour les graphiques interactifs.
- **Carte d'une fiche : MapLibre GL + tuiles vectorielles OpenFreeMap** (gratuites, sans clé), **chargée uniquement au clic** sur « Afficher la carte ».
- **Cartes des pages de synthèse : SVG statique** généré par Plot à partir des contours IGN simplifiés, sans fond de tuiles.

**Écartés :** ECharts (lourd, rendu canvas qui s'imprime mal, air « tableau de bord commercial ») ; uPlot / Chart.js (peu expressifs pour les distributions) ; Leaflet + tuiles raster OpenStreetMap (conditions d'usage incompatibles avec un trafic important).

### 2.4 Statistiques dans le navigateur (explorateur en phase 5) : JSON précalculé + DuckDB-WASM à la demande

**Retenu (option « les deux ») :**
- Chaque page de synthèse charge **son propre JSON précalculé** (quelques dizaines de Ko pour un département) : tri, filtres, graphiques en local, instantané sur téléphone.
- *(Phase 5.)* Un bouton **« Explorer les données »** (`/explorer/`) charge **DuckDB-WASM à la demande** (3 à 4 Mo) pour des croisements libres sur la France entière.
- *(Phase 5.)* Les **fichiers Parquet de chaque millésime sont publiés en téléchargement** : n'importe qui peut refaire un calcul (opposabilité).
- L'explorateur suit les règles anti-palmarès : tri par nom par défaut, aucun rang affiché.

**Écartés :** JSON seul (ne répond qu'aux questions prévues) ; DuckDB-WASM seul (trop lourd pour l'usage courant).

### 2.5 Structure du dépôt et archives

**Retenu :**
- Un seul dépôt organisé en **espaces de travail Bun** : `pipeline/` (collecte, `.sql`, génération des fichiers de données), `site/` (Astro), `shared/` (types communs : `Fiche`, `Mesure`, statuts `ok` / `non_publie_prive` / `non_disponible`…), `tests/fixtures/`.
- **Les archives des sources ne sont pas dans git.** Chaque version téléchargée d'une source (Parquet, avec empreinte et date de collecte) est **publiée comme fichier joint d'une GitHub Release** ; le dépôt ne garde que le `manifest.json` et le journal de collecte (une ligne par source et par nuit, ce qui maintient l'activité du dépôt et évite la suspension des tâches planifiées). Chaque version brute obtient ainsi une URL de téléchargement permanente et citable. Raison : l'annuaire change presque chaque jour et ferait grossir le dépôt d'environ 500 Mo par an.

### 2.6 Schéma des URL (permanentes)

| Page | URL | Remarque |
|---|---|---|
| Accueil | `/` | |
| Établissement | `/etablissement/0440001A/` | UAI en majuscules ; une adresse en minuscules est redirigée par la page 404 (GitHub Pages distingue la casse) |
| Commune | `/commune/44109/` | code INSEE ; **nouveau type de page** (section 6) |
| Département | `/departement/44/`, `/departement/2A/`, `/departement/971/` | code INSEE canonique |
| Académie | `/academie/17/` | code, plus stable que le nom |
| France | `/france/` | |
| Sources, méthode, explorateur | `/sources/`, `/methode/`, `/explorer/` | |
| Données publiées | `/donnees/2025/ips-colleges.parquet` | par millésime |

- La hiérarchie est dans la page, pas dans l'URL : **fil d'Ariane cliquable** France › Académie › Département › Commune.
- La fiche imprimable n'a pas d'URL propre : c'est la même page avec une feuille de style d'impression.
- Un établissement fermé ou fusionné **garde sa page**, avec la mention « fermé » et un lien vers son successeur.

**Écartés :** `/etablissement/0440001A-college-jules-verne/` (un changement de nom casse le lien, GitHub Pages ne sait pas faire de vraie redirection) ; `/44/0440001A/` (casse si le rattachement change).

### 2.7 Périmètre de la phase 1, mise en ligne, volume et licences

**Périmètre de la phase 1 (validé par le porteur) :**
- En ligne : fiches établissement (public et privé sous contrat), accueil avec recherche, pages département, `/sources/`, `/methode/`, 404 (redirection des UAI en minuscules).
- En phase 2 (livrée) : pages commune, académie et France. En phase 5 : explorateur DuckDB-WASM, `/donnees/`.
- **Fil d'Ariane sans lien mort** : tant qu'une page de territoire n'existe pas, son maillon est du texte simple ; il devient un lien quand la page est générée.
- **Historique** : séries IPS « à partir de 2023 », et les millésimes présents dans les jeux actuels d'effectifs et de personnels. L'IPS 2016-2022 (autres jeux, autre schéma) passe en phase 4.

**Mise en ligne publique (choix du builder, conforme à la spec) :** domaine `observatoireeducation.fr` (nom du projet : « Observatoire citoyen de l’éducation en France »). seulement une fois l'organisation GitHub et le domaine définitifs créés, car les liens « donnée brute » (GitHub Releases) contiennent `organisation/dépôt` et le lien permanent et le QR code contiennent le domaine. Avant cela, un aperçu non référencé (`noindex`, pas de sitemap soumis).

**Volume (choix du builder) :** budget d'environ 50 Ko de HTML par fiche (barres empilées en HTML/CSS, SVG Plot compacts, styles partagés). Le garde-fou du build reste à 900 Mo et 50 000 fichiers ; s'il est atteint, passage à Cloudflare Pages comme prévu par la spec, sans changer les URL.

**Licences (décision du porteur) :** données retraitées et archives publiées sous **Licence Ouverte 2.0 (Etalab)**, comme les sources ; code sous **AGPL-3.0**.

## 3. Système visuel

- **Thèmes :** clair par défaut (ambiance « Signal »), **sombre automatique** via `prefers-color-scheme` (ambiance « Nuit »), plus un bouton ◐ dont le choix est mémorisé localement.
- **Polices : uniquement système**, aucune police Google ni externe. Texte : `system-ui, -apple-system, "Segoe UI", Roboto, …`. Chiffres : monospace système (`ui-monospace, "SF Mono", Menlo, Consolas, …`) avec chiffres tabulaires. Une police auto-hébergée reste possible plus tard si besoin.
- **Couleurs : violet / ambre** (choix du porteur, palette 1). La couleur ne code **que le secteur**, jamais un jugement : ni rouge ni vert « bien / mal ».

  | Jeton | Clair | Sombre | Usage |
  |---|---|---|---|
  | `--pub` | `#6e56f8` | `#9d8cff` | marques du public |
  | `--pub-ink` | `#5a41f0` | `#b3a6ff` | texte du public |
  | `--pri` | `#e0a020` | `#f5c04a` | marques du privé sous contrat |
  | `--pri-ink` | `#8f6200` | `#f5c04a` | texte du privé (l'ambre pur est trop clair pour du texte sur blanc) |
  | `--bg` / `--surface` | `#f7f7f9` / `#ffffff` | `#0d0f17` / `#151826` | fonds |
  | `--ink` / `--muted` | `#14161c` / `#5d6270` | `#eceef6` / `#9aa0b4` | texte |

  Les valeurs exactes sont dans `maquettes-2026-11-23/obs.css`.
- **Formes redondantes avec la couleur** (daltonisme, impression noir et blanc) : public = **point plein**, privé sous contrat = **anneau**, l'établissement de la page = **losange neutre** (encre).
- **Catégories** (statuts, âges, ancienneté, filles/garçons, langues) en **rampe de gris neutre** : le violet et l'ambre restent réservés au secteur ; pas de rose / bleu pour les sexes.
- **Absences** : texte en toutes lettres (« non publié pour le privé », « pas de SEGPA », « non disponible ») avec un picto en pointillés ou des hachures dans les barres ; jamais 0 ni tiret seul pour une donnée manquante.
- Mobile d'abord, contraste AA, navigation au clavier, tableaux défilant horizontalement sur petit écran.

## 4. Maquettes validées

Toutes dans `maquettes-2026-11-23/`. Chiffres et noms fictifs ; les encadrés jaunes sont des annotations de maquette.

### 4.1 Fiche établissement public (`fiche-public.html`)

Retour du porteur : **l'IPS est moins mis en avant** (l'outil AED était centré sur la vie scolaire ; celui-ci est global), **tout tient sur la page**, et **les données femmes / hommes doivent figurer**.

Ordre :
1. **En-tête** : fil d'Ariane, nom, pastilles (secteur, type, éducation prioritaire, SEGPA, ULIS, UAI, adresse), boutons « Imprimer / PDF », « Afficher la carte », « Copier le lien ».
2. **Bandeau de six chiffres clés au même niveau** : élèves, élèves par ETP enseignant, élèves par ETP de vie scolaire, part d'enseignantes, part de non-titulaires, IPS ; sous chacun, moyennes départementales public et privé.

**Règle d'affichage des comparaisons (validée par le porteur, conforme à la spec 4.2) :** sur la page web, chaque moyenne de comparaison s'affiche **avec l'écart en premier et la moyenne entre parenthèses**, par exemple « −14,0 (106,4) », pour tous les indicateurs qui ont une moyenne (pas seulement l'IPS). Les maquettes ne l'appliquent qu'au tableau de l'IPS ; les autres tableaux sont à aligner. Sur la **fiche A4**, le tableau central garde les **moyennes seules** pour rester lisible. Les volumes (élèves, ETP) n'ont pas de moyenne ni d'écart.
3. **Sommaire** : Élèves · Composition sociale · Enseignants · Vie scolaire · Voisins · Sources.
4. **Élèves** : historique de l'effectif avec SEGPA / ULIS ; tableau par niveau avec filles, garçons, part de filles, et barre comparée aux moyennes ; langues vivantes LV1 et LV2.
5. **Composition sociale** : IPS et écart-type, graphique à points (losange établissement, point moyenne publique, anneau moyenne privée) sur trois lignes département / académie / France ; évolution ; tableau des écarts. Moyennes **publiées par la DEPP**, affichées telles quelles ; quand la DEPP n'en publie pas (commune), l'observatoire la calcule, pondérée par les effectifs, et l'indique (spec de phase 2, section 6.4).
6. **Enseignants** : ETP total, ETP enseignants, élèves par ETP enseignant (seuls les ratios ont une moyenne ; les volumes ne se comparent pas) ; puis barres empilées à 100 % sur cinq lignes (établissement, département public et privé, France public et privé) pour **femmes / hommes, statuts, âge, ancienneté dans l'établissement**.
7. **Vie scolaire** : élèves par ETP de vie scolaire et ETP, situés par rapport aux moyennes publiques.
8. **Résultats et moyens** (phases 3 et 4) : IVAC / DNB, budget de la collectivité en € par élève, même gabarit.
9. **Voisins nommés** : les 6 plus proches à moins de 30 km, triés par distance, colonnes élèves, élèves par ETP enseignant, IPS ; valeurs brutes, sans écart.
10. **Sources de la page** : producteur, titre, millésime, date de collecte, lien vers la donnée brute archivée ; date de génération et lien permanent.

Colonnes de source utilisées (vérifiées sur les CSV du dépôt AED) :
- *Personnels second degré* : ETP total, ETP vie scolaire, ETP enseignants, ETP femmes enseignantes, ETP agrégés, certifiés/PEPS, PLP, autres titulaires, non titulaires, ETP par âge (< 35, 35–49, ≥ 50), ETP par ancienneté (< 2, 2–4, 5–7, ≥ 8 ans).
- *Effectifs collèges* : total, hors SEGPA/ULIS, SEGPA, ULIS, par niveau (6e à 3e) avec filles / garçons, LV1 et LV2 par langue.

**Lycées :** le bloc Élèves diffère (seconde, première, terminale ; voies générale, technologique, professionnelle) car les jeux d'effectifs des lycées n'ont pas les mêmes colonnes. Pas de maquette dédiée : même gabarit, contenu adapté aux colonnes disponibles.

### 4.2 Fiche établissement privé sous contrat (`fiche-prive.html`)

Même gabarit. Différences :
- Pastilles « Privé sous contrat » (ambre) et type de contrat (« Contrat d'association »).
- **Élèves par ETP de vie scolaire : « non publié pour le privé »** dans le bandeau et dans la section Vie scolaire, avec une phrase neutre (la DEPP ne publie ces ETP que pour le public), les moyennes publiques pour situer, et la date de vérification de l'absence.
- Les autres indicateurs de personnels **sont publiés pour le privé** et s'affichent normalement : ETP total et ETP enseignants sont bien présents dans le jeu (vérifié sur le CSV ; seule la colonne vie scolaire est vide).
- Les écarts d'IPS s'affichent de la même façon qu'ils soient positifs ou négatifs, sans couleur de jugement.
- Les voisins publics sont nommés comme les autres.

### 4.3 Fiche imprimable A4 (`fiche-a4.html`)

Produite par la feuille de style d'impression de la fiche (`window.print()`), sans PDF stocké. Tient sur **une page A4** (mesuré : 210 × 297 mm, avec de la marge pour un lycée).
- En-tête : nom, secteur, type, dispositifs, UAI, adresse, département, académie ; à droite date d'édition, lien permanent et **QR code** vers la page (généré au build).
- **Tableau central opposable** : une ligne par indicateur, colonnes établissement puis moyennes public et privé du département, de l'académie et de la France ; chaque ligne renvoie à sa source par un numéro.
- Élèves par niveau (filles, garçons, SEGPA, ULIS) ; personnels en ETP.
- Voisins nommés avec UAI, triés par distance.
- Pied : sources numérotées avec millésime et date de collecte, définition de « non publié », « Ce document ne contient aucun commentaire ».
- **Aucun graphique à l'impression** : tableaux seulement ; pastille / anneau conservés en noir et blanc.

### 4.4 Page département (`departement.html`)

- **Onglets par type d'établissement** (Collèges, Lycées GT, Lycées polyvalents, Lycées pro, EREA) : les moyennes n'ont de sens qu'à type égal.
- Bandeau : nombre d'établissements public / privé, élèves, part du privé (France pour repère), IPS moyen public / privé, élèves par ETP de vie scolaire, **hors contrat en nombre d'établissements avec « non couvert par les statistiques publiques »**.
- Composition sociale : distribution des IPS (public en barres pleines, privé en barres contour) ; IPS moyen comparé à l'académie et à la France ; indice de ségrégation (phase 4).
- Carte SVG statique (points pleins / anneaux, taille = élèves) ; évolution des élèves public / privé depuis 2016 ; budget par élève (phase 3).
- Tableau des moyennes du département face à l'académie et à la France.
- **Liste de tous les établissements** : filtres secteur, éducation prioritaire, nom ou commune ; **tri par nom par défaut**, triable sur toutes les colonnes, aucun rang ; colonnes élèves, élèves par ETP enseignant, élèves par ETP de vie scolaire, part d'enseignantes, IPS.
- Liste des communes avec leur nombre d'établissements (liens vers les pages communes).
- Boutons « Télécharger les données (CSV, Parquet) » et « Explorer les données ».

Les pages **académie**, **France** et **commune** suivent ce gabarit (pas de maquette dédiée) ; la page commune se limite à la liste des établissements de la commune avec leurs valeurs brutes et un lien vers son département.

### 4.5 Accueil et recherche (`accueil.html`)

- Titre neutre (« Les chiffres publics de chaque collège et lycée de France. ») et un paragraphe descriptif sans commentaire.
- **Grande recherche** : insensible aux accents et à la casse, sur nom, commune, UAI et département ; résultats groupés (établissements avec pastille de secteur, type, commune, UAI ; communes ; départements) ; message explicite sans résultat, rappelant que le hors contrat n'est pas couvert. Index chargé au premier focus (`/recherche.json`, clés courtes).
- Bandeau national : collèges, lycées, EREA (public / privé), élèves, avec sources.
- Parcourir par territoire : académies par ordre alphabétique et leurs départements, lien France entière.
- Dernières mises à jour des sources, avec dates.
- Quatre principes : sourcé et daté, sans classement, absences dites, imprimable.

## 5. Choix laissés au builder

- Version exacte d'Astro, de Plot, de MapLibre et de DuckDB-WASM au moment de l'implémentation.
- Bibliothèque de génération des QR codes au build (en SVG, sans dépendance réseau).
- Contours IGN simplifiés : source et niveau de simplification.
- Format exact des JSON précalculés et de `recherche.json`.
- Mise en page de la page commune et des pages académie / France, dans le gabarit de la page département.

## 6. Écarts par rapport à la spec et au brouillon de plan

À reporter dans la spec et dans le plan de phase 1 réécrit :
1. **Langage** : TypeScript sur Bun au lieu de Python (la spec laissait le choix ; le brouillon supposait Python).
2. **Générateur** : Astro au lieu de Jinja2.
3. **Archives** : GitHub Releases au lieu de fichiers Parquet committés dans `archives/`.
4. **Pages communes** `/commune/<INSEE>/` : nouveau type de page (environ 5 000), en phase 2 avec les synthèses.
5. **Indicateurs de la fiche élargis** dès la phase 1 : femmes / hommes (élèves et enseignants), statuts, âges, ancienneté complète, niveaux, SEGPA / ULIS, langues vivantes. L'IPS devient un indicateur parmi d'autres.
6. **Explorateur DuckDB-WASM** et publication des Parquet par millésime (`/donnees/`), en phase 5.
7. **Tests** : `bun test` avec couverture, plus des tests sur le HTML généré.
8. **Licences** : Licence Ouverte 2.0 pour les données, AGPL-3.0 pour le code (la spec laissait la question ouverte ; le dépôt AED reste en CC BY-NC).
9. **Historique de l'IPS 2016-2022** : déplacé en phase 4.
