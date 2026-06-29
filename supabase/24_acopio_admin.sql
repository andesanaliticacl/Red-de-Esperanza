-- ============================================================
-- Red de Esperanza — Migración 24: Rol "acopio_admin" (curador de centros)
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Crea un rol que SOLO el administrador puede asignar manualmente. Esta persona
-- puede EDITAR cualquier centro de acopio (nombre, dirección, teléfono de
-- contacto, red social, etc.), aunque no lo haya creado ella. Sirve para
-- completarle el contacto a los centros importados por scraping (BCV, bancos…)
-- y que así aparezca el botón "Contactar" para todos.
--
-- NOTA: si el editor SQL se queja al usar el nuevo valor del enum en la misma
-- corrida, ejecuta PRIMERO solo la línea del ALTER TYPE y luego el resto.
-- ============================================================

-- 1) Nuevo rol (no se puede elegir al registrarse; solo lo da el admin).
alter type rol_usuario add value if not exists 'acopio_admin';

-- 2) Campo opcional para una red social / enlace del centro.
alter table centros_acopio add column if not exists red_social text;

-- 3) Permisos: admin y acopio_admin pueden editar/borrar CUALQUIER centro; el
--    dueño sigue pudiendo el suyo. Usamos rol::text para no chocar con el enum
--    recién agregado dentro de la misma transacción.
drop policy if exists "editar acopio propio" on centros_acopio;
drop policy if exists "editar acopio" on centros_acopio;
create policy "editar acopio" on centros_acopio for update using (
  exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.rol::text in ('admin', 'acopio_admin')
  )
  or creado_por = auth.uid()
);

drop policy if exists "borrar acopio propio" on centros_acopio;
drop policy if exists "borrar acopio" on centros_acopio;
create policy "borrar acopio" on centros_acopio for delete using (
  exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.rol::text in ('admin', 'acopio_admin')
  )
  or creado_por = auth.uid()
);

-- 4) Proteger el nuevo rol: que NADIE pueda auto-asignarse 'acopio_admin'
--    (solo el admin puede otorgarlo). Recreamos proteger_rol incluyéndolo.
create or replace function public.proteger_rol()
returns trigger language plpgsql security definer as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if NEW.rol::text in ('verificador','admin','acopio_admin')
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
