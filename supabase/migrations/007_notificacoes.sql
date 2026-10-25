-- =====================================================================
-- Pergunta da Hora — notificações no celular (Web Push, pelo link do site)
-- - O ouvinte toca em "Quero ser avisado" e o celular fica inscrito.
-- - Avisos automáticos (o admin liga/desliga e edita os textos):
--     · "no ar": quando a rodada entra no ar (botão ou agendador);
--     · "lembrete": X minutos antes do horário da rodada.
-- - Mensagens avulsas (na hora ou agendadas) e disparo manual de uma rodada pelo Painel.
-- Quem envia é a função "enviar-push" (supabase/functions/enviar-push).
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Depois publique a função (LEIA-ME-SUPABASE.md → Notificações). Pode ser rodado mais de uma vez.
-- =====================================================================

-- Endereço da função de envio neste projeto (troque se mudar de projeto Supabase).
create or replace function public.url_funcao_push()
returns text
language sql immutable
as $$ select 'https://sxhwkkplxaotpxtgbzqe.supabase.co/functions/v1/enviar-push' $$;

-- Celulares inscritos
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  navegador text,
  criada_em timestamptz not null default now()
);
create index if not exists push_inscricoes_usuario on public.push_inscricoes (usuario_id);

-- Chaves de envio (VAPID), geradas pela própria função na primeira vez. Só o servidor lê.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  publica text not null,
  privada text not null,
  criada_em timestamptz not null default now()
);

-- Registro de cada envio
create table if not exists public.push_envios (
  id uuid primary key default gen_random_uuid(),
  motivo text not null check (motivo in ('rodada', 'lembrete', 'manual', 'avulsa', 'agendada')),
  rodada_id uuid references public.rodadas (id) on delete set null,
  -- "rodada": quando entrou no ar · "lembrete": horário previsto de início
  rodada_no_ar_em timestamptz,
  titulo text not null,
  corpo text not null,
  enviado_por uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  enviados int not null default 0,
  falhas int not null default 0,
  removidas int not null default 0
);
-- Cada entrada no ar (e cada lembrete) gera no máximo um aviso.
drop index if exists public.push_envios_uma_vez;
create unique index push_envios_uma_vez on public.push_envios (motivo, rodada_id, rodada_no_ar_em) where motivo in ('rodada', 'lembrete');

-- Mensagens avulsas agendadas para data e hora
create table if not exists public.push_agendados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 1 and 80),
  corpo text not null check (length(corpo) between 1 and 240),
  enviar_em timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'cancelado')),
  envio_id uuid references public.push_envios (id) on delete set null,
  criado_por uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists push_agendados_pendentes on public.push_agendados (enviar_em) where status = 'pendente';

-- Configurações dos avisos (Painel Admin → Avisos)
alter table public.configuracoes
  add column if not exists aviso_automatico boolean not null default true,
  add column if not exists lembrete_ativo boolean not null default true,
  add column if not exists lembrete_minutos int not null default 5 check (lembrete_minutos between 1 and 240),
  add column if not exists modelo_no_ar_titulo text not null default 'A pergunta das {horario} está no ar!',
  add column if not exists modelo_no_ar_corpo text not null default '{titulo} · vale {pontos} pontos. Toque para responder.',
  add column if not exists modelo_lembrete_titulo text not null default 'Daqui a {minutos} minutos tem pergunta!',
  add column if not exists modelo_lembrete_corpo text not null default 'Às {horario}: {titulo}, valendo {pontos} pontos. Fique ligado na rádio!';

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table public.push_inscricoes enable row level security;
alter table public.push_config enable row level security;
alter table public.push_envios enable row level security;
alter table public.push_agendados enable row level security;
revoke all on public.push_inscricoes, public.push_config, public.push_envios, public.push_agendados from anon, authenticated;

grant select on public.push_envios to authenticated;
drop policy if exists "admin vê envios" on public.push_envios;
create policy "admin vê envios" on public.push_envios for select to authenticated using (public.eh_admin());

grant select, insert, update on public.push_agendados to authenticated;
drop policy if exists "admin gerencia agendados" on public.push_agendados;
create policy "admin gerencia agendados" on public.push_agendados for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- Funções chamadas pelo app
-- ---------------------------------------------------------------------
create or replace function public.chave_publica_push()
returns text
language sql stable security definer set search_path = public
as $$ select publica from push_config where id = 1 $$;

create or replace function public.inscrever_push(p_endpoint text, p_p256dh text, p_auth text, p_navegador text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'endereco_invalido';
  end if;
  insert into push_inscricoes (usuario_id, endpoint, p256dh, auth, navegador)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_navegador, 300))
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, navegador = excluded.navegador;
end
$$;

create or replace function public.cancelar_push(p_endpoint text)
returns void
language sql security definer set search_path = public
as $$ delete from push_inscricoes where endpoint = p_endpoint and usuario_id = auth.uid() $$;

-- Resumo para o Painel Admin
create or replace function public.push_resumo()
returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  return json_build_object(
    'inscritos', (select count(*) from push_inscricoes),
    'ouvintes', (select count(distinct usuario_id) from push_inscricoes),
    'funcao_pronta', exists (select 1 from push_config)
  );
end
$$;

revoke all on function public.chave_publica_push(), public.inscrever_push(text, text, text, text),
  public.cancelar_push(text), public.push_resumo(), public.url_funcao_push() from anon, public;
grant execute on function public.chave_publica_push(), public.inscrever_push(text, text, text, text),
  public.cancelar_push(text), public.push_resumo() to authenticated;

-- ---------------------------------------------------------------------
-- Chamada à função de envio (pg_net)
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível: %', sqlerrm;
end
$$;

create or replace function public.chamar_envio_push(p_pedido jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform net.http_post(url := url_funcao_push(), body := p_pedido, headers := '{"Content-Type": "application/json"}'::jsonb);
exception when others then
  -- se o envio falhar, nada mais é afetado (a rodada entra no ar do mesmo jeito)
  raise warning 'aviso por notificação falhou: %', sqlerrm;
end
$$;
revoke all on function public.chamar_envio_push(jsonb) from anon, authenticated, public;

-- Aviso "no ar"
create or replace function public.avisar_rodada_no_ar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'no_ar' and old.status is distinct from 'no_ar'
     and coalesce((select aviso_automatico from configuracoes where id = 1), true) then
    perform chamar_envio_push(jsonb_build_object('tipo', 'rodada', 'rodada_id', new.id));
  end if;
  return new;
end
$$;

drop trigger if exists ao_entrar_no_ar on public.rodadas;
create trigger ao_entrar_no_ar
after update of status on public.rodadas
for each row execute function public.avisar_rodada_no_ar();

-- Lembretes "X minutos antes" e mensagens agendadas. Roda sozinha a cada 30 s (pg_cron, abaixo).
create or replace function public.processar_avisos()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg configuracoes;
  v_r record;
  v_a record;
begin
  select * into v_cfg from configuracoes where id = 1;

  if coalesce(v_cfg.lembrete_ativo, false) then
    for v_r in
      select r.id
      from rodadas r
      where r.status = 'agendada' and r.data is not null
        and ((r.data + r.horario::time) at time zone 'America/Sao_Paulo') > now()
        and ((r.data + r.horario::time) at time zone 'America/Sao_Paulo') - make_interval(mins => v_cfg.lembrete_minutos) <= now()
        and not exists (
          select 1 from push_envios e
          where e.motivo = 'lembrete' and e.rodada_id = r.id
            and e.rodada_no_ar_em = ((r.data + r.horario::time) at time zone 'America/Sao_Paulo')
        )
    loop
      perform chamar_envio_push(jsonb_build_object('tipo', 'lembrete', 'rodada_id', v_r.id));
    end loop;
  end if;

  for v_a in
    update push_agendados set status = 'enviando'
    where status = 'pendente' and enviar_em <= now()
    returning id
  loop
    perform chamar_envio_push(jsonb_build_object('tipo', 'agendada', 'id', v_a.id));
  end loop;
end
$$;
revoke all on function public.processar_avisos() from anon, authenticated, public;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron indisponível: lembretes e mensagens agendadas não vão sair sozinhos';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'quiz-avisos') then
    perform cron.unschedule('quiz-avisos');
  end if;
  begin
    perform cron.schedule('quiz-avisos', '30 seconds', 'select public.processar_avisos()');
  exception when others then
    perform cron.schedule('quiz-avisos', '* * * * *', 'select public.processar_avisos()');
  end;
end
$$;

-- Avisa a API do Supabase para recarregar a lista de funções (evita o erro "schema cache").
notify pgrst, 'reload schema';

select case
  when not exists (select 1 from pg_extension where extname = 'pg_net')
    then 'ATENÇÃO: ative a extensão pg_net em Database → Extensions e rode este arquivo de novo'
  when not exists (select 1 from pg_extension where extname = 'pg_cron')
    then 'ATENÇÃO: ative a extensão pg_cron em Database → Extensions e rode este arquivo de novo'
  else 'OK: banco pronto. Agora publique a função enviar-push.'
end as resultado;
