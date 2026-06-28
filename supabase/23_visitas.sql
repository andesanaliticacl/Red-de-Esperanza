-- ============================================================
-- Red de Esperanza — Migración 23: Contador de visitantes
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Registra de forma ANÓNIMA cuántos dispositivos han usado la página y de qué
-- país (aproximado por IP). Una fila por dispositivo; repetir la visita solo
-- actualiza la fecha. No guarda datos personales.
-- ============================================================

create table if not exists visitas (
  visitor_id text primary key,        -- id aleatorio del navegador (localStorage)
  pais text,                          -- país aproximado por IP
  ciudad text,
  creado_en timestamptz not null default now(),
  visto_en timestamptz not null default now()
);

alter table visitas enable row level security;

-- Cualquiera (anónimo) puede registrar/actualizar SU visita.
drop policy if exists "visitas_insert" on visitas;
create policy "visitas_insert" on visitas for insert with check (true);

drop policy if exists "visitas_update" on visitas;
create policy "visitas_update" on visitas for update using (true) with check (true);

-- Solo un admin puede LEER el contador (nadie más ve la lista).
drop policy if exists "visitas_select_admin" on visitas;
create policy "visitas_select_admin" on visitas
  for select using (public.tiene_rol(array['admin']::rol_usuario[]));
