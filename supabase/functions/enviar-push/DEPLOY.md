# Notificaciones push — pasos para activarlo (una sola vez)

El código ya está hecho. Falta conectarlo en Supabase. Sigue estos pasos en orden.

## 1) Crear la tabla
SQL Editor → New query → pega y corre `supabase/26_push.sql`.

## 2) Poner los secretos (llaves VAPID)
Project Settings → **Edge Functions → Secrets** → agrega:

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC` | la llave PÚBLICA (la misma que está en `web/src/lib/push.ts`) |
| `VAPID_PRIVATE` | la llave PRIVADA (te la pasé por chat — NO está en el repo) |
| `VAPID_SUBJECT` | `mailto:tucorreo@dominio.com` (tu correo) |

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen incluidos, no los agregues.

## 3) Desplegar la Edge Function
Con la CLI de Supabase (en tu PC, dentro del repo):

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy enviar-push --no-verify-jwt
```

`--no-verify-jwt` deja que los webhooks de la base la llamen sin token. (Si
prefieres, quítalo y en cada webhook agrega el header
`Authorization: Bearer <ANON_KEY>`.)

> ¿Sin CLI? También puedes crear la función desde el Dashboard
> (Edge Functions → Create function → nombre `enviar-push`) y pegar el contenido
> de `supabase/functions/enviar-push/index.ts`.

## 4) Crear los Database Webhooks
Database → **Webhooks** → Create a new hook. Crea **dos**, ambos apuntando a la
Edge Function `enviar-push` (tipo HTTP Request / Supabase Edge Functions):

**Webhook A — necesidades**
- Tabla: `necesidades`
- Eventos: `Insert` y `Update`
- URL: la de la función `enviar-push`

**Webhook B — mensajes**
- Tabla: `mensajes`
- Eventos: `Insert`
- URL: la de la función `enviar-push`

## 5) Probar
1. En la web, inicia sesión, abre la 🔔 y pulsa **"Activar avisos en este
   dispositivo"** (acepta el permiso del navegador).
2. Desde otro usuario/dispositivo crea una necesidad o SOS.
3. Te debe llegar la notificación **aunque tengas la página cerrada**.

## A quién le llega
- **Nueva necesidad / SOS** → a voluntarios y rescatistas.
- **Te asignaron tu reporte** → a quien lo creó (si tenía sesión).
- **Mensaje nuevo** → a los participantes de esa conversación.

## Notas
- **iPhone:** las push solo funcionan si la persona instaló la página
  (Compartir → "Agregar a inicio"). En Android y PC funcionan sin instalar.
- Si una suscripción muere (desinstalan el navegador, revocan permiso), la
  función la borra sola al fallar el envío.
