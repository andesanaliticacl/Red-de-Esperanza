import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarOfertas, type Oferta } from '../lib/ofertas'

/**
 * Ofertas ("Yo tengo") con actualización en vivo, siguiendo el mismo patrón
 * que `useNecesidades`: se carga una vez y después Realtime parchea el estado
 * en lugar de recargar la tabla entera.
 *
 * `activo` existe porque las ofertas NO se muestran por defecto: solo se
 * cargan si la persona toca el filtro "Yo tengo". Así el mapa no se llena
 * solo ni se paga la consulta a quien no la pidió.
 */
export function useOfertas(
  activo: boolean,
  pais?: string | null,
  /** Se llama con cada oferta nueva que llega en vivo (para el registro
   *  de movimientos). */
  onNueva?: (o: Oferta) => void,
) {
  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [cargando, setCargando] = useState(false)
  const onNuevaRef = useRef(onNueva)
  onNuevaRef.current = onNueva

  useEffect(() => {
    if (!activo) {
      setOfertas([])
      return
    }
    let cancelado = false
    setCargando(true)
    listarOfertas({ pais })
      .then((datos) => {
        if (!cancelado) setOfertas(datos)
      })
      .catch(() => {
        // Sin conexión o error: se deja la lista vacía en vez de romper el
        // mapa. Las necesidades, que es lo urgente, siguen viéndose.
        if (!cancelado) setOfertas([])
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })

    const canal = supabase
      .channel(`ofertas-cambios:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ofertas' },
        (payload) => {
          setOfertas((prev) => {
            if (payload.eventType === 'DELETE') {
              const viejo = payload.old as { id?: string }
              return viejo.id ? prev.filter((o) => o.id !== viejo.id) : prev
            }
            const fila = payload.new as unknown as Oferta
            // Solo interesan las disponibles: una agotada o retirada sale del
            // mapa sola, sin recargar nada.
            const vigente = fila.estado === 'disponible'
            if (payload.eventType === 'INSERT') {
              if (prev.some((o) => o.id === fila.id)) return prev
              onNuevaRef.current?.(fila)
              return vigente ? [fila, ...prev] : prev
            }
            if (!vigente) return prev.filter((o) => o.id !== fila.id)
            return prev.some((o) => o.id === fila.id)
              ? prev.map((o) => (o.id === fila.id ? { ...o, ...fila } : o))
              : [fila, ...prev]
          })
        },
      )
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [activo, pais])

  return { ofertas, cargando }
}
