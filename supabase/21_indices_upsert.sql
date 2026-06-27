-- ============================================================
-- Red de Esperanza — Migración 21: índices únicos COMPLETOS para el upsert
-- Ejecutar en el SQL Editor de Supabase.
--
-- Las migraciones 18 y 19 crearon el índice único de `id_fuente` como PARCIAL
-- (`where id_fuente is not null`). PostgREST hace `ON CONFLICT (id_fuente)` sin
-- ese predicado, y PostgreSQL exige un índice único NO parcial → error 42P10.
-- Aquí lo reemplazamos por un índice único completo (los NULL no chocan entre
-- sí, así que las filas sin id_fuente siguen permitidas).
-- ============================================================

-- Personas desaparecidas
drop index if exists idx_desaparecidos_id_fuente;
create unique index if not exists idx_desaparecidos_id_fuente
  on public.desaparecidos (id_fuente);

-- Centros de acopio / hospitales
drop index if exists idx_centros_id_fuente;
create unique index if not exists idx_centros_id_fuente
  on public.centros_acopio (id_fuente);
