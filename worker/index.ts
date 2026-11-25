// Script du Worker : reçoit les remontées du formulaire (/api/signalement) et les envoie par mail.
// Invoqué seulement pour /api/* (assets.run_worker_first) : les pages restent servies en statique.
// Aucune dépendance npm ni import @obs/* : le déploiement compile ce fichier sans installer le dépôt.
import { composerMail, validerSignalement } from "../shared/src/signalement.ts";
import { verifierTurnstile } from "./turnstile.ts";

export interface EmailBinding {
  send(m: {
    from: { email: string; name: string };
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<{ messageId: string }>;
}

export interface Env {
  EMAIL: EmailBinding;
  ASSETS: { fetch(r: Request): Promise<Response> };
  /** Secret Turnstile, posé par `wrangler secret put TURNSTILE_SECRET`. */
  TURNSTILE_SECRET?: string;
  CONTACT_DESTINATION: string;
  CONTACT_EXPEDITEUR: string;
  SITE_URL: string;
}

type CodeErreur = "champs" | "verification" | "configuration" | "envoi";
const STATUTS: Record<CodeErreur, number> = { champs: 400, verification: 403, configuration: 500, envoi: 502 };
const MESSAGES: Record<CodeErreur, string> = {
  champs: "",
  verification: "La vérification anti-robot a échoué. Rechargez la page et réessayez.",
  configuration: "Le formulaire est momentanément indisponible.",
  envoi: "L'envoi a échoué. Réessayez dans quelques minutes.",
};

/** Réponse JSON si le navigateur l'a demandée (envoi en JS), sinon redirection (formulaire classique). */
function repondre(json: boolean, resultat: { ok: true } | { ok: false; code: CodeErreur; erreurs?: string[] }): Response {
  if (json) {
    if (resultat.ok) return Response.json({ ok: true });
    const erreurs = resultat.erreurs ?? [MESSAGES[resultat.code]];
    return Response.json({ ok: false, erreurs }, { status: STATUTS[resultat.code] });
  }
  const cible = resultat.ok ? "/contact/merci/" : `/contact/?erreur=${resultat.code}`;
  return new Response(null, { status: 303, headers: { location: cible } });
}

async function signalement(req: Request, env: Env): Promise<Response> {
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  if (!env.TURNSTILE_SECRET) {
    console.error("TURNSTILE_SECRET manquant : formulaire refusé");
    return repondre(json, { ok: false, code: "configuration" });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return repondre(json, { ok: false, code: "champs", erreurs: ["Formulaire illisible."] });
  }
  const champ = (k: string): string | undefined => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  if (!(await verifierTurnstile(champ("cf-turnstile-response"), env.TURNSTILE_SECRET, req.headers.get("cf-connecting-ip")))) {
    return repondre(json, { ok: false, code: "verification" });
  }
  const v = validerSignalement(Object.fromEntries(
    ["motif", "message", "email", "page", "nom", "code", "onglet"].map((k) => [k, champ(k)]),
  ));
  if (!v.ok) return repondre(json, { ok: false, code: "champs", erreurs: v.erreurs });
  const mail = composerMail(v.signalement, env.SITE_URL, new Date());
  try {
    await env.EMAIL.send({
      from: { email: env.CONTACT_EXPEDITEUR, name: "Observatoire — formulaire" },
      to: env.CONTACT_DESTINATION,
      ...mail,
      ...(v.signalement.email ? { replyTo: v.signalement.email } : {}),
    });
  } catch (e) {
    console.error("Échec de l'envoi du signalement", (e as { code?: string }).code ?? "", e);
    return repondre(json, { ok: false, code: "envoi" });
  }
  return repondre(json, { ok: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/signalement") {
      if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405, headers: { allow: "POST" } });
      return signalement(req, env);
    }
    if (pathname.startsWith("/api/")) return new Response("Introuvable", { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
