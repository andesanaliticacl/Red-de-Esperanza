-- ============================================================
-- Red de Esperanza — Migración 34: Origen del reporte + límite por teléfono
-- Ejecutar UNA vez en Supabase (SQL Editor).
--
-- 1) Guardar desde qué PAÍS y CIUDAD (aprox. por IP) se creó cada reporte/SOS,
--    además del punto que la persona eligió en el mapa. Se guarda en la tabla
--    PRIVADA `contactos_necesidad` (solo personal la lee), junto al teléfono.
-- 2) Función para contar cuántos reportes se han creado HOY con un mismo
--    teléfono, y así bloquear a partir del 4.º (máximo 3 por día).
-- ============================================================

-- 1) Origen (país/ciudad de quien creó la solicitud).
alter table contactos_necesidad add column if not exists pais_origen text;
alter table contactos_necesidad add column if not exists ciudad_origen text;

-- 2) Cuántas solicitudes se han creado HOY (hora de Venezuela) con ese teléfono.
--    Compara por dígitos (ignora "+", espacios, guiones). Es SECURITY DEFINER
--    para que incluso un reportante anónimo pueda validarlo antes de crear.
create or replace function public.reportes_hoy_por_telefono(p_tel text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from contactos_necesidad c
  join necesidades n on n.id = c.necesidad_id
  where regexp_replace(c.contacto, '\D', '', 'g')
        = regexp_replace(coalesce(p_tel, ''), '\D', '', 'g')
    and n.creado_en >= (
      date_trunc('day', now() at time zone 'America/Caracas')
        at time zone 'America/Caracas'
    );
$$;

grant execute on function public.reportes_hoy_por_telefono(text) to anon, authenticated;
