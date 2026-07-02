import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ESTADOS_VENEZUELA = [
  'Amazonas',
  'Anzoategui',
  'Apure',
  'Aragua',
  'Barinas',
  'Bolivar',
  'Carabobo',
  'Cojedes',
  'Delta Amacuro',
  'Distrito Capital',
  'Falcon',
  'Guarico',
  'La Guaira',
  'Lara',
  'Merida',
  'Miranda',
  'Monagas',
  'Nueva Esparta',
  'Portuguesa',
  'Sucre',
  'Tachira',
  'Trujillo',
  'Yaracuy',
  'Zulia',
]

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

interface PayloadChat {
  ciudad?: unknown
  nombre?: unknown
  cuerpo?: unknown
  telefono?: unknown
  respuesta_a?: unknown
  respuesta_nombre?: unknown
  respuesta_cuerpo?: unknown
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function normalizarCiudad(ciudad: string): string {
  return ciudad.trim().toLowerCase()
}

function normalizarParaComparar(texto: string): string {
  return texto
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ipDeRequest(req: Request): string | null {
  const candidatos = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
  ]
  return candidatos.map((x) => x?.trim()).find(Boolean) ?? null
}

async function paisPorIP(ip: string): Promise<{ pais: string | null; codigo: string | null }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3500)
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code`,
      { signal: ctrl.signal },
    )
    const data = await res.json()
    if (data?.success) {
      return {
        pais: typeof data.country === 'string' ? data.country : null,
        codigo: typeof data.country_code === 'string' ? data.country_code : null,
      }
    }
  } catch {
    // Si no se puede confirmar el pais, no se permite escribir.
  } finally {
    clearTimeout(timer)
  }
  return { pais: null, codigo: null }
}

function esVenezuela(geo: { pais: string | null; codigo: string | null }): boolean {
  return (
    geo.codigo?.toUpperCase() === 'VE' ||
    geo.pais?.trim().toLowerCase() === 'venezuela'
  )
}

function ciudadValida(ciudad: string): boolean {
  const sala = normalizarParaComparar(ciudad)
  return ESTADOS_VENEZUELA.some(
    (estado) => normalizarParaComparar(estado) === sala,
  )
}

async function autorDesdeJWT(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization')
  const token = auth?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error) return null
  return data.user?.id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Metodo no permitido' }, { status: 405 })

  const ip = ipDeRequest(req)
  if (!ip) {
    return json(
      { ok: false, error: 'No pudimos confirmar tu ubicacion. El chat queda en solo lectura.' },
      { status: 403 },
    )
  }

  const geo = await paisPorIP(ip)
  if (!esVenezuela(geo)) {
    return json(
      {
        ok: false,
        error: geo.pais
          ? `Solo se puede escribir desde Venezuela. Tu conexion se detecta desde ${geo.pais}.`
          : 'Solo se puede escribir desde Venezuela. No pudimos confirmar tu ubicacion.',
      },
      { status: 403 },
    )
  }

  let body: PayloadChat
  try {
    body = (await req.json()) as PayloadChat
  } catch {
    return json({ ok: false, error: 'Solicitud invalida' }, { status: 400 })
  }

  const ciudad = typeof body.ciudad === 'string' ? body.ciudad.trim() : ''
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 40) : ''
  const cuerpo = typeof body.cuerpo === 'string' ? body.cuerpo.trim().slice(0, 500) : ''
  const telefono = typeof body.telefono === 'string' ? body.telefono.trim().slice(0, 30) : ''
  const respuestaA =
    typeof body.respuesta_a === 'string' && body.respuesta_a.trim()
      ? body.respuesta_a.trim()
      : null
  const respuestaNombre =
    typeof body.respuesta_nombre === 'string' && body.respuesta_nombre.trim()
      ? body.respuesta_nombre.trim().slice(0, 40)
      : null
  const respuestaCuerpo =
    typeof body.respuesta_cuerpo === 'string' && body.respuesta_cuerpo.trim()
      ? body.respuesta_cuerpo.trim().slice(0, 180)
      : null

  if (!ciudadValida(ciudad)) {
    return json({ ok: false, error: 'Elige un estado de Venezuela valido.' }, { status: 400 })
  }
  if (nombre.length < 1 || cuerpo.length < 1) {
    return json({ ok: false, error: 'Nombre y mensaje son obligatorios.' }, { status: 400 })
  }

  const autor = await autorDesdeJWT(req)
  const { data, error } = await supabase
    .from('chat_global')
    .insert({
      ciudad: normalizarCiudad(ciudad),
      nombre,
      cuerpo,
      autor,
      respuesta_a: respuestaA,
      respuesta_nombre: respuestaNombre,
      respuesta_cuerpo: respuestaCuerpo,
    })
    .select('id')
    .single()

  if (error) return json({ ok: false, error: error.message }, { status: 400 })

  if (telefono && data?.id) {
    const { error: contactoError } = await supabase
      .from('chat_contactos')
      .insert({ mensaje_id: data.id, telefono })
    if (contactoError) {
      return json({ ok: false, error: contactoError.message }, { status: 400 })
    }
  }

  return json({ ok: true })
})
