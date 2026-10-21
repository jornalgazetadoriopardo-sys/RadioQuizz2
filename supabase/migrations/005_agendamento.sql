-- =====================================================================
-- Pergunta da Hora — agendamento das rodadas
-- Cada rodada passa a ter data, horário de início, horário de encerramento e modo:
--   manual     → a produção clica em "No ar" e em "Encerrar" (como antes);
--   automatico → abre e fecha sozinha nos horários cadastrados (horário de Brasília).
-- O botão manual continua valendo nas rodadas automáticas (adiantar, reabrir, encerrar antes).
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- No fim aparece uma linha dizendo se o agendamento automático ficou ativo.
-- =====================================================================

-- (pode ser rodado mais de uma vez sem erro)
alter table public.rodadas
  add column if not exists data date,
  add column if not exists horario_fim text check (horario_fim ~ '^\d{2}:\d{2}$'),
  add column if not exists modo text not null default 'manual' check (modo in ('manual', 'automatico'));

-- Rodada automática precisa de data, início e fim (fim depois do início, no mesmo dia).
alter table public.rodadas drop constraint if exists rodadas_agendamento_completo;
alter table public.rodadas add constraint rodadas_agendamento_completo
  check (modo = 'manual' or (data is not null and horario_fim is not null and horario_fim > horario));

create index if not exists rodadas_agenda on public.rodadas (modo, status, data);

-- Abre e fecha as rodadas automáticas. Roda sozinha a cada poucos segundos (pg_cron, abaixo).
create or replace function public.processar_agendamento()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_agora timestamptz := now();
  v_abrir uuid;
begin
  -- 1. Fecha as automáticas que passaram do horário de encerramento.
  --    (se o admin reabriu à mão depois do horário, quem fecha é ele)
  update rodadas set status = 'encerrada'
  where modo = 'automatico' and status = 'no_ar'
    and ((data + horario_fim::time) at time zone 'America/Sao_Paulo') <= v_agora
    and (no_ar_em is null or no_ar_em < ((data + horario_fim::time) at time zone 'America/Sao_Paulo'));

  -- 2. Agendadas cuja janela já passou inteira (ex.: servidor parado) viram encerradas, sem abrir.
  update rodadas set status = 'encerrada'
  where modo = 'automatico' and status = 'agendada'
    and ((data + horario_fim::time) at time zone 'America/Sao_Paulo') <= v_agora;

  -- 3. Abre a automática cuja janela começou (se houver mais de uma, a de início mais recente).
  select id into v_abrir from rodadas
  where modo = 'automatico' and status = 'agendada'
    and ((data + horario::time) at time zone 'America/Sao_Paulo') <= v_agora
    and ((data + horario_fim::time) at time zone 'America/Sao_Paulo') > v_agora
  order by data desc, horario desc
  limit 1;

  if v_abrir is not null then
    update rodadas set status = 'encerrada' where status = 'no_ar' and id <> v_abrir;
    update rodadas set status = 'no_ar', no_ar_em = v_agora where id = v_abrir;
  end if;
end
$$;

revoke all on function public.processar_agendamento() from anon, authenticated, public;

-- Zerar os testes volta todas as rodadas para "agendada" e processa a agenda na hora.
create or replace function public.apagar_todas_respostas()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  delete from respostas where true;
  update rodadas set status = 'agendada', no_ar_em = null where true;
  perform processar_agendamento();
end
$$;

-- ---------------------------------------------------------------------
-- Agendador (pg_cron, incluído no Supabase). A cada 15 s; se a versão não aceitar
-- segundos, a cada 1 minuto.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponível: %', sqlerrm;
    return;
  end;
  if exists (select 1 from cron.job where jobname = 'quiz-agendamento') then
    perform cron.unschedule('quiz-agendamento');
  end if;
  begin
    perform cron.schedule('quiz-agendamento', '15 seconds', 'select public.processar_agendamento()');
  exception when others then
    perform cron.schedule('quiz-agendamento', '* * * * *', 'select public.processar_agendamento()');
  end;
end
$$;

-- Avisa a API do Supabase para recarregar a lista de funções (evita o erro "schema cache").
notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_extension where extname = 'pg_cron')
    then 'OK: agendamento automático ativo'
  else 'ATENÇÃO: ative a extensão pg_cron em Database → Extensions e rode este arquivo de novo'
end as resultado;
