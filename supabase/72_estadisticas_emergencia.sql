-- ============================================================
-- Red de Esperanza — Migración 72: analítica por emergencia (SOLO ADMIN)
-- Ejecutar UNA vez DESPUÉS de la 71, en: SQL Editor → New query → Run
--
-- Devuelve, en una sola llamada, la foto completa de las tres emergencias
-- (Venezuela, Chile, Colombia) para el panel de administración.
--
-- Se hace con una FUNCIÓN y no con una vista porque el acceso debe ser solo
-- de admin: una vista con security_invoker heredaría la RLS de cada tabla, y
-- `necesidades` es de lectura pública — se filtrarían agregados a cualquiera.
-- Aquí se comprueba el rol de forma explícita y se corta.
--
-- El tiempo de resolución sale de la bitácora `eventos` (migración 02), que
-- registra con triggers desde el día uno: se cruza cuándo se creó la necesidad
-- con cuándo se marcó 'reporte_resuelto'.
-- ============================================================

create or replace function public.estadisticas_emergencia()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  -- Analítica profunda = solo admin. No basta con la RLS de las tablas.
  if not public.tiene_rol(array['admin']::rol_usuario[]) then
    raise exception 'Solo el administrador puede ver la analitica de emergencias';
  end if;

  select jsonb_build_object(
    'generado_en', now(),

    -- ===== Una ficha por emergencia =====
    'paises', (
      select coalesce(jsonb_agg(d.dato order by d.orden), '[]'::jsonb)
      from (
        select pp.orden, jsonb_build_object(
          'pais', pp.pais,

          'reportes', (
            select count(*) from necesidades n
            where n.pais = pp.pais and not n.eliminada_del_mapa),

          'sos', (
            select count(*) from necesidades n
            where n.pais = pp.pais and not n.eliminada_del_mapa
              and n.origen = 'sos'),

          'eliminados', (
            select count(*) from necesidades n
            where n.pais = pp.pais and n.eliminada_del_mapa),

          'primer_reporte', (
            select min(n.creado_en) from necesidades n where n.pais = pp.pais),
          'ultimo_reporte', (
            select max(n.creado_en) from necesidades n where n.pais = pp.pais),

          -- Cuántos hay en cada estado del ciclo de vida.
          'por_estado', (
            select coalesce(jsonb_object_agg(t.estado, t.n), '{}'::jsonb)
            from (
              select n.estado::text as estado, count(*) as n
              from necesidades n
              where n.pais = pp.pais and not n.eliminada_del_mapa
              group by 1
            ) t),

          'por_tipo', (
            select coalesce(jsonb_agg(
              jsonb_build_object('tipo', t.tipo, 'n', t.n) order by t.n desc
            ), '[]'::jsonb)
            from (
              select n.tipo::text as tipo, count(*) as n
              from necesidades n
              where n.pais = pp.pais and not n.eliminada_del_mapa
              group by 1
            ) t),

          'por_urgencia', (
            select coalesce(jsonb_object_agg(t.urgencia, t.n), '{}'::jsonb)
            from (
              select n.urgencia::text as urgencia, count(*) as n
              from necesidades n
              where n.pais = pp.pais and not n.eliminada_del_mapa
              group by 1
            ) t),

          -- Mediana (no promedio: un solo caso que tardó semanas distorsiona
          -- el promedio y haría ver lenta a toda la operación).
          'horas_mediana_resolucion', (
            select round(percentile_cont(0.5) within group (
              order by extract(epoch from (r.en - n.creado_en)) / 3600.0
            )::numeric, 1)
            from necesidades n
            join (
              select necesidad_id, min(creado_en) as en
              from eventos
              where tipo = 'reporte_resuelto' and necesidad_id is not null
              group by 1
            ) r on r.necesidad_id = n.id
            where n.pais = pp.pais),

          -- Gente registrada en ese país, por rol.
          'perfiles', (
            select coalesce(jsonb_object_agg(t.rol, t.n), '{}'::jsonb)
            from (
              select p.rol::text as rol, count(*) as n
              from perfiles p where p.pais = pp.pais group by 1
            ) t),

          'centros_acopio', (
            select count(*) from centros_acopio c
            where coalesce(c.pais, public.pais_por_coordenadas(c.lat, c.lng))
                  = pp.pais),

          'desaparecidos', (
            select count(*) from desaparecidos d
            where coalesce(d.pais, public.pais_por_coordenadas(d.lat, d.lng))
                  = pp.pais),

          'desaparecidos_por_estado', (
            select coalesce(jsonb_object_agg(t.estado, t.n), '{}'::jsonb)
            from (
              select coalesce(d.estado::text, 'sin estado') as estado,
                     count(*) as n
              from desaparecidos d
              where coalesce(d.pais, public.pais_por_coordenadas(d.lat, d.lng))
                    = pp.pais
              group by 1
            ) t),

          -- La curva: cuántos reportes por día. Es lo que muestra de verdad
          -- cómo se comportó cada emergencia en el tiempo.
          'serie', (
            select coalesce(jsonb_agg(
              jsonb_build_object('dia', t.dia, 'n', t.n) order by t.dia
            ), '[]'::jsonb)
            from (
              select n.creado_en::date as dia, count(*) as n
              from necesidades n
              where n.pais = pp.pais and not n.eliminada_del_mapa
              group by 1
            ) t)
        ) as dato
        from (values ('Venezuela', 1), ('Chile', 2), ('Colombia', 3))
             as pp(pais, orden)
      ) d
    ),

    -- ===== Reportes que no cayeron en ninguno de los tres países =====
    -- (sin coordenadas o fuera de las cajas). Se muestra para que nadie
    -- suponga que los totales por país suman el total real.
    'fuera_de_los_tres', (
      select count(*) from necesidades n
      where n.pais is null
         or n.pais not in ('Venezuela', 'Chile', 'Colombia')),

    'total_reportes', (select count(*) from necesidades),
    'total_cuentas', (select count(*) from perfiles),

    -- ===== Apoyo desde el exterior =====
    -- Gente registrada fuera de los tres países: la diáspora ayudando a
    -- distancia. Es una historia que los totales por país esconden.
    'apoyo_exterior', (
      select coalesce(jsonb_agg(
        jsonb_build_object('pais', t.pais, 'n', t.n) order by t.n desc
      ), '[]'::jsonb)
      from (
        select p.pais, count(*) as n
        from perfiles p
        where p.pais is not null
          and p.pais not in ('Venezuela', 'Chile', 'Colombia')
        group by 1 order by 2 desc limit 12
      ) t),

    -- ===== Catástrofes registradas =====
    -- Con cuántos reportes tiene cada una: sirve para detectar duplicadas
    -- (quedaron varias de Chile de cuando cualquiera podía crearlas, antes
    -- de la migración 57).
    'catastrofes', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'nombre', c.nombre, 'pais', c.pais, 'ciudad', c.ciudad,
          'creado_en', c.creado_en,
          'reportes', (select count(*) from necesidades n
                       where n.catastrofe_id = c.id)
        ) order by c.creado_en
      ), '[]'::jsonb)
      from catastrofes c)
  )
  into v_res;

  return v_res;
end;
$$;

-- Nadie anónimo puede llamarla; y quien tenga cuenta pero no sea admin recibe
-- la excepción de arriba.
revoke all on function public.estadisticas_emergencia() from public, anon;
grant execute on function public.estadisticas_emergencia() to authenticated;
