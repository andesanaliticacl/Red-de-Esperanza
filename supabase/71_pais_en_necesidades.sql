-- ============================================================
-- Red de Esperanza — Migración 71: país en las necesidades
-- Ejecutar UNA vez DESPUÉS de la 70, en: SQL Editor → New query → Run
--
-- POR QUÉ: no se podía medir cada emergencia por separado. `necesidades` nunca
-- tuvo columna `pais` (`desaparecidos` sí la tiene desde la 58), y la única vía
-- indirecta —`catastrofe_id`— está casi vacía justo donde más datos hay:
--
--     Venezuela ...  16 de 1480 reportes etiquetados  (1 %)
--     Chile ......  285 de  351                      (81 %)
--     Colombia ...   79 de   83                      (95 %)
--
-- Agrupar por catástrofe habría reportado 16 reportes en Venezuela en vez de
-- 1480. El motivo es histórico: `catastrofe_id` nació en la migración 45, los
-- SOS nunca lo asignan (SosModal no lo manda) y lo que entra por el scraper o
-- por Telegram tampoco.
--
-- QUÉ HACE: deduce el país de las COORDENADAS, que sí están casi siempre, con
-- las mismas cajas geográficas que la app ya usa en web/src/lib/geo.ts. Lo
-- hace un trigger en la base, así que da igual por dónde entre el reporte
-- (web, SOS, scraper o bot): no se puede quedar sin país por olvido del
-- cliente. Y rellena hacia atrás todo el histórico.
-- ============================================================

-- Mismas cajas, y en el MISMO ORDEN, que CAJAS_PAIS en geo.ts: se devuelve la
-- primera que contiene el punto. El orden importa porque las cajas se solapan
-- (Venezuela y Colombia comparten frontera, Brasil es enorme y taparía a los
-- vecinos si fuera antes). Si se toca geo.ts, hay que tocar esto también.
create or replace function public.pais_por_coordenadas(
  p_lat double precision,
  p_lng double precision
)
returns text
language sql
immutable
as $$
  select c.pais
  from (values
    ('Venezuela',  0.5,  13.0, -73.6, -59.0, 1),
    ('Colombia',  -4.3,  13.5, -79.1, -66.8, 2),
    ('Ecuador',   -5.1,   1.7, -81.1, -75.2, 3),
    ('Perú',     -18.4,   0.1, -81.4, -68.6, 4),
    ('Panamá',     7.0,   9.7, -83.1, -77.0, 5),
    ('Brasil',   -33.8,   5.3, -74.0, -34.0, 6),
    ('Chile',    -56.0, -17.4, -75.7, -66.4, 7),
    ('Argentina',-55.1, -21.7, -73.6, -53.6, 8)
  ) as c(pais, sur, norte, oeste, este, orden)
  where p_lat is not null
    and p_lng is not null
    and p_lat between c.sur and c.norte
    and p_lng between c.oeste and c.este
  order by c.orden
  limit 1;
$$;

alter table public.necesidades add column if not exists pais text;

-- El país se calcula solo. Si el reporte no tiene coordenadas (pasa con
-- algunos importados), se cae a la catástrofe a la que esté ligado.
create or replace function public.necesidad_set_pais()
returns trigger
language plpgsql
as $$
begin
  if new.pais is null then
    new.pais := coalesce(
      public.pais_por_coordenadas(new.lat, new.lng),
      (select c.pais from public.catastrofes c where c.id = new.catastrofe_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_necesidad_pais on public.necesidades;
create trigger trg_necesidad_pais
  before insert or update of lat, lng, catastrofe_id
  on public.necesidades
  for each row execute function public.necesidad_set_pais();

-- Relleno del histórico completo (mismas reglas que el trigger).
update public.necesidades
set pais = coalesce(
  public.pais_por_coordenadas(lat, lng),
  (select c.pais from public.catastrofes c where c.id = catastrofe_id)
)
where pais is null;

-- La analítica siempre filtra por país y ordena por fecha.
create index if not exists necesidades_pais_idx
  on public.necesidades (pais, creado_en desc);
