-- ============================================================
-- 28 - Personas hospitalizadas por hospital
-- ============================================================
-- Tabla privada con la informacion completa y vista publica con datos
-- enmascarados para menores de edad. El front consulta solamente la vista
-- `personas_hospitalizadas_publicas`.
-- ============================================================

create table if not exists public.personas_hospitalizadas (
  id uuid primary key default gen_random_uuid(),
  import_key text,
  cedula text,
  nombre text,
  apellido text,
  edad integer,
  estatus text not null default 'HOSPITAL',
  locacion text not null,
  -- Debe guardar el mismo nombre normalizado que usa el front, por ejemplo:
  -- "jose maria vargas" para "Hospital Jose Maria Vargas (La Guaira)".
  hospital_normalizado text not null,
  ultima_ubicacion text,
  condicion text,
  ultima_actualizacion date,
  contacto text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.personas_hospitalizadas
  add column if not exists import_key text;

alter table public.personas_hospitalizadas
  alter column nombre drop not null;

create unique index if not exists idx_personas_hospitalizadas_import_key_unique
  on public.personas_hospitalizadas (import_key)
;

create index if not exists idx_personas_hospitalizadas_hospital
  on public.personas_hospitalizadas (hospital_normalizado);

create index if not exists idx_personas_hospitalizadas_estatus
  on public.personas_hospitalizadas (estatus);

alter table public.personas_hospitalizadas enable row level security;

-- Solo personal autorizado puede administrar la data completa.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'personas_hospitalizadas'
      and policyname = 'Personal autorizado gestiona personas hospitalizadas'
  ) then
    create policy "Personal autorizado gestiona personas hospitalizadas"
    on public.personas_hospitalizadas
    for all
    to authenticated
    using (public.tiene_rol(array['admin','verificador']::rol_usuario[]))
    with check (public.tiene_rol(array['admin','verificador']::rol_usuario[]));
  end if;
end $$;

create or replace view public.personas_hospitalizadas_publicas as
select
  id,
  case when edad is not null and edad < 18 then null else cedula end as cedula,
  nombre,
  apellido,
  case when edad is not null and edad < 18 then null else edad end as edad,
  (edad is not null and edad < 18) as es_menor,
  estatus,
  locacion,
  hospital_normalizado,
  case when edad is not null and edad < 18 then null else ultima_ubicacion end as ultima_ubicacion,
  case when edad is not null and edad < 18 then null else condicion end as condicion,
  case when edad is not null and edad < 18 then null else ultima_actualizacion end as ultima_actualizacion,
  case when edad is not null and edad < 18 then null else contacto end as contacto
from public.personas_hospitalizadas
where estatus = 'HOSPITAL';

grant select on public.personas_hospitalizadas_publicas to anon;
grant select on public.personas_hospitalizadas_publicas to authenticated;
