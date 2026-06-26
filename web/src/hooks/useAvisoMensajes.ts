import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { sonarMensaje } from '../lib/sonidos'
import type { Mensaje } from '../lib/types'

/**
 * Suena un aviso discreto cuando llega un mensaje nuevo en alguna de las
 * necesidades indicadas (las que me importan: las que reporté o las que
 * estoy atendiendo) y el autor no soy yo.
 *
 * Usa refs para no recrear la suscripción cada vez que cambia la lista de ids.
 */
export function useAvisoMensajes(necesidadIds: string[], miId?: string) {
  const idsRef = useRef<Set<string>>(new Set())
  idsRef.current = new Set(necesidadIds)
  const miIdRef = useRef(miId)
  miIdRef.current = miId

  useEffect(() => {
    const canal = supabase
      .channel(`aviso-mensajes:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes' },
        (payload) => {
          const m = payload.new as Mensaje
          if (idsRef.current.has(m.necesidad_id) && m.autor !== miIdRef.current)
            sonarMensaje()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [])
}
