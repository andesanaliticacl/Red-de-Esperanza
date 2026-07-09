-- ============================================================
-- Red de Esperanza - Fix 41
-- Permite crear reportes publicos en necesidades, incluyendo
-- atencion_psicologica sin ubicacion.
-- ============================================================

drop policy if exists "crear necesidad" on necesidades;

create policy "crear necesidad" on necesidades
  for insert
  with check (true);
