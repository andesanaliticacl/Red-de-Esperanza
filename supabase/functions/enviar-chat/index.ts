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

// 32 departamentos de Colombia + Bogota D.C. (debe reflejar exactamente
// web/src/lib/zonas.ts -> ZONAS.co / web/src/lib/regionesChat.ts).
const REGIONES_COLOMBIA = [
  'Amazonas',
  'Antioquia',
  'Arauca',
  'Atlantico',
  'Bogota D.C.',
  'Bolivar',
  'Boyaca',
  'Caldas',
  'Caqueta',
  'Casanare',
  'Cauca',
  'Cesar',
  'Choco',
  'Cordoba',
  'Cundinamarca',
  'Guainia',
  'Guaviare',
  'Huila',
  'La Guajira',
  'Magdalena',
  'Meta',
  'Narino',
  'Norte de Santander',
  'Putumayo',
  'Quindio',
  'Risaralda',
  'San Andres y Providencia',
  'Santander',
  'Sucre',
  'Tolima',
  'Valle del Cauca',
  'Vaupes',
  'Vichada',
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

// Codigo ISO del pais dueño de una sala, segun su formato: Venezuela = solo
// el nombre del estado; el resto = "pais/region". Null si la sala no es
// valida en ningun pais soportado. Ya NO se usa para exigir que la IP de
// quien escribe coincida con este pais (antes si) — cualquier cuenta puede
// escribir en cualquier sala; esto solo valida que la sala exista de
// verdad, para no insertar mensajes en salas inventadas.
function paisEsperadoDeSala(ciudad: string): 'VE' | 'CL' | 'CO' | null {
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
  if (sala.startsWith('colombia/')) {
    const region = sala.slice('colombia/'.length)
    if (REGIONES_COLOMBIA.some((r) => normalizarParaComparar(r) === region)) {
      return 'CO'
    }
  }
  return null
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

  // Escribir EXIGE cuenta. Antes se aceptaban mensajes anonimos (con un
  // apodo libre), y eso permitia hacerse pasar por cualquiera y publicar
  // estafas sin dejar rastro. Leer sigue siendo abierto.
  const autor = await autorDesdeJWT(req)
  if (!autor) {
    return json(
      {
        ok: false,
        error: 'Necesitas iniciar sesion para escribir en el chat.',
      },
      { status: 401 },
    )
  }

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
