# Remontées des visiteurs (contact et signalements) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un formulaire unique (page `/contact/`, avec un lien « Signaler ou compléter » sur chaque fiche) qui envoie chaque remontée par mail à contact@observatoireeducation.fr, via le Worker Cloudflare existant.

**Architecture :** la logique pure (motifs, validation, composition du mail, lien GitHub, lien de contact) vit dans `shared/src/signalement.ts`, testée sous `bun test` et importée à la fois par le Worker et par le site. Le Worker reçoit un script `worker/index.ts`, invoqué seulement sur `/api/*` (`run_worker_first`). Il vérifie Turnstile, valide les champs et envoie le mail par le binding `send_email`. Côté site, la page `/contact/` et le composant de lien sont générés seulement si `CONTACT.ACTIF` est vrai dans la config.

**Tech Stack :** Astro 7 (statique), Cloudflare Workers (assets + script), Cloudflare Email Sending (binding `send_email`), Turnstile, Bun (tests, `linkedom`).

**Spec :** `docs/superpowers/specs/2026-11-25-observatoire-remontees-design.md`

## Global Constraints

- **Préalable :** le travail en cours d'une autre session (`a-propos.astro`, `mentions-legales.astro`, et les modifications de `Base.astro`, `config.ts`, `obs.css`, `sitemap.xml.ts`, `site-transverse.test.ts`) doit être commité avant la tâche 1. Ne pas toucher ces fichiers tant que `git status` les montre modifiés.
- Le Worker ne doit importer **aucune dépendance npm ni aucun chemin `@obs/*`**. Le job `deployer` ne lance pas `bun install`, et wrangler compile seul. Pour le module partagé, on passe par un import relatif `../shared/src/signalement.ts`.
- Ne pas ajouter `@cloudflare/workers-types` : définir localement les types minimaux (`Env`, `EmailBinding`).
- Destinataire : `contact@observatoireeducation.fr`. Expéditeur : `formulaire@envoi.observatoireeducation.fr`, nom « Observatoire — formulaire ».
- Clé publique Turnstile de production : `0x4AAAAAAGSqI_70-OwNH_Ug`. Pour les tests, la clé publique de test de Cloudflare qui passe toujours est `1x00000000000000000000AA`, et le secret de test qui valide toujours est `1x0000000000000000000000000000000AA`.
- Le secret Turnstile du Worker s'appelle `TURNSTILE_SECRET`. L'éditeur le pose lui-même et il n'apparaît jamais dans le dépôt.
- Motifs, dans cet ordre : `erreur` « Une erreur dans les données », `complement` « Une information complémentaire », `question` « Une question », `autre` « Autre ». Préfixes d'objet : `[Erreur]`, `[Complément]`, `[Question]`, `[Autre]`.
- Bornes : message de 1 à 5 000 caractères après `trim` ; e-mail au plus 254 caractères, au format `x@y.z` ; chaque champ de contexte au plus 200 caractères. Au-delà, rejet, pas de troncature.
- Paramètres de contexte (URL de `/contact/` et champs cachés) : `page` (chemin, doit commencer par `/` et ne pas commencer par `//`), `nom`, `code`, `onglet`.
- Libellé du lien sur les fiches : « ✉ Signaler une erreur ou compléter ». Lien du pied de page : « Contact ».
- Sans `CONTACT.ACTIF`, aucune page ne contient de lien de signalement ni de lien « Contact ». `/contact/` est généré (page Astro fixe), mais en `noindex`, sans formulaire, et n'est lié nulle part.
- Pas de limitation de débit. Turnstile seul.
- Style : code et commentaires en français, comme le reste du dépôt.

## Review Focus

1. **Contexte forgé dans l'URL** (`nom=<img src=x>` ou retour à la ligne dans `nom`) : le HTML du mail est échappé, l'objet ne contient ni `\r` ni `\n`, et un `page` qui ne commence pas par `/` (par exemple `https://evil.test`) est ignoré dans le lien du mail. → tests de la tâche 1.
2. **Échec de l'envoi** (exception de `env.EMAIL.send`, par exemple quota dépassé) : le visiteur reçoit une erreur claire (502), jamais un faux « merci », et le message reste dans le formulaire. → tests des tâches 2 et 3.
3. **Turnstile absent, invalide, ou secret manquant côté Worker** : rien n'est envoyé. Un jeton refusé donne 403. Un secret manquant donne 500, sans planter, avec un log. → tests de la tâche 2.
4. **Assets inchangés** : seul `/api/*` passe par le script, les fiches restent servies en statique. Une méthode autre que POST sur `/api/signalement` donne 405, et une autre route `/api/*` donne 404. → tâche 2 (test de config et test du routeur).
5. **Visiteur sans JavaScript** : le formulaire s'affiche, un message visible explique que l'envoi requiert JavaScript, et un POST sans jeton renvoie vers `/contact/?erreur=verification`, qui affiche ce message. → tests des tâches 2 et 3.

---

### Task 1 : module partagé `signalement`

**Files :**
- Create : `shared/src/signalement.ts`
- Test : `tests/signalement.test.ts`

**Interfaces :**
- Produces :
  ```ts
  export type Motif = "erreur" | "complement" | "question" | "autre";
  export const MOTIFS: readonly { code: Motif; libelle: string; prefixe: string }[];
  export interface Contexte { page?: string; nom?: string; code?: string; onglet?: string }
  export interface Signalement { motif: Motif; message: string; email?: string; contexte: Contexte }
  export type Validation = { ok: true; signalement: Signalement } | { ok: false; erreurs: string[] };
  export function validerSignalement(champs: Record<string, string | undefined>): Validation;
  export function objetMail(s: Signalement): string;
  export function composerMail(s: Signalement, siteUrl: string, date: Date): { subject: string; text: string; html: string };
  export function lienIssueGitHub(depot: string, motif: Motif, contexte: Contexte, siteUrl: string): string;
  export function lienContact(contexte: Contexte): string; // "/contact/?page=…&nom=…"
  ```
  `champs` reçoit les clés de formulaire `motif`, `message`, `email`, `page`, `nom`, `code`, `onglet`. Une chaîne vide vaut absence.

- [ ] **Step 1 : écrire les tests qui échouent** dans `tests/signalement.test.ts` :
  - `validerSignalement({ motif: "erreur", message: " Bonjour " })` → `ok: true`, `message === "Bonjour"`, `email` indéfini, `contexte` vide `{}`.
  - motif inconnu `"spam"`, message vide `"   "`, message de 5 001 caractères, e-mail `"pas-un-mail"`, e-mail de 255 caractères, `nom` de 201 caractères → `ok: false`, chacun avec au moins une erreur.
  - `page: "https://evil.test/x"` et `page: "//evil.test"` → `ok: true`, mais `contexte.page` indéfini. `page: "/etablissement/0440001A/"` est conservé.
  - `objetMail` avec motif `erreur`, `nom: "Collège Jules Verne"`, `code: "0441234X"`, `onglet: "Résultats"` → `"[Erreur] Collège Jules Verne (0441234X) – Résultats"`. Sans contexte, motif `question` → `"[Question] Contact"`. Avec `nom: "A\r\nBcc: x@y.z"` → l'objet ne contient ni `\r` ni `\n`.
  - `composerMail` avec `nom: "<img src=x>"` → `html` contient `&lt;img` et pas `<img`. `text` et `html` contiennent le message, `https://observatoireeducation.fr/etablissement/0440001A/` (`siteUrl` + `page`), la date au format `25/11/2026`, et l'e-mail s'il est fourni.
  - `lienIssueGitHub("o/r", "erreur", { page: "/x/", nom: "N" }, "https://s.fr")` commence par `https://github.com/o/r/issues/new?`, et ses paramètres décodés contiennent `title` = l'objet sans préfixe entre crochets et `body` qui contient `https://s.fr/x/`.
  - `lienContact({ page: "/x/", nom: "Jules & Verne" })` → `/contact/?page=%2Fx%2F&nom=Jules+%26+Verne` (encodage `URLSearchParams`). `lienContact({})` → `/contact/`.

- [ ] **Step 2 : lancer `bun test tests/signalement.test.ts`.** Attendu : échec (module introuvable).
- [ ] **Step 3 : implémenter `shared/src/signalement.ts`** avec les signatures ci-dessus et les bornes de « Global Constraints ». Échapper `& < > " '` dans le HTML. Dans l'objet, remplacer toute suite de blancs (dont `\r\n`) par une espace. Ne rien importer d'autre que du code local : le Worker l'importe.
- [ ] **Step 4 : lancer `bun test tests/signalement.test.ts && bun run typecheck`.** Attendu : tout passe.
- [ ] **Step 5 : commiter** `feat(signalement): module partagé de validation et de composition du mail`.

### Task 2 : script du Worker `/api/signalement`

**Files :**
- Create : `worker/index.ts`, `worker/turnstile.ts`
- Modify : `wrangler.jsonc`, `tsconfig.json` (ajouter `"worker"` à `include`)
- Test : `tests/worker.test.ts`

**Interfaces :**
- Consumes : `validerSignalement`, `composerMail` (tâche 1, import `../shared/src/signalement.ts`).
- Produces :
  ```ts
  export interface EmailBinding { send(m: { from: { email: string; name: string }; to: string; subject: string; text: string; html: string; replyTo?: string }): Promise<{ messageId: string }> }
  export interface Env { EMAIL: EmailBinding; ASSETS: { fetch(r: Request): Promise<Response> }; TURNSTILE_SECRET?: string; CONTACT_DESTINATION: string; CONTACT_EXPEDITEUR: string; SITE_URL: string }
  export async function verifierTurnstile(jeton: string | undefined, secret: string, ip: string | null, f?: typeof fetch): Promise<boolean>; // worker/turnstile.ts
  export default { fetch(req: Request, env: Env): Promise<Response> } // worker/index.ts
  ```
- Contrat de réponse de `POST /api/signalement` (champ de jeton : `cf-turnstile-response`) :
  - si l'en-tête `Accept` contient `application/json` : JSON `{ ok: true }` (200), ou `{ ok: false, erreurs: string[] }` avec 400 (champs invalides), 403 (Turnstile refusé), 500 (secret manquant) ou 502 (échec d'envoi) ;
  - sinon : 303 vers `/contact/merci/` en cas de succès, ou vers `/contact/?erreur=<code>` avec `code` ∈ `champs | verification | configuration | envoi`.

- [ ] **Step 1 : écrire les tests qui échouent** dans `tests/worker.test.ts`. Ils importent `worker/index.ts` et utilisent un `env` factice : `EMAIL.send` est un `mock`, `fetch` global remplacé pour `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
  - POST JSON valide avec un jeton accepté : 200 et `{ ok: true }` ; `EMAIL.send` appelé une fois avec `to: "contact@observatoireeducation.fr"`, `from.email: "formulaire@envoi.observatoireeducation.fr"`, et `replyTo` égal à l'e-mail fourni (absent sinon).
  - Jeton refusé (`success: false`) : 403, `send` jamais appelé.
  - `TURNSTILE_SECRET` absent : 500, `send` jamais appelé, `console.error` appelé.
  - Champs invalides : 400, `send` jamais appelé.
  - `send` qui lève une exception : 502.
  - POST sans `Accept: application/json` et sans jeton : 303, `Location` égal à `/contact/?erreur=verification`. Succès : 303 vers `/contact/merci/`.
  - `GET /api/signalement` : 405. `POST /api/autre` : 404.
  - `wrangler.jsonc` (lu en retirant les commentaires `//`) : `main === "worker/index.ts"`, `assets.run_worker_first` vaut `["/api/*"]`, `assets.binding === "ASSETS"`, `send_email[0].name === "EMAIL"`, et `vars` contient `CONTACT_DESTINATION`, `CONTACT_EXPEDITEUR`, `SITE_URL`.
- [ ] **Step 2 : lancer `bun test tests/worker.test.ts`.** Attendu : échec.
- [ ] **Step 3 : implémenter `worker/turnstile.ts`.** POST `application/x-www-form-urlencoded` vers siteverify avec `secret`, `response`, `remoteip` (tiré de `CF-Connecting-IP`), et renvoi de `json.success === true`. Un jeton vide renvoie `false` sans appel réseau.
- [ ] **Step 4 : implémenter `worker/index.ts`.** Router : `/api/signalement` en POST, sinon 405 ; tout autre `/api/*` donne 404 ; tout le reste passe par `env.ASSETS.fetch(req)`, par sécurité. Ordre des contrôles : secret, puis Turnstile, puis validation, puis envoi.
- [ ] **Step 5 : modifier `wrangler.jsonc`.** Ajouter `main`, `assets.binding: "ASSETS"`, `assets.run_worker_first: ["/api/*"]`, `send_email: [{ "name": "EMAIL" }]`, et `vars` avec les trois valeurs de « Global Constraints » (`SITE_URL: "https://observatoireeducation.fr"`). Commenter chaque ajout, comme le fichier le fait déjà.
- [ ] **Step 6 : lancer `bun test tests/worker.test.ts && bun run typecheck`, puis `bunx wrangler@4.159.0 deploy --dry-run --outdir .cache/worker-dry`.** Attendu : les tests passent et le dry-run compile sans erreur ni dépendance manquante.
- [ ] **Step 7 : commiter** `feat(worker): réception des signalements et envoi par mail`.

### Task 3 : config `CONTACT` et page `/contact/`

**Files :**
- Modify : `site/src/lib/config.ts` (ajouter `CONTACT?: { ACTIF: boolean; TURNSTILE_SITEKEY: string }` à `Config`), `observatoire.config.json` (`"CONTACT": { "ACTIF": false, "TURNSTILE_SITEKEY": "0x4AAAAAAGSqI_70-OwNH_Ug" }`), `tests/fixtures/observatoire.config.json` (`ACTIF: true`, clé de test `1x00000000000000000000AA`)
- Create : `site/src/pages/contact.astro`, `site/src/pages/contact/merci.astro`
- Test : `tests/site-contact.test.ts`

**Interfaces :**
- Consumes : `MOTIFS`, `Contexte`, `lienIssueGitHub` (tâche 1, via `@obs/shared/signalement` dans un `<script>` Astro bundlé) ; le contrat de réponse de la tâche 2.
- Produces : page `/contact/` avec `<form id="form-signalement" method="post" action="/api/signalement">`, champs `motif` (radios), `message` (textarea, `required`, `maxlength="5000"`), `email` (`type="email"`), champs cachés `page`, `nom`, `code`, `onglet`, encart `#contexte` (masqué si vide) avec un bouton « retirer » qui vide les champs cachés, widget `<div class="cf-turnstile" data-sitekey=…>`, zone `#etat` (`role="status"`), lien `#lien-github`, et zone `#sans-js` visible seulement sans JS (`<noscript>`).

- [ ] **Step 1 : écrire les tests qui échouent** dans `tests/site-contact.test.ts`, avec `siteTest()` et `doc()` de `tests/site.ts` :
  - `doc("contact")` contient le formulaire `#form-signalement` (action `/api/signalement`, méthode `post`), quatre radios `motif` dans l'ordre de `MOTIFS` avec leurs libellés, un `textarea[name=message][required]`, `input[name=email][type=email]` sans `required`, les quatre champs cachés, et `.cf-turnstile[data-sitekey="1x00000000000000000000AA"]`.
  - Le script Turnstile `https://challenges.cloudflare.com/turnstile/v0/api.js` est chargé.
  - La page contient une phrase sur l'usage des données et un lien vers `/mentions-legales/`.
  - Le texte du `<noscript>` mentionne que l'envoi nécessite JavaScript.
  - `doc("contact/merci")` existe et contient un lien de retour vers `/`.
  - La page `/contact/` contient un élément `[data-erreur="verification"]`, plus un par code d'erreur de la tâche 2, chacun masqué (`hidden`) par défaut.
  - Avec `ACTIF: false`, une page Astro fixe ne peut pas être omise du build. `/contact/` est donc générée, mais avec `noindex`, sans formulaire ni script Turnstile, avec seulement le texte « Le formulaire de contact sera bientôt disponible. », et elle n'est liée nulle part (tâche 4). Le rendu dépend d'une fonction pure `formulaireActif(config: Config): boolean` exportée de `site/src/lib/config.ts`, testée en unitaire sans second build.
- [ ] **Step 2 : lancer `bun test tests/site-contact.test.ts`.** Attendu : échec.
- [ ] **Step 3 : implémenter `contact.astro` et `contact/merci.astro`** avec `Base`. Le `<script>` Astro de la page :
  - lit `location.search` : il remplit les champs cachés et l'encart, présélectionne `erreur` si `page` est présent, et affiche `[data-erreur=<code>]` si `erreur` est présent ;
  - met à jour `#lien-github` (`lienIssueGitHub`) à chaque changement de motif ;
  - intercepte l'envoi : `fetch` avec `Accept: application/json`, affiche le succès dans `#etat` et vide le message ; en cas d'échec, il affiche les erreurs, garde le message et réinitialise le widget (`turnstile.reset()`).

  Mention du lien GitHub : « Vous utilisez GitHub ? Ouvrez plutôt une issue (publique) ».
- [ ] **Step 4 : lancer `bun test tests/site-contact.test.ts && bun run typecheck`.** Attendu : tout passe.
- [ ] **Step 5 : commiter** `feat(contact): page de contact et de signalement`.

### Task 4 : lien sur les fiches, les territoires et dans le pied de page

**Files :**
- Create : `site/src/components/LienSignalement.astro`
- Modify : `site/src/components/Entete.astro:63-70` (dans `.actions`), `site/src/components/Territoire.astro:157-160` (dans `.actions`), `site/src/layouts/Base.astro` (pied de page)
- Test : `tests/site-contact.test.ts` (même fichier)

**Interfaces :**
- Consumes : `lienContact`, `Contexte` (tâche 1) ; `CONFIG.CONTACT` (tâche 3).
- Produces : `<LienSignalement contexte={{ page, nom, code }} />`, qui rend `<a class="btn" data-signalement href={lienContact(contexte)}>✉ Signaler une erreur ou compléter</a>`, ou rien si `CONFIG.CONTACT?.ACTIF` n'est pas vrai. Un `<script>` Astro, dédoublonné par Astro, ajoute au clic le paramètre `onglet` avec le texte de `[role="tab"][aria-selected="true"]` s'il existe.

- [ ] **Step 1 : écrire les tests qui échouent :**
  - `doc("etablissement/0440001A")` : `.actions a[data-signalement]` existe, et son `href` décodé contient `page=/etablissement/0440001A/`, `code=0440001A` et `nom=` (le nom de la fiche).
  - Il en va de même pour une page de chaque niveau de territoire présente dans le site d'essai (`commune`, `departement`, `academie`, `region`, `france`) : `code` vaut le code du territoire (absent pour `france`).
  - Toutes les pages HTML (`toutesLesPages()`, comme dans `site-transverse.test.ts`) ont dans le `footer` un lien `a[href="/contact/"]` au texte « Contact ».
  - Exécuter le `<script>` du composant dans une fenêtre linkedom, comme le fait `tests/onglets.test.ts` : avec un onglet sélectionné « Résultats », un clic sur le lien ajoute `onglet=Résultats` au `href`.
- [ ] **Step 2 : lancer `bun test tests/site-contact.test.ts`.** Attendu : les nouveaux tests échouent.
- [ ] **Step 3 : créer `LienSignalement.astro` et l'insérer** dans `Entete.astro` (`page: /etablissement/${f.uai}/`, `nom: f.nom`, `code: f.uai`) et dans `Territoire.astro` (`page: chemin`, `nom`, `code: d.ref.code` sauf pour `france`). Ajouter « Contact » au pied de page de `Base.astro`, à côté de « Mentions légales », lui aussi conditionné par `CONFIG.CONTACT?.ACTIF`.
- [ ] **Step 4 : lancer `bun test`** (suite complète, le poids des fiches compris) **puis `bun run typecheck`.** Attendu : tout passe. `.actions` est déjà masqué à l'impression : rien à ajouter.
- [ ] **Step 5 : commiter** `feat(signalement): lien sur chaque fiche et contact dans le pied de page`.

### Task 5 : mentions légales et mise en service

**Files :**
- Modify : `site/src/pages/mentions-legales.astro` (paragraphe « Formulaire de contact »), `docs/superpowers/specs/2026-11-25-observatoire-remontees-design.md` (statut)
- Test : `tests/site-contact.test.ts`

- [ ] **Step 1 : test.** `doc("mentions-legales")` contient une section dont le titre contient « formulaire ». Elle doit dire que les messages sont transmis par mail à l'éditeur, que l'e-mail est facultatif et sert uniquement à répondre, que rien n'est conservé par le site, et que Cloudflare Turnstile est utilisé contre les robots.
- [ ] **Step 2 : rédiger le paragraphe, puis lancer `bun test`.** Attendu : tout passe.
- [ ] **Step 3 : commiter** `docs(mentions): usage des données du formulaire`, puis pousser et laisser passer un déploiement nocturne avec `ACTIF: false`. Le Worker a maintenant un script, et les pages ne bougent pas.
- [ ] **Step 4 (éditeur) :** `bunx wrangler@4.159.0 secret put TURNSTILE_SECRET`.
- [ ] **Step 5 : essai réel.** Avec l'accord de l'éditeur, faire un `curl` POST vers `https://observatoireeducation.fr/api/signalement`, avec `Accept: application/json` et sans jeton. Attendu : 403. Cela confirme que le script répond et que le secret est lu, sans envoyer de mail. Puis passer `ACTIF: true`, déployer, et envoyer un vrai signalement depuis une fiche dans le navigateur. Attendu : un mail dans la boîte contact@ avec l'objet `[Erreur] … (UAI) – <onglet>`.
- [ ] **Step 6 : commiter** `feat(contact): mise en service` (config `ACTIF: true` et statut du spec à « en ligne »).
