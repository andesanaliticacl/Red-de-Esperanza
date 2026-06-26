-- ============================================================
-- Red de Esperanza — Migración 06: Foto de perfil (avatar)
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- Agrega `foto_url` al perfil y crea un bucket público de Storage llamado
-- `avatares` para que cada persona suba la foto que quiera.
-- ============================================================

-- Columna para la URL pública de la foto.
alter table perfiles add column if not exists foto_url text;

-- Bucket de Storage (público para lectura; la subida la limita la política).
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

-- Lectura pública de los avatares.
drop policy if exists "avatares lectura publica" on storage.objects;
create policy "avatares lectura publica" on storage.objects
  for select using (bucket_id = 'avatares');

-- Subir/actualizar: cualquier usuario autenticado (cada quien su foto).
drop policy if exists "avatares subir autenticado" on storage.objects;
create policy "avatares subir autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatares');

drop policy if exists "avatares actualizar autenticado" on storage.objects;
create policy "avatares actualizar autenticado" on storage.objects
  for update to authenticated using (bucket_id = 'avatares');

-- Incluir la foto en la vista pública (para mostrar el avatar en el chat, etc.).
create or replace view perfiles_publicos as
  select id, nombre, rol, foto_url from perfiles;
grant select on perfiles_publicos to anon, authenticated;
