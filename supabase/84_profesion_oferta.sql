-- ============================================================
-- Red de Esperanza — Migración 84: qué profesión ofrece quien se ofrece
-- Ejecutar UNA vez DESPUÉS de la 83, en: SQL Editor → New query → Run
--
-- "Yo tengo → Profesional" no decía DE QUÉ. Un médico y un veterinario no
-- resuelven lo mismo, y quien busca ayuda para su perro no tenía forma de
-- encontrar al veterinario entre los demás profesionales.
--
-- Va en columna propia y NO dentro de la descripción porque tiene que ser
-- CONSULTABLE: el filtro 🐾 Mascotas del mapa necesita poder preguntar
-- "¿esta oferta es de un veterinario?", y sobre texto libre eso no se puede
-- hacer de forma confiable.
-- ============================================================

alter table public.ofertas
  add column if not exists profesion text;

comment on column public.ofertas.profesion is
  'Profesión ofrecida cuando tipo = profesional. "Veterinario" hace que la oferta salga también en el filtro de mascotas.';

-- El filtro de mascotas pregunta por esta columna en cada movimiento del
-- mapa, así que conviene que no recorra la tabla entera.
create index if not exists ofertas_profesion_idx
  on public.ofertas (profesion)
  where profesion is not null;
