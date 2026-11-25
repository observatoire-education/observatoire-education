// Pages à onglets : une page n'a de barre et de panneaux masqués qu'à partir de trois onglets.
export type Onglet = { id: string; libelle: string };

/** Retire les onglets absents (`false`, `null`, `undefined`) d'une liste construite avec des conditions. */
export function onglets(liste: (Onglet | false | null | undefined)[]): Onglet[] {
  return liste.filter((o): o is Onglet => !!o);
}

/** Moins de trois onglets : la page reste d'un seul tenant. */
export function avecOnglets(o: Onglet[]): boolean {
  return o.length >= 3;
}
