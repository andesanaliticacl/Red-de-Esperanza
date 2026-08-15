-- ============================================================
-- Red de Esperanza — Migración 74: documento en `desaparecidos`
-- Ejecutar UNA vez DESPUÉS de la 73, en: SQL Editor → New query → Run
--
-- Permite distinguir a quién tenemos identificado con cédula/documento y a
-- quién no, y mostrar los dos conteos por separado.
--
-- ⚠️ IMPORTANTE sobre el scraping: HOY NINGUNA de las dos fuentes publica el
-- documento de forma utilizable —
--   · La fuente de Venezuela no trae el campo.
--   · La de Colombia lo publica ENMASCARADO ("****880"), a propósito.
-- Así que esta columna queda casi toda en null hasta que aparezca una fuente
-- que sí lo entregue. Se agrega igual porque:
--   1) los reportes ciudadanos (migración 60) SÍ traen documento, y
--   2) permite medir cuántos están sin identificar, que es justo el dato que
--      hacía falta para saber qué tan completa está la base.
--
-- El documento de un reporte CIUDADANO sigue viviendo en la tabla privada
-- `desaparecidos_documento` (es dato sensible de una persona viva que lo
-- entregó al reportar). Esta columna es para lo que venga ya PÚBLICO desde
-- una fuente oficial: si algún día una fuente publica la cédula, ya está
-- publicada por ellos, y sirve para no duplicar personas.
-- ============================================================

alter table public.desaparecidos
  add column if not exists documento text;

-- Buscar por documento (para no cargar dos veces a la misma persona cuando
-- dos fuentes distintas la publiquen).
create index if not exists idx_desaparecidos_documento
  on public.desaparecidos (documento)
  where documento is not null;

-- ============================================================
-- Conteo con/sin documento, por país y tipo. Una sola llamada en vez de
-- varias consultas con `count` desde el navegador.
-- ============================================================
create or replace function public.conteo_desaparecidos(
  p_pais text default null,
  p_tipo_ser text default null
)
returns table (con_documento bigint, sin_documento bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where documento is not null and btrim(documento) <> ''),
    count(*) filter (where documento is null or btrim(documento) = ''),
    count(*)
  from desaparecidos
  where estado = 'no_encontrado'
    and lat is not null
    and (p_pais is null or pais = p_pais)
    and (p_tipo_ser is null or tipo_ser = p_tipo_ser);
$$;

grant execute on function public.conteo_desaparecidos(text, text)
  to anon, authenticated;
