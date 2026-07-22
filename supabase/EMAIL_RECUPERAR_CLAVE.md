# Correo de recuperación de contraseña — pasos (dashboard Supabase)

El flujo en la web YA está listo: en el login está el link **"¿Olvidaste tu
contraseña?"** → `/recuperar` (pide el correo) → Supabase manda el enlace →
`/nueva-clave` (pone la clave nueva). Falta configurar en el **dashboard de
Supabase** el remitente y el diseño del correo. Son 3 cosas.

## 1) Permitir el enlace de regreso (Redirect URLs)

Authentication → **URL Configuration** → en **Redirect URLs** agrega (una por
línea), tanto producción como local:

```
https://TU-DOMINIO/nueva-clave
http://localhost:5173/nueva-clave
http://localhost:5180/nueva-clave
```

Y en **Site URL** pon tu dominio de producción. Sin esto, el enlace del correo
no vuelve a la página.

## 2) Remitente = Reddeesperanza.vzla@gmail.com (SMTP propio)

Por defecto Supabase manda desde su correo genérico. Para que salga desde
**Reddeesperanza.vzla@gmail.com** hay que activar SMTP propio:

1. En esa cuenta de Gmail, activa la **verificación en 2 pasos** y crea una
   **"Contraseña de aplicación"** (Google → Cuenta → Seguridad → Contraseñas
   de aplicaciones). Copia esa clave de 16 letras.
2. Authentication → **SMTP Settings** → Enable Custom SMTP y completa:
   - **Host:** `smtp.gmail.com`
   - **Port:** `465`
   - **Username:** `Reddeesperanza.vzla@gmail.com`
   - **Password:** la contraseña de aplicación del paso 1 (NO la de tu Gmail)
   - **Sender email:** `Reddeesperanza.vzla@gmail.com`
   - **Sender name:** `Red de Esperanza`

> Nota: Gmail gratis tiene un límite de ~500 correos/día, suficiente para
> recuperaciones de clave. Si algún día crece mucho, se pasa a un proveedor
> de correo transaccional (Resend, SendGrid…), pero para esto va bien.

## 3) Diseño del correo (con los colores y un mensaje de aliento)

Authentication → **Email Templates** → pestaña **Reset Password** → pega esto
en el cuerpo (reemplaza lo que haya). El `{{ .ConfirmationURL }}` es el enlace
que genera Supabase.

```html
<div style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <div style="background:#002FA7;padding:20px 24px;">
        <div style="color:#ffffff;font-size:20px;font-weight:800;">🕊️ Red de Esperanza</div>
      </div>
      <div style="padding:24px;color:#374151;">
        <h1 style="margin:0 0 8px;font-size:20px;color:#002FA7;">Recupera tu contraseña</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
          Recibimos una solicitud para crear una contraseña nueva en tu cuenta.
          Toca el botón para hacerlo. Si no fuiste tú, puedes ignorar este correo.
        </p>
        <p style="text-align:center;margin:24px 0;">
          <a href="{{ .ConfirmationURL }}"
             style="background:#002FA7;color:#ffffff;text-decoration:none;font-weight:700;
                    padding:14px 28px;border-radius:12px;display:inline-block;font-size:16px;">
            Crear nueva contraseña
          </a>
        </p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
          El enlace vence pronto por seguridad. Si expira, pídelo de nuevo desde la app.
        </p>
        <div style="border-top:1px solid #f3f4f6;margin-top:20px;padding-top:16px;font-size:14px;color:#374151;">
          💙 Gracias por ser parte de esta red. Cada gesto de ayuda cuenta, y tú también importas.
        </div>
      </div>
      <div style="background:#CF9B00;height:6px;"></div>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">
      Red de Esperanza · Reddeesperanza.vzla@gmail.com
    </p>
  </div>
</div>
```

Puedes cambiar el **Subject** (asunto) a algo como:
`Recupera tu contraseña — Red de Esperanza 💙`

## Probar

En el login, toca "¿Olvidaste tu contraseña?", escribe un correo con cuenta,
y revisa que llegue el correo con este diseño y desde
Reddeesperanza.vzla@gmail.com. Al tocar el botón debe abrir `/nueva-clave`
para poner la clave nueva.
