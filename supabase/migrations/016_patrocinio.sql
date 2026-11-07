-- =====================================================================
-- Pergunta da Hora — espaços de patrocínio, rodízio com peso, período, patrocinador fixo e relatório
-- Espaços:
--   anuncio_pergunta  → anúncio (vídeo ou montado) depois de "Vou participar"
--   anuncio_resultado → anúncio depois de "Confira sua resposta"
--   banner_inicio     → banner rotativo da tela inicial
--   banner_espera     → faixa de banner nas telas de espera
-- Rodízio: quando a rodada entra no ar, o servidor escolhe o patrocinador de cada anúncio (o mesmo para
-- todos os ouvintes). A escolha alterna de forma justa conforme o PESO de cada um: peso 3 aparece 3 vezes
-- a cada 1 de peso 1, intercalado (nunca vários seguidos). Quem está fora do período não entra.
-- "Patrocinador fixo" da rodada passa por cima do rodízio.
-- Exibições: o app conta quantas vezes cada patrocinador apareceu em cada espaço, por dia.
-- Precisa do 008. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.patrocinadores
  add column if not exists espacos text[] not null default array['anuncio_pergunta', 'anuncio_resultado', 'banner_inicio', 'banner_espera'],
  add column if not exists peso int not null default 1,
  add column if not exists inicio date,
  add column if not exists fim date,
  add column if not exists banner_url text;

alter table public.patrocinadores drop constraint if exists patrocinadores_espacos_validos;
alter table public.patrocinadores add constraint patrocinadores_espacos_validos
  check (espacos <@ array['anuncio_pergunta', 'anuncio_resultado', 'banner_inicio', 'banner_espera']);
alter table public.patrocinadores drop constraint if exists patrocinadores_peso_valido;
alter table public.patrocinadores add constraint patrocinadores_peso_valido check (peso between 1 and 10);
alter table public.patrocinadores drop constraint if exists patrocinadores_periodo_valido;
alter table public.patrocinadores add constraint patrocinadores_periodo_valido check (inicio is null or fim is null or fim >= inicio);

alter table public.rodadas
  add column if not exists patrocinador_fixo uuid references public.patrocinadores (id) on delete set null,
  add column if not exists patrocinador_pergunta uuid references public.patrocinadores (id) on delete set null,
  add column if not exists patrocinador_resultado uuid references public.patrocinadores (id) on delete set null;

-- Saldo de cada patrocinador no rodízio de cada espaço (rodízio ponderado suave)
create table if not exists public.patrocinio_rodizio (
  espaco text not null,
  patrocinador_id uuid not null references public.patrocinadores (id) on delete cascade,
  credito numeric not null default 0,
  ultima_vez timestamptz,
  primary key (espaco, patrocinador_id)
);
alter table public.patrocinio_rodizio enable row level security;

-- Exibições por dia, patrocinador e espaço
create table if not exists public.patrocinio_exibicoes (
  dia date not null,
  patrocinador_id uuid not null references public.patrocinadores (id) on delete cascade,
  espaco text not null,
  exibicoes int not null default 0,
  rodadas int not null default 0,
  primary key (dia, patrocinador_id, espaco)
);
alter table public.patrocinio_exibicoes enable row level security;

create or replace function public.hoje_sp()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Patrocinador pode aparecer neste espaço hoje?
create or replace function public.patrocinador_no_ar(p public.patrocinadores, p_espaco text)
returns boolean language sql stable
as $$ select p.ativo and p_espaco = any (p.espacos)
             and (p.inicio is null or p.inicio <= hoje_sp()) and (p.fim is null or p.fim >= hoje_sp()) $$;

-- Escolhe o próximo patrocinador do espaço. p_evitar: prefere outro (ex.: o do primeiro anúncio da rodada).
create or replace function public.escolher_patrocinador(p_espaco text, p_evitar uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_total int;
  v_escolhido uuid;
begin
  lock table patrocinio_rodizio in share row exclusive mode;

  select sum(p.peso) into v_total from patrocinadores p where patrocinador_no_ar(p, p_espaco);
  if v_total is null then
    return null;
  end if;

  insert into patrocinio_rodizio (espaco, patrocinador_id)
  select p_espaco, p.id from patrocinadores p where patrocinador_no_ar(p, p_espaco)
  on conflict do nothing;

  -- cada um ganha o próprio peso; o de maior saldo aparece e "paga" o total
  update patrocinio_rodizio r set credito = r.credito + p.peso
  from patrocinadores p
  where r.espaco = p_espaco and r.patrocinador_id = p.id and patrocinador_no_ar(p, p_espaco);

  select r.patrocinador_id into v_escolhido
  from patrocinio_rodizio r join patrocinadores p on p.id = r.patrocinador_id
  where r.espaco = p_espaco and patrocinador_no_ar(p, p_espaco)
  order by (r.patrocinador_id = p_evitar) is true, r.credito desc, r.ultima_vez asc nulls first, random()
  limit 1;

  update patrocinio_rodizio set credito = credito - v_total, ultima_vez = now()
  where espaco = p_espaco and patrocinador_id = v_escolhido;

  return v_escolhido;
end
$$;

-- Conta uma vez a rodada em que o patrocinador foi escolhido
create or replace function public.contar_rodada_patrocinio(p_patrocinador uuid, p_espaco text)
returns void
language sql security definer set search_path = public
as $$
  insert into patrocinio_exibicoes (dia, patrocinador_id, espaco, rodadas)
  select hoje_sp(), p_patrocinador, p_espaco, 1 where p_patrocinador is not null
  on conflict (dia, patrocinador_id, espaco) do update set rodadas = patrocinio_exibicoes.rodadas + 1
$$;

-- Ao entrar no ar (botão ou agendamento): escolhe os patrocinadores dos dois anúncios da rodada
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
      new.patrocinador_pergunta := escolher_patrocinador('anuncio_pergunta');
      new.patrocinador_resultado := escolher_patrocinador('anuncio_resultado', new.patrocinador_pergunta);
    end if;
    perform contar_rodada_patrocinio(new.patrocinador_pergunta, 'anuncio_pergunta');
    perform contar_rodada_patrocinio(new.patrocinador_resultado, 'anuncio_resultado');
  end if;
  return new;
end
$$;

drop trigger if exists escolher_patrocinio on public.rodadas;
create trigger escolher_patrocinio
before update on public.rodadas
for each row execute function public.escolher_patrocinio_da_rodada();

-- O app manda, de tempos em tempos, quantas vezes mostrou cada patrocinador em cada espaço
create or replace function public.registrar_exibicoes(p_itens jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 50 then
    return;
  end if;
  for v in select * from jsonb_array_elements(p_itens) loop
    if (v ->> 'e') in ('anuncio_pergunta', 'anuncio_resultado', 'banner_inicio', 'banner_espera')
       and exists (select 1 from patrocinadores where id::text = v ->> 'p') then
      insert into patrocinio_exibicoes (dia, patrocinador_id, espaco, exibicoes)
      values (hoje_sp(), (v ->> 'p')::uuid, v ->> 'e', least(greatest(coalesce((v ->> 'n')::int, 1), 1), 100))
      on conflict (dia, patrocinador_id, espaco) do update set exibicoes = patrocinio_exibicoes.exibicoes + excluded.exibicoes;
    end if;
  end loop;
end
$$;

-- Relatório do painel (só admin)
create or replace function public.relatorio_exibicoes(p_de date, p_ate date)
returns table (patrocinador_id uuid, nome text, espaco text, exibicoes bigint, rodadas bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  return query
  select e.patrocinador_id, p.nome, e.espaco, sum(e.exibicoes)::bigint, sum(e.rodadas)::bigint
  from patrocinio_exibicoes e join patrocinadores p on p.id = e.patrocinador_id
  where e.dia between p_de and p_ate
  group by e.patrocinador_id, p.nome, e.espaco
  order by p.nome, e.espaco;
end
$$;

revoke all on function public.escolher_patrocinador(text, uuid), public.contar_rodada_patrocinio(uuid, text),
  public.escolher_patrocinio_da_rodada() from anon, authenticated, public;
revoke all on function public.registrar_exibicoes(jsonb), public.relatorio_exibicoes(date, date) from anon, public;
grant execute on function public.registrar_exibicoes(jsonb), public.relatorio_exibicoes(date, date) to authenticated;

notify pgrst, 'reload schema';

select 'OK: espaços, rodízio com peso, período, fixo e relatório de patrocinadores' as resultado;
