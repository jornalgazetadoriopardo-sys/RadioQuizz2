-- =====================================================================
-- Pergunta da Hora — horários das rodadas com segundos
-- - "Abre às" e "Encerra às" aceitam segundos (ex.: 10:30:00 às 10:30:45).
-- - O agendador passa a conferir a cada 1 segundo, para rodadas que ficam pouco tempo no ar.
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

-- aceita HH:MM ou HH:MM:SS (horas 00–23, minutos e segundos 00–59)
alter table public.rodadas drop constraint if exists rodadas_horario_check;
alter table public.rodadas add constraint rodadas_horario_check check (horario ~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$');
alter table public.rodadas drop constraint if exists rodadas_horario_fim_check;
alter table public.rodadas add constraint rodadas_horario_fim_check check (horario_fim ~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$');

-- compara como hora (e não como texto), para "10:30" e "10:30:00" valerem o mesmo
alter table public.rodadas drop constraint if exists rodadas_agendamento_completo;
alter table public.rodadas add constraint rodadas_agendamento_completo
  check (modo = 'manual' or (data is not null and horario_fim is not null and horario_fim::time > horario::time));

-- agendador a cada 1 segundo (se a versão do pg_cron não aceitar, a cada 15 s ou 1 min)
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron indisponível';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'quiz-agendamento') then
    perform cron.unschedule('quiz-agendamento');
  end if;
  begin
    perform cron.schedule('quiz-agendamento', '1 seconds', 'select public.processar_agendamento()');
  exception when others then
    begin
      perform cron.schedule('quiz-agendamento', '15 seconds', 'select public.processar_agendamento()');
    exception when others then
      perform cron.schedule('quiz-agendamento', '* * * * *', 'select public.processar_agendamento()');
    end;
  end;
end
$$;

notify pgrst, 'reload schema';

select coalesce(
  (select 'OK: agendador conferindo a cada ' || schedule from cron.job where jobname = 'quiz-agendamento'),
  'ATENÇÃO: agendador não encontrado — rode antes o 005_agendamento.sql'
) as resultado;
