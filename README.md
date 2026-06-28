# 🕊️ Red de Esperanza

Herramienta de emergencia (**PWA**) creada para el terremoto de Venezuela, donde
la gente reporta necesidades desde la propia app, **voluntarios humanos las
verifican**, y aparecen en un **mapa colaborativo público** en tiempo casi real.
Incluye además un registro de **personas desaparecidas**, **centros de acopio**
(nacionales e internacionales) y **zonas sin atender**.

🌐 En vivo: **red-de-esperanza-lime.vercel.app**

> Principio: **el ciudadano reporta, el humano confirma.** Todo lo que entra se
> marca **⚪ sin verificar** hasta que un verificador lo confirma
> (**🟢 verificado**). Nada sin verificar se publica como oficial.

## Estructura

```
red-de-esperanza/
├── web/        → PWA (React + Vite + TS) con las vistas por rol
├── scraper/    → scraper de personas desaparecidas (Python + Playwright)
├── supabase/   → esquema SQL (tablas, roles, RLS, analítica, migraciones 02→23)
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
| **Administrador** | Sí | Gestiona roles, panel, centros, scraping, visitantes |

El registro pide nombre, cédula/pasaporte, país, estado/región y ciudad, y el rol
elegido (ciudadano/voluntario/rescatista/centro de acopio). Nadie puede
auto-asignarse verificador ni admin: eso solo lo otorga un admin.

---

## ✨ Funciones principales

### Mapa colaborativo
- Mapa **Leaflet + OpenStreetMap** a pantalla completa, con marcadores por tipo y
  estado (🟢 verificado / ⚪ sin verificar).
- **Clustering** de marcadores en móvil para no saturar (sin spiderfy, para
  evitar crashes en pantallas pequeñas).
- **Jerarquía visual de íconos:** las necesidades (comida, agua, medicina,
  derrumbe, refugio, zona) van **más grandes y por encima**; hospitales y centros
  de acopio van **más pequeños y por debajo**; los desaparecidos quedan al fondo.
- **Íconos fuera de Venezuela** unificados a un tamaño menor (40 px); dentro de
  Venezuela mantienen su tamaño normal.

### Reportar necesidades (todo en una sola pantalla)
- Tipos: **rescate (SOS)**, **agua/comida**, **medicinas**, **refugio**,
  **derrumbe** (edificio colapsado), **zona sin atender** y **otros**.
- Un **único botón "Enviar reporte"** (sin pasos intermedios).
- Para ubicar el punto, el reporte:
  1. Acepta una **dirección escrita con número de casa/apto** y la geocodifica.
  2. Permite usar **"Mi ubicación"** (GPS) — botón resaltado y opcional.
  3. Deja **arrastrar un pin** en un mini-mapa o **pegar coordenadas**.
- **Solo se aceptan reportes dentro de Venezuela**: si las coordenadas caen fuera,
  se rechaza con un aviso (no borra lo existente).
- Si la dirección no es válida o no se encuentra, sale una **alerta clara**.
- **Zona sin atender:** dibuja un **círculo rojo translúcido titilante**
  proporcional al tamaño elegido (1, 3 o 5 km de diámetro) con una **banderita 🚩**;
  al tocarlo muestra título y ubicación.
- **Edificio derrumbado:** usa la **dirección escrita** (no toma el GPS
  automáticamente); el GPS queda como botón opcional.

### Geocodificación con Google Maps (interna)
- La app consulta **Google Maps** internamente para resolver una dirección con
  número exacto; si está dentro de Venezuela, **trae las coordenadas al mapa de
  OpenStreetMap** (la base sigue siendo OSM, no se cambia).
- Si Google no está disponible, hay **respaldo con Nominatim/OSM** generando
  variantes de la dirección (calle+ciudad+estado, completa, sin número, etc.) y
  detectando la precisión del resultado.
- **"🧭 Cómo llegar"** abre la **app de Google Maps** con la ruta.
- Funciona con direcciones de **cualquier país** (no solo Venezuela), útil para
  centros de acopio internacionales.

### Centros de acopio (nacionales e internacionales)
- Se ubican por **dirección escrita** (geocodificada) con GPS opcional; aparecen
  en el mapa principal.
- Formulario con **selector de país → región/estado → ciudad** (igual que el
  registro), según el país elegido.
- El **país de cada centro** se determina de forma robusta: para los centros
  scrapeados se deduce del **texto** (nombre/dirección) o de las **coordenadas**,
  no del país que traía el scraper (que ponía "Venezuela" por defecto). Así los
  centros de España, EE.UU., Argentina, Chile, etc. **sí aparecen en el filtro por
  país**. (Ej.: "Texas / San Antonio" se clasifica como Estados Unidos, no México.)

### Filtros
- Filtro por **tipo** ampliado: incluye todos los tipos de necesidad **más
  centros de acopio y hospitales**.
- Filtro por **urgencia**.

### Personas desaparecidas
- Registro de desaparecidos alimentado por el **scraper** (ver `scraper/`), con
  hasta decenas de miles de registros.
- **Ocultos al entrar**; solo se muestran al pulsar el botón **🔍 Desaparecidos**.
- Cuando varios comparten un mismo punto, se **esparcen en un disco** alrededor
  para poder ver/abrir cada persona sin que la app se trabe.
- Las ubicaciones son **aproximadas** (se advierte en el tutorial), no exactas.

### Tutorial "¿Cómo funciona?"
- Botón **más visual** (color bandera + 💡) pero sin acaparar la atención.
- Explica zonas sin atender, banderas, filtros y **advierte que la ubicación de
  los desaparecidos es aproximada y puede fallar**.

### Panel de administración
- **Estadísticas** de necesidades (recibidas / en proceso / resueltas) y equipo
  activo.
- **Gestión de usuarios y roles**.
- **Scraping** de personas desaparecidas (ejecutar y administrar).
- **Centros de acopio** (gestión unificada, también internacionales).
- **👥 Visitantes:** contador anónimo de cuántos dispositivos han usado la página
  y **desglose por país** (país aproximado por IP, una fila por dispositivo, máximo
  una escritura por día). Requiere la migración 23.

---

## 1. Configurar Supabase (una vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega TODO el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **SQL Editor → New query** → ejecuta, **en orden, una por una** (Run entre cada
   una), las migraciones. Resumen:

   | Archivo | Para qué |
   |---|---|
   | `02_analitica_y_emergencias.sql` | Registro de acciones (`eventos`) para análisis |
   | `03_centros_internacionales.sql` | Centros de acopio internacionales |
   | `04_derrumbes.sql` | Tipo de necesidad "derrumbe" (edificios colapsados) |
   | `05_chat_y_perfiles_publicos.sql` | Chat global por estado y perfiles públicos |
   | `06_foto_perfil.sql` | Foto de perfil (avatar) + bucket de Storage |
   | `07_acopio_estado.sql` | Estado/región en centros de acopio (para filtrar) |
   | `08_chat_retencion_3dias.sql` | Retención del chat a 3 días |
   | `09_indices.sql` | Índices de rendimiento |
   | `10_borrar_propio_y_rol.sql` | Borrar el propio reporte + ajustes de rol |
   | `11_chat_contacto_abierto.sql` | Apertura de contacto en el chat |
   | `12_acopio_contacto_y_perfil_ciudad.sql` | Contacto de acopio + ciudad de perfil |
   | `13_pais_y_roles.sql` | País en el registro y roles |
   | `14_admin_judicoro.sql` | Marca al admin inicial |
   | `15_fix_registro.sql` | Arreglo del flujo de registro |
   | `16_reset_para_publicar.sql` | Limpieza de datos de prueba |
   | `17_perfil_desde_cliente.sql` | Crear perfil desde el cliente |
   | `18_desaparecidos_id_fuente.sql` | Tabla de desaparecidos + `id_fuente` |
   | `19_centros_id_fuente.sql` | `id_fuente` en centros (distinguir scrapeados) |
   | `20_scraper_runs.sql` | Bitácora de corridas del scraper |
   | `21_indices_upsert.sql` | Índices para upsert sin duplicados |
   | `22_zona_sin_atender.sql` | Tipo "zona sin atender" + `radio_km` |
   | `23_visitas.sql` | Contador anónimo de visitantes (panel admin) |

4. **Authentication → Sign In / Providers → Email**: deja **Email** activado.
   Recomendado: activa **Confirm email** para que cada cuenta se verifique por
   correo y no se creen cuentas falsas masivas.
5. **Project Settings → API**: copia `Project URL` y la **publishable key**
   (`sb_publishable_…`). Esa llave es pública por diseño; la seguridad viene del
   **RLS**, no de esconderla.
6. Para hacerte **admin** la primera vez: regístrate en la web con tu correo,
   luego en **Table Editor → `perfiles`** cambia tu fila a `rol = admin` (o usa la
   migración 14 si es tu correo).

> 🔒 **Nota de seguridad:** el campo de contacto NO vive en `necesidades`. Se
> guarda en la tabla aparte `contactos_necesidad`, legible solo por personal
> interno. Así el contacto privado nunca se filtra al mapa público ni por
> Realtime. Lo mismo aplica a los `mensajes` del chat (solo el reportante y el
> personal que atiende los ven). La tabla `visitas` permite inserción anónima
> pero **solo un admin puede leerla**.

## 2. Web (local)

```bash
cd web
cp .env.example .env        # rellena las variables (ver abajo)
npm install
npm run dev                 # http://localhost:5173
```

### Variables de entorno (`web/.env`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | Sí | Project URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sí | Publishable key (`sb_publishable_…`) |
| `VITE_GOOGLE_MAPS_KEY` | Opcional | Geocodificar direcciones con precisión (números de casa). Si falta, se usa OSM/Nominatim como respaldo |

> ⚠️ La clave de Google Maps queda **visible en el navegador** (es normal en claves
> de Maps para web). **Restríngela en Google Cloud** por *HTTP referrers* (tu
> dominio de Vercel + `localhost`) y por API (Maps JavaScript API + Geocoding API).
> Regenérala si se filtra y muévela a variables de entorno de Vercel cuando puedas.

---

## 3. Desplegar la web en Vercel

1. Sube el repo a GitHub.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. **Root Directory:** `web`
4. **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
   (opcional) `VITE_GOOGLE_MAPS_KEY`.
5. Deploy. Vercel detecta Vite automáticamente y redespliega en cada push a `main`.

## 4. Instalar como app (PWA)

Abre la URL de Vercel en el celular → menú del navegador → **"Agregar a
pantalla de inicio"**. Se instala como app a pantalla completa (iOS y Android),
y el mapa base queda cacheado para abrir con señal débil.

## 5. Scraper de personas desaparecidas

El registro de desaparecidos se alimenta con el scraper en [`scraper/`](scraper/)
(Python + Playwright), que consulta la API real de la fuente, se ejecuta por
**GitHub Actions** y hace **upsert sin duplicar** (corridas registradas en
`scraper_runs`). Ver la nota de arquitectura del proyecto para detalles.

## 6. Pruebas de aceptación

- [ ] Sin login ves el mapa (vista ciudadano); los desaparecidos están ocultos
      hasta pulsar 🔍.
- [ ] Creas un reporte por dirección escrita → se geocodifica y aparece como ⚪.
- [ ] Un reporte con coordenadas fuera de Venezuela se **rechaza** con aviso.
- [ ] Una "zona sin atender" dibuja un círculo rojo titilante proporcional a los km.
- [ ] Un centro de acopio internacional aparece en el filtro por su país real.
- [ ] "Cómo llegar" abre Google Maps con la ruta.
- [ ] Como admin ves el panel: estadísticas, roles, scraping y **👥 Visitantes**.
- [ ] El contacto privado NUNCA aparece en el mapa público.

## Stack

React + Vite + TypeScript · Tailwind · Leaflet + OpenStreetMap (+ Google Maps
solo para geocodificar/rutas) · Supabase (Postgres + Auth + Realtime) ·
Python + Playwright (scraper) · GitHub Actions · Vercel. Todo con plan gratuito.
