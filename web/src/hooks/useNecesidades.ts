import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Necesidad, CentroAcopio } from '../lib/types'

// Solo las columnas que usan las vistas (no traemos texto_crudo, verificada_por,
// actualizado_en ni nada sensible). Reduce muchísimo el tráfico. (Fase 2)
const COLS_NECESIDAD =
  'id, tipo, urgencia, estado, descripcion, zona, lat, lng, radio_km, origen, reportado_por, asignado_a, creado_en, eliminada_del_mapa'

// Tope de registros por carga: nadie puede ver decenas de miles. (Fase 4)
const LIMITE = 500
const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

/**
 * Carga necesidades + centros de acopio y se mantiene al día por Realtime.
 *
 * Optimizaciones de escala:
 *  - Fase 1: Realtime aplica cambios de forma incremental (INSERT/UPDATE/DELETE)
 *    sobre el estado de React. NO se vuelve a hacer un SELECT por cada evento.
 *  - Fase 2: se piden solo las columnas necesarias.
 *  - Fase 4: límite de registros.
 *  - Fase 25: canal Realtime dedicado solo a la tabla `necesidades`.
 */
export function useNecesidades(
  filtroEstados?: Necesidad['estado'][],
  onNueva?: (n: Necesidad) => void,
  // Realtime (websocket) solo cuando conviene: para usuarios con sesión (staff
  // que responden SOS al instante). Los visitantes anónimos NO abren websocket
  // —refrescan por sondeo— para no saturar el tope de conexiones con miles a la
  // vez. Por defecto true (compatibilidad).
  tiempoReal: boolean = true,
) {
  const [necesidades, setNecesidades] = useState<Necesidad[]>([])
  const [acopios, setAcopios] = useState<CentroAcopio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ref para tener siempre el callback más reciente sin recrear la suscripción.
  const onNuevaRef = useRef(onNueva)
  onNuevaRef.current = onNueva
  // Firma de la última lista de necesidades: si el sondeo trae lo mismo, NO
  // actualizamos el estado (evita redibujar todo el mapa cada 30 s sin motivo,
  // que era el "tirón" en el teléfono conforme crecen los datos).
  const firmaRef = useRef('')

  // ¿Una fila entra en el filtro de estados activo?
  function pasaFiltro(n: {
    estado: Necesidad['estado']
    eliminada_del_mapa?: boolean | null
    creado_en?: string
  }): boolean {
    if (n.eliminada_del_mapa) return false
    if (n.creado_en && n.creado_en < FECHA_MINIMA_VISIBLE) return false
    if (!filtroEstados || filtroEstados.length === 0) return true
    return filtroEstados.includes(n.estado)
  }

  function firmaDe(lista: Necesidad[]): string {
    return lista
      .map(
        (n) =>
          `${n.id}:${n.estado}:${n.asignado_a ?? ''}:${n.lat ?? ''}:${n.lng ?? ''}:${
            n.eliminada_del_mapa ? 1 : 0
          }`,
      )
      .join('|')
  }

  // Solo las necesidades (lo que cambia seguido). Si nada cambió, no toca estado.
  async function cargar() {
    let q = supabase
      .from('necesidades')
      .select(COLS_NECESIDAD)
      .order('creado_en', { ascending: false })
      .eq('eliminada_del_mapa', false)
      .gte('creado_en', FECHA_MINIMA_VISIBLE)
      .limit(LIMITE)
    if (filtroEstados && filtroEstados.length) q = q.in('estado', filtroEstados)
    const nec = await q
    if (nec.error) setError(nec.error.message)
    else {
      const lista = (nec.data ?? []) as unknown as Necesidad[]
      const firma = firmaDe(lista)
      if (firma !== firmaRef.current) {
        firmaRef.current = firma
        setNecesidades(lista)
      }
    }
    setCargando(false)
  }

  // Los centros de acopio casi no cambian: se cargan UNA vez (no en cada sondeo).
  async function cargarAcopios() {
    const ac = await supabase
      .from('centros_acopio')
      .select(
        'id, nombre, descripcion, pais, estado, ciudad, direccion, contacto, red_social, lat, lng, creado_por, creado_en, id_fuente',
      )
    if (!ac.error) setAcopios((ac.data ?? []) as unknown as CentroAcopio[])
  }

  useEffect(() => {
    cargar()
    cargarAcopios()

    // Anónimos (sin sesión): NADA de websocket. Refrescan por sondeo cada 30 s.
    // Evita abrir miles de conexiones realtime simultáneas. (Solo necesidades.)
    // Si la pestaña está oculta (en segundo plano), NO sondea: ahorra peticiones
    // y batería en el teléfono.
    if (!tiempoReal) {
      const id = window.setInterval(() => {
        if (!document.hidden) cargar()
      }, 30000)
      return () => window.clearInterval(id)
    }

    // Con sesión (staff): Realtime incremental, parchea el estado en lugar de
    // recargar toda la tabla. Canal único por instancia.
    const canal = supabase
      .channel(`necesidades-cambios:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'necesidades' },
        (payload) => {
          setNecesidades((prev) => {
            if (payload.eventType === 'DELETE') {
              const viejo = payload.old as { id?: string }
              return viejo.id ? prev.filter((n) => n.id !== viejo.id) : prev
            }
            const fila = payload.new as unknown as Necesidad
            if (payload.eventType === 'INSERT') {
              if (prev.some((n) => n.id === fila.id)) return prev
              // Aviso a quien escuche (p. ej. para sonar al llegar un SOS).
              onNuevaRef.current?.(fila)
              if (!pasaFiltro(fila)) return prev
              return [fila, ...prev]
            }
            // UPDATE
            if (!pasaFiltro(fila)) return prev.filter((n) => n.id !== fila.id)
            const existe = prev.some((n) => n.id === fila.id)
            return existe
              ? prev.map((n) => (n.id === fila.id ? { ...n, ...fila } : n))
              : [fila, ...prev]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtroEstados), tiempoReal])

  return { necesidades, acopios, cargando, error, recargar: cargar, recargarAcopios: cargarAcopios }
}
