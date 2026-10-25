-- =====================================================================
-- Pergunta da Hora — pontuação fixa por pergunta
-- Quem acerta dentro do tempo ganha o valor cheio da rodada; a velocidade não conta mais.
-- O tempo limite (definido pelo admin em cada rodada) continua sendo medido no servidor:
-- resposta enviada depois do tempo vale 0.
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- =====================================================================

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

-- Avisa a API do Supabase para recarregar a lista de funções (evita o erro "schema cache").
notify pgrst, 'reload schema';
