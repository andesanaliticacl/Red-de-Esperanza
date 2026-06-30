-- ============================================================
-- Red de Esperanza — Migración 28: Rol "líder de voluntarios"
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Un rol que SOLO el administrador puede asignar, y que reúne en uno las
-- capacidades de CUATRO roles a la vez:
--   • voluntario      → atender necesidades, ver contactos, chat
--   • rescatista      → además, tomar emergencias SOS
--   • centro_acopio   → registrar centros de acopio
--   • acopio_admin    → editar/borrar CUALQUIER centro de acopio
--
-- Truco para no editar decenas de políticas: casi todas usan public.tiene_rol().
-- Hacemos que tiene_rol() considere que un 'lider_voluntarios' "tiene" cualquiera
-- de esos cuatro roles. Así, toda política que pida voluntario/rescatista/
-- centro_acopio/acopio_admin lo cubre automáticamente. Las políticas de editar/
-- borrar centros (que NO usan tiene_rol) se recrean aparte aquí abajo.
--
-- NOTA: si el editor SQL se queja al usar el nuevo valor del enum en la misma
-- corrida, ejecuta PRIMERO solo la línea del ALTER TYPE y luego el resto.
-- ============================================================

-- 1) Nuevo rol (no se puede elegir al registrarse; solo lo da el admin).
alter type rol_usuario add value if not exists 'lider_voluntarios';

-- 2) tiene_rol(): el líder de voluntarios equivale a sus cuatro roles base.
--    Usamos rol::text = 'lider_voluntarios' (comparación de texto) para no
--    castear el literal al enum recién agregado dentro de la misma transacción.
create or replace function public.tiene_rol(roles rol_usuario[])
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid()
      and (
        rol = any(roles)
        or (
          rol::text = 'lider_voluntarios'
          and roles && array[
            'voluntario','rescatista','centro_acopio','acopio_admin'
          ]::rol_usuario[]
        )
      )
  );
$$;

-- 3) Centros de acopio: editar/borrar CUALQUIERA también para 'lider_voluntarios'
--    (estas políticas no pasan por tiene_rol, comparan el rol directamente).
drop policy if exists "editar acopio" on centros_acopio;
create policy "editar acopio" on centros_acopio for update using (
  exists (
    select 1 from perfiles p
    where p.id = auth.uid()
      and p.rol::text in ('admin', 'acopio_admin', 'lider_voluntarios')
  )
  or creado_por = auth.uid()
);

drop policy if exists "borrar acopio" on centros_acopio;
create policy "borrar acopio" on centros_acopio for delete using (
  exists (
    select 1 from perfiles p
    where p.id = auth.uid()
      and p.rol::text in ('admin', 'acopio_admin', 'lider_voluntarios')
  )
  or creado_por = auth.uid()
);

-- 4) Proteger el rol: NADIE puede auto-asignarse 'lider_voluntarios'
--    (solo el admin lo otorga). Recreamos proteger_rol incluyéndolo.
create or replace function public.proteger_rol()
returns trigger language plpgsql security definer as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if NEW.rol::text in ('verificador','admin','acopio_admin','lider_voluntarios')
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'No puedes asignarte el rol %', NEW.rol;
    end if;
    if NEW.rol::text in ('voluntario','rescatista')
       and coalesce(NEW.pais, 'Venezuela') <> 'Venezuela'
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'Solo puedes ser % si estás en Venezuela', NEW.rol;
    end if;
  end if;
  return NEW;
end; $$;
