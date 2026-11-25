# Remontées des visiteurs : contact et signalements — design

Date : 2026-11-25 · Statut : à valider

## Intention

Donner à tout visiteur un moyen simple de faire remonter quelque chose à l'éditeur : une erreur dans les données, une information complémentaire, une question. Plutôt qu'un formulaire de contact isolé, une brique unique réutilisable : la page `/contact` et un lien sur chaque fiche ouvrent le même formulaire, qui transmet automatiquement le contexte de la page.

Le public visé n'est pas technique (parents, enseignants, élus). Le parcours doit fonctionner sans compte ni logiciel de messagerie configuré.

## Objectifs

- Un formulaire accessible depuis toutes les pages : lien « Contact » dans le pied de page commun, plus un lien « Signaler ou compléter » par fiche (établissement, école, commune, département, académie, région, France).
- Depuis une fiche, le contexte est pré-rempli et visible : type de page, nom, code (UAI ou code géographique), onglet actif, URL. Le visiteur peut le retirer.
- Chaque envoi arrive par mail sur **contact@observatoireeducation.fr**, avec un objet lisible et un lien vers la page. L'éditeur répond depuis sa messagerie.
- Un lien secondaire et discret ouvre une issue GitHub pré-remplie avec le même contexte, pour les profils techniques.

## Non-objectifs

- Pas de suivi des signalements : ni statuts, ni tableau de bord, ni base de données. La boîte mail suffit.
- Pas de publication automatique des signalements (pas de création d'issue par le Worker).
- Pas de lien par bloc ou par indicateur : un seul lien par page (décision de l'éditeur).
- Pas de pièces jointes.

## Anti-objectifs

- Publier sans le savoir les propos d'un visiteur (nom d'un enfant ou d'un enseignant…). C'est pour cela que la voie principale est le mail privé et que GitHub reste secondaire.
- Exposer l'adresse contact@ dans le HTML (aspiration d'adresses par les robots de spam).
- Ajouter du bruit visuel aux fiches, que l'éditeur a déjà travaillé à alléger.
- Changer le service des pages statiques : environ 92 000 fichiers servis comme assets ne doivent ni passer par le script ni coûter des invocations.
- Faire transiter les messages par un service tiers.

## Contraintes

- Site Astro entièrement statique. Le Worker Cloudflare `observatoire-education` ne sert aujourd'hui que `./dist` (assets seuls, [wrangler.jsonc](../../../wrangler.jsonc)). La zone DNS est chez Cloudflare, la messagerie chez OVH (CNAME mail en « DNS only », MX OVH à ne pas toucher).
- Déploiement par `bunx wrangler@4.159.0 deploy` dans le job `deployer` de `nightly.yml`, **sans installer les dépendances du dépôt**. Le script du Worker doit donc être autonome (aucun import `workspace:*` ni dépendance npm), wrangler le compile lui-même.
- Gabarit unique [Base.astro](../../../site/src/layouts/Base.astro) : l'en-tête et le pied de page communs y sont définis.
- Les onglets sont gérés par `site/public/js/onglets.js` : l'onglet actif se lit dans `[role="tab"][aria-selected="true"]` ou dans le hash.

## Approches envisagées

| Approche | Pour | Contre |
|---|---|---|
| **A. Formulaire → Worker → mail (retenue)** | Tout reste sur le compte Cloudflare existant, sans tiers. Adresse jamais exposée, mail structuré, anti-spam Turnstile. | Quelques DNS d'envoi à poser, environ 100 lignes de code serveur à maintenir. |
| B. Service de formulaires externe (Formspree, Web3Forms, Tally) | Aucun code serveur. | Messages chez un tiers (souvent hors UE, mention RGPD), quotas gratuits, dépendance. |
| C. Lien `mailto:` pré-rempli | Rien à héberger. | Ne marche pas sans messagerie configurée, adresse exposée, pas un vrai formulaire. |
| D. Issues GitHub comme voie principale | Gratuit, public, traçable. | Compte GitHub requis, interface en anglais, publication involontaire de données personnelles. |

Choix de l'éditeur : **A**, avec le lien GitHub de D **en complément**.

## Ce qui est décidé

### Parcours

1. **Pied de page** (Base.astro) : lien « Contact » vers `/contact/` sur toutes les pages.
2. **Fiches** : un lien « Signaler une erreur ou compléter » par page, à un endroit discret de la fiche (voir « Laissé au constructeur »). Il mène à `/contact/` en transmettant le contexte dans l'URL (paramètres de requête : `page`, `nom`, `code`, `onglet`). L'onglet est lu au clic, puisqu'il change côté client.
3. **Page `/contact/`** : le formulaire, accompagné d'un court texte d'accueil. Si l'URL porte un contexte, il s'affiche en encart au-dessus du message, avec un bouton « retirer ».

### Formulaire

- **Motif** (obligatoire, boutons radio) : Une erreur dans les données · Une information complémentaire · Une question · Autre. Arrivé depuis une fiche, « erreur » est présélectionné *(proposition)*.
- **Message** (obligatoire, texte libre, longueur bornée).
- **E-mail** (facultatif) : « pour que nous puissions vous répondre ».
- **Contexte** : champs cachés repris de l'URL, affichés en encart.
- **Turnstile** (Cloudflare), en mode invisible ou géré.
- Une ligne sur l'usage des données : transmises par mail à l'éditeur, utilisées seulement pour traiter la demande, non conservées par le site.
- **Lien GitHub secondaire** : « Vous utilisez GitHub ? Ouvrir une issue publique », qui construit `https://github.com/<CONFIG.DEPOT>/issues/new?title=…&body=…` avec le contexte. Une mention précise que l'issue est publique.
- Le formulaire fonctionne **sans JavaScript** : envoi classique en `POST`, puis redirection vers une page de confirmation ou d'erreur. Le JS ne sert qu'à améliorer l'expérience (envoi sans rechargement, lecture de l'onglet actif). Le widget Turnstile, lui, exige JS : sans JS, l'envoi est refusé avec un message clair *(proposition)*.

### Worker

- On ajoute un script `main` au Worker existant. Les assets restent servis directement : le script n'est invoqué **que** pour `/api/signalement`, via `assets.run_worker_first: ["/api/*"]` ou un mécanisme équivalent vérifié dans la doc à jour.
- Le script de `/api/signalement` (`POST` uniquement) :
  1. vérifie le jeton Turnstile côté serveur (secret en *secret* Wrangler) ;
  2. valide les champs (motif dans la liste, message non vide et borné, e-mail au bon format s'il est fourni, contexte borné) ;
  3. envoie le mail via le binding `send_email` de Cloudflare Email Service ;
  4. répond par une redirection (envoi classique) ou en JSON (envoi en JS).
- Le mail envoyé :
  - **De** : une adresse d'envoi du domaine onboardé (par exemple `formulaire@…`), **à** contact@observatoireeducation.fr.
  - **Répondre à** : l'e-mail du visiteur, s'il l'a donné.
  - **Objet** : `[Erreur] Collège Jules Verne (0441234X) – Résultats`, ou `[Question] Contact` sans contexte.
  - **Corps** (texte et HTML) : le message, le lien absolu vers la page, le contexte, la date.
- Anti-abus : Turnstile, plus des limites de taille. Pas de limitation de débit au départ *(proposition)*.

### DNS et configuration

- Onboarding du domaine sur Email Sending (`wrangler email sending enable …`). Les enregistrements d'envoi (SPF, DKIM, éventuellement DMARC) doivent **coexister** avec la messagerie OVH : fusionner le SPF existant plutôt que le remplacer, ne toucher ni aux MX ni aux CNAME mail. Utiliser un sous-domaine d'envoi si Cloudflare le permet ou le recommande, pour isoler les deux.
- Turnstile : un widget pour `observatoireeducation.fr`. La clé publique va dans la config du site, le secret en secret Worker.
- Le job `deployer` doit continuer à fonctionner sans installer les dépendances. Les secrets Worker se posent une fois, hors CI.

### Envoi : vérifications et repli (calls de conception)

- **Première étape du plan : vérifier qu'Email Sending (le nouveau service d'envoi, pas l'ancien binding Email Routing limité aux adresses vérifiées avec des MX chez Cloudflare) est disponible sur le compte, avec le plan Workers payant, et qu'il peut écrire vers une boîte hébergée chez OVH.** Si ce n'est pas le cas, on s'arrête et on revient vers l'éditeur avant d'écrire du code.
- **Envoi depuis un sous-domaine dédié** (par exemple `envoi.observatoireeducation.fr`). Le SPF de l'apex (`v=spf1 include:mx.ovh.com -all`), les MX et les CNAME OVH restent intacts, et une erreur de configuration ne peut pas casser la messagerie de l'éditeur.
- **Mise en service derrière un drapeau de config** (par exemple `CONTACT.ACTIF` dans la config du site). Tant que l'onboarding, Turnstile et les secrets ne sont pas en place, aucun lien n'est publié. La page `/contact/` existe (Astro génère toujours une page fixe), mais en `noindex`, sans formulaire et non liée, et le déploiement nocturne continue de passer.
- **Anti-abus : Turnstile seul au départ**, sans limitation de débit. On ajoutera une règle si du spam passe.
- Le droit du jeton `CLOUDFLARE_API_TOKEN` de la CI à déployer un Worker avec script et binding d'envoi se vérifie au premier déploiement. S'il manque des droits, l'éditeur élargit le jeton.

### Fiches couvertes

Les écoles et les établissements du second degré partagent la route `etablissement/[uai]`. Le lien est donc présent sur `etablissement/[uai]` et sur les pages de territoire (`commune`, `departement`, `academie`, `region`, `france`). Le garde-fou de build vérifie ces deux familles.

## Dépendance : pages À propos et Mentions légales

Au moment de la rédaction, des pages `a-propos.astro` et `mentions-legales.astro` sont en cours, non commitées, avec des modifications de `Base.astro` et de la config. Ce chantier, mené par une autre session, touche le même pied de page : il doit être commité avant de commencer.

## Configuration Cloudflare

La configuration unique (onboarding d'envoi du sous-domaine, DNS, widget Turnstile, secret Worker) se fait par des commandes `wrangler` lancées depuis la session de développement. L'éditeur donne son accord à chaque commande qui modifie le compte.

Vérifié le 2026-11-25, d'après la doc Cloudflare et l'état du compte :
- wrangler est connecté, avec les droits `email_sending` et `challenge-widgets`. Aucun domaine d'envoi n'est encore configuré.
- Avec le plan Workers Paid et un domaine d'envoi onboardé, Email Sending écrit à « any recipient », donc à une boîte OVH. Ni MX Cloudflare ni Email Routing ne sont nécessaires. 3 000 mails par mois sont inclus.
- L'onboarding ajoute des enregistrements sur `cf-bounce.<domaine>` (MX de retour, SPF, DKIM) et un `_dmarc.<domaine>` en `p=reject` s'il est absent. Avec `envoi.observatoireeducation.fr`, tout reste sous ce sous-domaine : les MX, SPF et DMARC de l'apex ne sont pas touchés. **Ne pas activer Email Routing sur l'apex** (MX OVH). Une fois l'onboarding fait, les enregistrements créés sont relus (`wrangler email sending dns get`) pour le confirmer.
- **Fait le 2026-11-25** : envoi activé sur `envoi.observatoireeducation.fr`. Les enregistrements sont tous sous ce sous-domaine, l'apex est vérifié intact (SPF OVH, MX OVH, pas de DMARC apex).
- **Turnstile** : widget créé par l'éditeur, en mode géré, pré-autorisation désactivée, sur `observatoireeducation.fr`, `www.observatoireeducation.fr` et `localhost`. Clé publique : `0x4AAAAAAGSqI_70-OwNH_Ug`, à mettre dans la config du site. Le secret est posé par l'éditeur (`wrangler secret put TURNSTILE_SECRET`) au moment du premier déploiement avec script.
- Binding : `"send_email": [{ "name": "EMAIL" }]`, appel `env.EMAIL.send({ from, to, subject, text, html, replyTo })`. En `wrangler dev`, l'envoi est simulé (logué) par défaut, et réel avec `"remote": true`. La mention sur l'usage des données du formulaire renvoie vers les mentions légales, qui gagnent un court paragraphe sur le formulaire.

## Laissé au constructeur

- L'emplacement exact et le style du lien sur les fiches (près de l'en-tête de fiche, ou en bas avant le pied de page), dans l'esprit sobre des fiches.
- Le nom exact des paramètres d'URL et des champs, la longueur maximale du message.
- Le format des pages de confirmation et d'erreur (sans JS).
- Les tests : validation des champs et construction de l'objet et du corps (unitaires sous `bun test`), construction du lien GitHub, présence du lien sur chaque type de fiche (garde-fou de build).
- Tester l'envoi en local avec `wrangler dev`, en respectant les possibilités du binding en local.
