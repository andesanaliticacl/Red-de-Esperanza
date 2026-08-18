-- ============================================================
-- Red de Esperanza — Migración 81: nacionalidad de la persona desaparecida
-- Ejecutar UNA vez DESPUÉS de la 80, en: SQL Editor → New query → Run
--
-- CASO REAL que lo destapó: una persona de Ecuador perdida en el terremoto
-- de Colombia.
--
-- `desaparecidos.pais` es DÓNDE se perdió, no de dónde es. Son dos cosas
-- distintas y en una catástrofe se separan seguido: turistas, migrantes,
-- gente que estaba de paso. Hasta ahora el formulario pedía "Cédula
-- (Venezuela o Colombia) o RUT (Chile)" y punto: el documento de un
-- ecuatoriano no tenía dónde ponerse, y el validador genérico le dejaba
-- pasar cualquier cosa sin comprobar su dígito verificador.
--
-- Con la nacionalidad guardada se puede además mostrar SU BANDERA en la
-- ficha, que es de lo que más ayuda a reconocer a alguien en una lista de
-- miles de nombres.
-- ============================================================

alter table public.desaparecidos
  add column if not exists nacionalidad text;

comment on column public.desaparecidos.nacionalidad is
  'País de origen de la persona. Distinto de `pais`, que es donde se perdió.';

-- La columna es pública (solo dice de qué país es, no identifica a nadie),
-- así que hay que sumarla al permiso por columna que dejó la migración 76:
-- ese permiso es una FOTO del momento y una columna nueva no queda incluida.
grant select (nacionalidad) on public.desaparecidos to anon, authenticated;
