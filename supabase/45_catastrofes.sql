-- ============================================================
-- Red de Esperanza — Migración 45: Catástrofes (eventos de emergencia)
-- Ejecutar UNA vez DESPUÉS de 44, en: SQL Editor → New query → Run
--
-- Una "catástrofe" es una emergencia con nombre (Terremoto Venezuela,
-- Temporal de lluvias Chile...). Los reportes pueden etiquetarse con
-- una catástrofe (opcional) para filtrar por emergencia a futuro.
--
-- OJO: la tabla se llama `catastrofes` (NO `eventos`): en esta base ya
-- existe `eventos` como bitácora interna de actividad (migración 02) y
-- esa bitácora es privada del staff — no debe tocarse.
--
--  - Cualquiera puede VER la lista de catástrofes y su fecha de creación.
--  - Solo usuarios con cuenta pueden CREAR catástrofes (frena el spam
--    anónimo); la fecha de creación se toma automáticamente.
--  - Se siembra la catástrofe del terremoto de Venezuela (24-jun-2026).
-- ============================================================

create table if not exists catastrofes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (char_length(trim(nombre)) between 3 and 80),
  pais text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table catastrofes enable row level security;

drop policy if exists "ver catastrofes" on catastrofes;
create policy "ver catastrofes" on catastrofes for select using (true);

drop policy if exists "crear catastrofe" on catastrofes;
create policy "crear catastrofe" on catastrofes for insert
  with check (auth.uid() is not null and creado_por = auth.uid());

-- Las necesidades pueden pertenecer (opcionalmente) a una catástrofe.
alter table necesidades
  add column if not exists catastrofe_id uuid references catastrofes(id) on delete set null;

create index if not exists necesidades_catastrofe_idx on necesidades (catastrofe_id);

-- Catástrofe fundacional: el terremoto de Venezuela del 24 de junio de 2026.
insert into catastrofes (nombre, pais, creado_en)
values ('Terremoto Venezuela', 'Venezuela', '2026-06-24T00:00:00Z')
on conflict (nombre) do nothing;
