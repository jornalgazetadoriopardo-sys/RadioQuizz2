-- =====================================================================
-- Pergunta da Hora — até 2 anúncios antes e 2 depois de responder
-- Cada posição da grade (antes / depois de responder) tem 30 segundos, divididos em 2 partes de 15 s:
-- - dois anúncios de 15 s (1ª e 2ª parte), que tocam um depois do outro;
-- - ou um anúncio de 30 s, que ocupa as duas partes (não sobra lugar para um segundo);
-- - ou um só de 15 s (a outra parte fica vaga).
-- A duração de cada anunciante (15 ou 30 s) vem do cadastro.
-- Precisa do 019. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.grade_insercoes add column if not exists parte smallint not null default 1;
alter table public.grade_insercoes drop constraint if exists grade_insercoes_parte_valida;
alter table public.grade_insercoes add constraint grade_insercoes_parte_valida check (parte in (1, 2));
alter table public.grade_insercoes drop constraint if exists grade_insercoes_data_horario_posicao_key;
alter table public.grade_insercoes drop constraint if exists grade_insercoes_lugar;
alter table public.grade_insercoes add constraint grade_insercoes_lugar unique (data, horario, posicao, parte);

-- Segundo anúncio de cada momento da rodada
alter table public.rodadas
  add column if not exists patrocinador_pergunta2 uuid references public.patrocinadores (id) on delete set null,
  add column if not exists patrocinador_resultado2 uuid references public.patrocinadores (id) on delete set null;

-- Duração do anúncio do patrocinador: 15 ou 30 s (sem duração no cadastro = 15)
create or replace function public.duracao_anuncio(p_patrocinador uuid)
returns int language sql stable security definer set search_path = public
as $$ select case when coalesce((select duracao_segundos from patrocinadores where id = p_patrocinador), 15) > 15 then 30 else 15 end $$;

-- Segundos já ocupados numa posição da grade
create or replace function public.segundos_ocupados(p_data date, p_horario text, p_posicao text)
returns int language sql stable security definer set search_path = public
as $$ select coalesce(sum(duracao_anuncio(patrocinador_id)), 0)::int from grade_insercoes
      where data = p_data and horario = p_horario and posicao = p_posicao $$;

-- Confere uma posição depois de mudar: no máximo 30 s e sem o mesmo anunciante duas vezes
create or replace function public.conferir_posicao(p_data date, p_horario text, p_posicao text)
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if segundos_ocupados(p_data, p_horario, p_posicao) > 30 then
    raise exception 'sem_espaco_na_posicao';
  end if;
  if (select count(*) <> count(distinct patrocinador_id) from grade_insercoes
      where data = p_data and horario = p_horario and posicao = p_posicao) then
    raise exception 'anunciante_repetido_na_posicao';
  end if;
end
$$;

-- Primeira parte livre numa posição em que cabe um anúncio de p_segundos (null se não couber)
create or replace function public.parte_livre(p_data date, p_horario text, p_posicao text, p_segundos int)
returns smallint language sql stable security definer set search_path = public
as $$
  select pt::smallint from (values (1), (2)) v(pt)
  where segundos_ocupados(p_data, p_horario, p_posicao) + p_segundos <= 30
    and not exists (select 1 from grade_insercoes g where g.data = p_data and g.horario = p_horario and g.posicao = p_posicao and g.parte = v.pt)
  order by pt limit 1
$$;

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
  v_parte smallint;
  v_seg int;
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
    -- 1. Fixos: no horário combinado, se houver lugar (antes de responder; se não, depois)
    for p in select * from patrocinadores x where x.modalidade = 'fixo' and patrocinador_circula_em(x, v_dia) order by x.nome loop
      v_seg := duracao_anuncio(p.id);
      foreach v_h in array p.horarios_fixos loop
        v_h := horario_da_grade(v_h);
        continue when v_h is null or horario_passou(v_dia, v_h);
        continue when exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = v_h and g.patrocinador_id = p.id);
        v_pos := null;
        v_parte := null;
        if 'anuncio_pergunta' = any (p.espacos) then
          v_parte := parte_livre(v_dia, v_h, 'antes', v_seg);
          if v_parte is not null then v_pos := 'antes'; end if;
        end if;
        if v_pos is null and 'anuncio_resultado' = any (p.espacos) then
          v_parte := parte_livre(v_dia, v_h, 'depois', v_seg);
          if v_parte is not null then v_pos := 'depois'; end if;
        end if;
        if v_pos is null then
          v_pend := v_pend || jsonb_build_object('patrocinador', p.nome, 'data', v_dia, 'horario', v_h, 'motivo', 'horário fixo ocupado');
        else
          insert into grade_insercoes (data, horario, posicao, parte, patrocinador_id, origem) values (v_dia, v_h, v_pos, v_parte, p.id, 'fixo');
          v_inseridas := v_inseridas + 1;
        end if;
      end loop;
    end loop;

    -- 2. Rotativos: um de cada vez (ordem sorteada), até cada um ter as vezes do dia, em lugares vagos sorteados
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
        v_seg := duracao_anuncio(p.id);
        select c.horario, c.posicao, c.parte into v_cel
        from (
          select h.h as horario, ps.pos as posicao, parte_livre(v_dia, h.h, ps.pos, v_seg) as parte
          from horarios_grade() h(h)
          cross join (values ('antes'), ('depois')) ps(pos)
          where ((ps.pos = 'antes' and 'anuncio_pergunta' = any (p.espacos)) or (ps.pos = 'depois' and 'anuncio_resultado' = any (p.espacos)))
            and not horario_passou(v_dia, h.h)
            and not exists (select 1 from grade_insercoes g where g.data = v_dia and g.horario = h.h and g.patrocinador_id = p.id)
        ) c
        where c.parte is not null
        -- primeiro as posições totalmente vagas (espalha os anúncios); depois completa as que têm um de 15 s
        order by (select count(*) from grade_insercoes g where g.data = v_dia and g.horario = c.horario and g.posicao = c.posicao), random()
        limit 1;
        if not found then
          v_pend := v_pend || jsonb_build_object('patrocinador', p.nome, 'data', v_dia, 'motivo', format('sem vaga para %s inserção(ões)', v_falta));
          continue;
        end if;
        insert into grade_insercoes (data, horario, posicao, parte, patrocinador_id, origem) values (v_dia, v_cel.horario, v_cel.posicao, v_cel.parte, p.id, 'auto');
        v_inseridas := v_inseridas + 1;
        v_andou := true;
      end loop;
      exit when not v_andou;
    end loop;
  end loop;

  return json_build_object('inseridas', v_inseridas, 'pendencias', v_pend);
end
$$;

-- Admin: coloca um patrocinador numa parte da posição (ou deixa vaga, com p_patrocinador nulo).
-- Anúncio de 30 s ocupa a posição inteira (fica na 1ª parte e a 2ª precisa estar vaga). Fixos não mudam pela grade.
drop function if exists public.grade_definir(date, text, text, uuid);
create or replace function public.grade_definir(p_data date, p_horario text, p_posicao text, p_patrocinador uuid, p_parte smallint default 1)
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
  if exists (select 1 from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao and parte = p_parte and origem = 'fixo') then
    raise exception 'posicao_fixa';
  end if;
  delete from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao and parte = p_parte;
  if p_patrocinador is null then
    return;
  end if;
  if duracao_anuncio(p_patrocinador) = 30 then
    if exists (select 1 from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao) then
      raise exception 'sem_espaco_na_posicao';
    end if;
    p_parte := 1;
  end if;
  insert into grade_insercoes (data, horario, posicao, parte, patrocinador_id, origem)
  values (p_data, p_horario, p_posicao, p_parte, p_patrocinador, 'manual');
  perform conferir_posicao(p_data, p_horario, p_posicao);
end
$$;

-- Admin: muda uma inserção de dia/horário/posição/parte. Se o destino tiver outra inserção (não fixa), as duas trocam de lugar.
drop function if exists public.grade_mover(uuid, date, text, text);
create or replace function public.grade_mover(p_id uuid, p_data date, p_horario text, p_posicao text, p_parte smallint default 1)
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
  if duracao_anuncio(v_origem.patrocinador_id) = 30 then
    p_parte := 1; -- 30 s ocupa a posição inteira
  end if;
  select * into v_destino from grade_insercoes where data = p_data and horario = p_horario and posicao = p_posicao and parte = p_parte;
  if v_destino.origem = 'fixo' then
    raise exception 'destino_fixo';
  end if;
  if v_destino.id = v_origem.id then
    return;
  end if;
  -- troca em três passos para não esbarrar na regra de uma inserção por lugar
  delete from grade_insercoes where id = v_origem.id;
  if v_destino.id is not null then
    update grade_insercoes set data = v_origem.data, horario = v_origem.horario, posicao = v_origem.posicao, parte = v_origem.parte,
                               origem = 'manual', veiculada_em = null, atualizado_em = now()
    where id = v_destino.id;
  end if;
  insert into grade_insercoes (id, data, horario, posicao, parte, patrocinador_id, origem)
  values (v_origem.id, p_data, p_horario, p_posicao, p_parte, v_origem.patrocinador_id, 'manual');
  -- se não couber (ex.: 30 s numa posição que já tem um de 15 s), nada muda
  perform conferir_posicao(p_data, p_horario, p_posicao);
  perform conferir_posicao(v_origem.data, v_origem.horario, v_origem.posicao);
end
$$;

-- Relatório de inserções (todos ou um patrocinador), passadas e futuras, com a parte e a duração
drop function if exists public.relatorio_insercoes(date, date, uuid);
create or replace function public.relatorio_insercoes(p_de date, p_ate date, p_patrocinador uuid default null)
returns table (data date, horario text, posicao text, parte smallint, segundos int, origem text, patrocinador_id uuid, nome text, situacao text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  return query
  select g.data, g.horario, g.posicao, g.parte, duracao_anuncio(g.patrocinador_id), g.origem, g.patrocinador_id, p.nome,
         case when g.veiculada_em is not null then 'veiculada'
              when ((g.data + g.horario::time) at time zone 'America/Sao_Paulo') + interval '30 minutes' < now() then 'nao_veiculada'
              else 'programada' end
  from grade_insercoes g join patrocinadores p on p.id = g.patrocinador_id
  where g.data between p_de and p_ate and (p_patrocinador is null or g.patrocinador_id = p_patrocinador)
  order by g.data, g.horario, g.posicao, g.parte;
end
$$;

-- Ao entrar no ar: os anúncios da rodada vêm da grade, na ordem das partes (até 30 s antes e 30 s depois).
-- Rodada fixa por patrocinador continua passando por cima (um anúncio antes e um depois).
create or replace function public.escolher_patrocinio_da_rodada()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_dia date;
  v_h text;
  v_pos text;
  v_ids uuid[];
  g record;
  v_seg int;
begin
  if new.status = 'no_ar' and (old.status is distinct from 'no_ar' or new.no_ar_em is distinct from old.no_ar_em) then
    new.patrocinador_pergunta2 := null;
    new.patrocinador_resultado2 := null;
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
        foreach v_pos in array array['antes', 'depois'] loop
          v_ids := '{}';
          v_seg := 0;
          for g in
            select x.id, x.patrocinador_id from grade_insercoes x join patrocinadores p on p.id = x.patrocinador_id
            where x.data = v_dia and x.horario = v_h and x.posicao = v_pos and patrocinador_circula_em(p, v_dia)
            order by x.parte
          loop
            -- cabe no tempo da posição? (se a duração de um anunciante mudou depois de programado, o que passa fica de fora)
            continue when v_seg + duracao_anuncio(g.patrocinador_id) > 30;
            v_seg := v_seg + duracao_anuncio(g.patrocinador_id);
            v_ids := v_ids || g.patrocinador_id;
            update grade_insercoes set veiculada_em = now() where id = g.id;
          end loop;
          if v_pos = 'antes' then
            new.patrocinador_pergunta := v_ids[1];
            new.patrocinador_pergunta2 := v_ids[2];
          else
            new.patrocinador_resultado := v_ids[1];
            new.patrocinador_resultado2 := v_ids[2];
          end if;
        end loop;
      end if;
    end if;
    perform contar_rodada_patrocinio(new.patrocinador_pergunta, 'anuncio_pergunta');
    perform contar_rodada_patrocinio(new.patrocinador_pergunta2, 'anuncio_pergunta');
    perform contar_rodada_patrocinio(new.patrocinador_resultado, 'anuncio_resultado');
    perform contar_rodada_patrocinio(new.patrocinador_resultado2, 'anuncio_resultado');
  end if;
  return new;
end
$$;

-- Quem entrou a tempo tem prazo para ver os anúncios (até 30 s) e abrir a pergunta
create or replace function public.prazo_entrada()
returns interval language sql stable security definer set search_path = public
as $$ select interval '50 seconds' $$;

revoke all on function public.duracao_anuncio(uuid), public.segundos_ocupados(date, text, text), public.conferir_posicao(date, text, text),
  public.parte_livre(date, text, text, int) from anon, authenticated, public;
revoke all on function public.grade_definir(date, text, text, uuid, smallint), public.grade_mover(uuid, date, text, text, smallint),
  public.relatorio_insercoes(date, date, uuid) from anon, public;
grant execute on function public.grade_definir(date, text, text, uuid, smallint), public.grade_mover(uuid, date, text, text, smallint),
  public.relatorio_insercoes(date, date, uuid) to authenticated;

notify pgrst, 'reload schema';

select 'OK: até 2 anúncios antes e 2 depois de responder (15 + 15 s ou um de 30 s)' as resultado;
