# Observatoire citoyen de l'éducation en France

Les chiffres publics de chaque collège et lycée de France, public et privé sous contrat : sourcés, datés, sans classement.

Site statique régénéré chaque nuit : collecte des jeux open data (data.education.gouv.fr), croisement par UAI dans DuckDB, génération du site avec Astro, publication sur GitHub Pages.

## Organisation

| Dossier | Rôle |
|---|---|
| `shared/` | types communs, formatage à la française, libellés exacts |
| `pipeline/` | collecte, archives, normalisation et calculs (`.sql` DuckDB), export des données du site |
| `site/` | site Astro (sortie statique) |
| `tests/` | tests `bun test` et jeux d'essai |
| `docs/superpowers/` | spécification, socle technique, maquettes et plans |

## Commandes

```bash
bun install
bun test              # toute la suite
bun run typecheck     # vérification TypeScript
bun run collect       # collecte des sources (phase 1, tâche 3)
bun run build         # données + site + garde-fous
```

Prérequis : Bun ≥ 1.4.

## Licences

- Code : AGPL-3.0 (`LICENSE`).
- Données retraitées : Licence Ouverte 2.0 (`LICENCE-DONNEES.md`).
