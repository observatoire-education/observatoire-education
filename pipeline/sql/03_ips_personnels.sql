-- 03 : IPS et personnels des établissements qui ont une fiche (table fiches_etab, créée par 05).

-- IPS de 2016-2017 à aujourd'hui : union des huit jeux. Une même (uai, rentrée) dans plusieurs jeux :
-- le jeu le plus récent l'emporte (actuel, puis ap2022, puis 2016-2021). Moyennes publiées : seulement
-- dans les jeux actuels (collèges, lycées par type de lycée) et le jeu EREA ; null ailleurs.
-- Lycées : `ips` = IPS de l'établissement (actuel) ou de l'ensemble GT + pro (anciens jeux) ;
-- `ips_gt` et `ips_pro` : IPS par voie. Écart-type : celui de l'établissement (actuel), null pour les anciens jeux.
create or replace table ips as
with brut as (
  select
    upper(trim(uai)) as uai,
    rentree(rentree_scolaire) as rentree,
    'ips_colleges' as source,
    0 as priorite,
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
    0 as priorite,
    nombre(ips_etab) as ips,
    nombre(ecart_type_etablissement) as ecart_type,
    nombre(ips_voie_gt) as ips_gt,
    nombre(ips_voie_pro) as ips_pro,
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
  union all by name
  select
    upper(trim(uai)) as uai,
    rentree(rentree_scolaire) as rentree,
    'ips_erea' as source,
    0 as priorite,
    nombre(ips) as ips,
    nombre(ecart_type_de_l_ips) as ecart_type,
    nombre(ips_departemental_public) as dep_public,
    nombre(ips_departemental_prive) as dep_prive,
    nombre(ips_academique_public) as aca_public,
    nombre(ips_academique_prive) as aca_prive,
    nombre(ips_national_public) as nat_public,
    nombre(ips_national_prive) as nat_prive
  from src_ips_erea
  union all by name
  select upper(trim(uai)) as uai, rentree(rentree_scolaire) as rentree, 'ips_colleges_2022' as source, 1 as priorite,
    nombre(ips) as ips, nombre(ecart_type_de_l_ips) as ecart_type
  from src_ips_colleges_2022
  union all by name
  select upper(trim(uai)) as uai, rentree(rentree_scolaire) as rentree, 'ips_lycees_2022' as source, 1 as priorite,
    nombre(ips_ensemble_gt_pro) as ips, null::double as ecart_type,
    nombre(ips_voie_gt) as ips_gt, nombre(ips_voie_pro) as ips_pro
  from src_ips_lycees_2022
  union all by name
  select upper(trim(uai)) as uai, rentree(rentree_scolaire) as rentree, 'ips_colleges_2016' as source, 2 as priorite,
    nombre(ips) as ips, nombre(ecart_type_de_l_ips) as ecart_type
  from src_ips_colleges_2016
  union all by name
  select upper(trim(uai)) as uai, rentree(rentree_scolaire) as rentree, 'ips_lycees_2016' as source, 2 as priorite,
    nombre(ips_ensemble_gt_pro) as ips, null::double as ecart_type,
    nombre(ips_voie_gt) as ips_gt, nombre(ips_voie_pro) as ips_pro
  from src_ips_lycees_2016
  union all by name
  select upper(trim(uai)) as uai, rentree(rentree_scolaire) as rentree, 'ips_erea_2016' as source, 2 as priorite,
    nombre(ips) as ips, nombre(ecart_type_de_l_ips) as ecart_type
  from src_ips_erea_2016
)
select uai, rentree, source, ips, ecart_type, ips_gt, ips_pro,
  dep_public, dep_prive, aca_public, aca_prive, nat_public, nat_prive
from brut
where rentree is not null and uai in (select uai from fiches_etab)
qualify row_number() over (partition by uai, rentree order by priorite, source) = 1
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
