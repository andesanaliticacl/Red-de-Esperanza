import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MapaNecesidades from '../components/MapaNecesidades'
import ReportarModal from '../components/ReportarModal'
import SosModal from '../components/SosModal'
import { useNecesidades } from '../hooks/useNecesidades'
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
  'otro',
]

export default function CiudadanoView() {
  const { necesidades, acopios } = useNecesidades([
    'sin_verificar',
    'verificada',
    'en_proceso',
  ])

  const [tipoFiltro, setTipoFiltro] = useState<NecesidadTipo | 'todos'>('todos')
  const [urgFiltro, setUrgFiltro] = useState<NecesidadUrgencia | 'todas'>('todas')
  const [soloVerificadas, setSoloVerificadas] = useState(false)
  const [abrirReporte, setAbrirReporte] = useState(false)
  const [abrirSos, setAbrirSos] = useState(false)
  const [coordTocada, setCoordTocada] = useState<{ lat: number; lng: number } | null>(
    null,
  )

  const filtradas = useMemo(
    () =>
      necesidades.filter((n) => {
        if (tipoFiltro !== 'todos' && n.tipo !== tipoFiltro) return false
        if (urgFiltro !== 'todas' && n.urgencia !== urgFiltro) return false
        if (soloVerificadas && n.estado === 'sin_verificar') return false
        return true
      }),
    [necesidades, tipoFiltro, urgFiltro, soloVerificadas],
  )

  return (
    <div className="relative h-full w-full">
      {/* Mapa a pantalla completa */}
      <div className="absolute inset-0">
        <MapaNecesidades
          necesidades={filtradas}
          acopios={acopios}
          marcadorTemporal={coordTocada}
          onClicMapa={(lat, lng) => setCoordTocada({ lat, lng })}
        />
      </div>

      {/* Encabezado + filtros */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-3 pointer-events-none">
        <div className="flex items-center gap-2 mb-2 pointer-events-auto">
          <span className="bg-bandera-azul text-white font-extrabold px-3 py-2 rounded-xl shadow">
            🕊️ Esperanza
          </span>
          <Link
            to="/login"
            className="ml-auto bg-white/95 text-bandera-azul font-semibold px-3 py-2 rounded-xl shadow"
          >
            Ingresar
          </Link>
        </div>

        <div className="pointer-events-auto bg-white/95 rounded-2xl shadow p-2 flex gap-2 overflow-x-auto">
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
          <label className="flex items-center gap-1 text-sm whitespace-nowrap px-2">
            <input
              type="checkbox"
              checked={soloVerificadas}
              onChange={(e) => setSoloVerificadas(e.target.checked)}
            />
            Solo verificadas
          </label>
        </div>

        {coordTocada && (
          <div className="pointer-events-auto mt-2 bg-white/95 rounded-xl shadow p-2 text-sm flex items-center gap-2">
            📍 Punto marcado en el mapa
            <button
              className="ml-auto text-bandera-rojo font-semibold"
              onClick={() => setCoordTocada(null)}
            >
              Quitar
            </button>
          </div>
        )}
      </div>

      {/* Botones flotantes: SOS + Reportar (con leyenda integrada arriba) */}
      <div className="absolute bottom-4 left-0 right-0 z-[1000] px-4 pointer-events-none">
        <div className="mx-auto w-full max-w-md flex flex-col gap-2 pointer-events-auto">
          <div className="self-center bg-white/95 rounded-full shadow px-3 py-1 text-xs flex items-center gap-3">
            <span>🟢 Verificado</span>
            <span>⚪ Sin verificar</span>
          </div>
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

      {abrirReporte && (
        <ReportarModal
          coordPreseleccionada={coordTocada}
          onCerrar={() => setAbrirReporte(false)}
          onCreado={() => {
            setAbrirReporte(false)
            setCoordTocada(null)
          }}
        />
      )}
      {abrirSos && <SosModal onCerrar={() => setAbrirSos(false)} />}
    </div>
  )
}
