// Edge Function: enviar-push
// Envía notificaciones push (Web Push / VAPID) cuando ocurre algo en la base.
// Se dispara con Database Webhooks de Supabase (Database → Webhooks):
//   · INSERT en `necesidades`  → avisa al equipo de campo (voluntario/rescatista)
//   · UPDATE en `necesidades`  → si se asignó, avisa a quien reportó
//   · INSERT en `mensajes`     → avisa a los participantes de la conversación
//
// Secretos necesarios (Project Settings → Edge Functions → Secrets):
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (ej. mailto:tucorreo@dominio.com)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen incluidos.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@reddeesperanza.app'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

interface Aviso {
  title: string
  body: string
  url: string
  tag?: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
}

// Decide a QUIÉN avisar y CON QUÉ, según el evento de la base.
async function calcular(
  p: WebhookPayload,
): Promise<{ userIds: string[]; aviso: Aviso } | null> {
  const r = p.record ?? {}

  // --- Necesidad nueva → equipo de campo (menos quien la reportó) ---
  if (p.table === 'necesidades' && p.type === 'INSERT') {
    const esSOS = r.tipo === 'rescate' || r.origen === 'sos'
    const { data } = await supabase
      .from('perfiles')
      .select('id')
      .in('rol', ['voluntario', 'rescatista'])
    const userIds = (data ?? [])
      .map((x) => x.id as string)
      .filter((id) => id !== r.reportado_por)
    return {
      userIds,
      aviso: {
        title: esSOS ? '🆘 Nueva emergencia SOS' : '🔔 Nueva necesidad',
        body: esSOS
          ? 'Alguien pidió rescate. Tócalo para verlo en el mapa.'
          : 'Hay una nueva necesidad para atender cerca.',
        url: `/?necesidad=${r.id}`,
        tag: 'necesidad',
      },
    }
  }

  // --- Asignación → avisar a quien reportó (ya están atendiendo su solicitud) ---
  if (p.table === 'necesidades' && p.type === 'UPDATE') {
    const antes = (p.old_record?.asignado_a ?? null) as string | null
    const ahora = (r.asignado_a ?? null) as string | null
    if (!antes && ahora && r.reportado_por) {
      return {
        userIds: [r.reportado_por as string],
        aviso: {
          title: '🚑 ¡Ya están atendiendo tu solicitud!',
          body: 'Un voluntario o rescatista tomó tu solicitud.',
          url: '/mis-reportes',
          tag: 'asignacion',
        },
      }
    }
    return null
  }

  // --- Mensaje nuevo → participantes de la conversación (menos el autor) ---
  if (p.table === 'mensajes' && p.type === 'INSERT') {
    const { data: nec } = await supabase
      .from('necesidades')
      .select('reportado_por, asignado_a')
      .eq('id', r.necesidad_id as string)
      .maybeSingle()
    if (!nec) return null
    const userIds = [nec.reportado_por, nec.asignado_a]
      .filter((id): id is string => Boolean(id) && id !== r.autor)
    if (userIds.length === 0) return null
    return {
      userIds,
      aviso: {
        title: '💬 Nuevo mensaje',
        body: 'Te escribieron en una conversación.',
        url: '/conversaciones',
        tag: 'mensaje',
      },
    }
  }

  return null
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload
    const plan = await calcular(payload)
    if (!plan || plan.userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviados: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Suscripciones de los destinatarios.
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', plan.userIds)

    const cuerpo = JSON.stringify(plan.aviso)
    let enviados = 0
    await Promise.all(
      (subs ?? []).map(async (s) => {
        const suscripcion = {
          endpoint: s.endpoint as string,
          keys: { p256dh: s.p256dh as string, auth: s.auth as string },
        }
        try {
          await webpush.sendNotification(suscripcion, cuerpo)
          enviados++
        } catch (e) {
          // Suscripción muerta (navegador desinstalado / permiso revocado).
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id)
          }
        }
      }),
    )

    return new Response(JSON.stringify({ ok: true, enviados }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
