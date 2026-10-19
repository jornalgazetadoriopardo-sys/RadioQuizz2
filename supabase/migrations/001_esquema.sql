-- =====================================================================
-- Pergunta da Hora — esquema do banco de dados
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Rode UMA vez num projeto novo. Depois rode 002_dados_exemplo.sql (opcional).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfis (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  admin boolean not null default false,
  criado_em timestamptz not null default now()
);

create function public.eh_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select admin from public.perfis where id = auth.uid()), false)
$$;

-- Cria o perfil automaticamente quando alguém faz o primeiro login.
create function public.criar_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger ao_criar_usuario
after insert on auth.users
for each row execute function public.criar_perfil();

-- ---------------------------------------------------------------------
-- Rodadas: a parte pública (card da tela inicial e grade)
-- ---------------------------------------------------------------------
create table public.rodadas (
  id uuid primary key default gen_random_uuid(),
  horario text not null check (horario ~ '^\d{2}:\d{2}$'),
  categoria text not null default '',
  titulo text not null,
  descricao text not null default '',
  nivel text not null default 'Médio',
  pontos numeric(8, 2) not null check (pontos >= 0),
  tempo_resposta int not null default 15 check (tempo_resposta between 5 and 120),
  status text not null default 'agendada' check (status in ('agendada', 'no_ar', 'encerrada')),
  no_ar_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Só uma rodada pode estar no ar por vez.
create unique index rodadas_uma_no_ar on public.rodadas ((true)) where status = 'no_ar';

-- Rodadas: a parte secreta. Só o admin lê; o ouvinte recebe a pergunta pela
-- função abrir_pergunta() (que dispara o cronômetro) e o gabarito só depois de responder.
create table public.rodadas_conteudo (
  rodada_id uuid primary key references public.rodadas (id) on delete cascade,
  pergunta text not null,
  alternativas text[] not null check (array_length(alternativas, 1) between 2 and 6),
  correta int not null,
  explicacao text not null default '',
  check (correta >= 0 and correta < array_length(alternativas, 1))
);

-- ---------------------------------------------------------------------
-- Respostas (escritas só pelas funções abaixo, nunca direto pelo app)
-- ---------------------------------------------------------------------
create table public.respostas (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.rodadas (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  iniciada_em timestamptz not null default now(),
  respondida_em timestamptz,
  alternativa int,
  acertou boolean,
  tempo_esgotado boolean not null default false,
  pontos numeric(8, 2) not null default 0,
  unique (rodada_id, usuario_id)
);

create index respostas_respondida_em on public.respostas (respondida_em);

-- ---------------------------------------------------------------------
-- Patrocinadores, prêmios, configurações e feedback da equipe
-- ---------------------------------------------------------------------
create table public.patrocinadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slogan text not null default '',
  descricao text not null default '',
  icone text not null default 'Store',
  cor text not null default 'amber',
  logo_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.premios (
  id uuid primary key default gen_random_uuid(),
  colocacao int not null check (colocacao > 0),
  titulo text not null,
  oferecido_por text not null default ''
);

create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  modo_apresentacao boolean not null default false
);
insert into public.configuracoes (id) values (1);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.perfis (id) on delete set null,
  mensagem text not null check (length(mensagem) between 1 and 2000),
  tela text,
  navegador text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Segurança (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.rodadas enable row level security;
alter table public.rodadas_conteudo enable row level security;
alter table public.respostas enable row level security;
alter table public.patrocinadores enable row level security;
alter table public.premios enable row level security;
alter table public.configuracoes enable row level security;
alter table public.feedback enable row level security;

-- Visitantes sem login não acessam nada.
revoke all on all tables in schema public from anon;

grant select on public.perfis, public.rodadas, public.respostas, public.patrocinadores, public.premios, public.configuracoes to authenticated;
grant insert, update, delete on public.rodadas, public.patrocinadores, public.premios to authenticated;
grant select, insert, update, delete on public.rodadas_conteudo to authenticated;
grant update on public.configuracoes to authenticated;
grant select, insert on public.feedback to authenticated;
-- O ouvinte só pode mudar o próprio nome (nunca a coluna "admin").
grant update (nome) on public.perfis to authenticated;

create policy "ver o próprio perfil" on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_admin());
create policy "editar o próprio nome" on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "todos veem as rodadas" on public.rodadas for select to authenticated using (true);
create policy "admin gerencia rodadas" on public.rodadas for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "só admin vê o conteúdo" on public.rodadas_conteudo for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "ver as próprias respostas" on public.respostas for select to authenticated
  using (usuario_id = auth.uid() or public.eh_admin());

create policy "todos veem patrocinadores" on public.patrocinadores for select to authenticated using (true);
create policy "admin gerencia patrocinadores" on public.patrocinadores for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "todos veem prêmios" on public.premios for select to authenticated using (true);
create policy "admin gerencia prêmios" on public.premios for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "todos veem configurações" on public.configuracoes for select to authenticated using (true);
create policy "admin altera configurações" on public.configuracoes for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "enviar feedback" on public.feedback for insert to authenticated
  with check (usuario_id = auth.uid());
create policy "admin lê feedback" on public.feedback for select to authenticated
  using (public.eh_admin());

-- ---------------------------------------------------------------------
-- Funções do jogo (rodam no servidor; o app só chama)
-- ---------------------------------------------------------------------

-- Ouvinte terminou o 1º anúncio: registra a hora de início (relógio do servidor)
-- e devolve a pergunta. Se ele sair e voltar, o cronômetro continua de onde estava.
create function public.abrir_pergunta(p_rodada uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_rodada rodadas;
  v_conteudo rodadas_conteudo;
  v_resposta respostas;
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;

  select * into v_rodada from rodadas where id = p_rodada;
  if v_rodada.id is null or v_rodada.status <> 'no_ar' then
    raise exception 'rodada_fora_do_ar';
  end if;

  insert into respostas (rodada_id, usuario_id) values (p_rodada, auth.uid())
  on conflict (rodada_id, usuario_id) do nothing;

  select * into v_resposta from respostas where rodada_id = p_rodada and usuario_id = auth.uid();
  if v_resposta.respondida_em is not null then
    raise exception 'ja_respondida';
  end if;

  select * into v_conteudo from rodadas_conteudo where rodada_id = p_rodada;

  return json_build_object(
    'pergunta', v_conteudo.pergunta,
    'alternativas', v_conteudo.alternativas,
    'tempo_resposta', v_rodada.tempo_resposta,
    'segundos_restantes', greatest(0, v_rodada.tempo_resposta - extract(epoch from now() - v_resposta.iniciada_em))
  );
end
$$;

-- Ouvinte respondeu (ou o tempo acabou: p_alternativa = null).
-- Confere a resposta, calcula os pontos e devolve o gabarito. Chamar de novo devolve o mesmo resultado.
create function public.responder(p_rodada uuid, p_alternativa int)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_rodada rodadas;
  v_conteudo rodadas_conteudo;
  v_resposta respostas;
  v_decorrido numeric;
  v_esgotado boolean;
  v_acertou boolean;
  v_pontos numeric(8, 2);
  -- folga para a demora da internet entre o clique e a chegada ao servidor
  c_tolerancia constant numeric := 1.5;
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;

  select * into v_resposta from respostas
  where rodada_id = p_rodada and usuario_id = auth.uid()
  for update;
  if v_resposta.id is null then
    raise exception 'pergunta_nao_aberta';
  end if;

  select * into v_rodada from rodadas where id = p_rodada;
  select * into v_conteudo from rodadas_conteudo where rodada_id = p_rodada;

  if v_resposta.respondida_em is null then
    v_decorrido := extract(epoch from now() - v_resposta.iniciada_em);
    v_esgotado := p_alternativa is null or v_decorrido > v_rodada.tempo_resposta + c_tolerancia;
    v_acertou := not v_esgotado and p_alternativa = v_conteudo.correta;
    v_pontos := case
      when v_acertou then round(v_rodada.pontos * (0.5 + 0.5 * greatest(0, v_rodada.tempo_resposta - v_decorrido) / v_rodada.tempo_resposta), 2)
      else 0
    end;

    update respostas
    set respondida_em = now(), alternativa = p_alternativa, acertou = v_acertou, tempo_esgotado = v_esgotado, pontos = v_pontos
    where id = v_resposta.id
    returning * into v_resposta;
  end if;

  return json_build_object(
    'alternativa', v_resposta.alternativa,
    'acertou', v_resposta.acertou,
    'tempo_esgotado', v_resposta.tempo_esgotado,
    'pontos', v_resposta.pontos,
    'correta', v_conteudo.correta,
    'resposta_correta', v_conteudo.alternativas[v_conteudo.correta + 1],
    'explicacao', v_conteudo.explicacao
  );
end
$$;

-- Segunda-feira 00:00 (horário de Brasília): o ranking semanal recomeça sozinho.
create function public.inicio_semana()
returns timestamptz
language sql stable
as $$
  select date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- Ranking da semana: os primeiros colocados + a linha de quem está consultando.
create function public.ranking_semana(p_limite int default 10)
returns table (posicao bigint, nome text, pontos numeric, eu boolean)
language sql stable security definer set search_path = public
as $$
  with totais as (
    select p.id, p.nome, sum(r.pontos) as pontos, max(r.respondida_em) as ultima
    from respostas r
    join perfis p on p.id = r.usuario_id
    where r.respondida_em >= inicio_semana() and r.pontos > 0
    group by p.id, p.nome
  ),
  ordenado as (
    select *, row_number() over (order by pontos desc, ultima asc) as posicao from totais
  )
  select posicao, coalesce(nullif(nome, ''), 'Ouvinte'), pontos, id = auth.uid()
  from ordenado
  where posicao <= p_limite or id = auth.uid()
  order by posicao
$$;

-- Admin: coloca uma rodada no ar (e tira a anterior).
-- p_limpar = true apaga as respostas anteriores dessa rodada (para repetir em testes).
create function public.colocar_no_ar(p_rodada uuid, p_limpar boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  update rodadas set status = 'encerrada' where status = 'no_ar' and id <> p_rodada;
  if p_limpar then
    delete from respostas where rodada_id = p_rodada;
  end if;
  update rodadas set status = 'no_ar', no_ar_em = now() where id = p_rodada;
end
$$;

create function public.encerrar_rodada(p_rodada uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  update rodadas set status = 'encerrada' where id = p_rodada;
end
$$;

-- Admin: apaga todas as respostas (zera o ranking) — útil na fase de testes.
create function public.apagar_todas_respostas()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  delete from respostas where true;
  update rodadas set status = 'agendada', no_ar_em = null where true;
end
$$;

-- As funções só podem ser chamadas por quem fez login.
revoke all on all functions in schema public from anon, public;
grant execute on function public.eh_admin(), public.abrir_pergunta(uuid), public.responder(uuid, int),
  public.inicio_semana(), public.ranking_semana(int), public.colocar_no_ar(uuid, boolean),
  public.encerrar_rodada(uuid), public.apagar_todas_respostas()
to authenticated;

-- ---------------------------------------------------------------------
-- Tempo real: o app é avisado na hora quando uma rodada entra no ar
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.rodadas, public.respostas, public.configuracoes, public.patrocinadores, public.premios;

-- ---------------------------------------------------------------------
-- Arquivos: logos dos patrocinadores (bucket público, só admin envia)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('patrocinadores', 'patrocinadores', true)
on conflict (id) do nothing;

create policy "admin envia logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'patrocinadores' and public.eh_admin());
create policy "admin altera logos" on storage.objects for update to authenticated
  using (bucket_id = 'patrocinadores' and public.eh_admin());
create policy "admin apaga logos" on storage.objects for delete to authenticated
  using (bucket_id = 'patrocinadores' and public.eh_admin());
