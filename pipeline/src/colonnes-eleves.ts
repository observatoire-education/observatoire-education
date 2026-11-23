// Définition déclarative des niveaux et des langues dans les jeux d'effectifs.
// Sert à générer le SQL (eleves.ts) et les colonnes requises de la collecte (sources.ts) :
// toute colonne lue par le calcul est exigée à la collecte.
import type { SourceId } from "@obs/shared/types";

/** Une partie d'un niveau : ses élèves et, si la source les publie, filles et garçons. */
export interface Composante {
  eleves: string;
  filles?: string;
  garcons?: string;
}

export interface DefNiveau {
  /** Ordre d'affichage, unique tous jeux confondus (collèges 1-4, GT 11-13, pro 21-26). */
  ordre: number;
  libelle: string;
  composantes: Composante[];
}

export interface DefLangue {
  rang: 1 | 2;
  /** Libellé : identique aux catégories de REPARTITIONS.lv1 / lv2. */
  langue: string;
  ordre: number;
  colonnes: string[];
}

export interface DefJeu {
  source: SourceId;
  rentree: string;
  uai: string;
  total: string;
  segpa?: string;
  ulis?: string;
  niveaux: DefNiveau[];
  langues: DefLangue[];
}

const sexe = (eleves: string, filles: string, garcons: string): Composante => ({ eleves, filles, garcons });
const sansSexe = (eleves: string): Composante => ({ eleves });

// --- Collèges ---

const NIVEAUX_COLLEGE = [6, 5, 4, 3] as const;

const LANGUES_LV1 = [
  ["Anglais", "anglais"],
  ["Allemand", "allemand"],
  ["Espagnol", "espagnol"],
  ["Autres", "autres_langues"],
] as const;
const LANGUES_LV2 = [
  ["Anglais", "anglais"],
  ["Allemand", "allemand"],
  ["Espagnol", "espagnol"],
  ["Italien", "italien"],
  ["Autres", "autres_langues"],
] as const;

const COLLEGES: DefJeu = {
  source: "effectifs_colleges",
  rentree: "rentree_scolaire",
  uai: "numero_college",
  total: "nombre_eleves_total",
  segpa: "nombre_d_eleves_total_segpa",
  ulis: "nombre_d_eleves_total_ulis",
  niveaux: NIVEAUX_COLLEGE.map((n, i) => ({
    ordre: i + 1,
    libelle: `${n}e`,
    composantes: [sexe(`nombre_total_de_${n}emes`, `${n}eme_filles`, `${n}emes_garcons`)],
  })),
  langues: [
    ...LANGUES_LV1.map(([langue, suffixe], i) => ({
      rang: 1 as const,
      langue,
      ordre: i + 1,
      colonnes: NIVEAUX_COLLEGE.map((n) => `nombre_de_${n}emes_lv1_${suffixe}`),
    })),
    // LV2 à partir de la 5e (la LV2 de 6e, marginale, n'est pas retenue)
    ...LANGUES_LV2.map(([langue, suffixe], i) => ({
      rang: 2 as const,
      langue,
      ordre: i + 1,
      colonnes: ([5, 4, 3] as const).map((n) => `nombre_de_${n}emes_lv2_${suffixe}`),
    })),
  ],
};

// --- Lycées généraux et technologiques : voie générale et voies technologiques ---

/** Voies avec filles et garçons publiés. */
const VOIES_GT_SEXE = ["g", "sti2d", "stl", "stmg", "st2s", "std2a"] as const;
/** Voies sans répartition par sexe dans la source. */
const VOIES_GT_SANS_SEXE = ["sthr", "tmd", "bt"] as const;

const niveauGt = (ordre: number, libelle: string, prefixe: "1eres" | "terminales"): DefNiveau => ({
  ordre,
  libelle,
  composantes: [
    ...VOIES_GT_SEXE.map((v) => sexe(`${prefixe}_${v}`, `${prefixe}_${v}_filles`, `${prefixe}_${v}_garcons`)),
    ...VOIES_GT_SANS_SEXE.map((v) => sansSexe(`${prefixe}_${v}`)),
  ],
});

const LYCEES_GT: DefJeu = {
  source: "effectifs_lycees_gt",
  rentree: "rentree_scolaire",
  uai: "numero_lycee",
  total: "nombre_d_eleves",
  niveaux: [
    {
      ordre: 11,
      libelle: "Seconde GT",
      composantes: [
        sexe("2ndes_gt", "2ndes_gt_filles", "2ndes_gt_garcons"),
        ...VOIES_GT_SANS_SEXE.map((v) => sansSexe(`2ndes_${v}`)),
      ],
    },
    niveauGt(12, "Première", "1eres"),
    niveauGt(13, "Terminale", "terminales"),
  ],
  langues: [],
};

// --- Lycées professionnels ---

const pro = (ordre: number, libelle: string, colonne: string): DefNiveau => ({
  ordre,
  libelle,
  composantes: [sexe(colonne, `${colonne}_filles`, `${colonne}_garcons`)],
});

const LYCEES_PRO: DefJeu = {
  source: "effectifs_lycees_pro",
  rentree: "rentree_scolaire",
  uai: "numero_lycee",
  total: "nombre_d_eleves",
  niveaux: [
    pro(21, "Seconde pro", "2ndes_pro"),
    pro(22, "Première pro", "1eres_pro"),
    pro(23, "Terminale pro", "terminales_pro"),
    pro(24, "CAP 1re année", "cap_1ere_annee"),
    pro(25, "CAP 2e année", "cap_2nde_annee"),
    {
      ordre: 26,
      libelle: "Autres formations",
      composantes: [
        ...["cap_en_3_ans", "cap_en_1_an", "bma_1ere_annee", "bma_2nde_annee", "cs_niv_3_et_4_mc_avant_2024",
          "autres_formations_professionnelles"].map((c) => sexe(c, `${c}_filles`, `${c}_garcons`)),
        sansSexe("bma_en_1_an"),
      ],
    },
  ],
  langues: [],
};

export const JEUX_EFFECTIFS = [COLLEGES, LYCEES_GT, LYCEES_PRO] as const;

/** Toutes les colonnes lues pour un jeu, dans un ordre stable et sans doublon. */
export function colonnesDe(j: DefJeu): string[] {
  const cols = [
    j.rentree,
    j.uai,
    j.total,
    ...(j.segpa ? [j.segpa] : []),
    ...(j.ulis ? [j.ulis] : []),
    ...j.niveaux.flatMap((n) => n.composantes.flatMap((c) => [c.eleves, c.filles, c.garcons])),
    ...j.langues.flatMap((l) => l.colonnes),
  ];
  return [...new Set(cols.filter((c): c is string => c !== undefined))];
}
