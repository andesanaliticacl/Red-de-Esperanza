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
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import {
  TIPO_META,
  ROL_META,
  type Necesidad,
  type NecesidadTipo,
  type NecesidadUrgencia,
  type RolRegistro,
} from '../lib/types'

// Accesos directos de inicio de sesión por rol (en el orden pedido).
const ROLES_ACCESO: RolRegistro[] = [
  'rescatista',
  'voluntario',
  'ciudadano',
  'centro_acopio',
]

// Opciones del filtro por tipo. Incluye las necesidades, los centros de acopio
// y un valor especial 'hospital' (los acopios cuya descripción dice "hospital").
const TIPOS_FILTRO: NecesidadTipo[] = [
  'rescate',
  'zona_sin_atender',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'otro',
  'acopio',
]
// Filtro de tipo: necesidad, 'todos', o 'hospital' (subtipo de acopio).
type FiltroTipo = NecesidadTipo | 'todos' | 'hospital'

const CLAVE_TUTORIAL = 'esperanza.tutorialVisto'

export default function CiudadanoView() {
  const { perfil, session, rol } = useAuth()
  const { necesidades, acopios } = useNecesidades(
    ['sin_verificar', 'verificada', 'en_proceso'],
    undefined,
    // Realtime solo para usuarios con sesión (staff). Los anónimos refrescan
    // por sondeo → no abren websocket → escala a miles a la vez.
    !!session,
  )
  // Total de desaparecidos para el contador del botón (consulta barata).
  const [totalDesap, setTotalDesap] = useState<number | null>(null)
  useEffect(() => {
    let cancel = false
    supabase
      .from('desaparecidos')
      .select('id', { count: 'exact', head: true })
      .not('lat', 'is', null)
      .then(({ count }) => {
        if (!cancel) setTotalDesap(count ?? null)
      })
    return () => {
      cancel = true
    }
  }, [])
  // La ubicación se detecta sola (GPS/IP) y se refresca cada 10 minutos.
  const { coord: coordAuto, fuente: fuenteAuto } = useUbicacionAuto()
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

  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipo>('todos')
  const [urgFiltro, setUrgFiltro] = useState<NecesidadUrgencia | 'todas'>('todas')
  // El filtro arranca CERRADO para no tapar el mapa; se abre con la flechita.
  const [verFiltros, setVerFiltros] = useState(false)
  // En móvil, el bloque de roles arranca plegado para no tapar el mapa.
  const [verRoles, setVerRoles] = useState(false)
  // Capa de desaparecidos: OCULTA al entrar. Solo se muestra cuando el usuario
  // la activa con el botón 🔍 Desaparecidos. null = aún no ha tocado (oculta).
  const [verDesapManual, setVerDesapManual] = useState<boolean | null>(null)
  const [busqDesap, setBusqDesap] = useState('')
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

  // Al filtrar por centros (acopio/hospital) no se muestran necesidades.
  const filtrandoCentros = tipoFiltro === 'acopio' || tipoFiltro === 'hospital'

  // Ambos filtros se combinan (tipo Y urgencia).
  const filtradas = useMemo(
    () =>
      filtrandoCentros
        ? []
        : necesidades.filter((n) => {
            if (tipoFiltro !== 'todos' && n.tipo !== tipoFiltro) return false
            if (urgFiltro !== 'todas' && n.urgencia !== urgFiltro) return false
            return true
          }),
    [necesidades, tipoFiltro, urgFiltro, filtrandoCentros],
  )

  // Los desaparecidos NO se muestran al entrar a la página: quedan ocultos hasta
  // que el usuario pulse el botón 🔍 Desaparecidos (o busque por nombre). Así no
  // tapan las necesidades a primera vista.
  const verDesap = verDesapManual ?? false
  const desapConCoords = totalDesap ?? 0

  // Centros visibles según el filtro:
  //  · 'todos'    → todos los centros (acopios + hospitales)
  //  · 'acopio'   → solo centros de acopio (no hospitales)
  //  · 'hospital' → solo hospitales
  //  · necesidad  → ninguno (se muestra solo esa necesidad)
  const acopiosVisibles = useMemo(() => {
    const esHosp = (a: (typeof acopios)[number]) =>
      (a.descripcion ?? '').toLowerCase().includes('hospital')
    if (tipoFiltro === 'todos') return acopios
    if (tipoFiltro === 'acopio') return acopios.filter((a) => !esHosp(a))
    if (tipoFiltro === 'hospital') return acopios.filter((a) => esHosp(a))
    return []
  }, [acopios, tipoFiltro])
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
            miUbicacion={coordAuto}
            miFoto={perfil?.foto_url}
            onMensaje={contactar}
            onAsignarme={puedeAtender ? asignarme : undefined}
            resaltadaId={resaltadaId}
            verDesaparecidos={verDesap}
            busquedaDesap={busqDesap}
          />
          {/* (desaparecidos se cargan por zona dentro del mapa) */}
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

          {/* Accesos directos por rol (solo si no hay sesión): entra o crea
              cuenta ya con el rol elegido. Plegable para no tapar el mapa. */}
          {!session && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow mb-2">
              <button
                onClick={() => setVerRoles((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5"
              >
                <span className="text-sm font-bold text-gray-700">
                  👤 Entra o crea tu cuenta
                </span>
                <span className="text-gray-400 text-lg leading-none">
                  {verRoles ? '▲' : '▼'}
                </span>
              </button>
              {verRoles && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-2 pb-2">
                  {ROLES_ACCESO.map((r) => (
                    <button
                      key={r}
                      onClick={() => navigate(`/login?rol=${r}`)}
                      className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl px-2 py-2 bg-bandera-azul/10 text-bandera-azul hover:bg-bandera-azul/20 active:scale-95 transition"
                    >
                      <span className="text-base leading-none">
                        {ROL_META[r].emoji}
                      </span>
                      {ROL_META[r].etiqueta}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Controles compactos: una sola fila con Filtrar + Desaparecidos,
              para no saturar la pantalla (sobre todo en el teléfono). */}
          <div className="pointer-events-auto flex gap-2">
            <button
              onClick={() => setVerFiltros((v) => !v)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl shadow px-2 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap ${
                verFiltros || hayFiltro
                  ? 'bg-bandera-azul text-white'
                  : 'bg-white/95 backdrop-blur text-gray-700'
              }`}
            >
              🔎 Filtrar{hayFiltro ? ' •' : ''}
              <span className="text-[10px] leading-none">{verFiltros ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => {
                const nuevo = !verDesap
                setVerDesapManual(nuevo)
                if (!nuevo) setBusqDesap('')
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl shadow px-2 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap ${
                verDesap
                  ? 'bg-bandera-azul text-white'
                  : 'bg-white/95 backdrop-blur text-gray-700'
              }`}
            >
              🔍 Desaparecidos{desapConCoords ? ` (${desapConCoords})` : ''}
            </button>
          </div>

          {/* Panel de filtros (solo si está abierto) */}
          {verFiltros && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-2 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="w-full rounded-lg border-2 border-gray-200 px-2 py-2 text-sm font-medium"
                  value={tipoFiltro}
                  onChange={(e) => setTipoFiltro(e.target.value as FiltroTipo)}
                >
                  <option value="todos">🗂️ Todo tipo de ayuda</option>
                  {TIPOS_FILTRO.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_META[t].emoji} {TIPO_META[t].etiqueta}
                    </option>
                  ))}
                  <option value="hospital">🏥 Hospital</option>
                </select>
                <select
                  className="w-full rounded-lg border-2 border-gray-200 px-2 py-2 text-sm font-medium"
                  value={urgFiltro}
                  onChange={(e) =>
                    setUrgFiltro(e.target.value as NecesidadUrgencia | 'todas')
                  }
                >
                  <option value="todas">⏱️ Cualquier urgencia</option>
                  <option value="alta">🔴 Urgencia alta</option>
                  <option value="media">🟠 Urgencia media</option>
                  <option value="baja">🟢 Urgencia baja</option>
                </select>
              </div>
              {hayFiltro && (
                <button
                  onClick={() => {
                    setTipoFiltro('todos')
                    setUrgFiltro('todas')
                  }}
                  className="mt-2 text-xs text-bandera-rojo font-semibold"
                >
                  ✕ Quitar filtros
                </button>
              )}
            </div>
          )}

          {/* Buscador de desaparecidos (solo si la capa está visible) */}
          {verDesap && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-2 mt-2">
              <input
                type="search"
                value={busqDesap}
                onChange={(e) => setBusqDesap(e.target.value)}
                placeholder="Buscar desaparecido por nombre…"
                className="w-full rounded-lg border-2 border-gray-200 px-2 py-2 text-sm"
              />
            </div>
          )}
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
