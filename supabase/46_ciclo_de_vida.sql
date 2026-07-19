-- ============================================================
-- Red de Esperanza — Migración 46: Ciclo de vida de 4 días
-- Ejecutar UNA vez DESPUÉS de 45, en: SQL Editor → New query → Run
--
-- Las necesidades y los centros de acopio se OCULTAN (no se borran)
-- si nadie los "refresca" en 4 días. CUALQUIER persona (incluso sin
-- cuenta) puede refrescar: el contador SIEMPRE vuelve a 4 días
-- completos y se registra cuántas veces se ha refrescado.
--
-- NO expiran (el filtro vive en las consultas de la app):
--   - Necesidades tipo 'derrumbe' (edificios colapsados).
--   - Necesidades tipo 'atencion_psicologica' (tienen su propio
--     ciclo: abierta → seguimiento → cerrada por el equipo).
--   - Hospitales (fila de centros_acopio con es_hospital = true).
--
-- El histórico completo queda en la base: los rescatistas pueden ver
-- TODOS los SOS que hubo (vista "Histórico SOS" en la app) y el admin
-- puede reactivar cualquier publicación oculta refrescándola.
-- ============================================================

-- ===== Necesidades =====
alter table necesidades
  add column if not exists ultimo_refresco timestamptz not null default now(),
  add column if not exists refrescos int not null default 0;

-- Lo ya publicado parte contando desde su fecha de creación: lo que
-- lleve más de 4 días sin actividad se oculta apenas se despliegue.
update necesidades set ultimo_refresco = creado_en;

create index if not exists necesidades_refresco_idx
  on necesidades (ultimo_refresco);

-- ===== Centros de acopio =====
alter table centros_acopio
  add column if not exists ultimo_refresco timestamptz not null default now(),
  add column if not exists refrescos int not null default 0,
  add column if not exists es_hospital boolean not null default false;

update centros_acopio set ultimo_refresco = creado_en;

-- Los hospitales existentes se registraron con la descripción "Hospital".
update centros_acopio set es_hospital = true
where descripcion ilike 'hospital%';

create index if not exists centros_acopio_refresco_idx
  on centros_acopio (ultimo_refresco);

-- ===== Refrescar (público, sin cuenta) =====
-- SECURITY DEFINER: permite el update puntual aunque la RLS no deje a un
-- anónimo tocar la tabla. Solo resetea el contador; no cambia nada más.

create or replace function public.refrescar_necesidad(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update necesidades
  set ultimo_refresco = now(), refrescos = refrescos + 1
  where id = p_id and coalesce(eliminada_del_mapa, false) = false;
$$;

create or replace function public.refrescar_centro(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update centros_acopio
  set ultimo_refresco = now(), refrescos = refrescos + 1
  where id = p_id;
$$;

grant execute on function public.refrescar_necesidad(uuid) to anon, authenticated;
grant execute on function public.refrescar_centro(uuid) to anon, authenticated;
