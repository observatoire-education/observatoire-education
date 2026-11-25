// Remontées des visiteurs : motifs, validation du formulaire, composition du mail, liens de contact et d'issue GitHub.
// Partagé par le site et par le Worker (worker/index.ts) : aucun import, le Worker est compilé sans dépendances.

export type Motif = "erreur" | "complement" | "question" | "autre";

export const MOTIFS: readonly { code: Motif; libelle: string; prefixe: string }[] = [
  { code: "erreur", libelle: "Une erreur dans les données", prefixe: "[Erreur]" },
  { code: "complement", libelle: "Une information complémentaire", prefixe: "[Complément]" },
  { code: "question", libelle: "Une question", prefixe: "[Question]" },
  { code: "autre", libelle: "Autre", prefixe: "[Autre]" },
];

/** Page d'où vient le visiteur : chemin interne, nom, code (UAI ou code géographique), onglet actif. */
export interface Contexte { page?: string; nom?: string; code?: string; onglet?: string }
export interface Signalement { motif: Motif; message: string; email?: string; contexte: Contexte }
export type Validation = { ok: true; signalement: Signalement } | { ok: false; erreurs: string[] };

export const MESSAGE_MAX = 5000;
export const EMAIL_MAX = 254;
export const CONTEXTE_MAX = 200;
const CLES_CONTEXTE = ["page", "nom", "code", "onglet"] as const;

/** Chaîne rognée, ou undefined si absente ou vide. */
const valeur = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** Chemin interne au site : commence par « / » mais pas par « // » (protocole relatif). */
const cheminInterne = (p: string): boolean => p.startsWith("/") && !p.startsWith("//");

export function validerSignalement(champs: Record<string, string | undefined>): Validation {
  const erreurs: string[] = [];
  const motif = valeur(champs.motif);
  if (!MOTIFS.some((m) => m.code === motif)) erreurs.push("Choisissez l'objet de votre message.");
  const message = valeur(champs.message);
  if (!message) erreurs.push("Le message est vide.");
  else if (message.length > MESSAGE_MAX) erreurs.push(`Le message dépasse ${MESSAGE_MAX} caractères.`);
  const email = valeur(champs.email);
  if (email && (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    erreurs.push("L'adresse e-mail n'est pas valide.");
  }
  const contexte: Contexte = {};
  for (const cle of CLES_CONTEXTE) {
    const v = valeur(champs[cle]);
    if (!v) continue;
    if (v.length > CONTEXTE_MAX) { erreurs.push("Le contexte de la page est trop long."); continue; }
    if (cle === "page" && !cheminInterne(v)) continue;
    contexte[cle] = v;
  }
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, signalement: { motif: motif as Motif, message: message!, ...(email ? { email } : {}), contexte } };
}

/** Une seule ligne : tout blanc (dont \r\n) devient une espace. */
const uneLigne = (s: string): string => s.replace(/\s+/g, " ").trim();

/** « Collège Jules Verne (0441234X) – Résultats », ou null sans nom ni code. */
function libelleContexte(c: Contexte): string | null {
  const base = [c.nom, c.code ? `(${c.code})` : undefined].filter(Boolean).join(" ");
  if (!base) return null;
  return uneLigne(c.onglet ? `${base} – ${c.onglet}` : base);
}

export function objetMail(s: Signalement): string {
  const prefixe = MOTIFS.find((m) => m.code === s.motif)!.prefixe;
  return uneLigne(`${prefixe} ${libelleContexte(s.contexte) ?? "Contact"}`);
}

const echapper = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const dateFr = (d: Date): string =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export function composerMail(s: Signalement, siteUrl: string, date: Date): { subject: string; text: string; html: string } {
  const motif = MOTIFS.find((m) => m.code === s.motif)!.libelle;
  const lien = s.contexte.page ? `${siteUrl}${s.contexte.page}` : null;
  const lignes: [string, string][] = [
    ["Objet", motif],
    ...(s.contexte.nom ? [["Page", s.contexte.nom] as [string, string]] : []),
    ...(s.contexte.code ? [["Code", s.contexte.code] as [string, string]] : []),
    ...(s.contexte.onglet ? [["Onglet", s.contexte.onglet] as [string, string]] : []),
    ...(lien ? [["Lien", lien] as [string, string]] : []),
    ["E-mail", s.email ?? "non fourni"],
    ["Reçu le", dateFr(date)],
  ];
  const text = `${s.message}\n\n---\n${lignes.map(([k, v]) => `${k} : ${v}`).join("\n")}\n`;
  const html = `<p style="white-space:pre-wrap">${echapper(s.message)}</p><hr><table>${lignes
    .map(([k, v]) => `<tr><th align="left">${echapper(k)}</th><td>${k === "Lien" ? `<a href="${echapper(v)}">${echapper(v)}</a>` : echapper(v)}</td></tr>`)
    .join("")}</table>`;
  return { subject: objetMail(s), text, html };
}

export function lienIssueGitHub(depot: string, motif: Motif, contexte: Contexte, siteUrl: string): string {
  const libelle = MOTIFS.find((m) => m.code === motif)!.libelle;
  const title = libelleContexte(contexte) ?? libelle;
  const lien = contexte.page && cheminInterne(contexte.page) ? `${siteUrl}${contexte.page}` : null;
  const body = [`**${libelle}**`, "", "<!-- Décrivez ici votre remarque. -->", "", ...(lien ? [`Page : ${lien}`] : [])].join("\n");
  return `https://github.com/${depot}/issues/new?${new URLSearchParams({ title, body })}`;
}

export function lienContact(contexte: Contexte): string {
  const p = new URLSearchParams();
  for (const cle of CLES_CONTEXTE) if (contexte[cle]) p.set(cle, contexte[cle]!);
  const q = p.toString();
  return q ? `/contact/?${q}` : "/contact/";
}
