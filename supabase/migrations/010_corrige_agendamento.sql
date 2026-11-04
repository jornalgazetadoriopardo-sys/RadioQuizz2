-- =====================================================================
-- Pergunta da Hora — correção do agendamento + diagnóstico
-- Problema: uma rodada automática que já tinha aberto/fechado (ou cujo horário passou) ficava
-- "encerrada"; ao ser reagendada para um novo horário ela continuava "encerrada" e o agendador
-- (que só abre rodadas "agendadas") nunca mais a abria.
-- Correção: ao mudar data, horário ou modo de uma rodada automática para uma janela no futuro,
-- ela volta a ficar "agendada" sozinha.
-- Também cria o diagnóstico mostrado no Painel Admin → Ao vivo.
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run. Pode ser rodado mais de uma vez.
-- =====================================================================

create or replace function public.fim_da_rodada(r public.rodadas)
returns timestamptz
language sql stable
as $$ select case when r.data is null or r.horario_fim is null then null
                  else ((r.data + r.horario_fim::time) at time zone 'America/Sao_Paulo') end $$;

create or replace function public.inicio_da_rodada(r public.rodadas)
returns timestamptz
language sql stable
as $$ select case when r.data is null then null
                  else ((r.data + r.horario::time) at time zone 'America/Sao_Paulo') end $$;

-- Mudou a data ou o horário de uma rodada automática:
-- - encerrada com o novo horário ainda por vir (ou acontecendo agora) → volta a ser "agendada";
-- - no ar, mas o novo início ficou para depois → sai do ar e fica "agendada".
create or replace function public.reagendar_rodada()
returns trigger
language plpgsql
as $$
begin
  if new.modo = 'automatico'
     and (new.data, new.horario, new.horario_fim, new.modo) is distinct from (old.data, old.horario, old.horario_fim, old.modo)
     and ((new.status = 'encerrada' and fim_da_rodada(new) > now())
          or (new.status = 'no_ar' and inicio_da_rodada(new) > now())) then
    new.status := 'agendada';
    new.no_ar_em := null;
  end if;
  return new;
end
$$;

drop trigger if exists ao_reagendar on public.rodadas;
create trigger ao_reagendar
before update on public.rodadas
for each row execute function public.reagendar_rodada();

-- Encerrar à mão uma rodada automática ANTES do horário dela (ex.: um teste com "No ar")
-- não cancela o agendamento: ela continua "agendada" e abre no horário.
create or replace function public.encerrar_rodada(p_rodada uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  update rodadas r
  set status = case when r.modo = 'automatico' and inicio_da_rodada(r) > now() then 'agendada' else 'encerrada' end
  where r.id = p_rodada;
end
$$;

-- Conserta as rodadas que já ficaram presas
update public.rodadas r set status = 'agendada', no_ar_em = null
where r.modo = 'automatico' and r.status = 'encerrada' and fim_da_rodada(r) > now();

-- Roda a agenda agora (o mesmo que o agendador faz sozinho a cada segundo)
select public.processar_agendamento();

-- ---------------------------------------------------------------------
-- Diagnóstico (Painel Admin → Ao vivo → "Diagnóstico do agendamento")
-- ---------------------------------------------------------------------
create or replace function public.diagnostico_agendamento()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_job json;
  v_execucoes json;
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select json_build_object('nome', jobname, 'frequencia', schedule, 'ativo', active) into v_job
    from cron.job where jobname = 'quiz-agendamento';

    select coalesce(json_agg(x order by x.inicio desc), '[]'::json) into v_execucoes
    from (
      select d.start_time as inicio, d.status, left(d.return_message, 300) as mensagem
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
      where j.jobname = 'quiz-agendamento'
      order by d.start_time desc
      limit 5
    ) x;
  end if;

  return json_build_object(
    'agora_servidor', now(),
    'pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron'),
    'job', v_job,
    'ultimas_execucoes', coalesce(v_execucoes, '[]'::json),
    'erros_recentes', (
      select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname = 'quiz-agendamento' and d.status = 'failed' and d.start_time > now() - interval '1 hour'
    ),
    'rodadas', (
      select coalesce(json_agg(json_build_object(
        'titulo', r.titulo, 'status', r.status, 'data', r.data, 'horario', r.horario, 'horario_fim', r.horario_fim,
        'abre_em', inicio_da_rodada(r), 'fecha_em', fim_da_rodada(r), 'no_ar_em', r.no_ar_em
      ) order by r.data, r.horario), '[]'::json)
      from rodadas r
      where r.modo = 'automatico' and (r.data is null or r.data >= (now() at time zone 'America/Sao_Paulo')::date - 1)
    )
  );
exception when undefined_table or invalid_schema_name then
  -- sem pg_cron instalado
  return json_build_object('agora_servidor', now(), 'pg_cron', false, 'job', null, 'ultimas_execucoes', '[]'::json, 'erros_recentes', 0, 'rodadas', '[]'::json);
end
$$;

-- Admin: conferir a agenda agora (útil se o agendador estiver parado)
create or replace function public.conferir_agenda_agora()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  perform processar_agendamento();
end
$$;

revoke all on function public.diagnostico_agendamento(), public.conferir_agenda_agora(), public.reagendar_rodada(),
  public.fim_da_rodada(public.rodadas), public.inicio_da_rodada(public.rodadas) from anon, public;
grant execute on function public.diagnostico_agendamento(), public.conferir_agenda_agora() to authenticated;

notify pgrst, 'reload schema';

-- Resultado: situação do agendador agora
select
  coalesce((select 'Agendador ' || case when active then 'ATIVO' else 'PARADO' end || ', a cada ' || schedule
            from cron.job where jobname = 'quiz-agendamento'), 'ATENÇÃO: agendador não existe — rode o 005_agendamento.sql') as agendador,
  (select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where j.jobname = 'quiz-agendamento' and d.start_time > now() - interval '1 minute') as execucoes_no_ultimo_minuto,
  (select left(d.return_message, 200) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where j.jobname = 'quiz-agendamento' and d.status = 'failed' order by d.start_time desc limit 1) as ultimo_erro;
