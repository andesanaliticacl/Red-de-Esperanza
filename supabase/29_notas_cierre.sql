-- ============================================================
-- Red de Esperanza — Migración 29: Notas de cierre
-- Ejecutar UNA vez en Supabase (SQL Editor).
--
-- Los LÍDERES DE VOLUNTARIOS (y admin) pueden dejar un comentario al cerrar un
-- caso/necesidad ("cómo se resolvió", observaciones, etc.). Se guarda en una
-- tabla aparte, legible solo por el personal interno: NO se expone en el mapa
-- público ni viaja por Realtime con la fila de `necesidades`.
-- ============================================================

create table if not exists notas_cierre (
  id uuid primary key default gen_random_uuid(),
  necesidad_id uuid not null references necesidades(id) on delete cascade,
  autor uuid references perfiles(id),
  nota text not null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_notas_cierre_necesidad on notas_cierre (necesidad_id);

alter table notas_cierre enable row level security;

-- Crear: cualquier personal que atiende casos (voluntario, rescatista, líder y
-- admin) puede dejar una nota al cerrar el caso que tiene asignado.
drop policy if exists "crear nota cierre" on notas_cierre;
create policy "crear nota cierre" on notas_cierre for insert with check (
  public.tiene_rol(
    array['voluntario','rescatista','lider_voluntarios','verificador','admin']::rol_usuario[]
  )
);

-- Leer: personal interno (para que el equipo, los líderes y el admin vean
-- TODAS las notas de cierre, no solo las propias).
drop policy if exists "leer nota cierre" on notas_cierre;
create policy "leer nota cierre" on notas_cierre for select using (
  public.tiene_rol(
    array['voluntario','rescatista','lider_voluntarios','verificador','admin']::rol_usuario[]
  )
);
