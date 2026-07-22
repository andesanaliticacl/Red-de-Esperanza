-- ============================================================
-- Red de Esperanza — Migración 50: liberar voluntario/rescatista a
-- cualquier país
-- Ejecutar UNA vez DESPUÉS de 49, en: SQL Editor → New query → Run
--
-- Antes: voluntario/rescatista solo podían asignarse si pais = 'Venezuela'
-- (se asumía que exigían presencia física en la emergencia venezolana).
-- Ahora la red opera también en Chile (y potencialmente más países), así
-- que se libera esa restricción: cualquiera, en cualquier país, puede
-- elegir cualquiera de los roles autoasignables (ciudadano, voluntario,
-- rescatista, centro_acopio). 'psicologo' sigue sin autoasignarse (lo
-- otorga el equipo tras revisar una solicitud, ver migración 48).
-- ============================================================

-- handle_new_user(): ya NO se sanea el rol según el país (se conserva
-- exactamente igual al resto de la migración 48, solo se quita el bloque
-- que reseteaba voluntario/rescatista a ciudadano fuera de Venezuela).
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

-- proteger_rol(): se quita el bloque que exigía Venezuela para cambiar a
-- voluntario/rescatista por UPDATE (edición de perfil). El resto queda
-- igual que en la migración 48 (verificador/admin/acopio_admin/
-- lider_voluntarios/lider_psicologo siguen exigiendo admin; psicologo
-- sigue exigiendo admin o lider_psicologo).
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
  end if;
  return NEW;
end;
$$;
