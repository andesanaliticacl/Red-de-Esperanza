-- ============================================================
-- Red de Esperanza — Migración 52: Necesidad de "mascota" con foto
-- Ejecutar UNA vez DESPUÉS de 51, en: SQL Editor → New query → Run
--
-- Permite levantar una solicitud de mascota/animal (perdido, encontrado o
-- que necesita ayuda) con una FOTO. La foto se comprime en el navegador a
-- WebP liviano (~0,3 MB) y se sube al bucket público `mascotas`; en la
-- necesidad solo se guarda la URL (columna foto_url).
--
-- Incluye: el tipo nuevo, la columna foto_url, el bucket de Storage y la
-- política que deja subir la imagen (también a visitantes anónimos, porque
-- reportar no requiere cuenta).
-- ============================================================

-- 1) Tipo nuevo (autodetecta enum o texto libre).
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'necesidad_tipo' and n.nspname = 'public'
  ) then
    alter type public.necesidad_tipo add value if not exists 'mascota';
    raise notice 'Enum necesidad_tipo actualizado: mascota agregado.';
  else
    raise notice 'No existe el enum necesidad_tipo: la columna tipo es texto libre; no hay nada que migrar.';
  end if;
end $$;

-- 2) Columna para la URL de la foto (no sensible: es la foto del animal).
alter table necesidades add column if not exists foto_url text;

-- 3) Bucket público de Storage para las fotos de mascotas.
insert into storage.buckets (id, name, public)
values ('mascotas', 'mascotas', true)
on conflict (id) do nothing;

-- 4) Subir fotos al bucket 'mascotas': cualquiera (anónimo incluido, porque
--    reportar no exige cuenta). La lectura es pública por ser bucket público.
drop policy if exists "subir foto mascota" on storage.objects;
create policy "subir foto mascota" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'mascotas');
