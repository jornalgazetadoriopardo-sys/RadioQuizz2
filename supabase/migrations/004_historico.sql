-- =====================================================================
-- Pergunta da Hora — histórico de participação (auditoria)
-- Guarda uma cópia de cada participação: a pergunta como estava no momento, a resposta,
-- os horários (do servidor) e os pontos. Serve para atender reclamações.
-- - Ninguém altera pelo app: só as funções abrir_pergunta() e responder() escrevem aqui.
-- - Não é apagado ao zerar o ranking, reabrir ou excluir uma rodada.
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- =====================================================================

create table public.historico (
  id uuid primary key default gen_random_uuid(),
  -- protocolo curto para o ouvinte informar numa reclamação (ex.: 7F3A-91C2)
  protocolo text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 4) || '-' || substr(md5(gen_random_uuid()::text), 1, 4)),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  resposta_id uuid references public.respostas (id) on delete set null,
  rodada_id uuid references public.rodadas (id) on delete set null,
  -- cópia da rodada no momento da participação
  rodada_horario text not null,
  rodada_titulo text not null,
  categoria text not null default '',
  pergunta text not null,
  alternativas text[] not null,
  correta int not null,
  valor_pontos numeric(8, 2) not null,
  tempo_limite int not null,
  -- participação (horários do servidor)
  aberta_em timestamptz not null default now(),
  respondida_em timestamptz,
  alternativa int,
  acertou boolean,
  tempo_esgotado boolean,
  pontos numeric(8, 2),
  tempo_gasto numeric(7, 1),
  navegador text
);

create index historico_usuario on public.historico (usuario_id, aberta_em desc);
create index historico_aberta_em on public.historico (aberta_em desc);

alter table public.historico enable row level security;
revoke all on public.historico from anon, authenticated;
-- O ouvinte lê o próprio histórico pela função meu_historico() (que esconde o gabarito de pergunta ainda em aberto).
-- O admin lê tudo pela função historico_admin().

-- ---------------------------------------------------------------------
-- Funções do jogo, agora registrando o histórico
-- ---------------------------------------------------------------------
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
  if v_rodada.id is null or v_rodada.status <> 'no_ar' then
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

create or replace function public.responder(p_rodada uuid, p_alternativa int)
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
    -- Acertou dentro do tempo: ganha o valor cheio da rodada (a velocidade não conta).
    v_pontos := case when v_acertou then v_rodada.pontos else 0 end;

    update respostas
    set respondida_em = now(), alternativa = p_alternativa, acertou = v_acertou, tempo_esgotado = v_esgotado, pontos = v_pontos
    where id = v_resposta.id
    returning * into v_resposta;

    update historico
    set respondida_em = v_resposta.respondida_em, alternativa = p_alternativa, acertou = v_acertou,
        tempo_esgotado = v_esgotado, pontos = v_pontos, tempo_gasto = round(v_decorrido, 1)
    where resposta_id = v_resposta.id and respondida_em is null;
  end if;

  return json_build_object(
    'alternativa', v_resposta.alternativa,
    'acertou', v_resposta.acertou,
    'tempo_esgotado', v_resposta.tempo_esgotado,
    'pontos', v_resposta.pontos,
    'correta', v_conteudo.correta,
    'resposta_correta', v_conteudo.alternativas[v_conteudo.correta + 1],
    'explicacao', v_conteudo.explicacao,
    'protocolo', (select protocolo from historico where resposta_id = v_resposta.id order by aberta_em desc limit 1)
  );
end
$$;

-- ---------------------------------------------------------------------
-- Consultas
-- ---------------------------------------------------------------------

-- Histórico do próprio ouvinte. O gabarito só aparece depois que ele respondeu ou o tempo acabou.
create function public.meu_historico(p_limite int default 100)
returns table (
  protocolo text, rodada_horario text, rodada_titulo text, categoria text, pergunta text, alternativas text[],
  correta int, valor_pontos numeric, tempo_limite int, aberta_em timestamptz, respondida_em timestamptz,
  alternativa int, acertou boolean, tempo_esgotado boolean, pontos numeric, tempo_gasto numeric
)
language sql stable security definer set search_path = public
as $$
  select h.protocolo, h.rodada_horario, h.rodada_titulo, h.categoria, h.pergunta, h.alternativas,
         case when h.respondida_em is not null or now() > h.aberta_em + make_interval(secs => h.tempo_limite + 2)
              then h.correta end,
         h.valor_pontos, h.tempo_limite, h.aberta_em, h.respondida_em, h.alternativa, h.acertou, h.tempo_esgotado,
         h.pontos, h.tempo_gasto
  from historico h
  where h.usuario_id = auth.uid()
  order by h.aberta_em desc
  limit least(greatest(p_limite, 1), 500)
$$;

-- Histórico de todos (admin), com filtros. Datas no horário de Brasília.
create function public.historico_admin(p_busca text default null, p_de date default null, p_ate date default null, p_limite int default 300)
returns table (
  protocolo text, usuario_id uuid, nome text, email text, anonimo boolean, rodada_horario text, rodada_titulo text,
  categoria text, pergunta text, alternativas text[], correta int, valor_pontos numeric, tempo_limite int,
  aberta_em timestamptz, respondida_em timestamptz, alternativa int, acertou boolean, tempo_esgotado boolean,
  pontos numeric, tempo_gasto numeric, navegador text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'acesso_negado';
  end if;
  return query
  select h.protocolo, h.usuario_id, p.nome, u.email::text, coalesce(u.is_anonymous, false), h.rodada_horario, h.rodada_titulo,
         h.categoria, h.pergunta, h.alternativas, h.correta, h.valor_pontos, h.tempo_limite, h.aberta_em, h.respondida_em,
         h.alternativa, h.acertou, h.tempo_esgotado, h.pontos, h.tempo_gasto, h.navegador
  from historico h
  join perfis p on p.id = h.usuario_id
  left join auth.users u on u.id = h.usuario_id
  where (p_busca is null or p_busca = ''
         or p.nome ilike '%' || p_busca || '%'
         or u.email ilike '%' || p_busca || '%'
         or h.protocolo ilike '%' || p_busca || '%'
         or h.rodada_titulo ilike '%' || p_busca || '%')
    and (p_de is null or h.aberta_em >= (p_de::timestamp at time zone 'America/Sao_Paulo'))
    and (p_ate is null or h.aberta_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))
  order by h.aberta_em desc
  limit least(greatest(p_limite, 1), 2000);
end
$$;

revoke all on function public.meu_historico(int), public.historico_admin(text, date, date, int) from anon, public;
grant execute on function public.meu_historico(int), public.historico_admin(text, date, date, int) to authenticated;

-- ---------------------------------------------------------------------
-- Registra no histórico as participações que já existiam antes desta atualização
-- (com o conteúdo atual da pergunta, que é o que existe hoje).
-- ---------------------------------------------------------------------
insert into historico (usuario_id, resposta_id, rodada_id, rodada_horario, rodada_titulo, categoria, pergunta, alternativas,
                       correta, valor_pontos, tempo_limite, aberta_em, respondida_em, alternativa, acertou, tempo_esgotado,
                       pontos, tempo_gasto)
select r.usuario_id, r.id, r.rodada_id, ro.horario, ro.titulo, ro.categoria, c.pergunta, c.alternativas, c.correta, ro.pontos,
       ro.tempo_resposta, r.iniciada_em, r.respondida_em, r.alternativa, r.acertou, r.tempo_esgotado, r.pontos,
       round(extract(epoch from r.respondida_em - r.iniciada_em), 1)
from respostas r
join rodadas ro on ro.id = r.rodada_id
join rodadas_conteudo c on c.rodada_id = r.rodada_id
where not exists (select 1 from historico h where h.resposta_id = r.id);
