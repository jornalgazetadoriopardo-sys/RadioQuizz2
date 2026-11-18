-- =====================================================================
-- Pergunta da Hora — grade de inserções dos patrocinadores
-- A programação dos anúncios fica gravada numa grade: todos os dias, das 9h às 18h, de meia em meia hora,
-- com 2 inserções por horário: "antes" (antes de responder) e "depois" (depois de responder).
-- - Fixos: entram nos horários combinados, se a posição estiver vaga (se não, ficam como pendência).
--   Não podem ser alterados pela grade.
-- - Rotativos: o sistema distribui sozinho as vezes por dia combinadas, só nas posições vagas.
-- - O que já está na grade nunca é mudado automaticamente; só o admin muda, à mão.
-- - Quando a pergunta entra no ar, o anúncio vem da grade (o mesmo para todos os ouvintes).
--   Posição vaga = sem anúncio naquele momento.
-- Precisa do 018. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

create table if not exists public.grade_insercoes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  horario text not null check (horario ~ '^((09|1[0-7]):(00|30)|18:00)$'),
  posicao text not null check (posicao in ('antes', 'depois')),
  patrocinador_id uuid not null references public.patrocinadores (id) on delete cascade,
  origem text not null default 'auto' check (origem in ('auto', 'manual', 'fixo')),
  veiculada_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (data, horario, posicao)
);
create index if not exists grade_insercoes_patrocinador on public.grade_insercoes (patrocinador_id, data);

alter table public.grade_insercoes enable row level security;
drop policy if exists "admin vê a grade" on public.grade_insercoes;
create policy "admin vê a grade" on public.grade_insercoes for select to authenticated using (public.eh_admin());
grant select on public.grade_insercoes to authenticated;

-- Horários da grade: 09:00, 09:30, … 18:00
create or replace function public.horarios_grade()
returns setof text language sql immutable
as $$ select to_char(time '09:00' + make_interval(mins => 30 * g), 'HH24:MI') from generate_series(0, 18) g $$;

-- Horário da rodada → horário da grade (10:42 → 10:30). Fora das 9h–18h29: sem horário na grade.
create or replace function public.horario_da_grade(p_horario text)
returns text language sql immutable
as $$
  select case when t < time '09:00' or t >= time '18:30' then null
              else to_char(time '00:00' + make_interval(mins => (extract(hour from t) * 60 + floor(extract(minute from t) / 30) * 30)::int), 'HH24:MI') end
  from (select p_horario::time as t) x
$$;

-- Patrocinador em circulação num dia (ativo e dentro do período)
create or replace function public.patrocinador_circula_em(p public.patrocinadores, p_dia date)
returns boolean language sql stable
as $$ select p.ativo and (p.inicio is null or p.inicio <= p_dia) and (p.fim is null or p.fim >= p_dia) $$;

-- Horário da grade já passou?
create or replace function public.horario_passou(p_dia date, p_horario text)
returns boolean language sql stable
as $$ select ((p_dia + p_horario::time) at time zone 'America/Sao_Paulo') <= now() $$;

-- Preenche as posições VAGAS da grade de p_de a p_ate (de hoje em diante). Não muda nada que já está na grade.
-- Devolve quantas inserções entraram e as pendências (fixo com horário ocupado, rotativo sem vaga).
create or replace function public.programar_grade(p_de date, p_ate date)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_dia date;
  p record;
  v_h text;
  v_pos text;
  v_cel record;
  v_falta int;
  v_andou boolean;
  v_inseridas int := 0;
  v_pend jsonb := '[]'::jsonb;
begin
  -- o agendador (sem login) e os administradores podem programar
  if auth.uid() is not null and not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  p_de := greatest(p_de, hoje_sp());
  p_ate := least(p_ate, p_de + 120);

  for v_dia in select generate_series(p_de, p_ate, interval '1 day')::date loop
    continue when horario_passou(v_dia, '18:00'); -- dia já encerrado
    -- 1. Fixos: no horário combinado, se a posição estiver vaga
    for p in select * from patrocinadores x where x.modalidade = 'fixo' and patrocinador_circula_em(x, v_dia) order by x.nome loop
      foreach v_h in array p.horarios_fixos loop
        v_h := horario_da_grade(v_h);
        continue when v_h is null or horario_passou(v_dia, v_h);
        continue when exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = v_h and g.patrocinador_id = p.id);
        v_pos := case
          when 'anuncio_pergunta' = any (p.espacos) and not exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = v_h and g.posicao = 'antes') then 'antes'
          when 'anuncio_resultado' = any (p.espacos) and not exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = v_h and g.posicao = 'depois') then 'depois'
        end;
        if v_pos is null then
          v_pend := v_pend || jsonb_build_object('patrocinador', p.nome, 'data', v_dia, 'horario', v_h, 'motivo', 'horário fixo ocupado');
        else
          insert into grade_insercoes (data, horario, posicao, patrocinador_id, origem) values (v_dia, v_h, v_pos, p.id, 'fixo');
          v_inseridas := v_inseridas + 1;
        end if;
      end loop;
    end loop;

    -- 2. Rotativos: um de cada vez (ordem sorteada), até cada um ter as vezes do dia, em posições vagas sorteadas
    loop
      v_andou := false;
      for p in
        select x.* from patrocinadores x
        where x.modalidade = 'rotativo' and patrocinador_circula_em(x, v_dia)
          and x.espacos && array['anuncio_pergunta', 'anuncio_resultado']
        order by random()
      loop
        v_falta := p.vezes_dia - (select count(*) from grade_insercoes g where g.data = v_dia and g.patrocinador_id = p.id);
        continue when v_falta <= 0;
        select h.h as horario, ps.pos as posicao into v_cel
        from horarios_grade() h(h)
        cross join (values ('antes'), ('depois')) ps(pos)
        where ((ps.pos = 'antes' and 'anuncio_pergunta' = any (p.espacos)) or (ps.pos = 'depois' and 'anuncio_resultado' = any (p.espacos)))
          and not horario_passou(v_dia, h.h)
          and not exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = h.h and g.posicao = ps.pos)
          and not exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = h.h and g.patrocinador_id = p.id)
        order by random()
        limit 1;
        if not found then
          v_pend := v_pend || jsonb_build_object('patrocinador', p.nome, 'data', v_dia, 'motivo', format('sem vaga para %s inserção(ões)', v_falta));
          continue;
        end if;
        insert into grade_insercoes (data, horario, posicao, patrocinador_id, origem) values (v_dia, v_cel.horario, v_cel.posicao, p.id, 'auto');
        v_inseridas := v_inseridas + 1;
        v_andou := true;
      end loop;
      exit when not v_andou;
    end loop;
  end loop;

  return json_build_object('inseridas', v_inseridas, 'pendencias', v_pend);
end
$$;

-- Admin: coloca um patrocinador numa posição (ou deixa vaga, com p_patrocinador nulo). Fixos não mudam pela grade.
create or replace function public.grade_definir(p_data date, p_horario text, p_posicao text, p_patrocinador uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  if horario_passou(p_data, p_horario) then
    raise exception 'horario_passado';
  end if;
  if exists (select 1 from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao and origem = 'fixo') then
    raise exception 'posicao_fixa';
  end if;
  if p_patrocinador is null then
    delete from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao;
  else
    insert into grade_insercoes (data, horario, posicao, patrocinador_id, origem)
    values (p_data, p_horario, p_posicao, p_patrocinador, 'manual')
    on conflict (data, horario, posicao) do update
      set patrocinador_id = excluded.patrocinador_id, origem = 'manual', veiculada_em = null, atualizado_em = now();
  end if;
end
$$;

-- Admin: muda uma inserção de dia/horário/posição. Se o destino tiver outra inserção (não fixa), as duas trocam de lugar.
create or replace function public.grade_mover(p_id uuid, p_data date, p_horario text, p_posicao text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_origem grade_insercoes;
  v_destino grade_insercoes;
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  select * into v_origem from grade_insercoes where id = p_id;
  if v_origem.id is null then
    raise exception 'insercao_nao_encontrada';
  end if;
  if v_origem.origem = 'fixo' then
    raise exception 'posicao_fixa';
  end if;
  if horario_passou(v_origem.data, v_origem.horario) or horario_passou(p_data, p_horario) then
    raise exception 'horario_passado';
  end if;
  select * into v_destino from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao;
  if v_destino.origem = 'fixo' then
    raise exception 'destino_fixo';
  end if;
  if v_destino.id = v_origem.id then
    return;
  end if;
  -- troca em três passos para não esbarrar na regra de uma inserção por posição
  delete from grade_insercoes where id = v_origem.id;
  if v_destino.id is not null then
    update grade_insercoes set data = v_origem.data, horario = v_origem.horario, posicao = v_origem.posicao, origem = 'manual', atualizado_em = now()
    where id = v_destino.id;
  end if;
  insert into grade_insercoes (id, data, horario, posicao, patrocinador_id, origem)
  values (v_origem.id, p_data, p_horario, p_posicao, v_origem.patrocinador_id, 'manual');
end
$$;

-- Relatório de inserções (todos ou um patrocinador), passadas e futuras
create or replace function public.relatorio_insercoes(p_de date, p_ate date, p_patrocinador uuid default null)
returns table (data date, horario text, posicao text, origem text, patrocinador_id uuid, nome text, situacao text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  return query
  select g.data, g.horario, g.posicao, g.origem, g.patrocinador_id, p.nome,
         case when g.veiculada_em is not null then 'veiculada'
              when ((g.data + g.horario::time) at time zone 'America/Sao_Paulo') + interval '30 minutes' < now() then 'nao_veiculada'
              else 'programada' end
  from grade_insercoes g join patrocinadores p on p.id = g.patrocinador_id
  where g.data between p_de and p_ate and (p_patrocinador is null or g.patrocinador_id = p_patrocinador)
  order by g.data, g.horario, g.posicao;
end
$$;

-- Ao entrar no ar: os anúncios da rodada vêm da grade (rodada fixa por patrocinador continua passando por cima)
create or replace function public.escolher_patrocinio_da_rodada()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_dia date;
  v_h text;
begin
  if new.status = 'no_ar' and (old.status is distinct from 'no_ar' or new.no_ar_em is distinct from old.no_ar_em) then
    if new.patrocinador_fixo is not null then
      new.patrocinador_pergunta := new.patrocinador_fixo;
      new.patrocinador_resultado := new.patrocinador_fixo;
    else
      v_dia := coalesce(new.data, hoje_sp());
      v_h := horario_da_grade(new.horario);
      new.patrocinador_pergunta := null;
      new.patrocinador_resultado := null;
      if v_h is not null then
        -- dia ainda sem programação: programa as vagas antes
        if not exists (select 1 from grade_insercoes where data = v_dia) then
          perform programar_grade(v_dia, v_dia);
        end if;
        select g.patrocinador_id into new.patrocinador_pergunta
        from grade_insercoes g join patrocinadores p on p.id = g.patrocinador_id
        where g.data = v_dia and g.horario = v_h and g.posicao = 'antes' and patrocinador_circula_em(p, v_dia);
        select g.patrocinador_id into new.patrocinador_resultado
        from grade_insercoes g join patrocinadores p on p.id = g.patrocinador_id
        where g.data = v_dia and g.horario = v_h and g.posicao = 'depois' and patrocinador_circula_em(p, v_dia);
        update grade_insercoes set veiculada_em = now()
        where data = v_dia and horario = v_h
          and ((posicao = 'antes' and patrocinador_id = new.patrocinador_pergunta) or (posicao = 'depois' and patrocinador_id = new.patrocinador_resultado));
      end if;
    end if;
    perform contar_rodada_patrocinio(new.patrocinador_pergunta, 'anuncio_pergunta');
    perform contar_rodada_patrocinio(new.patrocinador_resultado, 'anuncio_resultado');
  end if;
  return new;
end
$$;

revoke all on function public.programar_grade(date, date), public.grade_definir(date, text, text, uuid),
  public.grade_mover(uuid, date, text, text), public.relatorio_insercoes(date, date, uuid) from anon, public;
grant execute on function public.programar_grade(date, date), public.grade_definir(date, text, text, uuid),
  public.grade_mover(uuid, date, text, text), public.relatorio_insercoes(date, date, uuid) to authenticated;

-- Todo dia de madrugada, programa as vagas dos próximos dois meses
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron indisponível: a grade será programada pelo painel';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'quiz-grade') then
    perform cron.unschedule('quiz-grade');
  end if;
  perform cron.schedule('quiz-grade', '5 6 * * *', 'select public.programar_grade(public.hoje_sp(), public.hoje_sp() + 62)');
end
$$;

-- Programa já agora as vagas até o fim do mês que vem
select public.programar_grade(public.hoje_sp(), (date_trunc('month', public.hoje_sp()) + interval '2 months - 1 day')::date);

notify pgrst, 'reload schema';

select 'OK: grade de inserções dos patrocinadores' as resultado;
