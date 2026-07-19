-- ============================================================
-- Red de Esperanza — Migración 45: Eventos (catástrofes)
-- Ejecutar UNA vez DESPUÉS de 44, en: SQL Editor → New query → Run
--
-- Un "evento" es una catástrofe con nombre (Terremoto Venezuela,
-- Temporal de lluvias Chile...). Los reportes pueden etiquetarse con
-- un evento (opcional) para filtrar por catástrofe a futuro.
--
--  - Cualquiera puede VER la lista de eventos y su fecha de creación.
--  - Solo usuarios con cuenta pueden CREAR eventos (frena el spam
--    anónimo); la fecha de creación se toma automáticamente.
--  - Se siembra el evento del terremoto de Venezuela (24-jun-2026).
-- ============================================================

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (char_length(trim(nombre)) between 3 and 80),
  pais text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table eventos enable row level security;

drop policy if exists "ver eventos" on eventos;
create policy "ver eventos" on eventos for select using (true);

drop policy if exists "crear evento" on eventos;
create policy "crear evento" on eventos for insert
  with check (auth.uid() is not null and creado_por = auth.uid());

-- Las necesidades pueden pertenecer (opcionalmente) a un evento.
alter table necesidades
  add column if not exists evento_id uuid references eventos(id) on delete set null;

create index if not exists necesidades_evento_idx on necesidades (evento_id);

-- Evento fundacional: el terremoto de Venezuela del 24 de junio de 2026.
insert into eventos (nombre, pais, creado_en)
values ('Terremoto Venezuela', 'Venezuela', '2026-06-24T00:00:00Z')
on conflict (nombre) do nothing;
