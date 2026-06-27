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
import { sonarMensaje, sonarAlerta, sonarSOS } from '../lib/sonidos'

type Tono = 'info' | 'exito' | 'alerta'

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

  // Aviso al EQUIPO (voluntario/rescatista/admin): cuando alguien crea una
  // necesidad nueva, suena un aviso llamativo en cualquier pantalla para que
  // la atiendan cuanto antes. Un SOS suena con la sirena fuerte.
  useEffect(() => {
    const rol = perfil?.rol
    const esStaff =
      rol === 'voluntario' || rol === 'rescatista' || rol === 'admin'
    if (!perfil?.id || !esStaff) return
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
          }
          // No nos avisamos a nosotros mismos si reportamos algo.
          if (n.reportado_por === miId) return
          const esSOS = n.tipo === 'rescate' || n.origen === 'sos'
          if (esSOS) {
            sonarSOS()
            notificar('🆘 ¡Nueva emergencia SOS! Atiende según prioridad.', 'alerta')
          } else {
            sonarAlerta()
            notificar('🔔 Nueva necesidad reportada. Revísala para atenderla.', 'info')
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [perfil?.id, perfil?.rol, notificar])

  return (
    <Ctx.Provider value={{ notificar }}>
      {children}
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
