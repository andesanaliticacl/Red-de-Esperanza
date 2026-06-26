import { useEffect, useMemo, useState } from 'react'
import MapaNecesidades from '../components/MapaNecesidades'
import ReportarModal from '../components/ReportarModal'
import SosModal from '../components/SosModal'
import ChatGlobal from '../components/ChatGlobal'
import TutorialModal from '../components/TutorialModal'
import MenuUsuario from '../components/MenuUsuario'
import { useNecesidades } from '../hooks/useNecesidades'
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import {
  TIPO_META,
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
  // La ubicación se detecta sola (GPS/IP) y se refresca cada 10 minutos.
  const { coord: coordAuto, fuente: fuenteAuto } = useUbicacionAuto()

  const [tipoFiltro, setTipoFiltro] = useState<NecesidadTipo | 'todos'>('todos')
  const [urgFiltro, setUrgFiltro] = useState<NecesidadUrgencia | 'todas'>('todas')
  const [abrirReporte, setAbrirReporte] = useState(false)
  const [abrirSos, setAbrirSos] = useState(false)
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
      {/* Chat comunitario lateral (solo escritorio; en móvil va en el menú) */}
      <aside className="hidden md:flex md:w-80 lg:w-96 h-full flex-col border-r border-gray-200 shrink-0">
        <ChatGlobal />
      </aside>

      {/* Zona del mapa */}
      <div className="relative flex-1 h-full min-w-0">
        <div className="absolute inset-0">
          <MapaNecesidades
            necesidades={filtradas}
            acopios={acopiosVisibles}
            marcadorTemporal={coordAuto}
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
            <div className="ml-auto">
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
    </div>
  )
}
