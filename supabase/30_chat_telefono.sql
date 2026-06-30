-- ============================================================
-- Red de Esperanza — Migración 30: Teléfono en el chat en vivo
-- Ejecutar UNA vez en Supabase (SQL Editor).
--
-- Registro express del invitado: además del nombre y el estado, deja un número
-- de teléfono para que la gente del chat pueda contactarlo. La columna es
-- opcional (los mensajes viejos y los de usuarios con cuenta van sin teléfono).
-- ============================================================

alter table chat_global add column if not exists telefono text;
