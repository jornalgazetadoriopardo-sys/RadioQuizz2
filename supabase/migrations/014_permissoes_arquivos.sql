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
