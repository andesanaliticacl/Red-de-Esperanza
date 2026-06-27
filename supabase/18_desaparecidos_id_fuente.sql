-- ============================================================
-- Red de Esperanza — Migración 18: preparar `desaparecidos` para el scraper
-- Ejecutar en el SQL Editor de Supabase.
--
-- Agrega un identificador del origen (id de la web de desaparecidos) para poder
-- volver a scrapear sin duplicar (upsert) y un índice geográfico para el mapa.
-- ============================================================

-- Id de la persona en la web origen (ej. "p43ccdad40d7c"). Único para upsert.
alter table public.desaparecidos
  add column if not exists id_fuente text;

create unique index if not exists idx_desaparecidos_id_fuente
  on public.desaparecidos (id_fuente)
  where id_fuente is not null;

-- Índices para filtrar/mostrar rápido en el mapa.
create index if not exists idx_desaparecidos_estado
  on public.desaparecidos (estado);
create index if not exists idx_desaparecidos_latlng
  on public.desaparecidos (lat, lng);
