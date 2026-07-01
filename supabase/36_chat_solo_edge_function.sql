-- ============================================================
-- Red de Esperanza - Migracion 36: chat escrito solo por Edge Function
--
-- La lectura del chat sigue siendo publica, pero la escritura directa desde
-- anon/auth queda bloqueada. El unico camino de escritura debe ser la Edge
-- Function `enviar-chat`, que valida la IP en servidor y usa service role.
-- ============================================================

alter table chat_global enable row level security;
alter table chat_contactos enable row level security;

drop policy if exists "escribir chat global" on chat_global;
create policy "bloquear escritura directa chat global"
on chat_global
for insert
with check (false);

drop policy if exists "crear contacto chat" on chat_contactos;
create policy "bloquear contacto directo chat"
on chat_contactos
for insert
with check (false);
