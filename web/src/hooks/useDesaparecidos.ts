import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Desaparecido {
  id: string
  nombre: string
  edad: number | null
  genero: string | null
  fecha_desaparicion: string | null
  ultima_ubicacion: string | null
  lat: number | null
  lng: number | null
  foto_url: string | null
  contacto_familiar: string | null
  estado: 'no_encontrado' | 'encontrado'
  fuente: string | null
  creado_en: string
}

export function useDesaparecidos() {
  const [desaparecidos, setDesaparecidos] = useState<Desaparecido[]>([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    const { data, error } = await supabase
      .from('desaparecidos')
      .select('id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en')
      .order('creado_en', { ascending: false })
    if (!error) setDesaparecidos((data ?? []) as Desaparecido[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel(`desaparecidos:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desaparecidos' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDesaparecidos(prev =>
              prev.map(d => d.id === (payload.new as Desaparecido).id
                ? { ...d, ...(payload.new as Desaparecido) }
                : d
              )
            )
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  return { desaparecidos, cargando, recargar: cargar }
}