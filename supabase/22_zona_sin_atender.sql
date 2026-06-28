-- ============================================================
-- Red de Esperanza — Migración 22: Tipo "zona_sin_atender" + radio_km
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Agrega:
--  · El tipo de necesidad 'zona_sin_atender': un ÁREA (no un punto) donde aún
--    no ha llegado ayuda, para que rescatistas/voluntarios sepan dónde ir. Se
--    dibuja en el mapa como un círculo rojo translúcido que late (🚩 al centro).
--  · La columna radio_km: tamaño de esa zona en kilómetros (p. ej. 10).
--
-- Nota: ALTER TYPE ... ADD VALUE no puede ir en la misma transacción que su uso
-- inmediato; por eso el ADD VALUE y el ALTER TABLE se ejecutan por separado.
-- Si Supabase se queja, corre primero la línea del ADD VALUE y luego el resto.
-- ============================================================

alter type necesidad_tipo add value if not exists 'zona_sin_atender';

alter table necesidades add column if not exists radio_km double precision;
