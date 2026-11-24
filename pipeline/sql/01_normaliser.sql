-- 01 : tables canoniques à partir des vues src_* (une par source).
-- Idempotent (create or replace). Les valeurs sont relues en texte puis converties par les macros
-- (nombre, rentree, dep_canonique…) : un changement de type dans une source ne fausse rien.

-- Annuaire : une ligne par site.
create or replace table annuaire_n as
select
  upper(trim(identifiant_de_l_etablissement)) as uai,
  trim(nom_etablissement) as nom,
  trim(type_etablissement) as type_etablissement,
  upper(trim(libelle_nature)) as nature,
  secteur(statut_public_prive, type_contrat_prive) as secteur_brut,
  trim(type_contrat_prive) as contrat_brut,
  trim(adresse_1) as adresse,
  adresse_normalisee(adresse_1) as adresse_n,
  try_cast(left(trim(date_ouverture::varchar), 10) as date) as date_ouverture,
  trim(code_postal::varchar) as code_postal,
  trim(code_commune::varchar) as code_commune,
  trim(nom_commune) as commune,
  -- Saint-Barthélemy (977) et Saint-Martin (978) : rattachées à la Guadeloupe, comme dans les données de la DEPP
  case when dep_canonique(code_departement) in ('977', '978') then '971' else dep_canonique(code_departement) end as dep,
  case when dep_canonique(code_departement) in ('977', '978') then 'Guadeloupe' else libelle_territoire(libelle_departement) end as dep_libelle,
  trim(code_academie::varchar) as aca,
  libelle_territoire(libelle_academie) as aca_libelle,
  nombre(latitude) as lat,
  nombre(longitude) as lon,
  case when trim(appartenance_education_prioritaire) in ('REP+', 'REP')
       then trim(appartenance_education_prioritaire) end as ep,
  vrai(segpa) as segpa,
  vrai(ulis) as ulis,
  vrai(hebergement) as internat,
  trim(etat) as etat
from src_annuaire
where identifiant_de_l_etablissement is not null;

-- Sites d'une même UAI : le principal n'est pas une annexe, puis n'est pas un site d'enseignement
-- supérieur, puis a le nom le plus court, puis vient le premier dans l'ordre du nom et de l'adresse
-- (règle publiée sur /methode/).
create or replace table annuaire_rang as
select *,
  row_number() over (
    partition by uai
    order by nom ilike 'annexe%',
             regexp_matches(lower(nom), '\bsup\b|sup[eé]rieur|\bpr[eé]pas?\b|\bsts\b'),
             length(nom), nom, adresse
  )::integer as rang,
  count(*) over (partition by uai)::integer as nb_sites
from annuaire_n;

create or replace table sites as
select uai, rang, nom, adresse, code_postal, commune, rang = 1 as principal
from annuaire_rang
where nb_sites > 1
order by uai, rang;

-- Type de lycée de la rentrée la plus récente de l'IPS : il l'emporte sur la nature de l'annuaire.
create or replace table type_lycee as
select upper(trim(uai)) as uai, arg_max(upper(trim(type_de_lycee)), rentree(rentree_scolaire)) as type_lycee
from src_ips_lycees
group by 1;

-- Un motif d'exclusion par UAI (le premier qui s'applique), ou null si l'UAI est dans le périmètre.
create or replace table classement as
select *,
  case
    -- l'UAI sert à nommer des fichiers et des URL : format strict, 7 chiffres et une lettre
    when not regexp_matches(uai, '^[0-9]{7}[A-Z]$') then 'uai_invalide'
    when etat is distinct from 'OUVERT' then 'ferme'
    when dep like '98%' then 'hors_perimetre_geographique'
    when type_etablissement not in ('Collège', 'Lycée', 'EREA') then 'type_hors_perimetre'
    when secteur_brut = 'prive_hors_contrat' then 'prive_hors_contrat'
    when secteur_brut is null then 'secteur_inconnu'
    when famille is null then 'famille_inconnue'
  end as motif
from (
  select a.*, famille(a.nature, case when a.type_etablissement = 'Lycée' then t.type_lycee end) as famille
  from annuaire_rang a
  left join type_lycee t using (uai)
  where a.rang = 1
);

create or replace table etablissements as
select
  uai, nom, famille, secteur_brut as secteur,
  case when secteur_brut = 'prive_sous_contrat' then contrat_brut end as contrat,
  adresse, adresse_n, date_ouverture, code_postal, code_commune, commune, dep, dep_libelle, aca, aca_libelle,
  lat, lon, ep, segpa, ulis, internat
from classement
where motif is null
order by uai;

create or replace table exclus as
select uai, motif from classement where motif is not null order by uai;
