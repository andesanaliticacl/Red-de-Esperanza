-- ============================================================
-- Red de Esperanza — Migración 53: Centros de acopio con atención animal
-- Ejecutar UNA vez DESPUÉS de 52, en: SQL Editor → New query → Run
--
-- Marca si un centro de acopio también atiende animales/mascotas. Cuando
-- está activo, en el mapa y en la lista se muestra con un ícono con huella
-- (🐾) para reconocerlo de un vistazo.
-- ============================================================

alter table centros_acopio
  add column if not exists atiende_animales boolean not null default false;
