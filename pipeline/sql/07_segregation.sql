-- 07 : ségrégation sociale entre collèges, une ligne par département et par année.
-- `dep` est normalisé comme partout ailleurs ("044" → "44", "02A" → "2A"). Les valeurs sont lues en texte puis
-- converties par `nombre` : vide, « ND » ou « . » donnent null, jamais 0.
-- Les parts (poids du privé, contributions) sont publiées en pourcentage (38,5 = 38,5 %), pas en fraction : aucune conversion.
create or replace table segregation as
select
  rentree(annee) as annee,
  dep_canonique(dep) as dep,
  nombre(nb_coll_calcul) as nb_coll_calcul,
  nombre(poids_prive_calcul) as poids_prive_calcul,
  nombre(i_entropie_tot) as i_entropie_tot,
  nombre(i_entropie_pu) as i_entropie_pu,
  nombre(i_entropie_pr) as i_entropie_pr,
  nombre(i_entropie_interpupr) as i_entropie_interpupr,
  nombre(contrib_pu) as contrib_pu,
  nombre(contrib_pr) as contrib_pr,
  nombre(contrib_interpupr) as contrib_interpupr
from src_segregation
where rentree(annee) is not null and dep is not null and trim(dep::varchar) <> '';
