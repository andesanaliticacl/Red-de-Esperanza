-- ============================================================
-- Red de Esperanza — Migración 73: arreglo del país por coordenadas
-- Ejecutar UNA vez DESPUÉS de la 72, en: SQL Editor → New query → Run
--
-- BUG ENCONTRADO al validar la analítica de la migración 71: Chile aparecía
-- con 20 reportes y Brasil con 338. Brasil no tiene ninguna operación: eran
-- los reportes de Chile mal clasificados.
--
-- CAUSA: las cajas se revisan en orden y gana la primera que contiene el
-- punto. El recuadro de Brasil llega hasta lng -74 (oeste) y lat -33.8 (sur),
-- así que CONTIENE a Santiago (-33.45, -70.65), Coquimbo, Valparaíso y
-- Antofagasta. Y estaba ANTES que el de Chile, así que se los tragaba.
--
-- El bug no era solo de analítica: `paisPorCoordenadas()` en web/src/lib/geo.ts
-- tenía el mismo orden y es lo que elige el número de emergencia del botón
-- SOS. Un chileno en Santiago apretando SOS veía el 911 en vez de Carabineros
-- 133. Corregido también en geo.ts, en el mismo commit.
--
-- ARREGLO: Brasil pasa al final de Sudamérica, y Chile se parte en dos cajas
-- (es largo y angosto: una sola caja lo bastante ancha para el norte invadía
-- Mendoza y San Juan en Argentina).
--
-- Validado contra 15 ciudades conocidas de los 7 países: 15/15 correctas.
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
    -- Brasil AL FINAL: su caja tapa el oeste de Chile y el sur de Argentina.
    ('Brasil',   -33.8,   5.3, -74.0, -34.0, 9)
  ) as c(pais, sur, norte, oeste, este, orden)
  where p_lat is not null
    and p_lng is not null
    and p_lat between c.sur and c.norte
    and p_lng between c.oeste and c.este
  order by c.orden
  limit 1;
$$;

-- Recalcular TODO el histórico con las cajas corregidas. `pais` es un dato
-- derivado (nadie lo escribe a mano), así que se puede pisar sin perder nada.
update public.necesidades
set pais = coalesce(
  public.pais_por_coordenadas(lat, lng),
  (select c.pais from public.catastrofes c where c.id = catastrofe_id)
);
