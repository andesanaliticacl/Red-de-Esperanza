# 🕊️ Red de Esperanza

Herramienta de emergencia (**PWA**) donde la gente reporta necesidades desde la
propia app, **voluntarios humanos las verifican**, y aparecen en un **mapa
colaborativo público** en tiempo casi real.

> Principio: **el ciudadano reporta, el humano confirma.** Todo lo que entra se
> marca **⚪ sin verificar** hasta que un verificador lo confirma
> (**🟢 verificado**). Nada sin verificar se publica como oficial.

## Estructura

```
red-de-esperanza/
├── web/        → PWA (React + Vite + TS) con las vistas por rol
├── supabase/   → esquema SQL (tablas, roles, RLS, analítica)
└── README.md
```

## Roles

| Rol | Login | Hace |
|---|---|---|
| **Ciudadano** | Opcional | Ve el mapa, reporta necesidades, botón SOS |
| **Voluntario** | Sí | Ve lo verificado, se asigna y atiende |
| **Rescatista** | Sí | Atiende rescates/emergencias, ve el feed SOS |
| **Centro de acopio** | Sí | Gestiona donaciones y suministros |
| **Verificador** | Sí | Cola de verificación: confirma/corrige/rechaza |
| **Administrador** | Sí | Gestiona roles, panel, centros de acopio |

El registro pide nombre, cédula/pasaporte, estado y ciudad de Venezuela, y el rol
elegido (ciudadano/voluntario/rescatista/centro de acopio). Nadie puede
auto-asignarse verificador ni admin: eso solo lo otorga un admin.

---

## 1. Configurar Supabase (una vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega TODO el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **SQL Editor → New query** → ejecuta, en orden, cada una de estas migraciones
   (una por una, **Run** entre cada una):
   - [`supabase/02_analitica_y_emergencias.sql`](supabase/02_analitica_y_emergencias.sql) — registro de acciones para análisis.
   - [`supabase/03_centros_internacionales.sql`](supabase/03_centros_internacionales.sql) — centros de acopio internacionales.
   - [`supabase/04_derrumbes.sql`](supabase/04_derrumbes.sql) — tipo de necesidad "derrumbe" (edificios colapsados).
   - [`supabase/05_chat_y_perfiles_publicos.sql`](supabase/05_chat_y_perfiles_publicos.sql) — chat global por estado y vista pública de perfiles.
   - [`supabase/06_foto_perfil.sql`](supabase/06_foto_perfil.sql) — foto de perfil (avatar) + bucket de Storage.
4. **Authentication → Sign In / Providers → Email**: deja **Email** activado.
   Recomendado: activa **Confirm email** para que cada cuenta se verifique por
   correo y no se creen cuentas falsas masivas.
5. **Project Settings → API**: copia `Project URL` y la **publishable key**
   (`sb_publishable_…`). Esa llave es pública por diseño; la seguridad viene del
   **RLS**, no de esconderla.
6. Para hacerte **admin** la primera vez: regístrate en la web con tu correo,
   luego en **Table Editor → `perfiles`** cambia tu fila a `rol = admin`.

> 🔒 **Nota de seguridad:** el campo de contacto NO vive en `necesidades`. Se
> guarda en la tabla aparte `contactos_necesidad`, legible solo por personal
> interno. Así el contacto privado nunca se filtra al mapa público ni por
> Realtime. Lo mismo aplica a los `mensajes` del chat (solo el reportante y el
> personal que atiende los ven).

## 2. Web (local)

```bash
cd web
cp .env.example .env        # rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # http://localhost:5173
```

`VITE_SUPABASE_ANON_KEY` es tu **publishable key** (`sb_publishable_…`).

---

## 3. Desplegar la web en Vercel

1. Sube el repo a GitHub.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. **Root Directory:** `web`
4. **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Deploy. Vercel detecta Vite automáticamente.

## 4. Instalar como app (PWA)

Abre la URL de Vercel en el celular → menú del navegador → **"Agregar a
pantalla de inicio"**. Se instala como app a pantalla completa (iOS y Android),
y el mapa base queda cacheado para abrir con señal débil.

## 5. Funciones clave

- **Reportar / SOS:** ubicación por GPS con respaldo por IP si el GPS falla. El
  SOS aparece al instante a rescatistas/voluntarios y ofrece llamar al **911**.
- **Verificación:** cola priorizada (rescate primero), detección de duplicados,
  confirmar/corregir/rechazar.
- **Mensajería:** chat por necesidad entre el reportante y quien atiende.
- **Cómo llegar:** botón que abre Google Maps con la ruta y el tiempo estimado.
- **Analítica:** cada acción queda registrada en la tabla `eventos` (ver vista
  `estadisticas_usuario`) para análisis posterior.

## 6. Pruebas de aceptación

- [ ] Sin login ves el mapa (vista ciudadano).
- [ ] Creas un reporte y un SOS → aparecen al instante como ⚪.
- [ ] Como verificador confirmas un reporte → cambia a 🟢 para todos sin recargar.
- [ ] Como voluntario/rescatista te asignas una verificada → pasa a "en proceso".
- [ ] El feed de SOS muestra las emergencias entrantes en tiempo real.
- [ ] El chat funciona entre reportante y personal.
- [ ] Como admin cambias el rol de una cuenta y ves el panel.
- [ ] El contacto privado NUNCA aparece en el mapa público.

## Stack

React + Vite + TypeScript · Tailwind · Leaflet + OpenStreetMap ·
Supabase (Postgres + Auth + Realtime) · Vercel. Todo con plan gratuito.
