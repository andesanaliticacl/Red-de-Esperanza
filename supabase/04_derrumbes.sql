-- ============================================================
-- Red de Esperanza — Migración 04: Tipo "derrumbe" (edificios/departamentos)
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- Agrega el tipo de necesidad 'derrumbe' para reportar edificios o departamentos
-- colapsados tras el sismo. Se muestra en el mapa con su propio marcador (🏚️) y
-- tiene un botón dedicado en la vista del ciudadano.
--
-- Nota: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción
-- junto con su uso inmediato; por eso va en su propia migración.
-- ============================================================

alter type necesidad_tipo add value if not exists 'derrumbe';
