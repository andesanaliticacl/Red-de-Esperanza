-- ============================================================
-- Red de Esperanza — Migración 20: estado de las corridas del scraper
-- Ejecutar en el SQL Editor de Supabase.
--
-- El scraper (Python/Playwright, fuera de la web) escribe aquí su progreso para
-- que el panel de admin muestre "última actualización / cuántos / estado".
-- ============================================================

create table if not exists public.scraper_runs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                       -- 'personas' | 'centros'
  estado text not null,                     -- 'corriendo' | 'ok' | 'error'
  total integer,
  detalle text,
  iniciado_en timestamptz not null default now(),
  finalizado_en timestamptz
);

create index if not exists idx_scraper_runs_iniciado
  on public.scraper_runs (iniciado_en desc);

-- Lectura pública (el panel lo muestra). La escritura la hace el scraper con la
-- service_role key, que ignora RLS, así que no hace falta política de insert.
alter table public.scraper_runs enable row level security;

drop policy if exists "leer scraper_runs" on public.scraper_runs;
create policy "leer scraper_runs" on public.scraper_runs for select using (true);
