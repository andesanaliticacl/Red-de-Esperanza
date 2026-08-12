-- ============================================================
-- Red de Esperanza — Migración 67: país/ciudad del último login
-- Ejecutar UNA vez DESPUÉS de la 66, en: SQL Editor → New query → Run
--
-- El chat en vivo deja de exigir que la IP coincida con el país de la sala
-- (cambio en la Edge Function enviar-chat, no en SQL): cualquier cuenta
-- puede escribir en cualquier sala. A cambio, se guarda desde dónde se
-- conecta cada quien AL INICIAR SESIÓN, para que el admin tenga estadística
-- de países/ciudades de origen sin depender de esa verificación.
--
-- No hace falta RLS nueva: "editar mi perfil" (schema.sql) ya permite que
-- cada quien actualice SU PROPIA fila, y "ver mi perfil" ya deja leer TODO
-- a los admin — estas columnas quedan cubiertas por esas mismas políticas.
-- ============================================================

alter table perfiles add column if not exists ultimo_login_pais text;
alter table perfiles add column if not exists ultimo_login_ciudad text;
alter table perfiles add column if not exists ultimo_login_en timestamptz;
