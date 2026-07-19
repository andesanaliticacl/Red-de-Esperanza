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

// Chat multi-pais (Fase Red Global): Venezuela conserva su sala SIN prefijo
// (solo el nombre del estado) para no romper el historial de chat que ya
// existia antes de que hubiera selector de pais. Los paises nuevos usan el
// esquema "pais/region" (ver web/src/lib/regionesChat.ts, que debe reflejar
// exactamente esta misma lista).
const REGIONES_CHILE = [
  'Arica y Parinacota',
  'Tarapaca',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaiso',
  'Metropolitana de Santiago',
  "Libertador General Bernardo O'Higgins",
  'Maule',
  'Nuble',
  'Biobio',
  'La Araucania',
  'Los Rios',
  'Los Lagos',
  'Aysen del General Carlos Ibanez del Campo',
  'Magallanes y de la Antartica Chilena',
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
  dev_bypass_token?: unknown
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

function origenLocal(req: Request): boolean {
  const origin = req.headers.get('origin') ?? ''
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function bypassDevPermitido(req: Request, token: unknown): boolean {
  const esperado = Deno.env.get('CHAT_DEV_BYPASS_TOKEN')?.trim()
  return (
    Boolean(esperado) &&
    typeof token === 'string' &&
    token.trim() === esperado &&
    origenLocal(req)
  )
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

// Codigo ISO del pais dueño de una sala, segun su formato: Venezuela = solo
// el nombre del estado; el resto = "pais/region". Null si la sala no es
// valida en ningun pais soportado.
function paisEsperadoDeSala(ciudad: string): 'VE' | 'CL' | null {
  const sala = normalizarParaComparar(ciudad)
  if (ESTADOS_VENEZUELA.some((e) => normalizarParaComparar(e) === sala)) {
    return 'VE'
  }
  if (sala.startsWith('chile/')) {
    const region = sala.slice('chile/'.length)
    if (REGIONES_CHILE.some((r) => normalizarParaComparar(r) === region)) {
      return 'CL'
    }
  }
  return null
}

function geoCoincideConPais(
  geo: { pais: string | null; codigo: string | null },
  esperado: 'VE' | 'CL',
): boolean {
  const nombrePorCodigo: Record<'VE' | 'CL', string> = {
    VE: 'venezuela',
    CL: 'chile',
  }
  return (
    geo.codigo?.toUpperCase() === esperado ||
    geo.pais?.trim().toLowerCase() === nombrePorCodigo[esperado]
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

  const paisEsperado = paisEsperadoDeSala(ciudad)
  if (!paisEsperado) {
    return json(
      { ok: false, error: 'Elige un estado o region valido para escribir.' },
      { status: 400 },
    )
  }
  if (nombre.length < 1 || cuerpo.length < 1) {
    return json({ ok: false, error: 'Nombre y mensaje son obligatorios.' }, { status: 400 })
  }

  const permiteBypassDev = bypassDevPermitido(req, body.dev_bypass_token)
  if (!permiteBypassDev) {
    const ip = ipDeRequest(req)
    if (!ip) {
      return json(
        { ok: false, error: 'No pudimos confirmar tu ubicacion. El chat queda en solo lectura.' },
        { status: 403 },
      )
    }

    const geo = await paisPorIP(ip)
    if (!geoCoincideConPais(geo, paisEsperado)) {
      const nombrePais = paisEsperado === 'VE' ? 'Venezuela' : 'Chile'
      return json(
        {
          ok: false,
          error: geo.pais
            ? `Esta sala es de ${nombrePais}. Tu conexion se detecta desde ${geo.pais}.`
            : `Esta sala es de ${nombrePais}. No pudimos confirmar tu ubicacion.`,
        },
        { status: 403 },
      )
    }
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
