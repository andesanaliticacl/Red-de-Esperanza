-- ============================================================
-- Red de Esperanza - Migracion 38: borrar mensajes del chat
--
-- Solo el rol admin puede borrar mensajes del chat global. La replica identity
-- full permite que Realtime envie los datos antiguos del mensaje borrado.
-- ============================================================

alter table chat_global replica identity full;

drop policy if exists "borrar chat global admin" on chat_global;
create policy "borrar chat global admin"
on chat_global
for delete
using (public.tiene_rol(array['admin']::rol_usuario[]));
