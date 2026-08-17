-- ============================================================
-- Red de Esperanza — Migración 75: categoría "ONG o fundación"
-- Ejecutar UNA vez DESPUÉS de la 74, en: SQL Editor → New query → Run
--
-- POR QUÉ: al registrarse como entidad había 8 categorías y ninguna servía
-- para una ONG o fundación humanitaria que trabaja con PERSONAS. Las tres
-- formas de ONG se repartían así:
--
--   ONG de animales   → 'animal'         (Rescate y ayuda animal)      ✓
--   ONG comunitaria   → 'junta_vecinal'  (Junta vecinal / comunitaria) ✓
--   ONG de personas   → ninguna                                        ✗
--
-- Una fundación que reparte alimentos, atiende niños o gestiona albergues no
-- es bomberos, ni rescate, ni animal, ni municipalidad, ni junta vecinal, ni
-- empresa. Se quedaba sin dónde encajar y lo más probable es que abandonara
-- el registro. No es un problema de redacción, faltaba la casilla.
--
-- Los CHECK de categoría hay que rehacerlos: no se amplían en sitio (mismo
-- procedimiento que usó la migración 62 al sumar 'empresa').
-- ============================================================

alter table entidades drop constraint if exists entidades_categoria_check;
alter table entidades add constraint entidades_categoria_check
  check (categoria in (
    'bomberos', 'municipalidad', 'rescate', 'animal',
    'psicosocial', 'junta_vecinal', 'ong', 'empresa', 'profesional'
  ));

alter table solicitudes_entidad drop constraint if exists solicitudes_entidad_categoria_check;
alter table solicitudes_entidad add constraint solicitudes_entidad_categoria_check
  check (categoria in (
    'bomberos', 'municipalidad', 'rescate', 'animal',
    'psicosocial', 'junta_vecinal', 'ong', 'empresa', 'profesional'
  ));
