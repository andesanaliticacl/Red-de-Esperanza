-- ============================================================
-- Red de Esperanza - Migracion 37: respuestas en chat global
--
-- Guarda una referencia opcional al mensaje respondido y una copia corta de
-- nombre/texto para mostrar la cita sin consultas extra.
-- ============================================================

alter table chat_global
  add column if not exists respuesta_a uuid references chat_global(id) on delete set null,
  add column if not exists respuesta_nombre text,
  add column if not exists respuesta_cuerpo text;

create index if not exists idx_chat_respuesta_a on chat_global (respuesta_a);
