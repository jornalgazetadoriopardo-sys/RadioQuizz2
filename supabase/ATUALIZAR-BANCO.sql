-- =====================================================================
-- Pergunta da Hora — ATUALIZAR O BANCO (tudo de uma vez)
-- Junta as atualizações 005 a 020 (agendamento, relógio, notificações, anúncios, segundos,
-- correção do agendamento, "Vou participar", todos juntos, imagem na pergunta, permissões dos
-- arquivos, cadastro com CPF, patrocínio com rodízio, modalidades, data final dos prêmios, banners horizontais, grade de inserções e até 2 anúncios por momento). Pode ser rodado mais de uma vez: o que já existe é mantido.
-- Como usar: Supabase → SQL Editor → New query → cole TODO este texto → Run.
-- No fim aparece uma tabela conferindo cada parte.
-- =====================================================================





-- #####################################################################
-- 005_agendamento.sql
-- #####################################################################

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

-- #####################################################################
-- 006_relogio.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — hora oficial do servidor
-- O app e o Painel Admin acertam o relógio por esta função, para não depender
-- do relógio do celular ou do computador (que pode estar adiantado ou atrasado).
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- =====================================================================

create or replace function public.agora_servidor()
returns timestamptz
language sql stable
as $$
  select now()
$$;

revoke all on function public.agora_servidor() from public;
grant execute on function public.agora_servidor() to anon, authenticated;

-- Avisa a API do Supabase para recarregar a lista de funções (evita o erro "schema cache").
notify pgrst, 'reload schema';

-- #####################################################################
-- 007_notificacoes.sql
-- #####################################################################

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

-- #####################################################################
-- 008_anuncios.sql
-- #####################################################################

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

-- #####################################################################
-- 009_segundos.sql
-- #####################################################################

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

-- #####################################################################
-- 010_corrige_agendamento.sql
-- #####################################################################

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

-- #####################################################################
-- 011_entrada_na_rodada.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — o tempo da rodada vale para ENTRAR
-- Problema: com rodadas curtas (ex.: 10 s no ar), a rodada fechava durante o anúncio
-- e o ouvinte que tinha entrado a tempo recebia "Esta rodada não está mais no ar".
-- Agora: quem tocou em "Responder" enquanto a rodada estava no ar garante a vaga.
-- Vê o anúncio e depois abre a pergunta normalmente, mesmo que a rodada já tenha fechado,
-- e continua com o tempo de resposta da pergunta (contado a partir de quando a pergunta aparece).
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run. Pode ser rodado mais de uma vez.
-- =====================================================================

create table if not exists public.rodadas_entradas (
  rodada_id uuid not null references public.rodadas (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (rodada_id, usuario_id)
);
-- só as funções abaixo leem e gravam
alter table public.rodadas_entradas enable row level security;

-- Prazo para ver o anúncio e abrir a pergunta depois de entrar: o anúncio mais longo + 20 s de folga.
-- (curto de propósito: quem entra não pode esperar o locutor dar a resposta para só então abrir a pergunta)
create or replace function public.prazo_entrada()
returns interval language sql stable security definer set search_path = public
as $$ select make_interval(secs => coalesce((select max(coalesce(duracao_segundos, 30)) from patrocinadores where ativo), 30) + 20) $$;

-- Ouvinte tocou em "Responder": só aceita com a rodada no ar.
create or replace function public.entrar_na_rodada(p_rodada uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_rodada rodadas;
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;

  select * into v_rodada from rodadas where id = p_rodada;
  if v_rodada.id is null or v_rodada.status <> 'no_ar' then
    raise exception 'rodada_fora_do_ar';
  end if;

  if exists (select 1 from respostas where rodada_id = p_rodada and usuario_id = auth.uid() and respondida_em is not null) then
    raise exception 'ja_respondida';
  end if;

  -- vale a primeira entrada desta vez no ar (se a rodada for reaberta, conta de novo)
  insert into rodadas_entradas (rodada_id, usuario_id) values (p_rodada, auth.uid())
  on conflict (rodada_id, usuario_id) do update
    set entrou_em = case when rodadas_entradas.entrou_em < coalesce(v_rodada.no_ar_em, '-infinity') then now()
                         else rodadas_entradas.entrou_em end;
end
$$;

-- Igual à do 004, mas aceita quem entrou a tempo mesmo com a rodada já fechada.
create or replace function public.abrir_pergunta(p_rodada uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_rodada rodadas;
  v_conteudo rodadas_conteudo;
  v_resposta respostas;
  v_nova boolean;
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;

  select * into v_rodada from rodadas where id = p_rodada;
  if v_rodada.id is null then
    raise exception 'rodada_fora_do_ar';
  end if;

  if v_rodada.status <> 'no_ar' and not exists (
    select 1 from rodadas_entradas e
    where e.rodada_id = p_rodada and e.usuario_id = auth.uid()
      and e.entrou_em >= coalesce(v_rodada.no_ar_em, '-infinity')
      and e.entrou_em > now() - prazo_entrada()
  ) then
    raise exception 'rodada_fora_do_ar';
  end if;

  insert into respostas (rodada_id, usuario_id) values (p_rodada, auth.uid())
  on conflict (rodada_id, usuario_id) do nothing;
  v_nova := found;

  select * into v_resposta from respostas where rodada_id = p_rodada and usuario_id = auth.uid();
  if v_resposta.respondida_em is not null then
    raise exception 'ja_respondida';
  end if;

  select * into v_conteudo from rodadas_conteudo where rodada_id = p_rodada;

  if v_nova then
    insert into historico (usuario_id, resposta_id, rodada_id, rodada_horario, rodada_titulo, categoria, pergunta,
                           alternativas, correta, valor_pontos, tempo_limite, aberta_em, navegador)
    values (auth.uid(), v_resposta.id, p_rodada, v_rodada.horario, v_rodada.titulo, v_rodada.categoria, v_conteudo.pergunta,
            v_conteudo.alternativas, v_conteudo.correta, v_rodada.pontos, v_rodada.tempo_resposta, v_resposta.iniciada_em,
            left(current_setting('request.headers', true)::json ->> 'user-agent', 300));
  end if;

  return json_build_object(
    'pergunta', v_conteudo.pergunta,
    'alternativas', v_conteudo.alternativas,
    'tempo_resposta', v_rodada.tempo_resposta,
    'segundos_restantes', greatest(0, v_rodada.tempo_resposta - extract(epoch from now() - v_resposta.iniciada_em))
  );
end
$$;

revoke all on function public.entrar_na_rodada(uuid) from anon, public;
grant execute on function public.entrar_na_rodada(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'OK: quem entra a tempo responde mesmo com a rodada fechando durante o anúncio' as resultado;

-- #####################################################################
-- 012_todos_juntos.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — todos começam juntos
-- Depois do "Vou participar", o relógio continua até o fim do tempo da rodada e só então começa o
-- anúncio e a pergunta, para todos ao mesmo tempo. Por isso o prazo para abrir a pergunta passa a contar
-- a partir do fim do tempo da rodada (antes contava a partir do toque, e quem confirmava cedo
-- numa rodada longa poderia perder a vaga).
-- Precisa do 010 e do 011. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

create or replace function public.abrir_pergunta(p_rodada uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_rodada rodadas;
  v_conteudo rodadas_conteudo;
  v_resposta respostas;
  v_nova boolean;
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;

  select * into v_rodada from rodadas where id = p_rodada;
  if v_rodada.id is null then
    raise exception 'rodada_fora_do_ar';
  end if;

  if v_rodada.status <> 'no_ar' and not exists (
    select 1 from rodadas_entradas e
    where e.rodada_id = p_rodada and e.usuario_id = auth.uid()
      and e.entrou_em >= coalesce(v_rodada.no_ar_em, '-infinity')
      -- o prazo conta a partir do fim do tempo para entrar (rodada automática) ou da entrada
      and greatest(e.entrou_em, case when v_rodada.modo = 'automatico' then coalesce(fim_da_rodada(v_rodada), e.entrou_em) else e.entrou_em end)
          > now() - prazo_entrada()
  ) then
    raise exception 'rodada_fora_do_ar';
  end if;

  insert into respostas (rodada_id, usuario_id) values (p_rodada, auth.uid())
  on conflict (rodada_id, usuario_id) do nothing;
  v_nova := found;

  select * into v_resposta from respostas where rodada_id = p_rodada and usuario_id = auth.uid();
  if v_resposta.respondida_em is not null then
    raise exception 'ja_respondida';
  end if;

  select * into v_conteudo from rodadas_conteudo where rodada_id = p_rodada;

  if v_nova then
    insert into historico (usuario_id, resposta_id, rodada_id, rodada_horario, rodada_titulo, categoria, pergunta,
                           alternativas, correta, valor_pontos, tempo_limite, aberta_em, navegador)
    values (auth.uid(), v_resposta.id, p_rodada, v_rodada.horario, v_rodada.titulo, v_rodada.categoria, v_conteudo.pergunta,
            v_conteudo.alternativas, v_conteudo.correta, v_rodada.pontos, v_rodada.tempo_resposta, v_resposta.iniciada_em,
            left(current_setting('request.headers', true)::json ->> 'user-agent', 300));
  end if;

  return json_build_object(
    'pergunta', v_conteudo.pergunta,
    'alternativas', v_conteudo.alternativas,
    'tempo_resposta', v_rodada.tempo_resposta,
    'segundos_restantes', greatest(0, v_rodada.tempo_resposta - extract(epoch from now() - v_resposta.iniciada_em))
  );
end
$$;

notify pgrst, 'reload schema';

select 'OK: todos os participantes começam a pergunta juntos' as resultado;

-- #####################################################################
-- 013_imagem_pergunta.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — imagem na pergunta
-- Cada pergunta pode ter uma imagem (ex.: "Quem é este cantor?"). Ela fica guardada junto com a
-- pergunta (parte secreta da rodada) e só chega ao celular quando a pergunta abre, como o texto.
-- O histórico de participações guarda qual imagem a pessoa viu.
-- Precisa do 012. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.rodadas_conteudo add column if not exists imagem_url text;
alter table public.historico add column if not exists imagem_url text;

create or replace function public.abrir_pergunta(p_rodada uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_rodada rodadas;
  v_conteudo rodadas_conteudo;
  v_resposta respostas;
  v_nova boolean;
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;

  select * into v_rodada from rodadas where id = p_rodada;
  if v_rodada.id is null then
    raise exception 'rodada_fora_do_ar';
  end if;

  if v_rodada.status <> 'no_ar' and not exists (
    select 1 from rodadas_entradas e
    where e.rodada_id = p_rodada and e.usuario_id = auth.uid()
      and e.entrou_em >= coalesce(v_rodada.no_ar_em, '-infinity')
      -- o prazo conta a partir do fim do tempo para entrar (rodada automática) ou da entrada
      and greatest(e.entrou_em, case when v_rodada.modo = 'automatico' then coalesce(fim_da_rodada(v_rodada), e.entrou_em) else e.entrou_em end)
          > now() - prazo_entrada()
  ) then
    raise exception 'rodada_fora_do_ar';
  end if;

  insert into respostas (rodada_id, usuario_id) values (p_rodada, auth.uid())
  on conflict (rodada_id, usuario_id) do nothing;
  v_nova := found;

  select * into v_resposta from respostas where rodada_id = p_rodada and usuario_id = auth.uid();
  if v_resposta.respondida_em is not null then
    raise exception 'ja_respondida';
  end if;

  select * into v_conteudo from rodadas_conteudo where rodada_id = p_rodada;

  if v_nova then
    insert into historico (usuario_id, resposta_id, rodada_id, rodada_horario, rodada_titulo, categoria, pergunta,
                           alternativas, correta, valor_pontos, tempo_limite, aberta_em, navegador, imagem_url)
    values (auth.uid(), v_resposta.id, p_rodada, v_rodada.horario, v_rodada.titulo, v_rodada.categoria, v_conteudo.pergunta,
            v_conteudo.alternativas, v_conteudo.correta, v_rodada.pontos, v_rodada.tempo_resposta, v_resposta.iniciada_em,
            left(current_setting('request.headers', true)::json ->> 'user-agent', 300), v_conteudo.imagem_url);
  end if;

  return json_build_object(
    'pergunta', v_conteudo.pergunta,
    'imagem_url', v_conteudo.imagem_url,
    'alternativas', v_conteudo.alternativas,
    'tempo_resposta', v_rodada.tempo_resposta,
    'segundos_restantes', greatest(0, v_rodada.tempo_resposta - extract(epoch from now() - v_resposta.iniciada_em))
  );
end
$$;

notify pgrst, 'reload schema';

select 'OK: perguntas com imagem' as resultado;

-- #####################################################################
-- 014_permissoes_arquivos.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — permissões para enviar imagens e vídeos
-- Corrige o erro "new row violates row-level security policy" ao enviar a imagem de uma
-- pergunta, o logotipo/fotos de um patrocinador ou o vídeo MP4 de um anúncio.
-- Garante que o espaço de arquivos "patrocinadores" existe e que só administradores enviam,
-- trocam, consultam e apagam arquivos nele (quem vê o app só abre os arquivos pelo link público).
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run. Pode ser rodado mais de uma vez.
-- =====================================================================

insert into storage.buckets (id, name, public) values ('patrocinadores', 'patrocinadores', true)
on conflict (id) do update set public = true;

drop policy if exists "admin envia logos" on storage.objects;
drop policy if exists "admin altera logos" on storage.objects;
drop policy if exists "admin apaga logos" on storage.objects;
drop policy if exists "admin consulta arquivos" on storage.objects;

create policy "admin envia logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'patrocinadores' and public.eh_admin());
create policy "admin altera logos" on storage.objects for update to authenticated
  using (bucket_id = 'patrocinadores' and public.eh_admin());
create policy "admin apaga logos" on storage.objects for delete to authenticated
  using (bucket_id = 'patrocinadores' and public.eh_admin());
create policy "admin consulta arquivos" on storage.objects for select to authenticated
  using (bucket_id = 'patrocinadores' and public.eh_admin());

-- Resultado: confere se quem está no painel como administrador está marcado no banco
select
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('admin envia logos', 'admin altera logos', 'admin apaga logos', 'admin consulta arquivos')) as regras_criadas,
  (select count(*) from public.perfis where admin) as administradores;

-- #####################################################################
-- 015_cadastro.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — cadastro do ouvinte (nome, CPF, WhatsApp)
-- Depois de entrar com Google ou e-mail, o ouvinte completa o cadastro uma vez só.
-- - O CPF é conferido aqui no servidor (dígitos verificadores) e cada CPF só pode ter uma conta.
-- - Os dados ficam no perfil, que só o próprio ouvinte e os administradores conseguem ler.
-- - Guarda quando a pessoa aceitou o uso dos dados (LGPD).
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run. Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.perfis
  add column if not exists email text,
  add column if not exists cpf text check (cpf ~ '^\d{11}$'),
  add column if not exists whatsapp text check (whatsapp ~ '^\d{10,11}$'),
  add column if not exists cadastro_em timestamptz;

create unique index if not exists perfis_cpf_unico on public.perfis (cpf) where cpf is not null;

-- Confere os dois dígitos verificadores do CPF (só números)
create or replace function public.cpf_valido(p_cpf text)
returns boolean
language plpgsql immutable
as $$
declare
  d int[];
  s int;
  dv int;
begin
  if p_cpf !~ '^\d{11}$' or p_cpf ~ '^(\d)\1{10}$' then
    return false;
  end if;
  d := array(select substr(p_cpf, i, 1)::int from generate_series(1, 11) i);
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if dv <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv = d[11];
end
$$;

-- O ouvinte completa (ou corrige) o próprio cadastro
create or replace function public.completar_cadastro(p_nome text, p_cpf text, p_whatsapp text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_zap text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  if auth.uid() is null then
    raise exception 'login_necessario';
  end if;
  if length(v_nome) < 3 then
    raise exception 'nome_invalido';
  end if;
  if not cpf_valido(v_cpf) then
    raise exception 'cpf_invalido';
  end if;
  -- com o 55 do Brasil na frente, tira
  if length(v_zap) in (12, 13) and v_zap like '55%' then
    v_zap := substr(v_zap, 3);
  end if;
  if v_zap !~ '^\d{10,11}$' then
    raise exception 'whatsapp_invalido';
  end if;
  if exists (select 1 from perfis where cpf = v_cpf and id <> auth.uid()) then
    raise exception 'cpf_em_uso';
  end if;

  update perfis
  set nome = left(v_nome, 60), cpf = v_cpf, whatsapp = v_zap,
      email = (select email from auth.users where id = auth.uid()),
      cadastro_em = coalesce(cadastro_em, now())
  where id = auth.uid();
end
$$;

revoke all on function public.completar_cadastro(text, text, text) from anon, public;
grant execute on function public.completar_cadastro(text, text, text) to authenticated;

notify pgrst, 'reload schema';

select 'OK: cadastro com CPF e WhatsApp pronto' as resultado;

-- #####################################################################
-- 016_patrocinio.sql
-- #####################################################################

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

-- #####################################################################
-- 017_modalidades_patrocinio.sql
-- #####################################################################

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

-- #####################################################################
-- 018_banners_horizontais.sql
-- #####################################################################

-- =====================================================================
-- Pergunta da Hora — banners horizontais para as outras posições
-- Cada anunciante pode ter:
--   banners             → até 3 banners VERTICAIS (9:16), para os anúncios de 15 s e 30 s
--   banners_horizontais → até 3 banners HORIZONTAIS (16:9), para a tela inicial e as telas de espera
-- Precisa do 017. Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table public.patrocinadores add column if not exists banners_horizontais text[] not null default '{}';

alter table public.patrocinadores drop constraint if exists patrocinadores_banners_horizontais_max;
alter table public.patrocinadores add constraint patrocinadores_banners_horizontais_max check (cardinality(banners_horizontais) <= 3);

notify pgrst, 'reload schema';

select 'OK: banners horizontais para as outras posições' as resultado;

-- #####################################################################
-- 019_grade_insercoes.sql
-- #####################################################################

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
drop function if exists public.relatorio_insercoes(date, date, uuid); -- o 020 muda as colunas
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

-- #####################################################################
-- 020_dois_anuncios.sql
-- #####################################################################

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

-- #####################################################################
-- Conferência final
-- #####################################################################
select parte, case when ok then 'OK' else 'FALTANDO' end as situacao from (values
  ('Agendamento (005/009)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rodadas' and column_name = 'horario_fim')),
  ('Relógio (006)', exists (select 1 from pg_proc where proname = 'agora_servidor')),
  ('Notificações (007)', to_regclass('public.push_inscricoes') is not null),
  ('Anúncios (008)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'patrocinadores' and column_name = 'layout')),
  ('Diagnóstico do agendamento (010)', exists (select 1 from pg_proc where proname = 'diagnostico_agendamento')),
  ('Vou participar (011)', to_regclass('public.rodadas_entradas') is not null),
  ('Imagem na pergunta (013)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rodadas_conteudo' and column_name = 'imagem_url')),
  ('Permissões dos arquivos (014)', exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'admin consulta arquivos')),
  ('Cadastro com CPF (015)', exists (select 1 from pg_proc where proname = 'completar_cadastro')),
  ('Patrocínio: espaços, peso e relatório (016)', exists (select 1 from pg_proc where proname = 'escolher_patrocinador')),
  ('Banners, rotativo/fixo e data final dos prêmios (017)', exists (select 1 from pg_proc where proname = 'patrocinador_rotativo')),
  ('Banners horizontais (018)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'patrocinadores' and column_name = 'banners_horizontais')),
  ('Grade de inserções (019)', to_regclass('public.grade_insercoes') is not null),
  ('Até 2 anúncios antes e depois (020)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rodadas' and column_name = 'patrocinador_pergunta2')),
  ('Agendador automático (pg_cron)', exists (select 1 from pg_extension where extname = 'pg_cron'))
) as t(parte, ok);
