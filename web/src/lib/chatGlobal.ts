import { supabase } from './supabase'
import type { MensajeGlobal } from './types'

/** Normaliza el nombre de la ciudad para agrupar las salas de chat. */
export function normalizarCiudad(ciudad: string): string {
  return ciudad.trim().toLowerCase()
}

function completarRespuesta(mensajes: Partial<MensajeGlobal>[]): MensajeGlobal[] {
  return mensajes.map((m) => ({
    ...(m as MensajeGlobal),
    respuesta_a: m.respuesta_a ?? null,
    respuesta_nombre: m.respuesta_nombre ?? null,
    respuesta_cuerpo: m.respuesta_cuerpo ?? null,
  }))
}

/** Ultimos mensajes del chat, solo de los ultimos 3 dias, en orden cronologico. */
export async function listarChat(
  ciudad: string,
  limite = 100,
): Promise<MensajeGlobal[]> {
  const hace3dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('chat_global')
    .select(
      'id, ciudad, nombre, cuerpo, autor, creado_en, respuesta_a, respuesta_nombre, respuesta_cuerpo',
    )
    .eq('ciudad', normalizarCiudad(ciudad))
    .gte('creado_en', hace3dias)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (!error) return completarRespuesta(data ?? []).reverse()

  if (
    error.code !== '42703' &&
    !error.message.toLowerCase().includes('respuesta_')
  ) {
    throw error
  }

  const respaldo = await supabase
    .from('chat_global')
    .select('id, ciudad, nombre, cuerpo, autor, creado_en')
    .eq('ciudad', normalizarCiudad(ciudad))
    .gte('creado_en', hace3dias)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (respaldo.error) throw respaldo.error
  return completarRespuesta(respaldo.data ?? []).reverse()
}

/** Envia un mensaje pasando por la Edge Function que valida la IP en servidor. */
export async function enviarChat(args: {
  ciudad: string
  nombre: string
  cuerpo: string
  telefono?: string | null
  respuestaA?: {
    id: string
    nombre: string
    cuerpo: string
  } | null
  devBypassToken?: string | null
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    error?: string
  }>('enviar-chat', {
    body: {
      ciudad: args.ciudad,
      nombre: args.nombre,
      cuerpo: args.cuerpo,
      telefono: args.telefono ?? null,
      respuesta_a: args.respuestaA?.id ?? null,
      respuesta_nombre: args.respuestaA?.nombre ?? null,
      respuesta_cuerpo: args.respuestaA?.cuerpo ?? null,
      dev_bypass_token: args.devBypassToken || null,
    },
  })
  if (error) {
    const contexto = (error as { context?: Response }).context
    const payload = await contexto?.json().catch(() => null)
    throw new Error(payload?.error || error.message)
  }
  if (data?.ok === false) throw new Error(data.error || 'No se pudo enviar el mensaje.')
}

/** Borra un mensaje del chat. La RLS solo lo permite a administradores. */
export async function borrarChat(id: string): Promise<void> {
  const { error } = await supabase.from('chat_global').delete().eq('id', id)
  if (error) throw error
}

/**
 * Telefonos privados por mensaje. La RLS solo devuelve filas a lideres/admin.
 * Devuelve mensaje_id -> telefono.
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
 * Telefonos de usuarios registrados, leidos por funcion con controles de rol.
 * Devuelve id_usuario -> telefono.
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
 * Devuelve una funcion para cancelar la suscripcion.
 */
export function suscribirChat(
  ciudad: string,
  alLlegar: (m: MensajeGlobal) => void,
  alBorrar?: (id: string) => void,
): () => void {
  const sala = normalizarCiudad(ciudad)
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
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_global',
      },
      (payload) => {
        const viejo = payload.old as Partial<MensajeGlobal>
        if (viejo.ciudad && viejo.ciudad !== sala) return
        if (viejo.id) alBorrar?.(viejo.id)
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(canal)
  }
}
