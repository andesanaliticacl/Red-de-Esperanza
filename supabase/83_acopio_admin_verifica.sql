-- ============================================================
-- Red de Esperanza — Migración 83: el líder de centros de acopio también
-- puede verificar
-- Ejecutar UNA vez DESPUÉS de la 82, en: SQL Editor → New query → Run
--
-- La migración 79 dejó verificar a verificador, admin, líder de voluntarios
-- y líder de psicología. Falta 'acopio_admin' —el líder de centros de
-- acopio—, que también es un rol de coordinación y está en terreno viendo
-- qué es real y qué no.
--
-- El resto sigue igual: un voluntario ATIENDE un reporte, pero no lo
-- acredita. Una insignia de confianza que cualquiera puede darse a sí mismo
-- no vale nada, y el aura celeste solo significa algo si la base lo protege.
-- ============================================================

create or replace function public.proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.estado::text = 'verificada'
     and OLD.estado::text is distinct from 'verificada' then
    -- `auth.uid()` nulo = no hay usuario detrás: es el propio servidor (la
    -- clave de servicio, una migración, mantenimiento). Ese camino no es el
    -- que hay que proteger —ya exige la clave secreta— y bloquearlo dejaría
    -- sin poder corregir datos desde el editor SQL.
    if auth.uid() is not null
       and not public.tiene_rol(array[
         'verificador',
         'admin',
         'lider_voluntarios',
         'lider_psicologo',
         'acopio_admin'
       ]::rol_usuario[]) then
      raise exception
        'Verificar un reporte es del equipo de coordinacion (verificador, lider o admin).';
    end if;
    -- Se deja constancia de QUIÉN verificó aunque el cliente no lo mande:
    -- una insignia sin responsable detrás no se puede auditar.
    NEW.verificada_por := coalesce(NEW.verificada_por, auth.uid());
  end if;
  return NEW;
end;
$$;
