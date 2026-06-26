-- ============================================================
-- Red de Esperanza — Esquema de base de datos (Supabase / Postgres)
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → pegar todo → Run
--
-- Diferencia clave respecto a la guía v2 (corrección de seguridad):
--   El campo `contacto` NO vive en `necesidades`. Postgres RLS no filtra
--   columnas, y Realtime entrega la fila completa, así que tener `contacto`
--   en una tabla legible por el público lo filtraría. Lo aislamos en la
--   tabla `contactos_necesidad`, legible SOLO por personal interno.
-- ============================================================

-- ===== Tipos =====
create type necesidad_tipo as enum ('rescate','agua_comida','medicinas','refugio','otro','acopio');
create type necesidad_urgencia as enum ('alta','media','baja');
create type necesidad_estado as enum ('sin_verificar','verificada','en_proceso','resuelta','rechazada');
-- Roles: ciudadano (reporta), voluntario y rescatista (atienden), centro_acopio
-- (gestiona donaciones), verificador (confirma reportes), admin (todo).
create type rol_usuario as enum ('ciudadano','voluntario','rescatista','centro_acopio','verificador','admin');

-- ===== Perfiles (1 por usuario autenticado) =====
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol rol_usuario not null default 'ciudadano',
  tipo_documento text check (tipo_documento in ('cedula','pasaporte')),
  documento text,                   -- cédula venezolana o n.º de pasaporte
  telefono text,
  ciudad text,
  estado text,                      -- estado de Venezuela (no "región")
  zona text,
  creado_en timestamptz not null default now()
);

-- Al registrarse, se crea su perfil leyendo los datos del formulario
-- (raw_user_meta_data). El rol se SANEA: nadie puede auto-asignarse
-- 'verificador' ni 'admin'; esos solo los otorga un admin después.
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.perfiles (id, nombre, rol, tipo_documento, documento, telefono, ciudad, estado)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nombre',''), new.email),
    case
      when new.raw_user_meta_data->>'rol' in ('voluntario','rescatista','centro_acopio')
        then (new.raw_user_meta_data->>'rol')::rol_usuario
      else 'ciudadano'::rol_usuario
    end,
    nullif(new.raw_user_meta_data->>'tipo_documento',''),
    nullif(new.raw_user_meta_data->>'documento',''),
    nullif(new.raw_user_meta_data->>'telefono',''),
    nullif(new.raw_user_meta_data->>'ciudad',''),
    nullif(new.raw_user_meta_data->>'estado','')
  );
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: ¿el usuario actual tiene alguno de estos roles?
create function public.tiene_rol(roles rol_usuario[]) returns boolean language sql stable security definer as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = any(roles));
$$;

-- ===== Necesidades (SIN datos de contacto: seguro para lectura pública) =====
create table necesidades (
  id uuid primary key default gen_random_uuid(),
  tipo necesidad_tipo not null default 'otro',
  urgencia necesidad_urgencia not null default 'media',
  estado necesidad_estado not null default 'sin_verificar',
  descripcion text not null,
  texto_crudo text,                 -- mensaje original tal cual llegó (trazabilidad)
  zona text,
  lat double precision,
  lng double precision,
  origen text default 'web',        -- 'web' | 'sos'
  reportado_por uuid references perfiles(id), -- null si el reporte es anónimo
  asignado_a uuid references perfiles(id),
  verificada_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ===== Contacto PRIVADO (tabla aparte, solo personal interno la lee) =====
create table contactos_necesidad (
  necesidad_id uuid primary key references necesidades(id) on delete cascade,
  contacto text not null,
  creado_en timestamptz not null default now()
);

-- ===== Mensajes (chat por necesidad entre reportante y quien atiende) =====
create table mensajes (
  id uuid primary key default gen_random_uuid(),
  necesidad_id uuid not null references necesidades(id) on delete cascade,
  autor uuid not null references perfiles(id),
  cuerpo text not null,
  creado_en timestamptz not null default now()
);
create index on mensajes (necesidad_id, creado_en);

create table centros_acopio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, descripcion text,
  lat double precision not null, lng double precision not null,
  creado_en timestamptz not null default now()
);

create index on necesidades (estado);
create index on necesidades (tipo);
create index on necesidades (creado_en desc);
alter publication supabase_realtime add table necesidades;
alter publication supabase_realtime add table mensajes;

-- Mantener actualizado_en al día en cada UPDATE
create function public.touch_actualizado_en() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end; $$;
create trigger trg_touch_necesidades before update on necesidades
  for each row execute procedure public.touch_actualizado_en();

-- ============================================================
-- Seguridad por filas (RLS)
-- ============================================================
alter table necesidades enable row level security;
alter table contactos_necesidad enable row level security;
alter table mensajes enable row level security;
alter table centros_acopio enable row level security;
alter table perfiles enable row level security;

-- ---- necesidades ----
-- Lectura: el público ve todo menos lo 'rechazada'; el personal ve todo.
-- (La fila NO contiene contacto, así que es seguro y Realtime no filtra nada.)
create policy "leer necesidades" on necesidades for select
  using (estado <> 'rechazada' or public.tiene_rol(array['verificador','admin']::rol_usuario[]));

-- Crear reporte: cualquiera (anónimo incluido) puede insertar
create policy "crear necesidad" on necesidades for insert with check (true);

-- Actualizar: voluntarios/rescatistas se asignan/atienden; verificadores/admin confirman/rechazan/corrigen
create policy "actualizar interno" on necesidades for update
  using (public.tiene_rol(array['voluntario','rescatista','verificador','admin']::rol_usuario[]));

-- ---- contactos_necesidad (PRIVADO) ----
-- Insertar: cualquiera puede adjuntar su contacto al reportar
create policy "crear contacto" on contactos_necesidad for insert with check (true);
-- Leer: SOLO personal interno (los que de verdad van a ayudar / contactar)
create policy "leer contacto interno" on contactos_necesidad for select
  using (public.tiene_rol(array['voluntario','rescatista','verificador','admin']::rol_usuario[]));

-- ---- mensajes ----
-- Ver: personal interno, o el ciudadano dueño del reporte (si lo creó autenticado).
create policy "leer mensajes" on mensajes for select using (
  public.tiene_rol(array['voluntario','rescatista','verificador','admin']::rol_usuario[])
  or exists (select 1 from necesidades n where n.id = necesidad_id and n.reportado_por = auth.uid())
);
-- Escribir: mismas personas, y el autor debe ser uno mismo.
create policy "crear mensajes" on mensajes for insert with check (
  autor = auth.uid() and (
    public.tiene_rol(array['voluntario','rescatista','verificador','admin']::rol_usuario[])
    or exists (select 1 from necesidades n where n.id = necesidad_id and n.reportado_por = auth.uid())
  )
);

-- ---- centros_acopio ----
create policy "leer acopio" on centros_acopio for select using (true);
create policy "admin acopio" on centros_acopio for all
  using (public.tiene_rol(array['admin']::rol_usuario[]));

-- ---- perfiles ----
create policy "ver mi perfil" on perfiles for select
  using (id = auth.uid() or public.tiene_rol(array['admin']::rol_usuario[]));
create policy "editar mi perfil" on perfiles for update
  using (id = auth.uid() or public.tiene_rol(array['admin']::rol_usuario[]));

-- ============================================================
-- Vista pública opcional (columnas no sensibles). Útil para el mapa.
-- security_invoker = on → respeta la RLS de quien consulta (segura).
-- ============================================================
create view necesidades_publicas
  with (security_invoker = on) as
  select id, tipo, urgencia, estado, descripcion, zona, lat, lng, origen, creado_en, asignado_a
  from necesidades
  where estado <> 'rechazada';
