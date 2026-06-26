-- ============================================================
-- Red de Esperanza — Migración 12: Contacto de acopio + ciudad pública
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
-- ============================================================

-- 1) Teléfono/contacto del encargado del centro de acopio (para escribirle).
alter table centros_acopio add column if not exists contacto text;

-- 2) Exponer la ciudad en la vista pública de perfiles (para "Mis
--    conversaciones": mostrar de qué ciudad es la otra persona). Sigue sin
--    exponer documento ni teléfono.
create or replace view perfiles_publicos as
  select id, nombre, rol, foto_url, ciudad from perfiles;
grant select on perfiles_publicos to anon, authenticated;
