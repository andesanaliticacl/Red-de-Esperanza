-- ============================================================
-- Red de Esperanza — Migración 86: que el líder de acopios pueda verificar
-- DE VERDAD
--
-- POR QUÉ: la migración 83 sumó 'acopio_admin' al trigger
-- `proteger_verificacion` para que pudiera poner la estrella, y la pantalla
-- le muestra el botón. Pero nadie conectó el otro extremo: la política RLS
-- `"actualizar interno"` exige
-- `tiene_rol(['voluntario','rescatista','verificador','admin'])`, y un
-- 'acopio_admin' puro no está ahí ni se expande a ninguno de esos —
-- `tiene_rol()` expande 'lider_voluntarios', 'psicologo' y 'lider_psicologo',
-- pero no 'acopio_admin'.
--
-- Resultado hasta hoy: el botón se ve, se toca, el UPDATE afecta CERO filas
-- y Postgres no devuelve error. Falla en silencio. Para el líder de acopios
-- la app simplemente no responde, sin explicación.
--
-- LO QUE **NO** SE HACE, y es la parte importante:
--
--   · NO se mete 'acopio_admin' a la política `"actualizar interno"`. Esa
--     política es de tabla, no de columna: agregarlo ahí le daría además
--     reasignarse casos, cerrarlos y cambiar el estado de cualquier reporte.
--     Verificar es SUMAR ("yo respondo por esto"), no MANDAR ("yo decido
--     sobre tu trabajo"). Son dos poderes distintos y no tienen por qué
--     viajar juntos.
--   · NO se le quita nada. Esta migración es puramente aditiva: todo lo que
--     un 'acopio_admin' podía hacer antes lo sigue pudiendo hacer igual. No
--     se toca ninguna política existente.
--   · Los reportes de psicología quedan fuera. 'atencion_psicologica' y
--     'apoyo_emocional' tienen equipo propio y su propio resguardo en RLS
--     (`es_equipo_psicologia()`); son los datos más sensibles de la red y no
--     corresponde acreditarlos desde acopios.
--
-- Mismo molde angosto que la migración 85 usó para las entidades.
-- ============================================================

create or replace function public.acopio_verificar_reporte(
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
  -- `tiene_rol` deja pasar también a lider_voluntarios y lider_psicologo,
  -- que ya podían verificar por la política directa: para ellos esto no
  -- agrega ningún poder nuevo, solo otro camino al mismo sitio.
  if not public.tiene_rol(array['acopio_admin']::rol_usuario[]) then
    raise exception 'Solo el equipo de acopios puede usar esta via';
  end if;

  select tipo::text, estado::text, eliminada_del_mapa, verificada_por
    into v_tipo, v_estado, v_eliminada, v_verificada_por
  from necesidades
  where id = p_id;

  if v_tipo is null then
    raise exception 'Ese reporte no existe';
  end if;

  if v_tipo in ('atencion_psicologica', 'apoyo_emocional') then
    raise exception 'Los reportes de apoyo psicologico los acredita su propio equipo';
  end if;

  if v_eliminada then
    raise exception 'Ese reporte fue quitado del mapa';
  end if;

  -- Un reporte que ya tiene a alguien encima (o cerrado) no se toca:
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
    -- Quitar la estrella de otro sería poder ANULAR a un líder o a un
    -- verificador. Solo la propia.
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

revoke all on function public.acopio_verificar_reporte(uuid, boolean) from public;
grant execute on function public.acopio_verificar_reporte(uuid, boolean) to authenticated;
