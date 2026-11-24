-- 05 : établissements fermés, fiches historiques, pages conservées et établissements qui ont une fiche.
-- Les valeurs sont relues en texte puis converties par les macros, comme en 01.

-- Type de lycée des anciennes séries d'IPS (rentrée la plus récente) : il sert à classer un lycée fermé
-- qui n'est plus dans l'annuaire.
create or replace table type_lycee_ferme as
select uai, arg_max(type_lycee, rentree) as type_lycee
from (
  select upper(trim(uai)) as uai, upper(trim(type_de_lycee)) as type_lycee, rentree(rentree_scolaire) as rentree
  from src_ips_lycees_2016
  union all
  select upper(trim(uai)), upper(trim(type_de_lycee)), rentree(rentree_scolaire) from src_ips_lycees_2022
)
where rentree is not null
group by uai;

-- Établissements fermés depuis 2012 (extrait filtré à la collecte) : une ligne par UAI, la fermeture la plus récente.
create or replace table fermes as
select
  uai, nom, nature, famille, secteur, date_ouverture, date_fermeture, adresse,
  adresse_normalisee(adresse) as adresse_n,
  code_postal, code_commune, commune, dep, dep_libelle, aca, aca_libelle, lat, lon
from (
  select
    upper(trim(f.numero_uai)) as uai,
    trim(f.appellation_officielle) as nom,
    upper(trim(f.nature_uai_libe)) as nature,
    famille(f.nature_uai_libe, case when upper(trim(f.nature_uai_libe)) like 'LYCEE%' then t.type_lycee end) as famille,
    -- les sources DEPP ne couvrent que le privé sous contrat
    case trim(f.secteur_public_prive_libe) when 'Public' then 'public' when 'Privé' then 'prive_sous_contrat' end as secteur,
    try_cast(left(trim(f.date_ouverture::varchar), 10) as date) as date_ouverture,
    try_cast(left(trim(f.date_fermeture::varchar), 10) as date) as date_fermeture,
    trim(f.adresse_uai) as adresse,
    trim(f.code_postal_uai::varchar) as code_postal,
    trim(f.code_commune::varchar) as code_commune,
    trim(f.libelle_commune) as commune,
    case when dep_canonique(f.code_departement) in ('977', '978') then '971' else dep_canonique(f.code_departement) end as dep,
    case when dep_canonique(f.code_departement) in ('977', '978') then 'Guadeloupe' else libelle_territoire(f.libelle_departement) end as dep_libelle,
    trim(f.code_academie::varchar) as aca,
    libelle_territoire(f.libelle_academie) as aca_libelle,
    nombre(f.latitude) as lat,
    nombre(f.longitude) as lon
  from src_fermes f
  left join type_lycee_ferme t on t.uai = upper(trim(f.numero_uai))
  where f.numero_uai is not null
)
where regexp_matches(uai, '^[0-9]{7}[A-Z]$')
qualify row_number() over (partition by uai order by date_fermeture desc nulls last) = 1
order by uai;

-- UAI citées par une source historique (IPS, valeur ajoutée des collèges, résultats des lycées).
create or replace table cites as
select distinct uai from (
  select upper(trim(uai)) as uai from src_ips_colleges_2016
  union all select upper(trim(uai)) from src_ips_colleges_2022
  union all select upper(trim(uai)) from src_ips_lycees_2016
  union all select upper(trim(uai)) from src_ips_lycees_2022
  union all select upper(trim(uai)) from src_ips_erea_2016
  union all select upper(trim(uai)) from src_ips_erea
  union all select upper(trim(uai)) from src_ivac
  union all select upper(trim(uai)) from src_ival_gt
  union all select upper(trim(uai)) from src_ival_pro
)
where uai is not null
order by uai;

-- Fermés cités ni actifs ni au registre. Sans famille, secteur ou date de fermeture, ils n'ont pas de fiche.
create or replace table historiques_candidats as
select * from fermes
where uai in (select uai from cites)
  and uai not in (select uai from etablissements)
  and uai not in (select uai from registre);

create or replace table historiques as
select * from historiques_candidats
where famille is not null and secteur is not null and date_fermeture is not null
order by uai;

create or replace table historiques_exclus as
select uai, nature from historiques_candidats
where famille is null or secteur is null or date_fermeture is null
order by uai;

-- Pages conservées : UAI du registre absentes du périmètre actuel, et fiches historiques des fermés.
create or replace table disparus as
select uai, famille, secteur, dep, aca, disparu_le from registre where uai not in (select uai from etablissements)
union all
select uai, famille, secteur, dep, aca, date_fermeture::varchar from historiques
order by uai;

-- Établissements qui ont une fiche : actifs et disparus. Les statistiques sont calculées pour eux tous ;
-- les moyennes, les références et le voisinage ne portent que sur les actifs (table etablissements).
create or replace view fiches_etab as
select uai, famille, secteur, dep, aca, false as disparu from etablissements
union all
select uai, famille, secteur, dep, aca, true from disparus;
