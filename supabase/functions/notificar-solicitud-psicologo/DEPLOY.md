# Aviso por WhatsApp a los admins — pasos para activarlo (opcional)

Esta función es un aviso **extra**. La notificación principal de una nueva
solicitud de psicólogo/a YA funciona sin esto:
- En la app, en vivo (campana 🔔) para quien tenga sesión como admin/lider_psicologo.
- Por push (`enviar-push`, si ya está configurado — ver su propio DEPLOY.md),
  aunque tengan la app cerrada.

Este WhatsApp es un canal adicional para cuando ni siquiera tengan la app
abierta. **Requiere una cuenta de WhatsApp Business verificada por Meta**, así
que es más trabajo de configurar. Si no te interesa, puedes saltarte esto por
completo: el resto de la app funciona igual sin ella (la función revisa si
está configurada y, si no, no hace nada — nunca rompe el envío de la
solicitud).

## 1) Crear la cuenta de WhatsApp Business (Meta)

1. Entra a [business.facebook.com](https://business.facebook.com) y crea (o
   usa) un Business Manager.
2. Ve a [developers.facebook.com](https://developers.facebook.com) → Mis apps
   → Crear app → tipo "Business" → agrega el producto **WhatsApp**.
3. Meta te da un **número de prueba gratis** para probar sin comprar nada
   (sirve para validar que todo funciona, pero solo le puede escribir a
   números que agregues como "destinatarios de prueba" en el panel).
4. Para producción real necesitas verificar tu propio número de WhatsApp
   Business (proceso de verificación de negocio de Meta).

## 2) Conseguir las credenciales

En el panel de WhatsApp de tu app (developers.facebook.com → tu app →
WhatsApp → API Setup) vas a ver:
- **Temporary access token** (dura 24h; para producción genera uno
  permanente en Business Settings → System users).
- **Phone number ID** (el id del número que envía los mensajes).

## 3) Poner los secretos

Project Settings → **Edge Functions → Secrets** → agrega:

| Nombre | Valor |
|---|---|
| `WHATSAPP_TOKEN` | el access token de tu app de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | el phone number id |
| `PSICOLOGIA_ADMIN_WHATSAPP` | números destino separados por coma, formato internacional SIN el signo `+` (ej: `584121234567,56912345678`) |
| `WHATSAPP_TEMPLATE` | (opcional) nombre de una plantilla aprobada — ver abajo |

## 4) Desplegar la función

```bash
supabase functions deploy notificar-solicitud-psicologo --no-verify-jwt
```

## 5) La limitación real de WhatsApp: la ventana de 24 horas

Meta **no deja** que un negocio le escriba primero a alguien con texto libre
salvo que esa persona le haya escrito a tu número en las últimas 24 horas.
Como el admin nunca le escribió primero al número de negocio, el mensaje de
texto libre **fallará** la primera vez.

Dos formas de resolverlo:

**Opción A (rápida, recomendada para empezar):** que cada admin/líder de
psicología le mande UN mensaje cualquiera (ej. "hola") al número de WhatsApp
Business desde su teléfono. Eso abre la ventana de 24h y, mientras siga
escribiéndose de vez en cuando, los avisos de texto libre le llegarán.

**Opción B (para que llegue siempre, sin depender de esa ventana):** crear una
**plantilla de mensaje** en Meta Business Manager → WhatsApp Manager →
Message Templates, categoría "Utility", con un texto tipo:

```
Nueva solicitud para ser psicólogo/a en Red de Esperanza: {{1}}
```

Meta la revisa y aprueba (puede tardar minutos a un día). Una vez aprobada,
pon su nombre exacto en el secreto `WHATSAPP_TEMPLATE` y la función la usa
automáticamente — esas SÍ llegan sin importar la ventana de 24h.

## 6) Probar

Envía una solicitud de psicólogo/a de prueba desde la app y revisa si llega
el WhatsApp. Si no llega, revisa los logs de la función
(`supabase functions logs notificar-solicitud-psicologo`) — normalmente el
motivo es la ventana de 24h (ver punto 5) o un token vencido (los
"temporary access token" duran solo 24h).
