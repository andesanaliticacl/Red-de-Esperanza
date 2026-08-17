-- ============================================================
-- Red de Esperanza — Migración 76: el número de documento deja de ser público
-- Ejecutar UNA vez DESPUÉS de la 75, en: SQL Editor → New query → Run
--
-- EL PROBLEMA: la migración 74 sumó la columna `documento` a `desaparecidos`,
-- y esa tabla tiene lectura abierta:
--
--     create policy "leer desaparecidos" ... for select using (true)
--
-- La app nunca MUESTRA el número —solo filtra por si existe— pero eso no
-- protege nada: cualquiera puede pedirle la columna directamente a la API y
-- recibir el documento de todas las personas de la lista. Que la interfaz no
-- lo pinte y que la base no lo entregue son dos cosas distintas, y hasta hoy
-- solo se cumplía la primera.
--
-- Que Colombia lo publique enmascarado ("*******007") no alcanza como
-- defensa: la fuente de Venezuela puede empezar a publicarlo completo en
-- cualquier momento, y entonces el agujero se abre solo, sin que nadie toque
-- una línea de código.
--
-- LA SOLUCIÓN: al público le basta saber SI HAY documento, nunca CUÁL es.
--   1) `tiene_documento`: columna calculada, verdadero o falso. Es lo único
--      que necesita el filtro "solo con documento" de la app.
--   2) Se le quita a anon y authenticated el permiso de leer `documento`.
--      El scraper sigue escribiéndolo: usa la clave de servicio, que no pasa
--      por estos permisos.
-- ============================================================

-- 1) La señal pública: dice si hay documento, nunca cuál.
alter table public.desaparecidos
  add column if not exists tiene_documento boolean
  generated always as (documento is not null) stored;

-- El filtro de la app pregunta siempre por los que SÍ tienen, así que el
-- índice solo necesita cubrir esos.
create index if not exists desaparecidos_tiene_documento_idx
  on public.desaparecidos (tiene_documento)
  where tiene_documento;

-- 2) Se cierra la columna `documento`.
--
-- En Postgres no se puede "revocar una sola columna" mientras el rol tenga
-- permiso sobre TODA la tabla: hay que quitar el permiso de tabla y volver a
-- darlo columna por columna. Se arma la lista sola para no tener que
-- enumerarlas a mano ni desactualizarse con las que ya existen.
--
-- ⚠️ OJO AL AGREGAR COLUMNAS NUEVAS a `desaparecidos` en el futuro: este
-- permiso es una FOTO del momento en que se corrió esta migración. Una
-- columna creada después NO queda incluida y la app no podrá leerla, con un
-- error que no dice nada obvio. Al sumar una columna pública hay que
-- agregarle también:
--     grant select (nombre_de_la_columna) on public.desaparecidos
--       to anon, authenticated;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'desaparecidos'
    and column_name <> 'documento';

  execute 'revoke select on public.desaparecidos from anon, authenticated';
  execute format(
    'grant select (%s) on public.desaparecidos to anon, authenticated',
    v_cols
  );
end $$;
