-- =====================================================================
-- Pergunta da Hora — prêmios com data da pergunta final; patrocinadores com banners,
-- modalidade (rotativo ou fixo) e quantidade de vezes por dia
-- - Prêmio: "A pergunta final será dia XX/XX/XXXX".
-- - Patrocinador: novo tipo "banners" (até 3 imagens 16:9), que substitui o anúncio montado pelo app.
-- - Modalidade rotativo (padrão): aparece nos anúncios das rodadas pelo menos 1 vez por dia (ou a quantidade
--   de vezes por dia combinada), alternando com os outros de forma aleatória e justa.
-- - Modalidade fixo: aparece na rodada do horário combinado (ex.: 17:00 → rodada das 17h).
-- - O anúncio de cada rodada continua sendo escolhido pelo servidor quando ela entra no ar: o mesmo para todos.
-- Precisa do 016. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.premios add column if not exists data_final date;

alter table public.patrocinadores
  add column if not exists banners text[] not null default '{}',
  add column if not exists modalidade text not null default 'rotativo',
  add column if not exists vezes_dia int not null default 1,
  add column if not exists horarios_fixos text[] not null default '{}';

alter table public.patrocinadores drop constraint if exists patrocinadores_tipo_check;
alter table public.patrocinadores add constraint patrocinadores_tipo_check check (tipo in ('simples', 'video', 'automatico', 'banners'));
alter table public.patrocinadores drop constraint if exists patrocinadores_banners_max;
alter table public.patrocinadores add constraint patrocinadores_banners_max check (cardinality(banners) <= 3);
alter table public.patrocinadores drop constraint if exists patrocinadores_modalidade_valida;
alter table public.patrocinadores add constraint patrocinadores_modalidade_valida check (modalidade in ('rotativo', 'fixo'));
alter table public.patrocinadores drop constraint if exists patrocinadores_vezes_dia_valida;
alter table public.patrocinadores add constraint patrocinadores_vezes_dia_valida check (vezes_dia between 1 and 50);
alter table public.patrocinadores drop constraint if exists patrocinadores_horarios_validos;
alter table public.patrocinadores add constraint patrocinadores_horarios_validos
  check (array_to_string(horarios_fixos, ',') ~ '^(([01]\d|2[0-3]):[0-5]\d(,|$))*$');

-- Patrocinador em circulação hoje (ativo e dentro do período)?
create or replace function public.patrocinador_em_circulacao(p public.patrocinadores)
returns boolean language sql stable
as $$ select p.ativo and (p.inicio is null or p.inicio <= hoje_sp()) and (p.fim is null or p.fim >= hoje_sp()) $$;

-- Quantas vezes o patrocinador já apareceu hoje nos anúncios das rodadas
create or replace function public.vezes_hoje(p_patrocinador uuid)
returns int language sql stable security definer set search_path = public
as $$ select coalesce(sum(rodadas), 0)::int from patrocinio_exibicoes
      where dia = hoje_sp() and patrocinador_id = p_patrocinador and espaco in ('anuncio_pergunta', 'anuncio_resultado') $$;

-- Patrocinador fixo combinado para o horário desta rodada (rodada que começa entre o horário e 29 min depois)
create or replace function public.patrocinador_fixo_do_horario(p_horario text, p_espaco text, p_evitar uuid default null)
returns uuid language sql stable security definer set search_path = public
as $$
  select p.id from patrocinadores p
  where p.modalidade = 'fixo' and patrocinador_em_circulacao(p) and p_espaco = any (p.espacos)
    and (p.id <> p_evitar or p_evitar is null)
    and exists (
      select 1 from unnest(p.horarios_fixos) h
      where p_horario::time >= h::time and p_horario::time < h::time + interval '30 minutes'
    )
  order by vezes_hoje(p.id), random()
  limit 1
$$;

-- Rotativo: primeiro quem ainda não cumpriu as vezes do dia; entre eles, quem apareceu menos em proporção ao
-- combinado, com sorteio. Depois que todos cumprem, o rodízio continua sorteado, na mesma proporção.
create or replace function public.patrocinador_rotativo(p_espaco text, p_evitar uuid default null)
returns uuid language sql stable security definer set search_path = public
as $$
  select p.id from patrocinadores p
  where p.modalidade = 'rotativo' and patrocinador_em_circulacao(p) and p_espaco = any (p.espacos)
  order by (p.id = p_evitar) is true,
           vezes_hoje(p.id) >= p.vezes_dia,
           -- vezes do dia proporcionais ao combinado, com sorteio (o "+ random()" mistura a ordem sem tirar a proporção)
           (vezes_hoje(p.id) + random()) / p.vezes_dia
  limit 1
$$;

-- Ao entrar no ar: escolhe os patrocinadores dos dois anúncios da rodada (o mesmo para todos os ouvintes)
create or replace function public.escolher_patrocinio_da_rodada()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'no_ar' and (old.status is distinct from 'no_ar' or new.no_ar_em is distinct from old.no_ar_em) then
    if new.patrocinador_fixo is not null then
      new.patrocinador_pergunta := new.patrocinador_fixo;
      new.patrocinador_resultado := new.patrocinador_fixo;
    else
      new.patrocinador_pergunta := coalesce(patrocinador_fixo_do_horario(new.horario, 'anuncio_pergunta'),
                                            patrocinador_rotativo('anuncio_pergunta'));
      perform contar_rodada_patrocinio(new.patrocinador_pergunta, 'anuncio_pergunta');
      new.patrocinador_resultado := coalesce(patrocinador_fixo_do_horario(new.horario, 'anuncio_resultado', new.patrocinador_pergunta),
                                             patrocinador_rotativo('anuncio_resultado', new.patrocinador_pergunta));
      perform contar_rodada_patrocinio(new.patrocinador_resultado, 'anuncio_resultado');
      return new;
    end if;
    perform contar_rodada_patrocinio(new.patrocinador_pergunta, 'anuncio_pergunta');
    perform contar_rodada_patrocinio(new.patrocinador_resultado, 'anuncio_resultado');
  end if;
  return new;
end
$$;

revoke all on function public.vezes_hoje(uuid), public.patrocinador_fixo_do_horario(text, text, uuid),
  public.patrocinador_rotativo(text, uuid) from anon, authenticated, public;

notify pgrst, 'reload schema';

select 'OK: banners, modalidades rotativo/fixo, vezes por dia e data final dos prêmios' as resultado;
