-- ============================================================
-- Red de Esperanza — Migración 66: el límite diario de reportes sube a 10
-- Ejecutar UNA vez DESPUÉS de la 65, en: SQL Editor → New query → Run
--
-- Estaba en 5 solicitudes al día por teléfono (migración 65). Sube a 10.
--
-- OJO: este número tiene que coincidir con LIMITE_POR_TELEFONO_DIA en
-- web/src/lib/reportes.ts. El del navegador solo avisa antes de intentar;
-- este trigger es el que de verdad frena, porque quien hable directo con la
-- API se salta el JavaScript. Si cambias uno, cambia el otro.
--
-- El personal interno sigue exento: coordinando una emergencia pueden
-- registrar muchas solicitudes legítimas desde un mismo número.
-- ============================================================

create or replace function public.limitar_reportes_por_telefono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite constant int := 10;
  v_hoy int;
begin
  if new.contacto is null or btrim(new.contacto) = '' then
    return new;
  end if;

  if public.tiene_rol(array[
       'voluntario','rescatista','lider_voluntarios',
       'psicologo','lider_psicologo','verificador','admin','entidad'
     ]::rol_usuario[]) then
    return new;
  end if;

  select count(*)
    into v_hoy
    from contactos_necesidad c
    join necesidades n on n.id = c.necesidad_id
   where regexp_replace(c.contacto, '\D', '', 'g')
         = regexp_replace(new.contacto, '\D', '', 'g')
     and n.creado_en >= (
       date_trunc('day', now() at time zone 'America/Caracas')
         at time zone 'America/Caracas'
     );

  if v_hoy >= v_limite then
    raise exception 'Ya registraste % solicitudes hoy con este teléfono. Si es una nueva emergencia, llama a los servicios de emergencia de tu país.', v_limite
      using errcode = 'check_violation';
  end if;

  return new;
end; $$;

-- El trigger ya existe (migración 56/65) y apunta a esta misma función, así
-- que con reemplazar el cuerpo basta. Se recrea igual por si algún entorno
-- quedó a medias.
drop trigger if exists trg_limitar_reportes_por_telefono on contactos_necesidad;
create trigger trg_limitar_reportes_por_telefono
  before insert on contactos_necesidad
  for each row execute procedure public.limitar_reportes_por_telefono();
