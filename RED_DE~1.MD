# Red de Esperanza — Guía de construcción para Claude Code (v2)

> ## ⚠️ Estado real del proyecto (actualizado) — leer primero
>
> Esta guía v2 es el plan **original**. El proyecto construido **evolucionó** y
> algunas piezas de esta guía **ya NO aplican**. Lo de abajo manda sobre el
> resto del documento.
>
> ### ❌ Eliminado (ya no existe en el proyecto)
> - **Bot de Telegram** completo (carpeta `bot/`, `grammY`, `TELEGRAM_BOT_TOKEN`).
> - **IA / Google Gemini** para extraer datos (`GEMINI_API_KEY`, `GEMINI_MODEL`).
>   Ya no hace falta: el ciudadano reporta **dentro de la app** con un formulario
>   que entrega datos estructurados (tipo, urgencia, ubicación) directamente.
> - **Hosting en Render** y el **webhook** de Telegram.
> - **`SUPABASE_SERVICE_KEY`** (secret) en el cliente: la web usa solo la
>   **publishable key**; la seguridad la da el RLS.
> - **Magic link como método principal** de acceso (ahora es secundario).
> - El valor `'telegram'` de la columna `origen` (queda solo `'web'` y `'sos'`).
>   La columna `texto_crudo` se conserva pero la UI ya no la usa.
>
> ### ✅ Agregado / cambiado respecto a la guía
> - **Seguridad del contacto:** el campo `contacto` se aisló en la tabla
>   `contactos_necesidad` (RLS no filtra columnas y Realtime entrega la fila
>   completa). Legible solo por personal interno.
> - **Registro con correo + contraseña** y formulario completo: nombre,
>   **cédula/pasaporte**, **estado de Venezuela** + ciudad, teléfono y rol.
>   El trigger **sanea el rol**: nadie se auto-asigna verificador/admin.
> - **Roles ampliados:** además de ciudadano/voluntario/verificador/admin, se
>   añadieron **`rescatista`** y **`centro_acopio`**.
> - **Mensajería (chat) por necesidad** entre el reportante y quien atiende:
>   tabla `mensajes` + RLS (staff o dueño del reporte) + Realtime. Vistas:
>   `ChatNecesidad`, `MisReportesView`, botón 💬 en voluntario/verificador.
> - **Analítica:** tabla `eventos` + triggers que registran cada acción
>   (reportes, SOS, verificaciones, asignaciones, atenciones, mensajes, cuentas)
>   y vista `estadisticas_usuario`. Archivo `supabase/02_analitica_y_emergencias.sql`.
> - **SOS:** botón de **llamada al 911** (no es auto-llamada: el navegador no
>   puede marcar solo) y **feed de emergencias en tiempo real** para rescatistas.
> - **Ubicación:** GPS con **respaldo por IP** si el GPS falla, con indicador de
>   carga. Botón **"🧭 Cómo llegar"** que abre Google Maps con ruta y tiempo.
> - **UI responsiva:** botones de tamaño contenido en escritorio; leyenda visible.
>
> ### 🆕 Mejoras posteriores (terremoto de Venezuela)
> - **Geocodificación con Google Maps interna:** la app resuelve una dirección con
>   número de casa/apto vía Google Maps y trae las coordenadas al mapa OSM (la base
>   sigue siendo OpenStreetMap). Respaldo con Nominatim/OSM por variantes de la
>   dirección. Variable `VITE_GOOGLE_MAPS_KEY` (clave de navegador, restringida por
>   dominio). Funciona en **cualquier país**.
> - **Reportes en una sola pantalla** con un único botón "Enviar reporte" (sin
>   pasos). Ubicación por dirección escrita, "Mi ubicación" (GPS, resaltado), pin
>   arrastrable o coordenadas pegadas.
> - **Solo se aceptan necesidades dentro de Venezuela** (rechazo con aviso si las
>   coordenadas caen fuera). Aviso claro si la dirección no es válida.
> - **Nuevo tipo "zona sin atender":** círculo rojo translúcido titilante,
>   proporcional al tamaño (1/3/5 km de diámetro, `radio_km`), con banderita 🚩.
>   Reemplazó el tile de "rescate" del menú de reportar (el SOS ya tiene su botón).
> - **Edificio derrumbado:** usa la dirección escrita, no toma el GPS automático.
> - **Centros de acopio** ubicados por dirección escrita (GPS opcional), con
>   selector país→región→ciudad. El **país** de los centros scrapeados se deduce del
>   texto/coordenadas (no del "Venezuela" por defecto del scraper), así aparecen en
>   el filtro por país (España, EE.UU., Argentina, Chile…; Texas → EE.UU.).
> - **Jerarquía y tamaño de íconos:** necesidades grandes y al frente; hospitales y
>   acopios más pequeños y debajo; desaparecidos al fondo. Íconos **fuera de
>   Venezuela** unificados a 40 px.
> - **Filtros** por tipo ampliados (todas las necesidades + acopios + hospitales) y
>   por urgencia.
> - **Personas desaparecidas** por scraper (`scraper/`, Python + Playwright, GitHub
>   Actions, upsert sin duplicar, `scraper_runs`). Ocultas al entrar; se muestran con
>   🔍. Se esparcen en disco cuando comparten punto. Ubicación **aproximada**.
> - **Contador de visitantes** anónimo en el panel admin (tabla `visitas`, país por
>   IP, una fila por dispositivo) — migración 23.
> - Tutorial "¿Cómo funciona?" actualizado (zonas, banderas, aviso de desaparecidos
>   aproximados) y botón más visual.
>
> ### 📦 Estructura actual
> ```
> red-de-esperanza/
> ├── web/        → PWA (todo el frontend)
> ├── scraper/    → scraper de desaparecidos (Python + Playwright)
> ├── supabase/   → schema.sql + migraciones 02→23
> └── README.md
> ```
> El stack real es: React + Vite + TS · Tailwind · Leaflet/OSM (+ Google Maps solo
> para geocodificar/rutas) · Supabase (Postgres + Auth + Realtime) · Python +
> Playwright (scraper) · GitHub Actions · Vercel. **Sin** Telegram, **sin** Gemini,
> **sin** Render.

**Objetivo:** una herramienta de emergencia (web + móvil) donde la gente reporta necesidades por un bot de Telegram o por la web, una IA las estructura, **voluntarios verificadores las confirman**, y aparecen en un mapa colaborativo público en tiempo casi real.

**Estrategia "web + móvil":** **PWA** (Progressive Web App) en React + Vite. Un solo código que funciona en navegador y se **instala en el celular como app** (iOS y Android) sin tiendas. Lo más rápido para una emergencia.

**Idea central sobre el rigor (léela):** la IA **recoge, ordena y propone**; un **humano verificador confirma**. Por eso la app tiene roles. Todo lo que entra por IA o por ciudadanos se marca como **"sin verificar"** (un color distinto en el mapa) hasta que un verificador lo confirma. Así un error de la IA es, como máximo, un reporte mal clasificado esperando en una cola — nunca información falsa publicada como oficial. **Tú no eres el cuello de botella:** repartes la verificación entre varios voluntarios.

**Cómo usar esta guía con Claude Code:**

1. Haz primero los **Pasos manuales** (sección 2): crear cuentas y copiar llaves (~30 min).
2. Abre Claude Code en una carpeta vacía y pega los **PROMPTS** de cada fase, **uno a la vez, en orden**.
3. Tras cada fase corre su **prueba de aceptación**. No avances si no pasa.

> Regla de oro: cada fase deja algo funcionando. No saltes fases.

---

## 1. Stack (100% gratis y código abierto)

| Capa | Herramienta | Para qué |
|---|---|---|
| Frontend web + móvil | **React + Vite + TypeScript** | Una sola base de código |
| PWA / instalable + offline | **vite-plugin-pwa** | Instalable en el celular, abre sin señal |
| Estilos / UI | **Tailwind CSS** | UI rápida, botones grandes, alto contraste |
| Componentes accesibles | **shadcn/ui** (opcional) | Botones, diálogos y formularios listos |
| Mapa | **Leaflet + react-leaflet + OpenStreetMap** | Mapa gratis y ligero |
| Backend / base de datos | **Supabase** (Postgres + API + Realtime + **Auth**) | Datos, login y actualización en vivo, gratis |
| Login de usuarios | **Supabase Auth** (magic link por email) | Sin contraseñas que recordar, gratis |
| Bot | **Telegram Bot API + grammY** (Node) | Recibir reportes por chat |
| IA (extracción) | **Google Gemini API** (free tier) | Convertir texto libre en datos estructurados |
| Hosting web | **Vercel** | URL pública, deploy automático |
| Hosting del bot | **Render** (web service free) | Bot 24/7 por webhook |
| Repositorio | **GitHub** | Código abierto y despliegue continuo |

Todo lo anterior tiene plan gratuito suficiente para arrancar. Nada de tarjetas de crédito obligatorias.

---

## 2. Pasos manuales (solo tú, ~30 min) — ANTES de empezar

Claude Code no puede crear cuentas ni leer tus llaves secretas. Guarda estos valores en un bloc de notas:

1. **GitHub** → cuenta + repo vacío `red-de-esperanza`.
2. **Supabase** (supabase.com) → proyecto gratis. En *Project Settings → API* copia: `Project URL`, `anon public key`, `service_role key` (secreta).
3. **Supabase Auth** → en *Authentication → Providers* deja activado **Email** (magic link). No necesitas más.
4. **Google AI Studio** (aistudio.google.com) → genera `GEMINI_API_KEY` gratis.
5. **Telegram** → `@BotFather` → `/newbot` → copia `TELEGRAM_BOT_TOKEN`.
6. **Vercel** y **Render** → cuentas con login de GitHub.

> Si algo cuesta, pídeselo a Claude Code: *"Guíame paso a paso para obtener X"*.

---

## 3. Los 5 roles de usuario (esto es el corazón de la app)

Cada persona ve una interfaz distinta, pensada para que sea **rapidísima y obvia** en su tarea. Resumen:

| Rol | Quién es | Qué ve / hace | Login |
|---|---|---|---|
| **Ciudadano** | Cualquiera | Ve el mapa, reporta una necesidad. Lo más simple. | No (anónimo) |
| **Emergencia** | Alguien en peligro ahora | Botón rojo gigante "SOS" → reporte de rescate en 2 toques. | No |
| **Voluntario** | Quien ayuda en campo | Ve necesidades **verificadas**, se asigna una, la marca "en proceso" / "atendida". | Sí |
| **Verificador** | Quien confirma reportes | **Cola de verificación**: confirma o rechaza lo que entra sin verificar. | Sí |
| **Administrador** | Tú y tu equipo | Gestiona usuarios y roles, ve panel de estadísticas y todo el sistema. | Sí |

**Principio visual común a todos:** botones grandes con ícono + texto, máximo 3 pasos por acción, tipografía grande, alto contraste, colores de la bandera (amarillo #CF9B00, azul #002FA7, rojo #CC0001), y que funcione con una mano y con señal débil.

### 3.1 Vista CIUDADANO (sin login)
- Pantalla = **mapa a pantalla completa** con los marcadores por color.
- Arriba: filtros simples (tipo, urgencia, "solo verificadas").
- Abajo: un botón flotante grande **"Reportar necesidad"** (formulario de 3 pasos: tipo → descripción + urgencia → ubicación).
- Cada marcador muestra una **insignia clara**: 🟢 *Verificado* o ⚪ *Sin verificar*. Nunca se esconde esta distinción.

### 3.2 Vista EMERGENCIA (sin login)
- Acceso desde un botón rojo **"SOS / Necesito rescate"** siempre visible.
- Flujo de 2 toques: (1) "Usar mi ubicación" (GPS) → (2) "Enviar SOS". Opcional: una línea de texto y a cuántas personas afecta.
- Crea una necesidad `tipo=rescate, urgencia=alta`, que **salta al tope de la cola de verificación**.
- Mensaje de calma: "Tu alerta fue enviada. Mantén el teléfono contigo."

### 3.3 Vista VOLUNTARIO (login)
- Lista + mapa de necesidades **verificadas y abiertas**, ordenadas por urgencia y cercanía.
- En cada una: botón **"Me asigno"** → pasa a `en_proceso` con su nombre. Luego **"Marcar atendida"** → `resuelta`.
- Filtro por zona y tipo. Ve solo lo confirmado (no pierde tiempo con ruido).

### 3.4 Vista VERIFICADOR (login) — la pantalla más importante
- **Cola de verificación**: tarjetas con los reportes `sin verificar`, ordenadas por gravedad (rescate primero) y antigüedad.
- Cada tarjeta muestra: el **texto original crudo**, lo que la IA extrajo (tipo, urgencia, zona), el origen (Telegram/web) y el mapa pequeño del punto.
- Tres acciones grandes por tarjeta:
  - ✅ **Confirmar** → estado pasa a `verificada` y se vuelve visible como oficial.
  - ✏️ **Corregir y confirmar** → ajusta tipo/zona/urgencia y confirma.
  - ❌ **Rechazar** (spam/duplicado/falso) → se archiva, no se publica.
- Botón **"Posible duplicado"** que agrupa reportes cercanos en lugar y tiempo.
- Diseñada para **resolver una tarjeta en segundos**, de modo que repartir esto entre 3-5 personas sea ligero.

### 3.5 Vista ADMINISTRADOR (login)
- **Gestión de usuarios**: lista de cuentas y un selector para asignar rol (ciudadano/voluntario/verificador/admin).
- **Panel**: número de necesidades abiertas/en proceso/resueltas, sin verificar pendientes, voluntarios activos.
- Acceso a todo el mapa y a la cola. Puede crear **centros de acopio** (pins fijos).

---

## 4. Estructura del proyecto

```
red-de-esperanza/
├── web/        → la PWA (React + Vite) con las 5 vistas por rol
├── bot/        → el bot de Telegram (Node + grammY)
├── supabase/   → esquema SQL (tablas, roles, RLS)
└── README.md
```

---

## 5. Esquema de la base de datos (SQL) — con roles y seguridad

Se ejecuta una vez en Supabase (Fase A). Cópialo tal cual.

```sql
-- ===== Tipos =====
create type necesidad_tipo as enum ('rescate','agua_comida','medicinas','refugio','otro','acopio');
create type necesidad_urgencia as enum ('alta','media','baja');
-- estado incluye 'sin_verificar' (entra por IA/ciudadano) y 'verificada' (confirmada por humano)
create type necesidad_estado as enum ('sin_verificar','verificada','en_proceso','resuelta','rechazada');
create type rol_usuario as enum ('ciudadano','voluntario','verificador','admin');

-- ===== Perfiles (1 por usuario autenticado) =====
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol rol_usuario not null default 'ciudadano',
  zona text,
  creado_en timestamptz not null default now()
);

-- Al registrarse, se crea su perfil como 'ciudadano' automáticamente
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.perfiles (id, nombre) values (new.id, new.email);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: ¿el usuario actual tiene alguno de estos roles?
create function public.tiene_rol(roles rol_usuario[]) returns boolean language sql stable as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = any(roles));
$$;

-- ===== Necesidades =====
create table necesidades (
  id uuid primary key default gen_random_uuid(),
  tipo necesidad_tipo not null default 'otro',
  urgencia necesidad_urgencia not null default 'media',
  estado necesidad_estado not null default 'sin_verificar',
  descripcion text not null,
  texto_crudo text,                 -- mensaje original tal cual llegó (trazabilidad)
  zona text,
  lat double precision,
  lng double precision,
  origen text default 'web',        -- 'web' | 'telegram' | 'sos'
  contacto text,                    -- PRIVADO, nunca en la vista pública
  asignado_a uuid references perfiles(id),
  verificada_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table centros_acopio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, descripcion text,
  lat double precision not null, lng double precision not null,
  creado_en timestamptz not null default now()
);

create index on necesidades (estado);
create index on necesidades (tipo);
create index on necesidades (creado_en desc);
alter publication supabase_realtime add table necesidades;

-- ===== Seguridad por filas (RLS) =====
alter table necesidades enable row level security;
alter table centros_acopio enable row level security;
alter table perfiles enable row level security;

-- Vista pública SIN contacto, para el mapa de ciudadanos
create view necesidades_publicas as
  select id, tipo, urgencia, estado, descripcion, zona, lat, lng, origen, creado_en
  from necesidades where estado <> 'rechazada';

-- Lectura: cualquiera (anónimo) puede leer la vista pública
create policy "leer necesidades" on necesidades for select using (true);
create policy "leer acopio" on centros_acopio for select using (true);

-- Crear reporte: cualquiera (anónimo incluido) puede insertar
create policy "crear necesidad" on necesidades for insert with check (true);

-- Actualizar: solo verificadores/admin (confirmar, rechazar, corregir);
-- voluntarios pueden actualizar para asignarse/atender
create policy "actualizar verificador" on necesidades for update
  using (public.tiene_rol(array['verificador','admin']::rol_usuario[]));
create policy "actualizar voluntario" on necesidades for update
  using (public.tiene_rol(array['voluntario','verificador','admin']::rol_usuario[]));

-- Perfiles: cada quien ve/edita el suyo; admin ve todos y cambia roles
create policy "ver mi perfil" on perfiles for select using (id = auth.uid() or public.tiene_rol(array['admin']::rol_usuario[]));
create policy "editar mi perfil" on perfiles for update using (id = auth.uid() or public.tiene_rol(array['admin']::rol_usuario[]));

-- Centros de acopio: solo admin crea/edita
create policy "admin acopio" on centros_acopio for all
  using (public.tiene_rol(array['admin']::rol_usuario[]));
```

> **Importante:** el bot usa la `service_role key` (salta RLS) para insertar reportes de Telegram. La web usa la `anon key` y respeta las políticas de arriba. Para hacerte **admin** la primera vez: en Supabase → Table Editor → `perfiles` → cambia tu fila a `rol = admin` a mano (una sola vez).

---

## 6. Variables de entorno

| Variable | Dónde | Valor |
|---|---|---|
| `VITE_SUPABASE_URL` | `web/.env` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | `web/.env` | anon public key |
| `SUPABASE_URL` | `bot/.env` y Render | Project URL |
| `SUPABASE_SERVICE_KEY` | `bot/.env` y Render | service_role key (secreta) |
| `GEMINI_API_KEY` | `bot/.env` y Render | API key de Gemini |
| `TELEGRAM_BOT_TOKEN` | `bot/.env` y Render | token de BotFather |

> Crea un `.gitignore` que excluya `node_modules` y `.env`. Nunca subas llaves a GitHub.

---

## 7. Paso a paso para Claude Code (pega cada PROMPT en orden)

Cada bloque está listo para copiar. Cambia solo lo que esté `EN_MAYÚSCULAS`.

### FASE A — Base de datos, roles y seguridad

> **PROMPT A:**
> "Crea un monorepo `red-de-esperanza` con carpetas `web/`, `bot/`, `supabase/` y un `.gitignore` de Node que excluya `node_modules` y `.env`. En `supabase/schema.sql` escribe EXACTAMENTE este SQL: [PEGA EL SQL DE LA SECCIÓN 5]. Luego dame pasos numerados y cortos para ejecutarlo en el SQL Editor de Supabase, y para marcarme como `admin` manualmente en la tabla `perfiles`."

**Prueba A:** en *Table Editor* existen `perfiles`, `necesidades`, `centros_acopio`. Insertas una necesidad de prueba y queda con `estado = sin_verificar`.

---

### FASE B — La PWA, el mapa en vivo y el login

> **PROMPT B:**
> "En `web/` crea una app con **Vite + React + TypeScript**, **Tailwind CSS**, **react-leaflet + leaflet**, **@supabase/supabase-js** y **vite-plugin-pwa**. Configura el cliente de Supabase con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Implementa **login con Supabase Auth por magic link** (email): una pantalla simple 'Ingresar' que envía el enlace, y manejo de sesión. Tras iniciar sesión, lee el perfil del usuario de la tabla `perfiles` y guarda su `rol` en el estado global (Context). Crea un sistema de **ruteo por rol** con react-router: según el `rol` se muestra la vista correspondiente (ciudadano, voluntario, verificador, admin). El ciudadano y la vista de emergencia NO requieren login. Crea `web/.env.example`."

**Prueba B:** sin login ves el mapa (vista ciudadano). Inicias sesión por email; si tu perfil es `admin`, entras a la vista admin.

---

### FASE C — Mapa de ciudadano + reportar + emergencia (sin login)

> **PROMPT C:**
> "Construye la **vista CIUDADANO**: mapa Leaflet a pantalla completa centrado en Venezuela (10.48, -66.90, zoom 11) con tiles de OpenStreetMap. Carga la vista `necesidades_publicas` y los `centros_acopio` y píntalos como marcadores coloreados por `tipo` (rescate=rojo, agua_comida=naranja, medicinas=amarillo, refugio=morado, acopio=verde). Cada marcador muestra una **insignia '🟢 Verificado' o '⚪ Sin verificar'** según `estado`. Suscríbete al Realtime de `necesidades` para actualizar sin recargar. Añade filtros (tipo, urgencia, 'solo verificadas'). Añade un botón flotante grande **'Reportar necesidad'** con formulario de 3 pasos (tipo con íconos → descripción + urgencia → ubicación por GPS o tocando el mapa, contacto opcional privado) que inserta en `necesidades`. Añade un botón rojo grande **'SOS / Necesito rescate'** (vista EMERGENCIA) que en 2 toques crea una necesidad `tipo=rescate, urgencia=alta, origen='sos'` con la ubicación GPS. Todo con botones grandes, alto contraste y usable con una mano."

**Prueba C:** creas un reporte y un SOS desde el celular; aparecen al instante como '⚪ Sin verificar' con el color correcto.

---

### FASE D — El bot de Telegram con IA (anti-errores)

> **PROMPT D:**
> "En `bot/` crea un servicio Node + TypeScript con **grammY** y **@supabase/supabase-js** (usando `SUPABASE_SERVICE_KEY`). Por cada mensaje de texto, llama a **Gemini** (`GEMINI_API_KEY`, modelo `gemini-1.5-flash`) con `response_mime_type: application/json` y un prompt que devuelva SOLO `{ tipo, urgencia, zona, descripcion }`, donde `tipo` ∈ [rescate, agua_comida, medicinas, refugio, otro] y `urgencia` ∈ [alta, media, baja]. **Reglas anti-error obligatorias:** (1) si la IA no está segura del tipo, usa 'otro'; (2) si no hay zona clara, deja `zona` vacía y NO inventes; (3) NUNCA inventes coordenadas. Guarda SIEMPRE el mensaje original en `texto_crudo`. Inserta en `necesidades` con `origen='telegram'` y `estado='sin_verificar'`. Responde confirmando lo que registró y pide al usuario **compartir su ubicación de Telegram**; si la comparte, actualiza la última necesidad de ese usuario con `lat`/`lng`. Si Gemini falla o el JSON no parsea, guarda el mensaje crudo con `tipo='otro'` igual (nunca se pierde un reporte). Comandos `/start` y `/ayuda`. Webhook en producción, long polling en local. Crea `bot/.env.example`."

**Prueba D:** escribes *"Necesito agua en Petare, urgente"* → el bot confirma `agua_comida/alta/Petare` y aparece como '⚪ Sin verificar' en el mapa.

---

### FASE E — Vista VERIFICADOR (la cola de verificación)

> **PROMPT E:**
> "Construye la **vista VERIFICADOR** (solo rol verificador/admin). Muestra una **cola** de necesidades con `estado='sin_verificar'`, ordenadas por gravedad (rescate primero) y luego por antigüedad. Cada elemento es una **tarjeta grande** que muestra: `texto_crudo` (el mensaje original), lo que la IA extrajo (tipo, urgencia, zona) en campos editables, el origen, la fecha y un mini-mapa con el punto. Tres botones grandes: **✅ Confirmar** (estado → `verificada`, guarda `verificada_por`), **✏️ Corregir y confirmar** (permite ajustar tipo/urgencia/zona/lat/lng y luego confirma), **❌ Rechazar** (estado → `rechazada`). Añade un botón **'Marcar posible duplicado'** que liste necesidades dentro de ~200 m y 2 h para agruparlas. Usa Realtime para que cuando un verificador resuelve una tarjeta, desaparezca de la cola de los demás al instante. Optimiza para resolver una tarjeta en pocos segundos con el teclado/toques."

**Prueba E:** entras como verificador, confirmas un reporte; en el mapa de ciudadano ese marcador cambia a '🟢 Verificado' para todos sin recargar.

---

### FASE F — Vista VOLUNTARIO

> **PROMPT F:**
> "Construye la **vista VOLUNTARIO** (rol voluntario/verificador/admin). Lista + mapa de necesidades con `estado='verificada'`, ordenadas por urgencia y cercanía. En cada una: **'Me asigno'** (estado → `en_proceso`, guarda `asignado_a` con su id) y **'Marcar atendida'** (estado → `resuelta`). Filtros por zona y tipo. Solo muestra lo verificado. Realtime para evitar que dos voluntarios tomen la misma."

**Prueba F:** como voluntario te asignas una necesidad verificada; cambia a 'en proceso' y desaparece de la lista de pendientes de los demás.

---

### FASE G — Vista ADMINISTRADOR

> **PROMPT G:**
> "Construye la **vista ADMINISTRADOR** (rol admin). Incluye: (1) **Gestión de usuarios**: tabla de `perfiles` con un selector para cambiar el `rol` de cada persona (ciudadano/voluntario/verificador/admin). (2) **Panel de estadísticas**: contadores de necesidades por estado (sin verificar / verificadas / en proceso / resueltas), pendientes en cola y voluntarios activos, con tarjetas grandes y claras. (3) Formulario para **crear centros de acopio** (nombre, descripción, ubicación). (4) Acceso al mapa completo y a la cola. Diseño limpio, números grandes."

**Prueba G:** como admin cambias el rol de una cuenta a 'verificador'; esa persona, al entrar, ve la cola de verificación.

---

### FASE H — PWA instalable y despliegue

> **PROMPT H:**
> "Configura `vite-plugin-pwa` con `manifest` (nombre 'Red de Esperanza', tema azul #002FA7, fondo blanco, íconos 192 y 512 px) para que sea **instalable** en iOS y Android. Service worker que cachee la app shell y el mapa base para abrir con conexión lenta. Banner discreto 'Instalar app'. Crea un `README.md` con instrucciones para correr web y bot en local y para desplegar `web/` en **Vercel** (raíz `web/`, variables `VITE_*`) y `bot/` en **Render** (raíz `bot/`, variables del bot, webhook). Dame el comando `curl` exacto para registrar el webhook de Telegram con mi token y mi URL de Render."

**Prueba H:** abres tu URL de Vercel en el celular, "Agregar a pantalla de inicio", se instala como app a pantalla completa; el bot responde y los reportes llegan al mapa.

---

## 8. Cómo opera sin que recaiga todo en ti

1. El **bot y el formulario** recogen y mapean todo **automáticamente** (marcado 'sin verificar').
2. Reclutas **3-5 verificadores** de confianza (familiares, amigos, comunidad). Cada uno entra a la **cola** desde su celular y confirma reportes en segundos. El trabajo se reparte solo: Realtime quita de la cola lo que otro ya resolvió.
3. Los **voluntarios de campo** solo ven lo verificado y se asignan tareas.
4. Tú, como **admin**, solo asignas roles y miras el panel. No verificas uno por uno.

> Si en algún momento no hay verificadores disponibles, el mapa sigue mostrando lo 'sin verificar' con su aviso honesto — útil, pero sin hacerlo pasar por oficial.

---

## 9. Checklist final de lanzamiento

- [ ] Tablas, roles, RLS y vista pública creados en Supabase
- [ ] Login por magic link funcionando; tu cuenta como `admin`
- [ ] Mapa de ciudadano en vivo (Vercel), con insignia verificado/sin verificar
- [ ] Reportar y SOS funcionando sin login
- [ ] Bot de Telegram en línea (Render, webhook) con reglas anti-error
- [ ] Cola de verificación: confirmar / corregir / rechazar / duplicado
- [ ] Vista voluntario: asignarse y atender
- [ ] Vista admin: gestionar roles + panel + centros de acopio
- [ ] App instalable (PWA) y abre con señal débil
- [ ] Contacto privado NUNCA visible en el mapa público
- [ ] 3-5 verificadores reclutados y con rol asignado
- [ ] Segunda API key de IA de respaldo

---

## 10. Errores comunes (qué decirle a Claude Code)

- **Mapa en blanco:** *"Importa `leaflet/dist/leaflet.css` y pon el contenedor a height 100vh."*
- **Marcadores invisibles:** *"Arregla los íconos de Leaflet con Vite usando assets importados."*
- **Realtime no actualiza:** confirma `alter publication supabase_realtime add table necesidades;`.
- **RLS bloquea o deja pasar de más:** *"Revisa las políticas; la web usa anon key, el bot usa service key. Verifica que `tiene_rol` funciona."*
- **No me deja cambiar roles:** debes ser `admin`; ponlo a mano en `perfiles` la primera vez.
- **El bot no recibe mensajes en producción:** falta el webhook → usa el comando curl.
- **Gemini devuelve texto extra:** *"Fuerza `response_mime_type application/json` y valida; si falla, usa tipo 'otro'."*

---

## 11. Después del lanzamiento

1. Empaquetar la PWA para tiendas o migrar a Expo (apps nativas).
2. Notificaciones push (web push, gratis en PWA) cuando hay urgencias cercanas.
3. Rastreo de redes sociales (X/Telegram públicos) **solo cuando haya verificadores suficientes** — es la parte más ruidosa, va al final.
4. Estadísticas avanzadas, modo offline completo, traducción a inglés y portugués.

> Hecho a tiempo es mejor que perfecto tarde. La IA propone, el humano confirma, y tú solo coordinas.
