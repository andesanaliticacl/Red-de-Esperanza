-- ============================================================
-- Red de Esperanza — Migración 10: Borrar reportes propios + cambio de rol seguro
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
-- ============================================================

-- ===== 1) El autor (o un admin) puede BORRAR su propia necesidad / SOS =====
-- Al borrar, contactos_necesidad y mensajes se eliminan en cascada.
drop policy if exists "borrar mi necesidad" on necesidades;
create policy "borrar mi necesidad" on necesidades for delete using (
  reportado_por = auth.uid()
  or public.tiene_rol(array['admin']::rol_usuario[])
);

-- ===== 2) Cambio de rol seguro =====
-- El usuario puede cambiar su propio rol (ciudadano/voluntario/rescatista/
-- centro_acopio), pero NADIE que no sea admin puede asignarse 'verificador'
-- ni 'admin'. Esto cierra un posible escalamiento de privilegios.
create or replace function public.proteger_rol()
returns trigger language plpgsql security definer as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if NEW.rol in ('verificador','admin')
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'No puedes asignarte el rol %', NEW.rol;
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_proteger_rol on perfiles;
create trigger trg_proteger_rol before update on perfiles
  for each row execute procedure public.proteger_rol();
