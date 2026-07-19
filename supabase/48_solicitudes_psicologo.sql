-- ============================================================
-- Red de Esperanza — Migración 48: Solicitudes para ser psicólogo/a
-- Ejecutar UNA vez DESPUÉS de 47, en: SQL Editor → New query → Run
--
-- El rol 'psicologo' NO se autoasigna (nunca pudo, en realidad:
-- handle_new_user() nunca lo incluyó en su lista blanca de roles desde
-- signUp, y proteger_rol() bloquea cambiarlo por UPDATE). El flujo real:
--   1) Alguien pide ser psicólogo/a (con teléfono OBLIGATORIO, para poder
--      contactarlo) — desde el registro o desde su perfil.
--   2) admin y lider_psicologo reciben una notificación con el caso.
--   3) Verifican, contactan y, si corresponde, APRUEBAN: eso otorga el rol
--      'psicologo' automáticamente (vía la función de abajo).
-- ============================================================

create table if not exists solicitudes_psicologo (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  nombre text not null,
  telefono text not null,
  pais text,
  tipo_documento text check (tipo_documento in ('cedula', 'pasaporte')),
  documento text,
  mensaje text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por uuid references perfiles(id) on delete set null,
  revisado_en timestamptz,
  nota_revision text,
  creado_en timestamptz not null default now()
);

-- Un solo pedido PENDIENTE a la vez por persona (puede volver a pedir si el
-- anterior fue rechazado).
create unique index if not exists solicitudes_psicologo_pendiente_unica
  on solicitudes_psicologo (perfil_id)
  where estado = 'pendiente';

create index if not exists solicitudes_psicologo_estado_idx
  on solicitudes_psicologo (estado, creado_en desc);

alter table solicitudes_psicologo enable row level security;

drop policy if exists "crear mi solicitud psicologo" on solicitudes_psicologo;
create policy "crear mi solicitud psicologo" on solicitudes_psicologo
  for insert with check (perfil_id = auth.uid());

drop policy if exists "ver solicitudes psicologo" on solicitudes_psicologo;
create policy "ver solicitudes psicologo" on solicitudes_psicologo
  for select using (
    perfil_id = auth.uid()
    or exists (
      select 1 from perfiles p
      where p.id = auth.uid() and p.rol::text in ('admin', 'lider_psicologo')
    )
  );

-- Aprobar o rechazar: SOLO admin o lider_psicologo. Si se aprueba, otorga
-- el rol 'psicologo' en el mismo movimiento (transaccional).
create or replace function public.revisar_solicitud_psicologo(
  p_id uuid,
  p_aprobar boolean,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil_id uuid;
begin
  if not exists (
    select 1 from perfiles
    where id = auth.uid() and rol::text in ('admin', 'lider_psicologo')
  ) then
    raise exception 'Solo un administrador o el lider de psicologia puede revisar esta solicitud';
  end if;

  select perfil_id into v_perfil_id
  from solicitudes_psicologo
  where id = p_id and estado = 'pendiente';

  if v_perfil_id is null then
    raise exception 'La solicitud no existe o ya fue revisada';
  end if;

  update solicitudes_psicologo
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(),
         revisado_en = now(),
         nota_revision = p_nota
   where id = p_id;

  if p_aprobar then
    update perfiles set rol = 'psicologo' where id = v_perfil_id;
  end if;
end;
$$;

revoke all on function public.revisar_solicitud_psicologo(uuid, boolean, text) from public;
grant execute on function public.revisar_solicitud_psicologo(uuid, boolean, text) to authenticated;

-- proteger_rol(): 'psicologo' se agrega a la lista de roles que exigen
-- que quien hace el UPDATE sea admin o lider_psicologo (antes solo permitía
-- admin, y antes de esta migración psicologo tampoco se podía autoasignar
-- por UPDATE — pero ahora queda explícito y admite también a lider_psicologo,
-- porque la funcion revisar_solicitud_psicologo de arriba corre como ese
-- usuario). 'lider_psicologo' en sí mismo sigue siendo SOLO admin.
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

    if NEW.rol::text in ('voluntario', 'rescatista')
       and coalesce(NEW.pais, 'Venezuela') <> 'Venezuela'
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'Solo puedes ser % si estas en Venezuela', NEW.rol;
    end if;
  end if;
  return NEW;
end;
$$;

-- handle_new_user(): si al registrarse la persona marcó "quiero ser
-- psicólogo/a" (metadata quiere_psicologo = 'true'), se crea la solicitud
-- automáticamente con los mismos datos del registro. Envuelto en su propio
-- bloque de excepción: el registro NUNCA debe fallar por esto (mismo
-- criterio que el resto de esta función desde la migración 15).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_pais text := nullif(new.raw_user_meta_data->>'pais','');
  v_pedido text := new.raw_user_meta_data->>'rol';
  v_nombre text := coalesce(nullif(new.raw_user_meta_data->>'nombre',''), new.email);
  v_rol rol_usuario;
  v_telefono text := nullif(new.raw_user_meta_data->>'telefono','');
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

  return new;
end; $$;
