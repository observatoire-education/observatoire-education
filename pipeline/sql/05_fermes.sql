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

-- Secteur déclaré par les sources qui citent l'établissement (la liste des fermés ne le donne pas : « - »).
-- Le millésime le plus récent l'emporte. Valeurs : public / privé sous contrat (en capitales dans les effectifs
-- des écoles et l'éducation prioritaire, qui ne publie que PUBLIC), ou PU / PR pour l'IVAC.
create or replace table secteur_cites as
select uai, arg_max(secteur, millesime) as secteur
from (
  select upper(trim(uai)) as uai, rentree(rentree_scolaire) as millesime,
    case lower(strip_accents(trim(secteur::varchar))) when 'public' then 'public' when 'prive sous contrat' then 'prive_sous_contrat' end as secteur
  from (
    select uai, rentree_scolaire, secteur from src_ips_colleges_2016
    union all select uai, rentree_scolaire, secteur from src_ips_colleges_2022
    union all select uai, rentree_scolaire, secteur from src_ips_lycees_2016
    union all select uai, rentree_scolaire, secteur from src_ips_lycees_2022
    union all select uai, rentree_scolaire, secteur from src_ips_erea_2016
    union all select uai, rentree_scolaire, secteur from src_ips_erea
    union all select uai, annee, secteur from src_ival_gt
    union all select uai, annee, secteur from src_ival_pro
    union all select numero_ecole, rentree_scolaire, secteur from src_effectifs_ecoles
    union all select uai, rentree_scolaire, secteur from src_ips_ecoles_2016
    union all select uai, rentree_scolaire, secteur from src_ips_ecoles
    union all select uai, annee, libelle_secteur from src_classes_ecoles
    union all select uai, rs, secteurn from src_ecoles_ep
  )
  union all
  select upper(trim(uai)), session(session),
    case upper(trim(secteur::varchar)) when 'PU' then 'public' when 'PR' then 'prive_sous_contrat' end
  from src_ivac
)
where millesime is not null and secteur is not null
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
    -- une école fermée n'est plus dans l'annuaire : sa famille vient de la nature (jamais primaire)
    coalesce(
      famille(f.nature_uai_libe, case when upper(trim(f.nature_uai_libe)) like 'LYCEE%' then t.type_lycee end),
      case
        when upper(trim(f.nature_uai_libe)) like 'ECOLE MATERNELLE%' then 'maternelle'
        when upper(trim(f.nature_uai_libe)) like 'ECOLE ELEMENTAIRE%' or upper(trim(f.nature_uai_libe)) like 'ECOLE DE NIVEAU ELEMENTAIRE%' then 'elementaire'
      end) as famille,
    -- la liste des fermés donne « - » : le secteur vient alors des sources qui citent l'UAI (DEPP : privé sous contrat seulement)
    coalesce(case trim(f.secteur_public_prive_libe) when 'Public' then 'public' when 'Privé' then 'prive_sous_contrat' end, s.secteur) as secteur,
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
  left join secteur_cites s on s.uai = upper(trim(f.numero_uai))
  where f.numero_uai is not null
)
where regexp_matches(uai, '^[0-9]{7}[A-Z]$')
qualify row_number() over (partition by uai order by date_fermeture desc nulls last) = 1
order by uai;

-- UAI citées par une source chiffrée historique (IPS, valeur ajoutée des collèges, résultats des lycées ;
-- pour les écoles : effectifs, typologie des classes, éducation prioritaire).
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
  union all select upper(trim(numero_ecole)) from src_effectifs_ecoles
  union all select upper(trim(uai)) from src_ips_ecoles_2016
  union all select upper(trim(uai)) from src_ips_ecoles
  union all select upper(trim(uai)) from src_classes_ecoles
  union all select upper(trim(uai)) from src_ecoles_ep
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
select uai, nature, famille is null as sans_famille, secteur is null as sans_secteur, date_fermeture is null as sans_date
from historiques_candidats
where famille is null or secteur is null or date_fermeture is null
order by uai;

-- Pages conservées : UAI du registre absentes du périmètre actuel, et fiches historiques des fermés.
create or replace table disparus as
select r.uai, r.famille, r.secteur, r.dep, r.aca, coalesce(f.date_fermeture::varchar, r.disparu_le) as disparu_le
from registre r left join fermes f using (uai)
where r.uai not in (select uai from etablissements)
union all
select uai, famille, secteur, dep, aca, date_fermeture::varchar from historiques
order by uai;

-- Établissements qui ont une fiche : actifs et disparus. Les statistiques sont calculées pour eux tous ;
-- les moyennes, les références et le voisinage ne portent que sur les actifs (table etablissements).
create or replace view fiches_etab as
select uai, famille, secteur, dep, aca, false as disparu from etablissements
union all
select uai, famille, secteur, dep, aca, true from disparus;
