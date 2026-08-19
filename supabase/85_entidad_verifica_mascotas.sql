-- ============================================================
-- Red de Esperanza — Migración 85: una entidad aprobada verifica reportes
-- de mascotas
-- Ejecutar UNA vez DESPUÉS de la 84, en: SQL Editor → New query → Run
--
-- POR QUÉ: la estrella (y el aura celeste del pin) dice "esto lo confirmó
-- alguien que responde por ello". Hasta hoy solo la daba el equipo de
-- coordinación: verificador, admin, líder de voluntarios, líder de
-- psicología y líder de acopios (migraciones 79 y 83).
--
-- Pero una entidad APROBADA ya pasó por el filtro más caro que tiene la red:
-- un administrador revisó su solicitud, la verificó por un canal oficial y
-- le puso un tier. Nadie se autoasigna el rol 'entidad' —la migración 61 lo
-- bloquea en `proteger_rol()` y la fila de `entidades` solo la crea
-- `revisar_solicitud_entidad()`, que exige admin—. Esa gente está en
-- terreno viendo qué es real: un veterinario o una organización de rescate
-- animal sabe distinguir un perro herido de verdad de un reporte inventado
-- mejor que nadie en la sala de coordinación.
--
-- LO QUE **NO** SE AMPLÍA, y es lo importante:
--
--   · Una entidad solo verifica reportes de tipo 'mascota'. No toca un
--     derrumbe, ni una emergencia médica, ni nada más. Una insignia vale
--     mientras la dé quien sabe del tema; un veterinario acreditando un
--     edificio colapsado la devalúa.
--   · No se toca la política RLS `"actualizar interno"`. Esa política es de
--     tabla y no distingue columnas: meter 'entidad' ahí le daría permiso
--     para reasignarse casos, cerrarlos o cambiarles el estado a cualquiera.
--     En vez de eso, la entidad pasa por UNA función (abajo) que valida tipo,
--     estado y pertenencia antes de tocar la fila. Un solo camino, angosto.
--   · Una entidad suspendida deja de poder verificar en el acto: la
--     suspensión es la herramienta para retirar del aire a una organización
--     comprometida, y no serviría de nada si le quedara la estrella.
--   · Una entidad solo puede QUITAR la verificación que puso ella misma.
--     Si no, podría borrar la acreditación de un líder — y ahí el permiso
--     dejaría de ser "sumar" para pasar a ser "mandar".
-- ============================================================

-- ============================================================
-- 1) ¿La sesión actual es una entidad aprobada y vigente?
--    Rol 'entidad' Y membresía en una entidad que no esté suspendida. Se
--    piden las dos: el rol se otorga al aprobar, pero la suspensión llega
--    después y tiene que pesar más.
-- ============================================================
create or replace function public.es_entidad_vigente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from perfiles p
    join entidad_miembros m on m.perfil_id = p.id
    join entidades e on e.id = m.entidad_id
    where p.id = auth.uid()
      and p.rol::text = 'entidad'
      and not e.suspendida
  );
$$;

revoke all on function public.es_entidad_vigente() from public;
grant execute on function public.es_entidad_vigente() to authenticated;

-- ============================================================
-- 2) El trigger de la 79/83, con la entidad sumada SOLO para 'mascota'.
--    El resto del cuerpo queda igual, palabra por palabra.
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
       ]::rol_usuario[])
       -- Una entidad aprobada y vigente, pero solo en lo suyo: mascotas.
       and not (NEW.tipo::text = 'mascota' and public.es_entidad_vigente())
    then
      raise exception
        'Verificar un reporte es del equipo de coordinacion (verificador, lider o admin). Una entidad aprobada solo puede verificar reportes de mascotas.';
    end if;
    -- Se deja constancia de QUIÉN verificó aunque el cliente no lo mande:
    -- una insignia sin responsable detrás no se puede auditar.
    NEW.verificada_por := coalesce(NEW.verificada_por, auth.uid());
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 3) La puerta por la que entra la entidad. Una sola, y angosta.
--
--    El equipo de coordinación sigue usando el UPDATE directo de siempre
--    (la política `"actualizar interno"` los cubre); esto es exclusivamente
--    para el rol 'entidad', que a propósito NO está en esa política.
-- ============================================================
create or replace function public.entidad_verificar_reporte(
  p_id uuid,
  p_verificar boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_estado text;
  v_eliminada boolean;
  v_verificada_por uuid;
begin
  if not public.es_entidad_vigente() then
    raise exception 'Solo una entidad aprobada y vigente puede verificar reportes de mascotas';
  end if;

  select tipo::text, estado::text, eliminada_del_mapa, verificada_por
    into v_tipo, v_estado, v_eliminada, v_verificada_por
  from necesidades
  where id = p_id;

  if v_tipo is null then
    raise exception 'Ese reporte no existe';
  end if;

  if v_tipo <> 'mascota' then
    raise exception 'Una entidad solo puede verificar reportes de mascotas';
  end if;

  if v_eliminada then
    raise exception 'Ese reporte fue quitado del mapa';
  end if;

  -- Un reporte que ya tiene a alguien encima (o que se cerró) no se toca:
  -- cambiarle el estado desde aquí borraría el trabajo de quien lo atiende.
  if v_estado not in ('sin_verificar', 'verificada') then
    raise exception 'Ese reporte ya esta en curso o cerrado: su verificacion no se puede cambiar';
  end if;

  if p_verificar then
    update necesidades
       set estado = 'verificada',
           verificada_por = auth.uid()
     where id = p_id;
  else
    -- Quitar la estrella de otro sería poder ANULAR a un líder. Solo la
    -- propia.
    if v_verificada_por is distinct from auth.uid() then
      raise exception 'Solo puedes quitar la verificacion que pusiste tu';
    end if;
    update necesidades
       set estado = 'sin_verificar',
           verificada_por = null
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.entidad_verificar_reporte(uuid, boolean) from public;
grant execute on function public.entidad_verificar_reporte(uuid, boolean) to authenticated;
