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
