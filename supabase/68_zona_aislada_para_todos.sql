-- ============================================================
-- Red de Esperanza — Migración 68: "zona aislada" ya la puede reportar
-- cualquiera
-- Ejecutar UNA vez DESPUÉS de la 67, en: SQL Editor → New query → Run
--
-- Las migraciones 51 y 54 restringían crear 'zona_aislada' solo a
-- admin/lider_voluntarios. Se abre a cualquier persona (igual que el resto
-- de tipos): quien está en el lugar y no puede pasar es quien mejor sabe que
-- la zona quedó aislada, y hacerlo pasar por un rol de coordinación solo le
-- agregaba fricción a un aviso que en general es urgente.
-- ============================================================

drop policy if exists "crear necesidad" on necesidades;
create policy "crear necesidad" on necesidades for insert with check (true);
