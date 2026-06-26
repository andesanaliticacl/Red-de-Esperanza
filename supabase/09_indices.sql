-- ============================================================
-- Red de Esperanza — Migración 09: Índices de rendimiento (Fase 23)
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- schema.sql ya crea índices para necesidades(estado), (tipo) y (creado_en).
-- Aquí añadimos los que faltan para las consultas más frecuentes a escala.
-- ============================================================

-- Necesidades
create index if not exists idx_nec_urgencia on necesidades (urgencia);
create index if not exists idx_nec_reportado_por on necesidades (reportado_por);
create index if not exists idx_nec_asignado_a on necesidades (asignado_a);
-- Filtro por zona geográfica (viewport): consultas por rango de lat/lng.
create index if not exists idx_nec_lat_lng on necesidades (lat, lng);
-- Combinación típica del feed: estado + más recientes primero.
create index if not exists idx_nec_estado_creado on necesidades (estado, creado_en desc);

-- Mensajes por necesidad (schema ya crea uno; reforzamos por si acaso).
create index if not exists idx_msg_necesidad_creado on mensajes (necesidad_id, creado_en);

-- Perfiles por rol (panel de admin / conteos de equipo).
create index if not exists idx_perfiles_rol on perfiles (rol);
