// Edge Function: notificar-solicitud-psicologo
// Avisa por WhatsApp a los administradores cuando alguien pide ser
// psicólogo/a. Es un aviso EXTRA (best-effort): la notificación principal
// ya llega dentro de la app (campana en vivo) y por push (enviar-push).
// Si no está configurada, esta función simplemente no hace nada — nunca
// bloquea ni rompe el envío de la solicitud.
//
// Usa la API oficial de WhatsApp Business Cloud (Meta). Requiere una cuenta
// de WhatsApp Business verificada. Ver DEPLOY.md para el paso a paso.
//
// Secretos necesarios (Project Settings → Edge Functions → Secrets):
//   WHATSAPP_TOKEN            token de acceso de la app de Meta
//   WHATSAPP_PHONE_NUMBER_ID  id del número de WhatsApp Business emisor
//   PSICOLOGIA_ADMIN_WHATSAPP números destino, separados por coma, en
//                              formato internacional sin '+' (ej. "584121234567,56912345678")
//   WHATSAPP_TEMPLATE         (opcional) nombre de una plantilla APROBADA
//                              por Meta para mensajes fuera de la ventana de
//                              24h. Si no se define, se intenta un mensaje de
//                              texto libre (solo funciona si el número
//                              destino ya escribió al número de negocio en
//                              las últimas 24h).

const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? ''
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''
const DESTINOS = (Deno.env.get('PSICOLOGIA_ADMIN_WHATSAPP') ?? '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean)
const TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

interface Payload {
  nombre?: unknown
  telefono?: unknown
  pais?: unknown
}

async function enviarAUno(destino: string, texto: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`
  const body = TEMPLATE
    ? {
        // Plantilla aprobada: funciona aunque hayan pasado más de 24h desde
        // el último mensaje del destinatario. El texto va como parámetro.
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: TEMPLATE,
          language: { code: 'es' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: texto }] },
          ],
        },
      }
    : {
        // Mensaje de texto libre: solo lo entrega Meta si el destino ya
        // escribió al número de negocio en las últimas 24h.
        messaging_product: 'whatsapp',
        to: destino,
        type: 'text',
        text: { body: texto },
      }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  // Sin credenciales configuradas: no es un error, simplemente no hay a
  // dónde avisar todavía. La solicitud en sí ya se guardó bien.
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || DESTINOS.length === 0) {
    return json({ ok: true, enviado: false, motivo: 'whatsapp_no_configurado' })
  }

  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return json({ ok: false, error: 'Solicitud invalida' }, { status: 400 })
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre : 'Alguien'
  const telefono = typeof body.telefono === 'string' ? body.telefono : ''
  const pais = typeof body.pais === 'string' ? body.pais : ''
  const texto =
    `🧠 Nueva solicitud para ser psicólogo/a en Red de Esperanza.\n` +
    `Nombre: ${nombre}\n` +
    (pais ? `País: ${pais}\n` : '') +
    (telefono ? `Teléfono: ${telefono}\n` : '') +
    `Revísala en la app: sección Psicología.`

  const resultados = await Promise.allSettled(
    DESTINOS.map((d) => enviarAUno(d, texto)),
  )
  const enviados = resultados.filter(
    (r) => r.status === 'fulfilled' && r.value === true,
  ).length

  return json({ ok: true, enviado: enviados > 0, enviados, total: DESTINOS.length })
})
