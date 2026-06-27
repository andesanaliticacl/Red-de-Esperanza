import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import { distanciaMetros } from '../lib/geo'
import { sonarMensaje, sonarAlerta, sonarSOS } from '../lib/sonidos'
import type { Mensaje } from '../lib/types'

type Tono = 'info' | 'exito' | 'alerta'

// Radio para considerar "cercano": solo a los voluntarios/rescatistas dentro de
// esta distancia de la nueva necesidad les llega el aviso. Ajustable.
const RADIO_AVISO_M = 10000 // 10 km

/** Acción opcional de un aviso: a dónde llevar al usuario al tocarlo. */
interface AccionAviso {
  ruta: string
  etiqueta: string
}

export interface Aviso {
  id: string
  mensaje: string
  tono: Tono
  ts: number
  leido: boolean
  accion?: AccionAviso
}

interface NotiState {
  /** Muestra un aviso (toast + queda en la campana). */
  notificar: (mensaje: string, tono?: Tono, accion?: AccionAviso) => void
  /** Historial de avisos de esta sesión (lo que ve la campana). */
  historial: Aviso[]
  noLeidas: number
  marcarTodasLeidas: () => void
  marcarLeida: (id: string) => void
  limpiar: () => void
}

const Ctx = createContext<NotiState | undefined>(undefined)

/**
 * Centro de notificaciones de la app. Vive por encima de todas las vistas, así
 * que el usuario recibe el aviso esté donde esté y queda guardado en la campana
 * (🔔) de la barra superior. Disponible para TODOS los roles.
 *
 * Cubre:
 *  · Al creador de un reporte: "alguien va en camino" cuando se lo asignan.
 *  · Al equipo de campo cercano: "nueva necesidad / SOS".
 *  · A cualquiera: "te llegó un mensaje" en una conversación tuya.
 */
export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [historial, setHistorial] = useState<Aviso[]>([])
  const [toasts, setToasts] = useState<Aviso[]>([])
  // Última asignación conocida de cada reporte mío, para detectar la transición
  // "sin atender → alguien se asignó" sin depender de payload.old de Postgres.
  const vistos = useRef<Map<string, string | null>>(new Map())

  const quitarToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const marcarLeida = useCallback((id: string) => {
    setHistorial((prev) =>
      prev.map((a) => (a.id === id ? { ...a, leido: true } : a)),
    )
  }, [])

  const marcarTodasLeidas = useCallback(() => {
    setHistorial((prev) => prev.map((a) => ({ ...a, leido: true })))
  }, [])

  const limpiar = useCallback(() => setHistorial([]), [])

  const notificar = useCallback(
    (mensaje: string, tono: Tono = 'info', accion?: AccionAviso) => {
      const aviso: Aviso = {
        id: Math.random().toString(36).slice(2),
        mensaje,
        tono,
        ts: Date.now(),
        leido: false,
        accion,
      }
      setHistorial((prev) => [aviso, ...prev].slice(0, 50))
      setToasts((prev) => [...prev, aviso])
      window.setTimeout(() => quitarToast(aviso.id), 8000)
    },
    [quitarToast],
  )

  // Aviso al CREADOR del reporte: alguien se asignó (vaya donde vaya en la app).
  useEffect(() => {
    if (!perfil?.id) {
      vistos.current.clear()
      return
    }
    const miId = perfil.id

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
          if (fila.asignado_a && !antes) {
            sonarMensaje()
            notificar(
              '🚑 ¡Alguien va en camino! Ya están atendiendo tu reporte.',
              'exito',
              { ruta: '/mis-reportes', etiqueta: 'Ver mi reporte' },
            )
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [perfil?.id, notificar])

  const esEquipoCampo =
    perfil?.rol === 'voluntario' || perfil?.rol === 'rescatista'

  function alAccion(accion: AccionAviso, id: string) {
    marcarLeida(id)
    quitarToast(id)
    navigate(accion.ruta)
  }

  return (
    <Ctx.Provider
      value={{
        notificar,
        historial,
        noLeidas: historial.filter((a) => !a.leido).length,
        marcarTodasLeidas,
        marcarLeida,
        limpiar,
      }}
    >
      {children}

      {/* Avisos de mensajes nuevos: a cualquier usuario logueado. */}
      {perfil?.id && <AvisosMensajes />}
      {/* Avisos de nuevas necesidades: solo al equipo de campo cercano. */}
      {esEquipoCampo && <AvisosEquipoCercano />}

      {/* Pila de toasts (arriba y centrado, por encima del mapa). */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-2 w-[92%] max-w-sm pointer-events-none">
        {toasts.map((a) => (
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
            <div className="flex-1">
              <div>{a.mensaje}</div>
              {a.accion && (
                <button
                  onClick={() => alAccion(a.accion!, a.id)}
                  className="mt-1.5 inline-flex items-center bg-bandera-azul text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                >
                  {a.accion.etiqueta} →
                </button>
              )}
            </div>
            <button
              onClick={() => quitarToast(a.id)}
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
 */
function AvisosEquipoCercano() {
  const { perfil } = useAuth()
  const { notificar } = useNotificaciones()
  const { coord } = useUbicacionAuto()
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
            id: string
            tipo: string
            origen: string | null
            reportado_por: string | null
            lat: number | null
            lng: number | null
          }
          if (n.reportado_por === miId) return

          // Filtro de cercanía: si tenemos ambas ubicaciones, descarta lo lejano.
          const yo = coordRef.current
          if (yo && n.lat != null && n.lng != null) {
            const d = distanciaMetros(yo.lat, yo.lng, n.lat, n.lng)
            if (d > RADIO_AVISO_M) return
          }

          const esSOS = n.tipo === 'rescate' || n.origen === 'sos'
          const accion = { ruta: `/?necesidad=${n.id}`, etiqueta: 'Ver en el mapa' }
          if (esSOS) {
            sonarSOS()
            notificar('🆘 ¡Nueva emergencia SOS cerca de ti!', 'alerta', accion)
          } else {
            sonarAlerta()
            notificar(
              '🔔 Nueva necesidad cerca de ti. Revísala para atenderla.',
              'info',
              accion,
            )
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

/**
 * Avisa de mensajes nuevos en una conversación mía (un reporte que hice o que
 * estoy atendiendo) cuando el autor no soy yo. Mantiene al día el conjunto de
 * "mis necesidades" escuchando los cambios de la tabla.
 */
function AvisosMensajes() {
  const { perfil } = useAuth()
  const { notificar } = useNotificaciones()
  const misIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!perfil?.id) return
    const miId = perfil.id

    // Semilla: necesidades donde participo (reporté o me asignaron).
    void supabase
      .from('necesidades')
      .select('id, reportado_por, asignado_a')
      .or(`reportado_por.eq.${miId},asignado_a.eq.${miId}`)
      .then(({ data }) => {
        for (const r of data ?? []) misIds.current.add((r as { id: string }).id)
      })

    // Mantener el conjunto al día con los cambios de necesidades.
    const canalNec = supabase
      .channel(`mis-necesidades:${miId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'necesidades' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const v = payload.old as { id?: string }
            if (v.id) misIds.current.delete(v.id)
            return
          }
          const n = payload.new as {
            id: string
            reportado_por: string | null
            asignado_a: string | null
          }
          if (n.reportado_por === miId || n.asignado_a === miId)
            misIds.current.add(n.id)
          else misIds.current.delete(n.id)
        },
      )
      .subscribe()

    // Mensajes nuevos en mis conversaciones.
    const canalMsg = supabase
      .channel(`avisos-mensajes:${miId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes' },
        (payload) => {
          const m = payload.new as Mensaje
          if (m.autor === miId) return
          if (!misIds.current.has(m.necesidad_id)) return
          sonarMensaje()
          notificar('💬 Te llegó un mensaje nuevo en una conversación.', 'info', {
            ruta: '/conversaciones',
            etiqueta: 'Ver conversación',
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(canalNec)
      void supabase.removeChannel(canalMsg)
    }
  }, [perfil?.id, notificar])

  return null
}
