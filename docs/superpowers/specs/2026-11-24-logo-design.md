# Logo : tableau noir à courbes — design

Date : 2026-11-24 · Taille : petite modification

## Intention

Le carré bicolore du header (violet / ambre en diagonale) reprend bien le code public / privé, mais ne dit pas de quoi parle le site, et le site n'a aucun favicon. Le logo doit faire comprendre, sans le nom à côté (onglet, favicon, header mobile où le nom est masqué sous 720 px) : **un établissement scolaire, observé avec des chiffres**.

## Objectifs, non-objectifs, anti-objectifs

- Objectifs : un favicon ; un logo de header à la place du carré ; une version complète réutilisable en grand.
- Non-objectifs : image de partage (`og:image`), refonte du header, police ou mot-symbole.
- Anti-objectifs : tout ce qui évoque un palmarès (podium, médaille, flèche montante, courbes qui se croisent ou se dépassent) ; un fronton à colonnes (fait tribunal, pas école) ; une troisième couleur dans le système visuel.

## Approches considérées

1. Fronton-graphique (colonnes = barres) : écarté, lu comme un tribunal.
2. École à clocheton : confusion avec la mairie, illisible en 16 px.
3. Crayon-barre : dit « écrire » plus qu'« établissement ».
4. **Tableau noir à courbes (retenu)** : la salle de classe + les chiffres dans le temps, avec la grammaire exacte des courbes d'évolution du site (`site/src/lib/plot.ts`) : public = trait plein violet à points pleins, privé = tirets ambre à points creux. Choix de l'ardoise **encre** (pas verte) pour rester dans les couleurs du site.

## Le dessin (décidé)

Repère 64 × 64. Couleurs « craie » = variantes claires du site, identiques en clair et en sombre puisque le fond est toujours l'ardoise : violet `#9d8cff`, ambre `#f5c04a`, ardoise `#1b1f30`.

**Version simplifiée (favicon et header)** — sans chevalet :
- ardoise : `rect 2,2 60×60 rx 12`, fond `#1b1f30` ;
- privé : polyline `13,28 32,25 51,26`, ambre, épaisseur 4, tirets `6 4.5`, bouts arrondis ; trois points creux r 4.3, contour ambre 3, remplissage ardoise ;
- public : polyline `13,39 32,36 51,37`, violet, épaisseur 4 ; trois points pleins r 5 ;
- courbes **presque parallèles et presque plates** (écart ≈ 11 unités, variation de quelques unités, sans tendance nette ni montée), qui ne se croisent pas : une évolution qu'on observe, pas une progression qu'on célèbre.

**Version complète (grand format)** — ardoise `rect 4,7 56×42 rx 3` bordée bois `#9a7444` (3), deux pieds de chevalet, axe à la craie (`#e9e9e9`, opacité 0,55), quatre points par courbe (privé `13,24 24,22 35,23 48,21.5`, public `13,33 24,31 35,32 48,30.5`), mêmes règles (presque parallèles et plates, épaisseur 2.2, tirets `4 3`, points r 2.6 / 2.4).

## Intégration

- `site/public/favicon.svg` (version simplifiée) + `<link rel="icon" type="image/svg+xml">` dans `site/src/layouts/Base.astro`.
- `site/public/apple-touch-icon.png` (180 px) pour l'écran d'accueil iOS. Pas de `favicon.ico` (choix du réalisateur : tous les navigateurs visés lisent le favicon SVG déclaré ; un 404 sur `/favicon.ico` est sans effet).
- Header : le `<i>` de `.brand` remplacé par `<img src="/favicon.svg" alt="">` (22 px), le lien portant `aria-label` ; la règle `.brand i` de `obs.css` remplacée. (Amendement à la réalisation : une image plutôt que le SVG en ligne, qui portait la fiche complète au-delà de la limite de 60 000 octets ; l'image est mise en cache une fois pour tout le site.)
- Version complète conservée comme `site/public/logo.svg` (README, usages futurs).
- **Mode sombre** : l'ardoise `#1b1f30` se confond presque avec la barre sombre (`--surface` `#151826`). Dans le header, l'ardoise reçoit un contour fin (`box-shadow` à 22 % de `--ink`) pour garder sa forme en sombre.

## Laissé au réalisateur

- Outil de génération des PNG / ICO (script ponctuel, pas de dépendance ajoutée au build si possible).
- Ajustements au pixel près pour le rendu à 16 px, dans le respect des règles ci-dessus.
- Test d'HTML généré vérifiant la présence du lien favicon.
