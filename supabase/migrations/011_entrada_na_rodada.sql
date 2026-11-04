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
