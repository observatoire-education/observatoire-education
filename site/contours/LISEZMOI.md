# Contours des départements et des communes

- **Source :** IGN, ADMIN EXPRESS COG CARTO, service WFS de la Géoplateforme (`https://data.geopf.fr/wfs/ows`), couches `ADMINEXPRESS-COG-CARTO.LATEST:departement` et `ADMINEXPRESS-COG-CARTO.LATEST:commune` (Licence ouverte Etalab 2.0).
- **Millésime :** dernière édition (`LATEST`) à la date de téléchargement. Le service n'expose pas l'année d'édition ; les communes portent une date de recensement du 1er janvier 2023.
- **Date de téléchargement :** 24 novembre 2026.
- **Contenu :** 101 départements (`971` à `974` et `976` pour l'outre-mer ; ni `975`, ni `977`, ni `978`, absents de la couche) et 34 877 communes. Paris, Lyon et Marseille sont des communes entières (`75056`, `69123`, `13055`), sans arrondissements.
- **Traitement :** simplification mapshaper `-simplify 3% keep-shapes`, sortie TopoJSON avec `quantization=1e5`, propriétés réduites à `code` (code INSEE) et, pour les communes, `dep` (code INSEE du département).
- **Poids :** `departements.topo.json` environ 150 Ko (budget 1 Mo), `communes.topo.json` environ 6,8 Mo (budget 8 Mo).
- **Régénérer :** `bun scripts/contours.ts` (à la main, hors collecte nocturne ; une trentaine de requêtes, une minute environ).
