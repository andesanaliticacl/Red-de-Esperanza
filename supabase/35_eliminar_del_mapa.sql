-- ============================================================
-- Red de Esperanza — Migración 35: Eliminar solicitudes del mapa (borrado suave)
-- Ejecutar UNA vez en Supabase (SQL Editor → New query → Run).
--
-- Un líder de voluntarios o un admin puede QUITAR del mapa una necesidad/SOS
-- (p. ej. spam, duplicados, ya resuelto por fuera). NO se borra la fila: se
-- marca como "eliminada del mapa" para dejar un REGISTRO de qué se quitó, quién
-- lo hizo y cuándo, y poder restaurarla. El público deja de verla en el mapa;
-- el personal la sigue viendo en "Atender solicitudes" filtrando por eliminadas.
-- ============================================================

-- 1) Marca de borrado suave + auditoría (quién, cuándo y POR QUÉ).
alter table necesidades add column if not exists eliminada_del_mapa boolean not null default false;
alter table necesidades add column if not exists eliminada_en timestamptz;
alter table necesidades add column if not exists eliminada_por uuid references perfiles(id);
alter table necesidades add column if not exists motivo_eliminacion text;

-- Índice para listar rápido las eliminadas (el registro).
create index if not exists idx_necesidades_eliminadas
  on necesidades (eliminada_del_mapa) where eliminada_del_mapa = true;

-- 2) Lectura: el público ve SOLO lo activo (ni rechazada ni eliminada del mapa).
--    · verificador/admin ven todo (incluye rechazadas).
--    · el personal que atiende (voluntario/rescatista, y líder vía tiene_rol)
--      ve además las eliminadas del mapa, para el registro en "Atender".
drop policy if exists "leer necesidades" on necesidades;
create policy "leer necesidades" on necesidades for select using (
  (estado <> 'rechazada' and coalesce(eliminada_del_mapa, false) = false)
  or public.tiene_rol(array['verificador','admin']::rol_usuario[])
  or (
    coalesce(eliminada_del_mapa, false) = true
    and public.tiene_rol(array['voluntario','rescatista']::rol_usuario[])
  )
);

-- 3) Solo un LÍDER de voluntarios o un ADMIN puede eliminar/restaurar del mapa.
--    Se hace por función (SECURITY DEFINER) para que la restricción de rol viva
--    en un solo sitio: la política de UPDATE deja a cualquier voluntario cambiar
--    estado/asignado, así que el permiso fino de "eliminar" se valida aquí.
-- Se recrea con el parámetro del motivo. Quitamos la versión anterior (2 args)
-- para que no queden dos funciones y la llamada quede sin ambigüedad.
drop function if exists public.eliminar_necesidad_del_mapa(uuid, boolean);

create or replace function public.eliminar_necesidad_del_mapa(
  p_id uuid,
  p_eliminar boolean default true,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from perfiles
    where id = auth.uid() and rol::text in ('admin', 'lider_voluntarios')
  ) then
    raise exception 'Solo un líder de voluntarios o un administrador puede eliminar solicitudes del mapa';
  end if;

  update necesidades
     set eliminada_del_mapa = p_eliminar,
         eliminada_en = case when p_eliminar then now() else null end,
         eliminada_por = case when p_eliminar then auth.uid() else null end,
         motivo_eliminacion = case when p_eliminar then p_motivo else null end
   where id = p_id;
end;
$$;

grant execute on function public.eliminar_necesidad_del_mapa(uuid, boolean, text) to authenticated;
