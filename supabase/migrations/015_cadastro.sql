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
