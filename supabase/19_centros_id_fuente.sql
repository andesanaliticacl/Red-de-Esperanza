-- ============================================================
-- Red de Esperanza — Migración 19: preparar `centros_acopio` para el scraper
-- Ejecutar en el SQL Editor de Supabase.
--
-- Permite importar los centros de acopio / hospitales publicados en
-- desaparecidosterremotovenezuela.com sin duplicar (upsert por id_fuente).
-- Los centros importados quedan públicos como los demás (lectura "leer acopio").
-- ============================================================

alter table public.centros_acopio
  add column if not exists id_fuente text;

create unique index if not exists idx_centros_id_fuente
  on public.centros_acopio (id_fuente)
  where id_fuente is not null;
