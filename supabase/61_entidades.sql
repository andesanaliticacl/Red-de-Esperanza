-- ============================================================
-- Red de Esperanza — Migración 61: Entidades y profesionales verificados
-- Ejecutar UNA vez DESPUÉS de la 60, en: SQL Editor → New query → Run
--
-- Permite que organizaciones (bomberos, municipalidades, brigadas, rescate
-- animal, juntas vecinales) y profesionales voluntarios (veterinarios,
-- médicos…) tengan presencia VERIFICADA en la red.
--
-- ¿Por qué UN SOLO rol `entidad` y no uno por tipo?
--   Cada rol nuevo obliga a reescribir TODAS las políticas que listan roles.
--   La política "editar acopio" ya se reescribió en las migraciones 03, 24,
--   28 y 40 por ese motivo, y en Postgres un valor de enum no se puede
--   borrar nunca. Aquí el permiso es el mismo para todas (administrar lo
--   suyo y responder oficialmente); lo que cambia es la CATEGORÍA, que es
--   dato, no permiso. Así las políticas se escriben una vez.
--
-- Tres tablas:
--   · entidades           → el perfil PÚBLICO de la organización
--   · entidad_miembros    → quiénes pueden actuar en su nombre
--   · solicitudes_entidad → el proceso de alta (mismo patrón que la 48)
-- ============================================================

-- OJO: Postgres no deja USAR un valor de enum recién agregado dentro de la
-- misma transacción. Aquí no se usa como literal en ningún DDL (las
-- comparaciones son `rol::text = 'entidad'` y los `update ... set rol =
-- 'entidad'` viven dentro de cuerpos de función, que se compilan al
-- llamarlas), así que corre de una. Si el editor igual se queja, ejecuta
-- SOLO esta línea, y después el resto del archivo.
alter type rol_usuario add value if not exists 'entidad';

-- ============================================================
-- 1) Entidades (perfil público). Una fila SOLO existe si fue aprobada:
--    la crea revisar_solicitud_entidad(), nunca el cliente.
-- ============================================================
create table if not exists entidades (
  id uuid primary key default gen_random_uuid(),

  -- Identidad pública. `nombre` y `categoria` quedan BLOQUEADOS tras la
  -- aprobación (ver trigger más abajo): si se pudieran cambiar, alguien
  -- aprobado como "Junta Vecinal X" podría renombrarse "Bomberos X".
  nombre text not null,
  categoria text not null check (categoria in (
    'bomberos',       -- bomberos / defensa civil
    'municipalidad',  -- municipalidad / gobierno local
    'rescate',        -- organismo rescatista / brigada
    'animal',         -- rescate y ayuda animal
    'psicosocial',    -- apoyo psicológico / psicosocial
    'junta_vecinal',  -- junta vecinal / organización comunitaria
    'profesional'     -- persona con una profesión, no una organización
  )),
  -- Nivel de confianza que se muestra. Lo fija el admin AL APROBAR, según
  -- cómo pudo verificarla: una insignia que cubre por igual a bomberos y a
  -- una junta vecinal de doce casas deja de significar algo.
  tier text not null check (tier in ('oficial', 'verificada', 'profesional')),
  -- Solo para categoria = 'profesional' (psicólogo/a, veterinario/a…).
  profesion text,

  descripcion text,
  logo_url text,
  -- Contacto que LA ENTIDAD publica (no datos privados de la app).
  contacto_publico text,
  web text,

  -- Zona de cobertura y sede (lat/lng solo si tiene un lugar físico).
  pais text,
  zona text,
  ciudad text,
  lat double precision,
  lng double precision,

  -- Rastro de verificación: se muestra en el perfil público ("verificada
  -- el X por Y"). Mostrar el MÉTODO vale más que un check genérico.
  verificada_en timestamptz,
  verificada_por uuid references perfiles(id) on delete set null,
  metodo_verificacion text,
  evidencia_url text,

  -- Permite retirar del aire una entidad comprometida sin borrar historial.
  suspendida boolean not null default false,
  creado_en timestamptz not null default now()
);

create index if not exists idx_entidades_zona on entidades (pais, zona);
create index if not exists idx_entidades_categoria on entidades (categoria);

-- ============================================================
-- 2) Miembros: quiénes pueden actuar en nombre de la entidad.
--    Se crea desde el día 1 aunque la UI arranque solo con el fundador:
--    retrofitearla después obligaría a rehacer la propiedad del pin y la
--    insignia.
-- ============================================================
create table if not exists entidad_miembros (
  entidad_id uuid not null references entidades(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  rol_interno text not null default 'miembro'
    check (rol_interno in ('admin', 'miembro')),
  -- Quien firma oficialmente; siempre visible en el perfil público.
  es_vocero boolean not null default false,
  -- El RESTO de miembros es opt-in: aparecer públicamente ligado a una
  -- organización puede tener costo personal, y nadie se ofrece de
  -- voluntario para salir en un directorio público.
  publico boolean not null default false,
  creado_en timestamptz not null default now(),
  primary key (entidad_id, perfil_id)
);

create index if not exists idx_entidad_miembros_perfil
  on entidad_miembros (perfil_id);

-- ============================================================
-- 3) Solicitudes de alta
-- ============================================================
create table if not exists solicitudes_entidad (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,

  nombre text not null,
  categoria text not null check (categoria in (
    'bomberos', 'municipalidad', 'rescate', 'animal',
    'psicosocial', 'junta_vecinal', 'profesional'
  )),
  profesion text,
  descripcion text,

  pais text,
  zona text,
  ciudad text,

  -- Datos para VERIFICAR (privados, no son el contacto público). Ojo: la
  -- verificación real no se hace llamando a este teléfono, sino al que
  -- publica la institución en su sitio oficial. Esto es solo el hilo.
  telefono text not null,
  email_contacto text,
  web text,
  tipo_documento text check (tipo_documento in ('cedula', 'pasaporte')),
  documento text,
  mensaje text,

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por uuid references perfiles(id) on delete set null,
  revisado_en timestamptz,
  nota_revision text,
  -- La entidad que se creó al aprobar (null mientras esté pendiente).
  entidad_id uuid references entidades(id) on delete set null,
  creado_en timestamptz not null default now()
);

-- Un solo pedido PENDIENTE por persona (puede reintentar si le rechazaron).
create unique index if not exists solicitudes_entidad_pendiente_unica
  on solicitudes_entidad (perfil_id)
  where estado = 'pendiente';

create index if not exists solicitudes_entidad_estado_idx
  on solicitudes_entidad (estado, creado_en desc);

-- ============================================================
-- 4) RLS
-- ============================================================
alter table entidades enable row level security;
alter table entidad_miembros enable row level security;
alter table solicitudes_entidad enable row level security;

-- ---- entidades ----
-- Lectura pública: el perfil de una entidad tiene que verse SIN cuenta (es
-- la cara visible de la red y su mejor carta de presentación). Las
-- suspendidas desaparecen para todos menos el admin.
drop policy if exists "leer entidades" on entidades;
create policy "leer entidades" on entidades for select
  using (not suspendida or public.tiene_rol(array['admin']::rol_usuario[]));

-- Editar: el admin de la entidad (o un admin de la red). Los campos
-- bloqueados los protege el trigger de abajo, no esta política.
drop policy if exists "editar entidad propia" on entidades;
create policy "editar entidad propia" on entidades for update
  using (
    public.tiene_rol(array['admin']::rol_usuario[])
    or exists (
      select 1 from entidad_miembros m
      where m.entidad_id = entidades.id
        and m.perfil_id = auth.uid()
        and m.rol_interno = 'admin'
    )
  );

-- NO hay política de INSERT ni DELETE a propósito: una entidad solo nace
-- aprobando una solicitud (la función de abajo, que corre como definer).

-- ---- entidad_miembros ----
-- Público: solo el vocero y quienes aceptaron ser visibles. Uno siempre ve
-- su propia membresía; el admin de la red, todo.
drop policy if exists "leer miembros entidad" on entidad_miembros;
create policy "leer miembros entidad" on entidad_miembros for select
  using (
    publico
    or es_vocero
    or perfil_id = auth.uid()
    or public.tiene_rol(array['admin']::rol_usuario[])
  );

-- Cada quien decide si aparece públicamente; el admin de la entidad puede
-- gestionar a su equipo.
drop policy if exists "editar miembro entidad" on entidad_miembros;
create policy "editar miembro entidad" on entidad_miembros for update
  using (
    perfil_id = auth.uid()
    or public.tiene_rol(array['admin']::rol_usuario[])
    or exists (
      select 1 from entidad_miembros m2
      where m2.entidad_id = entidad_miembros.entidad_id
        and m2.perfil_id = auth.uid()
        and m2.rol_interno = 'admin'
    )
  );

-- ---- solicitudes_entidad ----
drop policy if exists "crear mi solicitud entidad" on solicitudes_entidad;
create policy "crear mi solicitud entidad" on solicitudes_entidad
  for insert with check (perfil_id = auth.uid());

drop policy if exists "ver solicitudes entidad" on solicitudes_entidad;
create policy "ver solicitudes entidad" on solicitudes_entidad for select
  using (
    perfil_id = auth.uid()
    or public.tiene_rol(array['admin']::rol_usuario[])
  );

-- ============================================================
-- 5) Campos bloqueados tras la aprobación
--    Sin esto, una entidad aprobada como junta vecinal podría renombrarse
--    "Bomberos de …" desde su propio panel: suplantación por la puerta de
--    atrás. El admin de la red sí puede corregirlos.
-- ============================================================
create or replace function public.proteger_identidad_entidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tiene_rol(array['admin']::rol_usuario[]) then
    return NEW;
  end if;
  if NEW.nombre is distinct from OLD.nombre
     or NEW.categoria is distinct from OLD.categoria
     or NEW.tier is distinct from OLD.tier
     or NEW.verificada_en is distinct from OLD.verificada_en
     or NEW.verificada_por is distinct from OLD.verificada_por
     or NEW.metodo_verificacion is distinct from OLD.metodo_verificacion
     or NEW.suspendida is distinct from OLD.suspendida then
    raise exception 'El nombre, la categoria y la verificacion de una entidad solo los cambia el equipo de la red';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_proteger_identidad_entidad on entidades;
create trigger trg_proteger_identidad_entidad
  before update on entidades
  for each row execute procedure public.proteger_identidad_entidad();

-- ============================================================
-- 6) Aprobar / rechazar. Al aprobar, en una sola transacción:
--    crea la entidad, deja al solicitante como admin y vocero, y le da el
--    rol 'entidad'.
-- ============================================================
create or replace function public.revisar_solicitud_entidad(
  p_id uuid,
  p_aprobar boolean,
  p_tier text default null,
  p_metodo_verificacion text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol solicitudes_entidad%rowtype;
  v_entidad_id uuid;
begin
  if not public.tiene_rol(array['admin']::rol_usuario[]) then
    raise exception 'Solo un administrador puede revisar solicitudes de entidad';
  end if;

  select * into v_sol
  from solicitudes_entidad
  where id = p_id and estado = 'pendiente';

  if v_sol.id is null then
    raise exception 'La solicitud no existe o ya fue revisada';
  end if;

  if p_aprobar then
    if p_tier is null then
      raise exception 'Falta indicar el nivel de verificacion (tier)';
    end if;

    insert into entidades (
      nombre, categoria, tier, profesion, descripcion,
      pais, zona, ciudad, web,
      verificada_en, verificada_por, metodo_verificacion
    ) values (
      v_sol.nombre, v_sol.categoria, p_tier, v_sol.profesion, v_sol.descripcion,
      v_sol.pais, v_sol.zona, v_sol.ciudad, v_sol.web,
      now(), auth.uid(), p_metodo_verificacion
    )
    returning id into v_entidad_id;

    -- Quien solicitó queda como administrador y vocero visible.
    insert into entidad_miembros
      (entidad_id, perfil_id, rol_interno, es_vocero, publico)
    values (v_entidad_id, v_sol.perfil_id, 'admin', true, true)
    on conflict do nothing;

    update perfiles set rol = 'entidad' where id = v_sol.perfil_id;
  end if;

  update solicitudes_entidad
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(),
         revisado_en = now(),
         nota_revision = p_nota,
         entidad_id = v_entidad_id
   where id = p_id;

  return v_entidad_id;
end;
$$;

revoke all on function public.revisar_solicitud_entidad(uuid, boolean, text, text, text) from public;
grant execute on function public.revisar_solicitud_entidad(uuid, boolean, text, text, text) to authenticated;

-- ============================================================
-- 7) proteger_rol(): 'entidad' solo lo otorga el admin (vía la función de
--    arriba). Nadie se lo puede autoasignar por UPDATE.
-- ============================================================
create or replace function public.proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if NEW.rol::text in (
      'verificador',
      'admin',
      'acopio_admin',
      'lider_voluntarios',
      'lider_psicologo'
    )
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'No puedes asignarte el rol %', NEW.rol;
    end if;

    if NEW.rol::text = 'psicologo'
       and not public.tiene_rol(array['admin', 'lider_psicologo']::rol_usuario[]) then
      raise exception 'El rol psicologo lo otorga el equipo de psicologia tras revisar tu solicitud';
    end if;

    if NEW.rol::text = 'entidad'
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'El rol entidad lo otorga el equipo tras verificar la organizacion';
    end if;

    if NEW.rol::text in ('voluntario', 'rescatista')
       and coalesce(NEW.pais, 'Venezuela') <> 'Venezuela'
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'Solo puedes ser % si estas en Venezuela', NEW.rol;
    end if;
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 8) handle_new_user(): si al registrarse eligió "represento una entidad",
--    se crea la solicitud automáticamente. Mismo criterio que la 48: va en
--    su propio bloque de excepción porque el registro NUNCA debe fallar por
--    esto. Los datos llegan como objeto jsonb en la metadata (`entidad`).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_pais text := nullif(new.raw_user_meta_data->>'pais','');
  v_pedido text := new.raw_user_meta_data->>'rol';
  v_nombre text := coalesce(nullif(new.raw_user_meta_data->>'nombre',''), new.email);
  v_rol rol_usuario;
  v_telefono text := nullif(new.raw_user_meta_data->>'telefono','');
  v_ent jsonb := new.raw_user_meta_data->'entidad';
begin
  if v_pedido in ('voluntario','rescatista','centro_acopio') then
    v_rol := v_pedido::rol_usuario;
  else
    v_rol := 'ciudadano';
  end if;
  if v_rol in ('voluntario','rescatista')
     and coalesce(v_pais, 'Venezuela') <> 'Venezuela' then
    v_rol := 'ciudadano';
  end if;

  begin
    insert into public.perfiles
      (id, nombre, rol, tipo_documento, documento, telefono, ciudad, estado, pais)
    values (
      new.id, v_nombre, v_rol,
      nullif(new.raw_user_meta_data->>'tipo_documento',''),
      nullif(new.raw_user_meta_data->>'documento',''),
      v_telefono,
      nullif(new.raw_user_meta_data->>'ciudad',''),
      nullif(new.raw_user_meta_data->>'estado',''),
      v_pais
    );
  exception when others then
    begin
      insert into public.perfiles (id, nombre, rol)
      values (new.id, v_nombre, v_rol)
      on conflict (id) do nothing;
    exception when others then
      null;
    end;
  end;

  -- Solicitud automática de psicólogo/a, si la marcó al registrarse.
  if coalesce(new.raw_user_meta_data->>'quiere_psicologo','') = 'true'
     and v_telefono is not null then
    begin
      insert into public.solicitudes_psicologo
        (perfil_id, nombre, telefono, pais, tipo_documento, documento)
      values (
        new.id, v_nombre, v_telefono, v_pais,
        nullif(new.raw_user_meta_data->>'tipo_documento',''),
        nullif(new.raw_user_meta_data->>'documento','')
      );
    exception when others then
      null;
    end;
  end if;

  -- Solicitud automática de entidad / profesional.
  if v_ent is not null and coalesce(v_ent->>'nombre','') <> '' then
    begin
      insert into public.solicitudes_entidad (
        perfil_id, nombre, categoria, profesion, descripcion,
        pais, zona, ciudad, telefono, email_contacto, web,
        tipo_documento, documento, mensaje
      ) values (
        new.id,
        v_ent->>'nombre',
        v_ent->>'categoria',
        nullif(v_ent->>'profesion',''),
        nullif(v_ent->>'descripcion',''),
        v_pais,
        nullif(new.raw_user_meta_data->>'estado',''),
        nullif(new.raw_user_meta_data->>'ciudad',''),
        coalesce(nullif(v_ent->>'telefono',''), v_telefono, 'sin telefono'),
        nullif(v_ent->>'email_contacto',''),
        nullif(v_ent->>'web',''),
        nullif(new.raw_user_meta_data->>'tipo_documento',''),
        nullif(new.raw_user_meta_data->>'documento',''),
        nullif(v_ent->>'mensaje','')
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end; $$;
