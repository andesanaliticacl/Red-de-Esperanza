-- ============================================================
-- Red de Esperanza — Migración 80: Indonesia
-- Ejecutar UNA vez DESPUÉS de la 79, en: SQL Editor → New query → Run
--
-- Para que la red también sirva en Indonesia hay que enseñarle a la base a
-- reconocer sus coordenadas: `pais_por_coordenadas()` es lo que usa el
-- trigger de `necesidades` (migración 71) y el de `ofertas` (77) para saber
-- de qué país es cada reporte. Sin esto, todo lo que se publique desde allá
-- entraría con el país en nulo y quedaría fuera de la analítica por
-- emergencia y de los filtros por país.
--
-- Su recuadro está al otro lado del planeta (longitudes POSITIVAS, 95° a
-- 141° este) y no se solapa con ninguno de América, así que da igual en qué
-- posición del orden vaya: ningún punto puede caer en los dos.
-- ============================================================

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
    -- Chile norte (Arica–Atacama): ancho, limita con Bolivia.
    ('Chile',    -27.0, -17.4, -70.6, -66.9, 6),
    -- Chile centro-sur: angosto, para no invadir Argentina.
    ('Chile',    -56.0, -27.0, -75.7, -69.0, 7),
    ('Argentina',-55.1, -21.7, -73.6, -53.6, 8),
    -- Brasil AL FINAL de América: su caja tapa el oeste de Chile y el sur de
    -- Argentina (ver migración 73).
    ('Brasil',   -33.8,   5.3, -74.0, -34.0, 9),
    -- Indonesia: longitudes positivas, sin solape posible con América.
    ('Indonesia',-11.0,   6.1,  95.0, 141.0, 10)
  ) as c(pais, sur, norte, oeste, este, orden)
  where p_lat is not null
    and p_lng is not null
    and p_lat between c.sur and c.norte
    and p_lng between c.oeste and c.este
  order by c.orden
  limit 1;
$$;

-- Recalcula el país de lo ya publicado. Es un dato derivado (nadie lo
-- escribe a mano), así que se puede pisar sin perder nada.
update public.necesidades
set pais = coalesce(
  public.pais_por_coordenadas(lat, lng),
  (select c.pais from public.catastrofes c where c.id = catastrofe_id)
);

update public.ofertas
set pais = public.pais_por_coordenadas(lat, lng)
where lat is not null and lng is not null;
