import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIPO_META, type NecesidadTipo } from '../lib/types'
import { OFERTA_META, type OfertaTipo } from '../lib/ofertas'

/**
 * Registro de movimientos EN VIVO: lo último que va pasando en la red.
 *
 * Escucha las altas de `necesidades` y de `ofertas` por Realtime. No hace
 * ninguna consulta inicial a propósito: esto no es un historial, es lo que
 * está pasando AHORA. Al abrir la app se empieza en blanco y se va llenando.
 * Cargar las últimas 20 de hace tres días le daría una falsa sensación de
 * actividad a un momento en que no la hay.
 */
export interface Movimiento {
  id: string
  clase: 'necesidad' | 'oferta'
  emoji: string
  etiqueta: string
  zona: string | null
  lat: number | null
  lng: number | null
  en: number
}

// Pocos y recientes: es un vistazo, no una bandeja de entrada.
const MAXIMO = 12

export function useMovimientos(activo = true) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])

  useEffect(() => {
    if (!activo) return

    const sufijo = Math.random().toString(36).slice(2)

    const agregar = (m: Movimiento) =>
      setMovimientos((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [m, ...prev].slice(0, MAXIMO),
      )

    const canalNec = supabase
      .channel(`mov-necesidades:${sufijo}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'necesidades' },
        (payload) => {
          const n = payload.new as {
            id: string
            tipo: NecesidadTipo
            zona: string | null
            lat: number | null
            lng: number | null
            eliminada_del_mapa?: boolean
          }
          if (n.eliminada_del_mapa) return
          const meta = TIPO_META[n.tipo]
          if (!meta) return
          agregar({
            id: n.id,
            clase: 'necesidad',
            emoji: meta.emoji,
            etiqueta: meta.etiqueta,
            zona: n.zona,
            lat: n.lat,
            lng: n.lng,
            en: Date.now(),
          })
        },
      )
      .subscribe()

    const canalOf = supabase
      .channel(`mov-ofertas:${sufijo}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ofertas' },
        (payload) => {
          const o = payload.new as {
            id: string
            tipo: OfertaTipo
            zona: string | null
            lat: number | null
            lng: number | null
          }
          const meta = OFERTA_META[o.tipo]
          if (!meta) return
          agregar({
            id: o.id,
            clase: 'oferta',
            emoji: meta.emoji,
            etiqueta: meta.etiqueta,
            zona: o.zona,
            lat: o.lat,
            lng: o.lng,
            en: Date.now(),
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canalNec)
      supabase.removeChannel(canalOf)
    }
  }, [activo])

  return movimientos
}
