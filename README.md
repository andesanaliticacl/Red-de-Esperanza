# 🕊️ Red de Esperanza

Herramienta de emergencia (PWA + bot de Telegram) donde la gente reporta
necesidades, una IA las estructura, **voluntarios humanos las verifican**, y
aparecen en un **mapa colaborativo público** en tiempo casi real.

> Principio: **la IA propone, el humano confirma.** Todo lo que entra por IA o
> por ciudadanos se marca **⚪ sin verificar** hasta que un verificador lo
> confirma (**🟢 verificado**). Un error de la IA nunca se publica como oficial.

## Estructura

```
red-de-esperanza/
├── web/        → PWA (React + Vite + TS) con las 5 vistas por rol
├── bot/        → bot de Telegram (Node + grammY + Gemini)
├── supabase/   → esquema SQL (tablas, roles, RLS)
└── README.md
```

## Los 5 roles

| Rol | Login | Hace |
|---|---|---|
| **Ciudadano** | No | Ve el mapa, reporta necesidades |
| **Emergencia** | No | Botón SOS, rescate en 2 toques |
| **Voluntario** | Sí | Ve lo verificado, se asigna y atiende |
| **Verificador** | Sí | Cola de verificación: confirma/corrige/rechaza |
| **Administrador** | Sí | Gestiona roles, panel, centros de acopio |

---

## 1. Configurar Supabase (una vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega TODO el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Providers** → deja **Email** activado (magic link).
4. **Project Settings → API** → copia `Project URL`, `anon public key` y
   `service_role key` (secreta).
5. Para hacerte **admin** la primera vez: regístrate en la web con tu correo,
   luego en **Table Editor → `perfiles`** cambia tu fila a `rol = admin`.

> 🔒 **Nota de seguridad (mejora sobre la guía v2):** el campo de contacto NO
> vive en `necesidades`. Se guarda en la tabla aparte `contactos_necesidad`,
> legible solo por personal interno. Así el contacto privado nunca se filtra al
> mapa público ni por Realtime.

## 2. Web (local)

```bash
cd web
cp .env.example .env        # rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # http://localhost:5173
```

## 3. Bot de Telegram (local)

```bash
cd bot
cp .env.example .env        # rellena SUPABASE_*, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN
npm install
npm run dev                 # corre en long polling (sin webhook)
```

Crea el bot con [@BotFather](https://t.me/BotFather) → `/newbot` para obtener el
`TELEGRAM_BOT_TOKEN`. La `GEMINI_API_KEY` se saca gratis en
[aistudio.google.com](https://aistudio.google.com).

> El modelo de Gemini es configurable con `GEMINI_MODEL` (por defecto
> `gemini-2.0-flash`). Si tu cuenta no tiene ese modelo, prueba con otro flash
> vigente.

---

## 4. Desplegar la web en Vercel

1. Sube el repo a GitHub.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. **Root Directory:** `web`
4. **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Deploy. Vercel detecta Vite automáticamente.

## 5. Desplegar el bot en Render

1. En [render.com](https://render.com) → **New → Web Service** → conecta el repo.
2. **Root Directory:** `bot`
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. **Environment Variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, y `PUBLIC_URL` con la URL pública que
   te da Render (ej. `https://red-de-esperanza-bot.onrender.com`).
   - Con `PUBLIC_URL` definido, el bot arranca en modo **webhook**.

### Registrar el webhook de Telegram

Una vez desplegado el bot, registra el webhook (reemplaza `TOKEN` y la URL):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<TU-APP>.onrender.com/webhook"
```

Verifica con:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

---

## 6. Instalar como app (PWA)

Abre la URL de Vercel en el celular → menú del navegador → **"Agregar a
pantalla de inicio"**. Se instala como app a pantalla completa (iOS y Android),
y el mapa base queda cacheado para abrir con señal débil.

## 7. Pruebas de aceptación

- [ ] Sin login ves el mapa (vista ciudadano).
- [ ] Creas un reporte y un SOS desde el celular → aparecen al instante como ⚪.
- [ ] El bot responde y un mensaje crea un reporte ⚪ en el mapa.
- [ ] Como verificador confirmas un reporte → cambia a 🟢 para todos sin recargar.
- [ ] Como voluntario te asignas una verificada → pasa a "en proceso".
- [ ] Como admin cambias el rol de una cuenta y ves el panel.
- [ ] El contacto privado NUNCA aparece en el mapa público.

## Stack

React + Vite + TypeScript · Tailwind · Leaflet + OpenStreetMap ·
Supabase (Postgres + Auth + Realtime) · grammY · Google Gemini ·
Vercel · Render. Todo con plan gratuito.
