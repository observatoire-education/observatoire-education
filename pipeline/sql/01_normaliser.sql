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
  trim(code_postal::varchar) as code_postal,
  trim(code_commune::varchar) as code_commune,
  trim(nom_commune) as commune,
  -- Saint-Barthélemy (977) et Saint-Martin (978) : rattachées à la Guadeloupe, comme dans les données de la DEPP
  case when dep_canonique(code_departement) in ('977', '978') then '971' else dep_canonique(code_departement) end as dep,
  case when dep_canonique(code_departement) in ('977', '978') then 'Guadeloupe' else trim(libelle_departement) end as dep_libelle,
  trim(code_academie::varchar) as aca,
  trim(libelle_academie) as aca_libelle,
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
  adresse, code_postal, code_commune, commune, dep, dep_libelle, aca, aca_libelle,
  lat, lon, ep, segpa, ulis, internat
from classement
where motif is null
order by uai;

create or replace table exclus as
select uai, motif from classement where motif is not null order by uai;

-- Pages conservées : UAI du registre absentes du périmètre actuel.
create or replace table disparus as
select * from registre where uai not in (select uai from etablissements) order by uai;

-- Établissements qui ont une fiche : actifs et disparus. Les statistiques sont calculées pour eux tous ;
-- les moyennes, les références et le voisinage ne portent que sur les actifs (table etablissements).
create or replace view fiches_etab as
select uai, famille, secteur, dep, aca, false as disparu from etablissements
union all
select uai, famille, secteur, dep, aca, true from disparus;

-- IPS : collèges et lycées ; pour un lycée, les moyennes publiées de sa famille (LEGT, LPO ou LP).
create or replace table ips as
with brut as (
  select
    upper(trim(uai)) as uai,
    rentree(rentree_scolaire) as rentree,
    'ips_colleges' as source,
    nombre(ips) as ips,
    nombre(ecart_type_de_l_ips) as ecart_type,
    nombre(ips_departemental_public) as dep_public,
    nombre(ips_departemental_prive) as dep_prive,
    nombre(ips_academique_public) as aca_public,
    nombre(ips_academique_prive) as aca_prive,
    nombre(ips_national_public) as nat_public,
    nombre(ips_national_prive) as nat_prive
  from src_ips_colleges
  union all by name
  select
    upper(trim(uai)) as uai,
    rentree(rentree_scolaire) as rentree,
    'ips_lycees' as source,
    nombre(ips_etab) as ips,
    nombre(ecart_type_etablissement) as ecart_type,
    nombre(case upper(trim(type_de_lycee)) when 'LEGT' then ips_departemental_legt_public
      when 'LPO' then ips_departemental_lpo_public when 'LP' then ips_departemental_lp_public end) as dep_public,
    nombre(case upper(trim(type_de_lycee)) when 'LEGT' then ips_departemental_legt_prive
      when 'LPO' then ips_departemental_lpo_prive when 'LP' then ips_departemental_lp_prive end) as dep_prive,
    nombre(case upper(trim(type_de_lycee)) when 'LEGT' then ips_academique_legt_public
      when 'LPO' then ips_academique_lpo_public when 'LP' then ips_academique_lp_public end) as aca_public,
    nombre(case upper(trim(type_de_lycee)) when 'LEGT' then ips_academique_legt_prive
      when 'LPO' then ips_academique_lpo_prive when 'LP' then ips_academique_lp_prive end) as aca_prive,
    nombre(case upper(trim(type_de_lycee)) when 'LEGT' then ips_national_legt_public
      when 'LPO' then ips_national_lpo_public when 'LP' then ips_national_lp_public end) as nat_public,
    nombre(case upper(trim(type_de_lycee)) when 'LEGT' then ips_national_legt_prive
      when 'LPO' then ips_national_lpo_prive when 'LP' then ips_national_lp_prive end) as nat_prive
  from src_ips_lycees
)
select * from brut
where rentree is not null and uai in (select uai from fiches_etab)
order by uai, rentree;

-- Personnels : volumes en ETP ; une valeur vide reste null (jamais 0).
create or replace table personnels as
select
  upper(trim(uai)) as uai,
  rentree(annee_de_la_rentree_scolaire) as rentree,
  nombre(etp_total) as etp_total,
  nombre(etp_de_personnels_de_vie_scolaire) as etp_vs,
  nombre(etp_enseignants_hommes_et_femmes) as etp_ens,
  nombre(etp_de_femmes_enseignantes) as etp_femmes,
  nombre(etp_d_enseignants_agreges) as etp_agreges,
  nombre(etp_d_enseignants_certifies_peps) as etp_certifies,
  nombre(etp_d_enseignants_plp) as etp_plp,
  nombre(etp_d_enseignants_titulaires_d_un_autre_corps) as etp_autres_tit,
  nombre(etp_d_enseignants_non_titulaires) as etp_non_tit,
  nombre(etp_d_enseignants_de_moins_de_35_ans) as etp_moins_35,
  nombre(etp_d_enseignants_de_35_a_moins_de_50_ans) as etp_35_49,
  nombre(etp_d_enseignants_de_50_ans_ou_plus) as etp_50_plus,
  nombre(etp_d_enseignants_ayant_une_anciennete_dans_l_etablissement_de_moins_de_2_ans) as etp_anc_moins_2,
  nombre(etp_d_enseignants_ayant_une_anciennete_dans_l_etablissement_de_2_ans_a_moins_de_5_ans) as etp_anc_2_4,
  nombre(etp_d_enseignants_ayant_une_anciennete_dans_l_etablissement_de_5_ans_a_moins_de_8_ans) as etp_anc_5_7,
  nombre(etp_d_enseignants_ayant_une_anciennete_dans_l_etablissement_de_8_ans_ou_plus) as etp_anc_8_plus
from src_personnels
where rentree(annee_de_la_rentree_scolaire) is not null
  and upper(trim(uai)) in (select uai from fiches_etab)
order by uai, rentree;
