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
