-- ============================================================
-- Red de Esperanza — Migración 79: verificar es solo del equipo
-- Ejecutar UNA vez DESPUÉS de la 78, en: SQL Editor → New query → Run
--
-- EL PROBLEMA: un reporte verificado se va a mostrar con un aura celeste en
-- el mapa — es la señal de "esto lo confirmó alguien del equipo" y es lo que
-- hace que un reporte valga más que otro cuando hay cientos.
--
-- Pero la política que deja actualizar `necesidades` es una sola y muy
-- ancha:
--
--     using (tiene_rol(['voluntario','rescatista','verificador','admin']))
--
-- y es la MISMA con la que un voluntario se asigna un caso o lo marca
-- atendido. O sea: cualquier voluntario podía poner estado='verificada'
-- llamando a la API directamente, aunque el botón no se le muestre. Una
-- insignia de confianza que cualquiera puede darse a sí mismo no vale nada.
--
-- EL ARREGLO: un trigger que mira SOLO el paso a 'verificada' y exige rol de
-- equipo. El resto de los cambios de estado (asignarse, atender, resolver)
-- siguen exactamente igual: no se toca la política, para no romper el flujo
-- de los voluntarios, que es el que sostiene la operación.
-- ============================================================

create or replace function public.proteger_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo interesa el MOMENTO en que algo pasa a verificada. Si ya lo estaba,
  -- o si el cambio es hacia otro estado, no hay nada que revisar.
  if NEW.estado::text = 'verificada'
     and OLD.estado::text is distinct from 'verificada' then
    if not public.tiene_rol(array[
      'verificador', 'admin', 'lider_voluntarios', 'lider_psicologo'
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

drop trigger if exists trg_proteger_verificacion on public.necesidades;
create trigger trg_proteger_verificacion
  before update of estado on public.necesidades
  for each row execute function public.proteger_verificacion();
