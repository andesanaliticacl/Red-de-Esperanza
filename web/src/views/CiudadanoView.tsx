import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MapaNecesidades from '../components/MapaNecesidades'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import ReportarModal from '../components/ReportarModal'
import SosModal from '../components/SosModal'
import ChatGlobal from '../components/ChatGlobal'
import ChatNecesidad from '../components/ChatNecesidad'
import TutorialModal from '../components/TutorialModal'
import MenuUsuario from '../components/MenuUsuario'
import { useNecesidades } from '../hooks/useNecesidades'
import { useDesaparecidos } from '../hooks/useDesaparecidos'
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import {
  TIPO_META,
  type Necesidad,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'

const TIPOS_FILTRO: NecesidadTipo[] = [
  'rescate',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'otro',
]

const CLAVE_TUTORIAL = 'esperanza.tutorialVisto'

export default function CiudadanoView() {
  const { necesidades, acopios } = useNecesidades([
    'sin_verificar',
    'verificada',
    'en_proceso',
  ])
  const { desaparecidos } = useDesaparecidos()
  // La ubicación se detecta sola (GPS/IP) y se refresca cada 10 minutos.
  const { coord: coordAuto, fuente: fuenteAuto } = useUbicacionAuto()
  const { perfil, session, rol } = useAuth()
  const { notificar } = useNotificaciones()
  const navigate = useNavigate()
  // Necesidad a resaltar en el mapa (al venir de un aviso: /?necesidad=ID).
  const [searchParams, setSearchParams] = useSearchParams()
  const resaltadaId = searchParams.get('necesidad') ?? undefined
  // El resaltado se quita solo a los 15 s para no quedar fijo.
  useEffect(() => {
    if (!resaltadaId) return
    const t = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          prev.delete('necesidad')
          return prev
        },
        { replace: true },
      )
    }, 15000)
    return () => window.clearTimeout(t)
  }, [resaltadaId, setSearchParams])
  // Voluntario/rescatista/admin pueden tomar una necesidad desde el mapa.
  const puedeAtender =
    rol === 'voluntario' || rol === 'rescatista' || rol === 'admin'
  const esRescatista = rol === 'rescatista' || rol === 'admin'

  // Tomar una necesidad desde el popup del mapa: la pasa a "en proceso" y le
  // avisa (Realtime) a quien la creó que alguien ya va en camino.
  async function asignarme(n: Necesidad) {
    if ((n.tipo === 'rescate' || n.origen === 'sos') && !esRescatista) {
      notificar('Solo los rescatistas pueden tomar una emergencia SOS.', 'alerta')
      return
    }
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'en_proceso', asignado_a: perfil?.id ?? null })
      .eq('id', n.id)
      .in('estado', ['sin_verificar', 'verificada'])
    if (error) notificar('No se pudo asignar: ' + error.message, 'alerta')
    else
      notificar(
        '✅ Te asignaste. Avisamos a la persona que vas en camino.',
        'exito',
      )
  }

  const [tipoFiltro, setTipoFiltro] = useState<NecesidadTipo | 'todos'>('todos')
  const [urgFiltro, setUrgFiltro] = useState<NecesidadUrgencia | 'todas'>('todas')
  const [abrirReporte, setAbrirReporte] = useState(false)
  const [abrirSos, setAbrirSos] = useState(false)
  const [chatNec, setChatNec] = useState<Necesidad | null>(null)
  const [chatAbierto, setChatAbierto] = useState(() => {
    try {
      return localStorage.getItem('esperanza.chatLateral') !== 'cerrado'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(
        'esperanza.chatLateral',
        chatAbierto ? 'abierto' : 'cerrado',
      )
    } catch {
      /* ignorar */
    }
  }, [chatAbierto])

  // Contactar a quien reportó: si hay sesión abre el chat; si no, va al login.
  function contactar(n: Necesidad) {
    if (session) setChatNec(n)
    else navigate('/login')
  }
  // El tutorial se muestra automáticamente la primera vez que se abre la app.
  const [abrirTutorial, setAbrirTutorial] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(CLAVE_TUTORIAL)) setAbrirTutorial(true)
    } catch {
      /* sin localStorage: no pasa nada */
    }
  }, [])

  function cerrarTutorial() {
    try {
      localStorage.setItem(CLAVE_TUTORIAL, '1')
    } catch {
      /* ignorar */
    }
    setAbrirTutorial(false)
  }

  // Ambos filtros se combinan (tipo Y urgencia).
  const filtradas = useMemo(
    () =>
      necesidades.filter((n) => {
        if (tipoFiltro !== 'todos' && n.tipo !== tipoFiltro) return false
        if (urgFiltro !== 'todas' && n.urgencia !== urgFiltro) return false
        return true
      }),
    [necesidades, tipoFiltro, urgFiltro],
  )

  // Los acopios solo se ven sin filtro de tipo (para mostrar solo lo del filtro).
  const acopiosVisibles = tipoFiltro === 'todos' ? acopios : []
  const hayFiltro = tipoFiltro !== 'todos' || urgFiltro !== 'todas'

  return (
    <div className="relative h-full w-full md:flex">
      {/* Chat comunitario lateral (solo escritorio; en móvil va en el menú).
          Se puede abrir/cerrar con el botón ✕ de su cabecera. */}
      {chatAbierto && (
        <aside className="hidden md:flex md:w-80 lg:w-96 h-full flex-col border-r border-gray-200 shrink-0">
          <ChatGlobal onCerrar={() => setChatAbierto(false)} />
        </aside>
      )}

      {/* Zona del mapa */}
      <div className="relative flex-1 h-full min-w-0">
        {/* Botón para reabrir el chat (solo escritorio, cuando está cerrado) */}
        {!chatAbierto && (
          <button
            onClick={() => setChatAbierto(true)}
            className="hidden md:flex absolute left-3 bottom-4 z-[1000] items-center gap-2 bg-bandera-azul text-white font-semibold px-4 py-2.5 rounded-full shadow-lg"
          >
            💬 Chat en vivo
          </button>
        )}
        <div className="absolute inset-0">
          <MapaNecesidades
            necesidades={filtradas}
            acopios={acopiosVisibles}
            desaparecidos={desaparecidos}
            miUbicacion={coordAuto}
            miFoto={perfil?.foto_url}
            onMensaje={contactar}
            onAsignarme={puedeAtender ? asignarme : undefined}
            resaltadaId={resaltadaId}
          />
        </div>

        {/* Encabezado + filtros */}
        <div className="absolute top-0 left-0 right-0 z-[1000] p-3 pointer-events-none">
          <div className="flex items-center gap-2 mb-2 pointer-events-auto">
            <span className="bg-bandera-azul text-white font-extrabold px-3 py-2 rounded-xl shadow">
              🕊️ Esperanza
            </span>
            <button
              onClick={() => setAbrirTutorial(true)}
              className="bg-white/70 backdrop-blur text-bandera-azul font-semibold px-3 py-2 rounded-xl shadow text-sm"
            >
              ¿Cómo funciona?
            </button>
            <div className="ml-auto flex items-center gap-2">
              {session && <CampanaNotificaciones claro />}
              <MenuUsuario claro />
            </div>
          </div>

          <div className="pointer-events-auto bg-white/95 rounded-2xl shadow p-2 flex gap-2 overflow-x-auto items-center">
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={tipoFiltro}
              onChange={(e) =>
                setTipoFiltro(e.target.value as NecesidadTipo | 'todos')
              }
            >
              <option value="todos">Todos los tipos</option>
              {TIPOS_FILTRO.map((t) => (
                <option key={t} value={t}>
                  {TIPO_META[t].emoji} {TIPO_META[t].etiqueta}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border px-2 py-1 text-sm"
              value={urgFiltro}
              onChange={(e) =>
                setUrgFiltro(e.target.value as NecesidadUrgencia | 'todas')
              }
            >
              <option value="todas">Toda urgencia</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
            {hayFiltro && (
              <button
                onClick={() => {
                  setTipoFiltro('todos')
                  setUrgFiltro('todas')
                }}
                className="text-xs text-bandera-rojo font-semibold whitespace-nowrap px-2"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Botones flotantes: SOS + Reportar */}
        <div className="absolute bottom-4 left-0 right-0 z-[1000] px-4 pointer-events-none">
          <div className="mx-auto w-full max-w-md flex flex-col gap-2 pointer-events-auto">
            <button
              onClick={() => setAbrirSos(true)}
              className="btn-rojo w-full text-base sm:text-lg py-3.5 animate-pulse"
            >
              🆘 SOS / Necesito rescate
            </button>
            <button
              onClick={() => setAbrirReporte(true)}
              className="btn-azul w-full text-base sm:text-lg py-3.5"
            >
              ➕ Reportar necesidad
            </button>
          </div>
        </div>
      </div>

      {abrirReporte && (
        <ReportarModal
          coordInicial={coordAuto}
          fuenteInicial={fuenteAuto}
          onCerrar={() => setAbrirReporte(false)}
          onCreado={() => setAbrirReporte(false)}
        />
      )}
      {abrirSos && <SosModal onCerrar={() => setAbrirSos(false)} />}
      {abrirTutorial && <TutorialModal onCerrar={cerrarTutorial} />}
      {chatNec && (
        <ChatNecesidad
          necesidadId={chatNec.id}
          titulo={`${TIPO_META[chatNec.tipo].etiqueta}${
            chatNec.zona ? ' · ' + chatNec.zona : ''
          }`}
          onCerrar={() => setChatNec(null)}
        />
      )}
    </div>
  )
}
