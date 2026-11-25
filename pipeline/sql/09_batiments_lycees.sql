-- Bâtiments et travaux des lycées : jeux de la Région Île-de-France (seule région à les publier à ce jour).
-- Les colonnes sont lues en texte puis converties : les types annoncés par le portail varient d'un export à l'autre.

-- Année de construction, par UAI ; une année hors de 1100-2100 est tenue pour absente.
create or replace table batiments_lycees as
select uai, max(annee) as annee_construction
from (
  select upper(trim(code_uai::varchar)) as uai, try_cast(trim(annee_construction::varchar) as integer) as annee
  from src_idf_lycees
)
where uai is not null and annee between 1100 and 2100
group by uai;

-- Opérations du plan pluriannuel d'investissement (PPI) : une ligne par opération.
create or replace table travaux_ppi as
select
  upper(trim(codeuai::varchar)) as uai,
  trim(ppi::varchar) as ppi,
  trim(titreoperation::varchar) as intitule,
  try_cast(enveloppe_prev_en_meur::varchar as double) as enveloppe_meur,
  nullif(trim(etat_d_avancement::varchar), '') as etat,
  try_cast(trim(annee_d_individualisation::varchar) as integer) as annee_individualisation,
  try_cast(trim(annee_de_livraison::varchar) as integer) as annee_livraison
from src_idf_ppi
where codeuai is not null and nullif(trim(titreoperation::varchar), '') is not null;

-- Opérations directes votées : un dossier par lycée, montants cumulés (affectations, revalorisations et
-- désaffectations, ces dernières déjà négatives dans le jeu). Les lignes sans UAI ne sont pas rattachées.
create or replace table travaux_operations as
select
  uai,
  intitule,
  min(annee) as premiere_annee,
  max(annee) as derniere_annee,
  sum(montant) as montant_vote,
  count(*) as decisions
from (
  select
    upper(trim(code_uai_ex_rne::varchar)) as uai,
    trim(dossier::varchar) as intitule,
    try_cast(trim(annee_de_la_decision::varchar) as integer) as annee,
    try_cast(montant_vote::varchar as double) as montant
  from src_idf_operations
  where nullif(trim(code_uai_ex_rne::varchar), '') is not null and nullif(trim(dossier::varchar), '') is not null
)
group by uai, intitule;
