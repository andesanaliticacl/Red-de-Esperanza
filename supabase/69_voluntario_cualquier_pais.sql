-- ============================================================
-- Red de Esperanza — Migración 69: voluntario/rescatista en cualquier país
-- Ejecutar UNA vez DESPUÉS de la 68, en: SQL Editor → New query → Run
--
-- proteger_rol() (migración 61) y handle_new_user() (migración 63)
-- restringían los roles 'voluntario' y 'rescatista' a personas con
-- pais='Venezuela' — un candado de cuando la red operaba solo ahí. Desde
-- que se sumaron Chile y Colombia (terremoto 2026) como países activos, ese
-- candado quedó bloqueando de verdad: alguien en Chile o Colombia que
-- intentaba pasar a voluntario/rescatista recibía "Solo puedes ser
-- voluntario si estas en Venezuela", con el rol de admin como única
-- excepción. Se quita la restricción de país para los dos roles: quedan
-- disponibles para cualquiera, igual que el resto de los roles
-- autoasignables (centro_acopio nunca tuvo este candado).
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

    -- Antes: 'voluntario'/'rescatista' exigían pais='Venezuela' salvo admin.
    -- Ya no hay restricción de país para estos dos roles.
  end if;
  return NEW;
end;
$$;

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
  -- Antes: si el pais no era Venezuela, esto bajaba en silencio el rol
  -- pedido a 'ciudadano' (sin avisar nada — alguien de Chile o Colombia
  -- elegía "Voluntario" en el registro y terminaba de ciudadano sin saber
  -- por qué). Se quita: cualquier país puede registrarse como
  -- voluntario/rescatista directamente.

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

  if v_ent is not null and coalesce(v_ent->>'nombre','') <> '' then
    begin
      insert into public.solicitudes_entidad (
        perfil_id, nombre, categoria, profesion, descripcion,
        pais, zona, ciudad, telefono, email_contacto, web,
        tipo_documento, documento, mensaje,
        razon_social, id_fiscal, direccion_fiscal, contacto_facturacion,
        direccion, lat, lng
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
        nullif(v_ent->>'mensaje',''),
        nullif(v_ent->>'razon_social',''),
        nullif(v_ent->>'id_fiscal',''),
        nullif(v_ent->>'direccion_fiscal',''),
        nullif(v_ent->>'contacto_facturacion',''),
        nullif(v_ent->>'direccion',''),
        (v_ent->>'lat')::double precision,
        (v_ent->>'lng')::double precision
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end; $$;
