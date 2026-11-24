-- 08 : classes des écoles (effectifs des écoles, typologie des classes, écoles de l'éducation prioritaire).
-- Après 05 (table fiches_etab). Les valeurs sont relues en texte puis converties par les macros, comme en 01 :
-- les millésimes sont des dates dans les jeux réels (rentree() en lit l'année).

create or replace table ecoles_effectifs_brut as
select upper(trim(numero_ecole)) as uai, rentree(rentree_scolaire) as rentree,
  nombre(nombre_total_eleves) as eleves, nombre(nombre_total_classes) as classes
from src_effectifs_ecoles
where numero_ecole is not null and rentree(rentree_scolaire) is not null;

create or replace table ecoles_ep_brut as
select upper(trim(uai)) as uai, rentree(rs) as rentree, nombre(nbeleves) as eleves, nombre(nbclasses) as classes
from src_ecoles_ep
where uai is not null and rentree(rs) is not null;

create or replace table classes_types_brut as
select upper(trim(uai)) as uai, rentree(annee) as rentree, trim(type_classe) as libelle, nombre(nb_classes) as classes
from src_classes_ecoles
where uai is not null and rentree(annee) is not null and nullif(trim(type_classe), '') is not null;

-- Lignes d'UAI sans fiche, par source (une par UAI et rentrée). Les écoles fermées de la liste des fermés
-- n'y sont pas : elles relèvent des fiches historiques et de leurs exclusions.
create or replace table ecoles_ignorees as
select source, count(distinct (uai, rentree))::integer as n
from (
  select 'effectifs_ecoles' as source, uai, rentree from ecoles_effectifs_brut
  union all select 'classes_ecoles', uai, rentree from classes_types_brut
  union all select 'ecoles_ep', uai, rentree from ecoles_ep_brut
)
where uai not in (select uai from fiches_etab) and uai not in (select uai from fermes)
group by source
order by source;

-- Série des élèves et des classes : effectifs des écoles, puis la série de l'éducation prioritaire
-- pour les seules rentrées absentes des effectifs.
create or replace table classes_historique as
with e as (
  select uai, rentree, max(eleves) as eleves, max(classes) as classes, 'effectifs_ecoles' as source
  from ecoles_effectifs_brut group by uai, rentree
),
ep as (
  select uai, rentree, max(eleves) as eleves, max(classes) as classes, 'ecoles_ep' as source
  from ecoles_ep_brut group by uai, rentree
)
select * from (
  select * from e
  union all
  select * from ep where not exists (select 1 from e where e.uai = ep.uai and e.rentree = ep.rentree)
)
where uai in (select uai from fiches_etab where famille in ('maternelle', 'elementaire', 'primaire'))
order by uai, rentree;

-- Typologie des classes : un type par ligne ; le nombre de niveaux est le nombre de segments séparés par « - ».
create or replace table classes_types as
select uai, rentree, libelle, len(string_split(libelle, '-'))::integer as niveaux, sum(classes) as classes
from classes_types_brut
where classes is not null
  and uai in (select uai from fiches_etab where famille in ('maternelle', 'elementaire', 'primaire'))
group by uai, rentree, libelle
order by uai, rentree;
