-- ============================================================
-- Red de Esperanza — Migración 13: País del usuario + roles por país
-- Ejecutar UNA vez DESPUÉS de schema.sql (y de la 10), en el SQL Editor.
--
-- Regla: solo quien está en Venezuela puede ser voluntario o rescatista.
-- Ciudadano y centro de acopio se permiten desde cualquier país.
-- ============================================================

alter table perfiles add column if not exists pais text;

-- Al registrarse: se guarda el país y se sanea el rol según el país.
-- IMPORTANTE: el registro NUNCA debe fallar por la base de datos. Si algo
-- en el insert completo falla (p. ej. una columna que aún no existe), se
-- captura el error y se crea al menos un perfil mínimo, para que la persona
-- siempre pueda entrar. En una app de emergencia esto es prioritario.
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
  -- Voluntario/rescatista solo si está en Venezuela.
  if v_rol in ('voluntario','rescatista')
     and coalesce(v_pais, 'Venezuela') <> 'Venezuela' then
    v_rol := 'ciudadano';
  end if;

  insert into public.perfiles
    (id, nombre, rol, tipo_documento, documento, telefono, ciudad, estado, pais)
  values (
    new.id,
    v_nombre,
    v_rol,
    nullif(new.raw_user_meta_data->>'tipo_documento',''),
    nullif(new.raw_user_meta_data->>'documento',''),
    nullif(new.raw_user_meta_data->>'telefono',''),
    nullif(new.raw_user_meta_data->>'ciudad',''),
    nullif(new.raw_user_meta_data->>'estado',''),
    v_pais
  );
  return new;
exception when others then
  -- Red de seguridad: si el insert completo falló por cualquier motivo,
  -- creamos un perfil mínimo para no bloquear el registro de la persona.
  insert into public.perfiles (id, nombre, rol)
  values (new.id, v_nombre, v_rol)
  on conflict (id) do nothing;
  return new;
end; $$;

-- Al actualizar el perfil: no se permite asignarse verificador/admin, ni
-- voluntario/rescatista si el país no es Venezuela (salvo admin).
create or replace function public.proteger_rol()
returns trigger language plpgsql security definer as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if NEW.rol in ('verificador','admin')
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'No puedes asignarte el rol %', NEW.rol;
    end if;
    if NEW.rol in ('voluntario','rescatista')
       and coalesce(NEW.pais, 'Venezuela') <> 'Venezuela'
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'Solo puedes ser % si estás en Venezuela', NEW.rol;
    end if;
  end if;
  return NEW;
end; $$;
