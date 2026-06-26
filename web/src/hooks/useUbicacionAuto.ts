import { useCallback, useEffect, useRef, useState } from 'react'
import { obtenerUbicacion, type FuenteUbicacion } from '../lib/geo'

const DIEZ_MINUTOS = 10 * 60 * 1000

export interface EstadoUbicacion {
  coord: { lat: number; lng: number } | null
  fuente: FuenteUbicacion | null
  estado: 'buscando' | 'lista' | 'error'
  /** Fuerza un refresco inmediato de la ubicación. */
  refrescar: () => void
}

/**
 * Detecta la ubicación del usuario al cargar (GPS con respaldo por IP) y la
 * refresca automáticamente cada 10 minutos. No usa seguimiento "en vivo"
 * continuo para no saturar la plataforma.
 */
export function useUbicacionAuto(): EstadoUbicacion {
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [fuente, setFuente] = useState<FuenteUbicacion | null>(null)
  const [estado, setEstado] = useState<'buscando' | 'lista' | 'error'>(
    'buscando',
  )
  const activo = useRef(true)

  const refrescar = useCallback(() => {
    setEstado((prev) => (prev === 'lista' ? prev : 'buscando'))
    obtenerUbicacion()
      .then((u) => {
        if (!activo.current) return
        setCoord({ lat: u.lat, lng: u.lng })
        setFuente(u.fuente)
        setEstado('lista')
      })
      .catch(() => {
        if (!activo.current) return
        setEstado((prev) => (prev === 'lista' ? prev : 'error'))
      })
  }, [])

  useEffect(() => {
    activo.current = true
    refrescar()
    const id = setInterval(refrescar, DIEZ_MINUTOS)
    return () => {
      activo.current = false
      clearInterval(id)
    }
  }, [refrescar])

  return { coord, fuente, estado, refrescar }
}
