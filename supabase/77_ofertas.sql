-- ============================================================
-- Red de Esperanza — Migración 77: "Yo tengo" (ofertas de ayuda)
-- Ejecutar UNA vez DESPUÉS de la 76, en: SQL Editor → New query → Run
--
-- POR QUÉ: hasta hoy el mapa solo responde "¿dónde FALTA algo?". Esta tabla
-- agrega la pregunta inversa: "¿dónde SOBRA algo?". En una catástrofe la
-- ayuda casi nunca falta — lo que falta es saber dónde está. Hay alguien con
-- agua a seis cuadras de alguien que no tiene, y ninguno de los dos lo sabe.
--
-- POR QUÉ TABLA APARTE Y NO UN TIPO MÁS DE `necesidades`: porque el ciclo de
-- vida es distinto. Una necesidad se RESUELVE (alguien fue y la atendió); una
-- oferta se AGOTA (se acabó el agua) o se RETIRA (ya no puedo seguir
-- ofreciéndola). Forzar ese vocabulario dentro de `necesidades` habría
-- ensuciado además toda la analítica por emergencia: los totales de
-- "reportes" pasarían a mezclar pedidos con ofrecimientos.
-- ============================================================

-- Tipos de lo que alguien puede ofrecer. 'comunidad' es distinto a todos los
-- demás y por eso existe: no es un recurso físico sino un punto de encuentro
-- (el grupo de WhatsApp del barrio, la radio vecinal). No se agota, no hay
-- que ir a buscarlo y sirve a cien personas a la vez.
create type oferta_tipo as enum (
  'agua',
  'comida',
  'medicinas',
  'refugio',
  'electricidad',   -- generador, carga de celular
  'internet',       -- wifi abierto, datos para compartir
  'transporte',     -- camioneta, moto, mover cosas o personas
  'higiene',        -- baño, ducha, lavado de ropa
  'herramientas',   -- herramientas o maquinaria
  'comunidad',      -- grupo de WhatsApp, radio vecinal, punto de encuentro
  'otro'
);

-- 'agotada' la marca quien ofrece cuando se le acabó; 'retirada' cuando ya no
-- puede seguir ofreciéndola. Se distinguen porque son cosas distintas de
-- saber: lo primero dice que la ayuda llegó a alguien, lo segundo no.
create type oferta_estado as enum ('disponible', 'agotada', 'retirada');

create table if not exists ofertas (
  id uuid primary key default gen_random_uuid(),
  tipo oferta_tipo not null,
  descripcion text not null check (char_length(trim(descripcion)) between 3 and 500),

  -- Ubicación. Puede ir sin coordenadas (una comunidad de WhatsApp no está
  -- "en" ningún lado), y en ese caso no se dibuja en el mapa pero sí sale en
  -- la lista.
  pais text,
  zona text,
  lat double precision,
  lng double precision,

  -- Enlace PÚBLICO: la invitación al grupo de WhatsApp, un sitio, un formulario.
  -- Es lo único que tiene sentido publicar de una oferta de tipo 'comunidad',
  -- donde el punto es justamente que cualquiera pueda entrar.
  enlace text,

  estado oferta_estado not null default 'disponible',
  ofrecido_por uuid references perfiles(id) on delete set null,

  -- Mismo ciclo de vida de 4 días que las necesidades (migración 46): una
  -- oferta de agua de hace tres semanas es ruido, no ayuda.
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  ultimo_refresco timestamptz not null default now(),
  refrescos integer not null default 0,

  -- Retiro por moderación (spam, publicidad disfrazada de ayuda).
  eliminada_del_mapa boolean not null default false,
  eliminada_en timestamptz,
  eliminada_por uuid references perfiles(id) on delete set null,
  motivo_eliminacion text
);

create index if not exists ofertas_mapa_idx
  on ofertas (estado, tipo) where not eliminada_del_mapa;
create index if not exists ofertas_pais_idx
  on ofertas (pais, creado_en desc);
create index if not exists ofertas_mias_idx on ofertas (ofrecido_por);

-- ============================================================
-- Teléfono aparte, igual que en `contactos_necesidad`
-- ============================================================
-- El teléfono NO va en `ofertas` porque esa tabla es de lectura pública: si
-- viviera ahí, cualquiera podría bajarse el listado completo de números. Lo
-- mismo que acabamos de arreglar con el documento en la migración 76.
create table if not exists contactos_oferta (
  oferta_id uuid primary key references ofertas(id) on delete cascade,
  contacto text not null,
  creado_en timestamptz not null default now()
);

-- ============================================================
-- Seguridad
-- ============================================================
alter table ofertas enable row level security;
alter table contactos_oferta enable row level security;

-- Ver: cualquiera, pero solo lo que no fue retirado por moderación.
drop policy if exists "ver ofertas" on ofertas;
create policy "ver ofertas" on ofertas for select
  using (not eliminada_del_mapa);

-- Crear: solo con cuenta. A diferencia de un SOS —donde pedir registro
-- costaría vidas— una oferta no es urgente, y exigir cuenta es lo que frena
-- la publicidad disfrazada de ayuda, que es el riesgo real de esta tabla.
drop policy if exists "crear oferta" on ofertas;
create policy "crear oferta" on ofertas for insert
  with check (auth.uid() is not null and ofrecido_por = auth.uid());

-- Editar: quien la ofreció (marcarla agotada, corregirla) o el equipo.
drop policy if exists "editar oferta" on ofertas;
create policy "editar oferta" on ofertas for update
  using (
    ofrecido_por = auth.uid()
    or public.tiene_rol(array['admin','lider_voluntarios','verificador']::rol_usuario[])
  );

drop policy if exists "borrar oferta" on ofertas;
create policy "borrar oferta" on ofertas for delete
  using (
    ofrecido_por = auth.uid()
    or public.tiene_rol(array['admin']::rol_usuario[])
  );

-- El teléfono de una oferta lo ve quien tenga cuenta (para poder coordinar),
-- no el público anónimo. Quien ofrece puede ver y editar el suyo.
drop policy if exists "ver contacto oferta" on contactos_oferta;
create policy "ver contacto oferta" on contactos_oferta for select
  using (auth.uid() is not null);

drop policy if exists "crear contacto oferta" on contactos_oferta;
create policy "crear contacto oferta" on contactos_oferta for insert
  with check (
    exists (
      select 1 from ofertas o
      where o.id = oferta_id and o.ofrecido_por = auth.uid()
    )
  );

-- ============================================================
-- `actualizado_en` al día, sin depender de que el cliente lo mande
-- ============================================================
create or replace function public.ofertas_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_ofertas_touch on ofertas;
create trigger trg_ofertas_touch before update on ofertas
  for each row execute function public.ofertas_touch();

-- El país se deduce solo de las coordenadas, igual que en `necesidades`
-- (migración 71), para que la analítica por emergencia también cubra las
-- ofertas sin depender de que el cliente lo mande bien.
create or replace function public.oferta_set_pais()
returns trigger language plpgsql as $$
begin
  if new.pais is null then
    new.pais := public.pais_por_coordenadas(new.lat, new.lng);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_oferta_pais on ofertas;
create trigger trg_oferta_pais before insert or update of lat, lng on ofertas
  for each row execute function public.oferta_set_pais();
