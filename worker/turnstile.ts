// Vérification côté serveur d'un jeton Cloudflare Turnstile.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Vrai si Cloudflare valide le jeton. Un jeton absent ou vide est refusé sans appel réseau. */
export async function verifierTurnstile(
  jeton: string | undefined,
  secret: string,
  ip: string | null,
  f: typeof fetch = fetch,
): Promise<boolean> {
  if (!jeton) return false;
  const corps = new URLSearchParams({ secret, response: jeton });
  if (ip) corps.set("remoteip", ip);
  try {
    const r = await f(SITEVERIFY, { method: "POST", body: corps });
    const json = (await r.json()) as { success?: boolean };
    return json.success === true;
  } catch (e) {
    console.error("Turnstile injoignable", e);
    return false;
  }
}
