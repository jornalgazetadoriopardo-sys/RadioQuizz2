-- =====================================================================
-- Pergunta da Hora — tipos de anúncio dos patrocinadores
--   simples    → logo/ícone + frase (como antes)
--   video      → vídeo do YouTube (pode ser "Não listado")
--   automatico → o app monta o anúncio a partir de logo, contatos, cores, promoção e fotos,
--                usando um dos layouts prontos
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.patrocinadores
  add column if not exists tipo text not null default 'simples' check (tipo in ('simples', 'video', 'automatico')),
  -- quanto tempo o anúncio fica na tela (vazio = o padrão do app: 15 s antes da pergunta, 30 s antes do gabarito)
  add column if not exists duracao_segundos int check (duracao_segundos between 5 and 120),
  -- vídeo
  add column if not exists video_url text,
  add column if not exists video_vertical boolean not null default false,
  -- anúncio automático
  add column if not exists layout text not null default 'oferta' check (layout in ('oferta', 'loja', 'relampago', 'vitrine')),
  add column if not exists cor_primaria text not null default '#e11d48' check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists cor_secundaria text not null default '#facc15' check (cor_secundaria ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists promo_titulo text not null default '',
  add column if not exists promo_descricao text not null default '',
  add column if not exists preco text not null default '',
  add column if not exists preco_antigo text not null default '',
  add column if not exists validade text not null default '',
  add column if not exists telefone text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists endereco text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists site text not null default '',
  add column if not exists imagens text[] not null default '{}' check (cardinality(imagens) <= 3);

-- vídeo precisa do link
alter table public.patrocinadores drop constraint if exists patrocinadores_video_com_link;
alter table public.patrocinadores add constraint patrocinadores_video_com_link
  check (tipo <> 'video' or coalesce(video_url, '') <> '');

-- Avisa a API do Supabase para recarregar a lista de colunas (evita o erro "schema cache").
notify pgrst, 'reload schema';

select 'OK: tipos de anúncio prontos' as resultado;
