-- ============================================================
-- Red de Esperanza — Migración 11: Contacto por chat para usuarios con sesión
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- Antes, el chat de una necesidad era solo para el personal y quien la reportó.
-- Para permitir que CUALQUIER persona con cuenta pueda escribirle a quien pidió
-- ayuda (botón "Contactar" del mapa), abrimos lectura/escritura a usuarios
-- autenticados. El número de contacto privado (contactos_necesidad) SIGUE
-- siendo solo para el personal: esto solo afecta al chat.
-- ============================================================

drop policy if exists "leer mensajes" on mensajes;
create policy "leer mensajes" on mensajes for select using (
  auth.uid() is not null
);

drop policy if exists "crear mensajes" on mensajes;
create policy "crear mensajes" on mensajes for insert with check (
  autor = auth.uid()
);
