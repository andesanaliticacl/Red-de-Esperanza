-- ============================================================
-- Red de Esperanza — Migración 15: arreglo DEFINITIVO del registro (500)
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es idempotente y seguro.
--
-- Causa del error: el trigger que crea el perfil (o el de analítica) podía
-- fallar y, al fallar un trigger, GoTrue devuelve 500 "Database error saving
-- new user" y NADIE puede registrarse. Aquí lo blindamos:
--   1) La columna `pais` existe sí o sí.
--   2) La analítica NUNCA puede tumbar el registro (captura sus propios errores).
--   3) handle_new_user crea un perfil mínimo de respaldo si algo falla.
-- ============================================================

-- 1) Columna país (por si una migración previa quedó a medias).
alter table public.perfiles add column if not exists pais text;

-- 2) Analítica a prueba de fallos: registrar un evento jamás debe impedir
--    crear la cuenta / la necesidad / el mensaje. Si falla, se ignora.
create or replace function public.log_cuenta() returns trigger
  language plpgsql security definer as $$
begin
  begin
    insert into eventos(tipo, actor, rol_actor, datos)
    values ('cuenta_creada', new.id, new.rol,
            jsonb_build_object('ciudad', new.ciudad, 'estado', new.estado));
  exception when others then
    null; -- la analítica nunca bloquea el registro
  end;
  return new;
end; $$;

create or replace function public.log_necesidad() returns trigger
  language plpgsql security definer as $$
declare
  v_actor uuid := auth.uid();
  v_rol rol_usuario;
begin
  begin
    if (TG_OP = 'INSERT') then
      select rol into v_rol from perfiles where id = new.reportado_por;
      insert into eventos(tipo, necesidad_id, actor, rol_actor, datos)
      values (
        case when new.origen = 'sos' then 'sos_creado'::evento_tipo
             else 'reporte_creado'::evento_tipo end,
        new.id, new.reportado_por, v_rol,
        jsonb_build_object('tipo', new.tipo, 'urgencia', new.urgencia, 'origen', new.origen, 'zona', new.zona)
      );
    elsif (TG_OP = 'UPDATE' and new.estado is distinct from old.estado) then
      select rol into v_rol from perfiles where id = v_actor;
      insert into eventos(tipo, necesidad_id, actor, rol_actor, datos)
      values (
        (case new.estado
          when 'verificada' then 'reporte_verificado'
          when 'rechazada'  then 'reporte_rechazado'
          when 'en_proceso' then 'reporte_asignado'
          when 'resuelta'   then 'reporte_resuelto'
          else 'reporte_verificado'
        end)::evento_tipo,
        new.id, v_actor, v_rol,
        jsonb_build_object('estado_anterior', old.estado, 'estado_nuevo', new.estado,
                           'tipo', new.tipo, 'asignado_a', new.asignado_a)
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end; $$;

create or replace function public.log_mensaje() returns trigger
  language plpgsql security definer as $$
declare v_rol rol_usuario;
begin
  begin
    select rol into v_rol from perfiles where id = new.autor;
    insert into eventos(tipo, necesidad_id, actor, rol_actor)
    values ('mensaje_enviado', new.necesidad_id, new.autor, v_rol);
  exception when others then
    null;
  end;
  return new;
end; $$;

-- 3) Creación del perfil al registrarse, con red de seguridad.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_pais text := nullif(new.raw_user_meta_data->>'pais','');
  v_pedido text := new.raw_user_meta_data->>'rol';
  v_nombre text := coalesce(nullif(new.raw_user_meta_data->>'nombre',''), new.email);
  v_rol rol_usuario;
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

  insert into public.perfiles
    (id, nombre, rol, tipo_documento, documento, telefono, ciudad, estado, pais)
  values (
    new.id, v_nombre, v_rol,
    nullif(new.raw_user_meta_data->>'tipo_documento',''),
    nullif(new.raw_user_meta_data->>'documento',''),
    nullif(new.raw_user_meta_data->>'telefono',''),
    nullif(new.raw_user_meta_data->>'ciudad',''),
    nullif(new.raw_user_meta_data->>'estado',''),
    v_pais
  );
  return new;
exception when others then
  -- Respaldo: si el insert completo falla por lo que sea, creamos un perfil
  -- mínimo para que la persona SIEMPRE pueda entrar.
  insert into public.perfiles (id, nombre, rol)
  values (new.id, v_nombre, v_rol)
  on conflict (id) do nothing;
  return new;
end; $$;
