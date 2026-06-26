import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Necesidad, CentroAcopio } from '../lib/types'

/**
 * Carga necesidades + centros de acopio y se mantiene al día por Realtime.
 * `filtroEstados` (opcional) restringe qué estados se traen.
 */
export function useNecesidades(filtroEstados?: Necesidad['estado'][]) {
  const [necesidades, setNecesidades] = useState<Necesidad[]>([])
  const [acopios, setAcopios] = useState<CentroAcopio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    let q = supabase
      .from('necesidades')
      .select('*')
      .order('creado_en', { ascending: false })
    if (filtroEstados && filtroEstados.length)
      q = q.in('estado', filtroEstados)

    const [nec, ac] = await Promise.all([
      q,
      supabase.from('centros_acopio').select('*'),
    ])

    if (nec.error) setError(nec.error.message)
    else setNecesidades((nec.data ?? []) as Necesidad[])
    if (!ac.error) setAcopios((ac.data ?? []) as CentroAcopio[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()

    // Realtime: cualquier cambio en `necesidades` refresca la lista.
    const canal = supabase
      .channel('necesidades-vivo')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'necesidades' },
        () => cargar(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtroEstados)])

  return { necesidades, acopios, cargando, error, recargar: cargar }
}
