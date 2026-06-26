-- ============================================================
-- Red de Esperanza — Migración 08: Retención del chat (3 días)
-- Ejecutar UNA vez DESPUÉS de 05_chat_y_perfiles_publicos.sql
--
-- Los mensajes del chat global se borran automáticamente a los 3 días.
-- Doble protección:
--   1) Un job de pg_cron borra los mensajes viejos a diario.
--   2) El frontend solo pide los últimos 3 días (por si el cron no corre).
-- ============================================================

-- Habilita pg_cron (en Supabase también puedes activarlo en Database → Extensions).
create extension if not exists pg_cron;

-- Borra a diario (04:00 UTC) los mensajes con más de 3 días.
-- Si el job ya existía, lo recreamos sin error.
do $$
begin
  perform cron.unschedule('limpiar_chat_global');
exception when others then
  null; -- no existía aún
end $$;

select cron.schedule(
  'limpiar_chat_global',
  '0 4 * * *',
  $$delete from public.chat_global where creado_en < now() - interval '3 days'$$
);

-- Limpieza inmediata de lo que ya esté viejo.
delete from public.chat_global where creado_en < now() - interval '3 days';
