-- =====================================================================
-- Pergunta da Hora — banners horizontais para as outras posições
-- Cada anunciante pode ter:
--   banners             → até 3 banners VERTICAIS (9:16), para os anúncios de 15 s e 30 s
--   banners_horizontais → até 3 banners HORIZONTAIS (16:9), para a tela inicial e as telas de espera
-- Precisa do 017. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.patrocinadores add column if not exists banners_horizontais text[] not null default '{}';

alter table public.patrocinadores drop constraint if exists patrocinadores_banners_horizontais_max;
alter table public.patrocinadores add constraint patrocinadores_banners_horizontais_max check (cardinality(banners_horizontais) <= 3);

notify pgrst, 'reload schema';

select 'OK: banners horizontais para as outras posições' as resultado;
