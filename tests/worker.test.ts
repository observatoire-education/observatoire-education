import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import worker, { type Env } from "../worker/index.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const fetchOriginal = globalThis.fetch;
let turnstileOk = true;
let appelsSiteverify = 0;

beforeEach(() => {
  turnstileOk = true;
  appelsSiteverify = 0;
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    if (String(url) === SITEVERIFY) {
      appelsSiteverify++;
      return Response.json({ success: turnstileOk });
    }
    throw new Error(`fetch inattendu : ${url}`);
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

function env(o: Partial<Env> = {}): Env & { EMAIL: { send: ReturnType<typeof mock> } } {
  return {
    EMAIL: { send: mock(async () => ({ messageId: "m1" })) },
    ASSETS: { fetch: mock(async () => new Response("asset")) },
    TURNSTILE_SECRET: "secret",
    CONTACT_DESTINATION: "contact@observatoireeducation.fr",
    CONTACT_EXPEDITEUR: "formulaire@envoi.observatoireeducation.fr",
    SITE_URL: "https://observatoireeducation.fr",
    ...o,
  } as Env & { EMAIL: { send: ReturnType<typeof mock> } };
}

function requete(champs: Record<string, string>, o: { json?: boolean; methode?: string; chemin?: string } = {}): Request {
  const corps = new URLSearchParams(champs);
  return new Request(`https://observatoireeducation.fr${o.chemin ?? "/api/signalement"}`, {
    method: o.methode ?? "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(o.json === false ? {} : { accept: "application/json" }) },
    ...((o.methode ?? "POST") === "POST" ? { body: corps } : {}),
  });
}

const VALIDE = { motif: "erreur", message: "Le taux est faux.", "cf-turnstile-response": "jeton", page: "/etablissement/0440001A/", nom: "Collège A", code: "0440001A" };

describe("POST /api/signalement (JSON)", () => {
  test("valide : mail envoyé à contact@, 200", async () => {
    const e = env();
    const r = await worker.fetch(requete({ ...VALIDE, email: "parent@exemple.fr" }), e);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(e.EMAIL.send).toHaveBeenCalledTimes(1);
    const m = e.EMAIL.send.mock.calls[0]![0] as Record<string, any>;
    expect(m.to).toBe("contact@observatoireeducation.fr");
    expect(m.from.email).toBe("formulaire@envoi.observatoireeducation.fr");
    expect(m.replyTo).toBe("parent@exemple.fr");
    expect(m.subject).toBe("[Erreur] Collège A (0440001A)");
    expect(m.text).toContain("https://observatoireeducation.fr/etablissement/0440001A/");
  });

  test("sans e-mail : pas de replyTo", async () => {
    const e = env();
    await worker.fetch(requete(VALIDE), e);
    expect((e.EMAIL.send.mock.calls[0]![0] as Record<string, unknown>).replyTo).toBeUndefined();
  });

  test("Turnstile refusé : 403, rien envoyé", async () => {
    turnstileOk = false;
    const e = env();
    const r = await worker.fetch(requete(VALIDE), e);
    expect(r.status).toBe(403);
    expect(e.EMAIL.send).not.toHaveBeenCalled();
  });

  test("jeton absent : 403 sans appel à siteverify", async () => {
    const e = env();
    const { "cf-turnstile-response": _, ...sansJeton } = VALIDE;
    const r = await worker.fetch(requete(sansJeton), e);
    expect(r.status).toBe(403);
    expect(appelsSiteverify).toBe(0);
    expect(e.EMAIL.send).not.toHaveBeenCalled();
  });

  test("secret manquant : 500, log, rien envoyé", async () => {
    const erreur = mock(() => {});
    const original = console.error;
    console.error = erreur;
    try {
      const e = env({ TURNSTILE_SECRET: undefined });
      const r = await worker.fetch(requete(VALIDE), e);
      expect(r.status).toBe(500);
      expect(e.EMAIL.send).not.toHaveBeenCalled();
      expect(erreur).toHaveBeenCalled();
    } finally { console.error = original; }
  });

  test("champs invalides : 400 avec erreurs, rien envoyé", async () => {
    const e = env();
    const r = await worker.fetch(requete({ ...VALIDE, message: " " }), e);
    expect(r.status).toBe(400);
    const j = (await r.json()) as { ok: boolean; erreurs: string[] };
    expect(j.ok).toBe(false);
    expect(j.erreurs.length).toBeGreaterThan(0);
    expect(e.EMAIL.send).not.toHaveBeenCalled();
  });

  test("échec de l'envoi : 502", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const e = env();
      e.EMAIL.send = mock(async () => { throw Object.assign(new Error("quota"), { code: "E_DAILY_LIMIT_EXCEEDED" }); });
      const r = await worker.fetch(requete(VALIDE), e);
      expect(r.status).toBe(502);
      expect(((await r.json()) as { ok: boolean }).ok).toBe(false);
    } finally { console.error = original; }
  });
});

describe("POST /api/signalement (formulaire classique)", () => {
  test("sans jeton : 303 vers /contact/?erreur=verification", async () => {
    const { "cf-turnstile-response": _, ...sansJeton } = VALIDE;
    const r = await worker.fetch(requete(sansJeton, { json: false }), env());
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/contact/?erreur=verification");
  });

  test("champs invalides : 303 vers /contact/?erreur=champs", async () => {
    const r = await worker.fetch(requete({ ...VALIDE, motif: "x" }, { json: false }), env());
    expect(r.headers.get("location")).toBe("/contact/?erreur=champs");
  });

  test("succès : 303 vers /contact/merci/", async () => {
    const r = await worker.fetch(requete(VALIDE, { json: false }), env());
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/contact/merci/");
  });
});

describe("routage", () => {
  test("GET /api/signalement : 405", async () => {
    const r = await worker.fetch(requete({}, { methode: "GET" }), env());
    expect(r.status).toBe(405);
  });

  test("autre /api/* : 404", async () => {
    const r = await worker.fetch(requete(VALIDE, { chemin: "/api/autre" }), env());
    expect(r.status).toBe(404);
  });

  test("hors /api : assets", async () => {
    const e = env();
    const r = await worker.fetch(requete({}, { methode: "GET", chemin: "/etablissement/0440001A/" }), e);
    expect(await r.text()).toBe("asset");
  });
});

describe("wrangler.jsonc", () => {
  const conf = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""));

  test("script invoqué seulement sur /api/*, binding d'envoi et variables", () => {
    expect(conf.main).toBe("worker/index.ts");
    expect(conf.assets.run_worker_first).toEqual(["/api/*"]);
    expect(conf.assets.binding).toBe("ASSETS");
    expect(conf.send_email[0].name).toBe("EMAIL");
    expect(conf.vars).toEqual({
      CONTACT_DESTINATION: "contact@observatoireeducation.fr",
      CONTACT_EXPEDITEUR: "formulaire@envoi.observatoireeducation.fr",
      SITE_URL: "https://observatoireeducation.fr",
    });
  });
});
