-- 06 : résultats aux examens (IVAC : brevet ; IVAL : baccalauréat), une ligne par établissement, voie et session.
-- Les valeurs sont lues en texte puis converties par `nombre` : vide, « ND », « . » donnent null, jamais 0.
-- Seules les UAI qui ont une fiche entrent dans la table ; les autres lignes sont comptées dans resultats_ignores.

create or replace table resultats_brut_tout as
-- brevet, série générale
select upper(trim(uai)) as uai, 'brevet_general' as voie, session(session) as session, 'ivac' as source,
  nombre(nb_candidats_g) as effectif, nombre(taux_de_reussite_g) as taux_reussite, nombre(va_du_taux_de_reussite_g) as va_reussite,
  nombre(note_a_l_ecrit_g) as note_ecrit, nombre(va_de_la_note_g) as va_note,
  nombre(taux_d_acces_6eme_3eme) as taux_acces, null::double as va_acces,
  null::double as taux_mentions, null::double as va_mentions,
  nombre(nb_mentions_ab_g) as mentions_ab, nombre(nb_mentions_b_g) as mentions_b, nombre(nb_mentions_tb_g) as mentions_tb
from src_ivac
where session(session) >= 2022
union all
-- brevet, série professionnelle : ni valeur ajoutée ni mentions
select upper(trim(uai)), 'brevet_pro', session(session), 'ivac',
  nombre(nb_candidats_p), nombre(taux_de_reussite_p), null, nombre(note_a_l_ecrit_p), null,
  null, null, null, null, null, null, null
from src_ivac
where session(session) >= 2022
union all
select upper(trim(uai)), 'bac_gt', session(annee), 'ival_gt',
  nombre(presents_total), nombre(taux_reu_total), nombre(va_reu_total), null, null,
  nombre(taux_acces_2nde), nombre(va_acces_2nde), nombre(taux_men_total), nombre(va_men_total), null, null, null
from src_ival_gt
where session(annee) >= 2012
union all
select upper(trim(uai)), 'bac_pro', session(annee), 'ival_pro',
  nombre(presents_total), nombre(taux_reu_total), nombre(va_reu_total), null, null,
  nombre(taux_acces_2nde), nombre(va_acces_2nde), nombre(taux_men_total), nombre(va_men_total), null, null, null
from src_ival_pro
where session(annee) >= 2012;

-- Une voie n'a de ligne que si son effectif ou une de ses valeurs est publié.
create or replace table resultats_brut as
select * from resultats_brut_tout
where session is not null
  and coalesce(effectif, taux_reussite, va_reussite, note_ecrit, va_note, taux_acces, va_acces, taux_mentions, va_mentions,
    mentions_ab, mentions_b, mentions_tb) is not null;

create or replace table resultats as
select uai, voie, session, source, effectif, taux_reussite, va_reussite, note_ecrit, va_note, taux_acces, va_acces,
  taux_mentions, va_mentions, mentions_ab, mentions_b, mentions_tb
from resultats_brut
where uai in (select uai from fiches_etab)
qualify row_number() over (partition by uai, voie, session order by effectif desc nulls last) = 1
order by uai, voie, session;

-- Lignes lues dont l'UAI n'a pas de fiche (établissement fermé absent du jeu des fermés, UAI changée).
-- Seules les sessions retenues (IVAC dès 2022, IVAL dès 2012) et les voies qui ont une valeur comptent.
create or replace table resultats_ignores as
select source, count(distinct (uai, session))::integer as n
from resultats_brut
where uai not in (select uai from fiches_etab)
group by source
order by source;

-- Moyennes calculées des taux : Σ(taux × effectif) / Σ effectif, sur les lignes où le taux et un effectif > 0 sont publiés.
-- Le territoire et le secteur sont ceux de la fiche (fermés compris).
create or replace table moyennes_resultats as
with base as (
  select r.voie, r.session, f.dep, f.aca, f.secteur, c.code, c.taux, r.effectif
  from resultats r
  join fiches_etab f using (uai),
  lateral (values ('taux_reussite', r.taux_reussite), ('taux_acces', r.taux_acces), ('taux_mentions', r.taux_mentions)) as c(code, taux)
  where c.taux is not null and r.effectif is not null and r.effectif > 0
),
niveaux as (
  select voie, code, 'departement' as niveau, dep as territoire, secteur, session, taux, effectif from base
  union all select voie, code, 'academie', aca, secteur, session, taux, effectif from base
  union all select voie, code, 'france', 'FR', secteur, session, taux, effectif from base
)
select voie, code, niveau, territoire, secteur, session,
  sum(taux * effectif) / sum(effectif) as valeur, count(*)::integer as n
from niveaux
where territoire is not null
group by voie, code, niveau, territoire, secteur, session
order by voie, code, niveau, territoire, secteur, session;
