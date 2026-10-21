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
