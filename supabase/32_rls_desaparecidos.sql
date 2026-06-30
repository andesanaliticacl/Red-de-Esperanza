-- ============================================================
-- Red de Esperanza — Migración 32: Activar RLS en `desaparecidos`
-- Ejecutar UNA vez en Supabase (SQL Editor).
--
-- ⚠️ SEGURIDAD: la tabla `desaparecidos` se creó a mano (no por estas
-- migraciones) y quedó SIN Row-Level Security. Sin RLS, cualquiera con la URL
-- del proyecto y la llave pública (que va en el navegador) podía leer, EDITAR y
-- BORRAR todos sus registros por la API. Esto lo cierra.
--
-- Tras activar RLS:
--   · Lectura pública: SÍ (se muestra en el mapa, como hasta ahora).
--   · Insertar / actualizar: el scraper usa la SERVICE_ROLE key, que IGNORA RLS,
--     así que sigue funcionando. Nadie más puede escribir.
--   · Borrar: solo el admin (desde el panel de scraping).
-- ============================================================

alter table public.desaparecidos enable row level security;

-- Lectura: cualquiera (el mapa público los muestra).
drop policy if exists "leer desaparecidos" on public.desaparecidos;
create policy "leer desaparecidos" on public.desaparecidos for select using (true);

-- Borrar: solo admin (el scraper, con service_role, no necesita política).
drop policy if exists "borrar desaparecidos admin" on public.desaparecidos;
create policy "borrar desaparecidos admin" on public.desaparecidos for delete
  using (public.tiene_rol(array['admin']::rol_usuario[]));
