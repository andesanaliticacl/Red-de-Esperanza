import { supabase } from './supabase'
import type { MensajeGlobal } from './types'

/** Normaliza el nombre de la ciudad para agrupar las salas de chat. */
export function normalizarCiudad(ciudad: string): string {
  return ciudad.trim().toLowerCase()
}

/** Últimos mensajes del chat (solo de los últimos 3 días), en orden cronológico. */
export async function listarChat(
  ciudad: string,
  limite = 100,
): Promise<MensajeGlobal[]> {
  const hace3dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('chat_global')
    .select('id, ciudad, nombre, cuerpo, autor, creado_en')
    .eq('ciudad', normalizarCiudad(ciudad))
    .gte('creado_en', hace3dias)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return ((data ?? []) as MensajeGlobal[]).reverse()
}

/** Envía un mensaje al chat de una ciudad. Si el invitado dejó teléfono, se
 *  guarda en la tabla PRIVADA `chat_contactos` (solo líderes/admin la leen). */
export async function enviarChat(args: {
  ciudad: string
  nombre: string
  cuerpo: string
  telefono?: string | null
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('chat_global')
    .insert({
      ciudad: normalizarCiudad(args.ciudad),
      nombre: args.nombre.trim().slice(0, 40),
      cuerpo: args.cuerpo.trim().slice(0, 500),
      autor: auth?.user?.id ?? null,
    })
    .select('id')
    .single()
  if (error) throw error

  const tel = args.telefono?.trim()
  if (tel && data?.id) {
    const { error: e2 } = await supabase
      .from('chat_contactos')
      .insert({ mensaje_id: data.id, telefono: tel.slice(0, 30) })
    if (e2) console.error('No se pudo guardar el teléfono del chat:', e2.message)
  }
}

/**
 * Teléfonos (privados) de una lista de mensajes del chat. La RLS solo devuelve
 * filas si quien consulta es líder de voluntarios o admin; cualquier otro recibe
 * un mapa vacío. Devuelve mensaje_id → teléfono.
 */
export async function telefonosDeChat(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('chat_contactos')
    .select('mensaje_id, telefono')
    .in('mensaje_id', ids)
  return new Map(
    ((data ?? []) as { mensaje_id: string; telefono: string }[]).map((c) => [
      c.mensaje_id,
      c.telefono,
    ]),
  )
}

/**
 * Teléfonos de una lista de USUARIOS registrados (autores de mensajes), leídos
 * de su perfil. La función SECURITY DEFINER solo devuelve datos si quien
 * consulta es líder de voluntarios o admin; cualquier otro recibe vacío.
 * Devuelve id_usuario → teléfono.
 */
export async function telefonosDeUsuarios(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase.rpc('telefonos_de_usuarios', { p_ids: ids })
  return new Map(
    ((data ?? []) as { id: string; telefono: string | null }[])
      .filter((x) => x.telefono)
      .map((x) => [x.id, x.telefono as string]),
  )
}

/**
 * Se suscribe en tiempo real a los mensajes nuevos de una ciudad.
 * Devuelve una función para cancelar la suscripción.
 */
export function suscribirChat(
  ciudad: string,
  alLlegar: (m: MensajeGlobal) => void,
): () => void {
  const sala = normalizarCiudad(ciudad)
  // Canal único por suscriptor: evita el error "subscribe multiple times"
  // cuando coexisten la barra lateral y el modal del chat en la misma página.
  const canal = supabase
    .channel(`chat-global:${sala}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_global',
        filter: `ciudad=eq.${sala}`,
      },
      (payload) => alLlegar(payload.new as MensajeGlobal),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(canal)
  }
}
