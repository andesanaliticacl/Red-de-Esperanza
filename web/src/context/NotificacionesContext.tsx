import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import { distanciaMetros } from '../lib/geo'
import { sonarMensaje, sonarAlerta, sonarSOS } from '../lib/sonidos'

type Tono = 'info' | 'exito' | 'alerta'

// Radio para considerar "cercano": solo a los voluntarios/rescatistas dentro de
// esta distancia de la nueva necesidad les llega el aviso. Ajustable.
const RADIO_AVISO_M = 10000 // 10 km

interface Aviso {
  id: string
  mensaje: string
  tono: Tono
}

interface NotiState {
  /** Muestra un aviso flotante (toast) en cualquier pantalla de la app. */
  notificar: (mensaje: string, tono?: Tono) => void
}

const Ctx = createContext<NotiState | undefined>(undefined)

/**
 * Avisos globales de la app. Vive por encima de todas las vistas, así que el
 * usuario recibe el aviso esté donde esté (mapa, lista, perfil…).
 *
 * Lo CRUCIAL: a quien CREÓ un reporte le avisamos (sonido + toast) en cuanto
 * un rescatista/voluntario se asigna, sin importar en qué pantalla esté. Antes
 * solo funcionaba dentro de "Mis reportes" y por eso parecía que no avisaba.
 */
export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth()
  const [avisos, setAvisos] = useState<Aviso[]>([])
  // Última asignación conocida de cada reporte mío, para detectar la transición
  // "sin atender → alguien se asignó" sin depender de payload.old de Postgres.
  const vistos = useRef<Map<string, string | null>>(new Map())

  const descartar = useCallback((id: string) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const notificar = useCallback(
    (mensaje: string, tono: Tono = 'info') => {
      const id = Math.random().toString(36).slice(2)
      setAvisos((prev) => [...prev, { id, mensaje, tono }])
      // Se descarta solo a los 8 s (el usuario también puede cerrarlo).
      window.setTimeout(() => descartar(id), 8000)
    },
    [descartar],
  )

  useEffect(() => {
    if (!perfil?.id) {
      vistos.current.clear()
      return
    }
    const miId = perfil.id

    // Semilla: estado actual de asignación de mis reportes, para no avisar de
    // reportes que ya estaban tomados antes de abrir la app.
    void supabase
      .from('necesidades')
      .select('id, asignado_a')
      .eq('reportado_por', miId)
      .then(({ data }) => {
        for (const r of data ?? [])
          vistos.current.set(r.id, (r as { asignado_a: string | null }).asignado_a)
      })

    const canal = supabase
      .channel(`avisos-asignacion:${miId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'necesidades',
          filter: `reportado_por=eq.${miId}`,
        },
        (payload) => {
          const fila = payload.new as { id: string; asignado_a: string | null }
          const antes = vistos.current.get(fila.id) ?? null
          vistos.current.set(fila.id, fila.asignado_a)
          // Transición: nadie → alguien se asignó.
          if (fila.asignado_a && !antes) {
            sonarMensaje()
            notificar(
              '🚑 ¡Alguien va en camino! Ya están atendiendo tu reporte.',
              'exito',
            )
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [perfil?.id, notificar])

  // El aviso de "nueva necesidad" NO es global: solo lo recibe el equipo de
  // campo (voluntario/rescatista) y solo si está CERCA. Por eso vive en un
  // componente aparte que únicamente se monta para ellos (así tampoco se pide
  // la ubicación a ciudadanos ni admin).
  const esEquipoCampo =
    perfil?.rol === 'voluntario' || perfil?.rol === 'rescatista'

  return (
    <Ctx.Provider value={{ notificar }}>
      {children}
      {esEquipoCampo && <AvisosEquipoCercano />}
      {/* Pila de avisos flotantes (arriba y centrado, por encima del mapa). */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-2 w-[92%] max-w-sm pointer-events-none">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`pointer-events-auto rounded-xl shadow-lg border px-4 py-3 text-sm font-semibold flex items-start gap-2 ${
              a.tono === 'exito'
                ? 'bg-green-50 border-green-300 text-green-900'
                : a.tono === 'alerta'
                  ? 'bg-red-50 border-red-300 text-red-900'
                  : 'bg-white border-gray-200 text-gray-800'
            }`}
          >
            <span className="flex-1">{a.mensaje}</span>
            <button
              onClick={() => descartar(a.id)}
              className="leading-none opacity-60 hover:opacity-100"
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotificaciones() {
  const ctx = useContext(Ctx)
  if (!ctx)
    throw new Error('useNotificaciones debe usarse dentro de <NotificacionesProvider>')
  return ctx
}

/**
 * Avisa de necesidades nuevas SOLO al equipo de campo (voluntario/rescatista)
 * que esté CERCA del punto reportado. Se monta únicamente para ese equipo, así
 * que la ubicación solo se pide a quien de verdad la necesita.
 *
 * Criterio de cercanía: si conocemos mi ubicación y la de la necesidad, solo
 * avisa dentro de RADIO_AVISO_M. Si falta alguna coordenada no se puede medir
 * la distancia → avisa igual (en una emergencia es peor callar que avisar).
 */
function AvisosEquipoCercano() {
  const { perfil } = useAuth()
  const { notificar } = useNotificaciones()
  const { coord } = useUbicacionAuto()
  // Ref para leer mi ubicación más reciente dentro del callback de Realtime
  // sin tener que reabrir el canal cada vez que cambia.
  const coordRef = useRef(coord)
  coordRef.current = coord

  useEffect(() => {
    if (!perfil?.id) return
    const miId = perfil.id

    const canal = supabase
      .channel(`avisos-nuevas:${miId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'necesidades' },
        (payload) => {
          const n = payload.new as {
            tipo: string
            origen: string | null
            reportado_por: string | null
            lat: number | null
            lng: number | null
          }
          // No nos avisamos a nosotros mismos si reportamos algo.
          if (n.reportado_por === miId) return

          // Filtro de cercanía: si tenemos ambas ubicaciones, descarta lo lejano.
          const yo = coordRef.current
          if (yo && n.lat != null && n.lng != null) {
            const d = distanciaMetros(yo.lat, yo.lng, n.lat, n.lng)
            if (d > RADIO_AVISO_M) return
          }

          const esSOS = n.tipo === 'rescate' || n.origen === 'sos'
          if (esSOS) {
            sonarSOS()
            notificar('🆘 ¡Nueva emergencia SOS cerca de ti!', 'alerta')
          } else {
            sonarAlerta()
            notificar('🔔 Nueva necesidad cerca de ti. Revísala para atenderla.', 'info')
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [perfil?.id, notificar])

  return null
}
