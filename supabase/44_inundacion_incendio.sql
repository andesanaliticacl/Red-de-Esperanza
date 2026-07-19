-- ============================================================
-- Red de Esperanza — Migración 44: Tipos "inundación" e "incendio"
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- La red se vuelve multi-emergencia: agrega los tipos de necesidad
-- 'inundacion' (temporales de lluvia, p. ej. Chile) e 'incendio'.
-- Se muestran en el mapa con marcador propio (🌊 / 🔥) y aparecen
-- en el menú "Reportar necesidad".
--
-- Nota: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una
-- transacción junto con su uso inmediato; por eso va en su propia
-- migración (igual que se hizo con 'derrumbe' en la migración 04).
-- ============================================================

alter type necesidad_tipo add value if not exists 'inundacion';
alter type necesidad_tipo add value if not exists 'incendio';
