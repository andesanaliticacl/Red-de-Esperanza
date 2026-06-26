import { useState } from 'react'
import {
  TIPO_META,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'
import { crearNecesidad } from '../lib/reportes'
import { obtenerUbicacion, type FuenteUbicacion } from '../lib/geo'

const TIPOS: NecesidadTipo[] = [
  'rescate',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'otro',
]
const URGENCIAS: { v: NecesidadUrgencia; etiqueta: string; clase: string }[] = [
  { v: 'alta', etiqueta: 'Alta', clase: 'btn-rojo' },
  { v: 'media', etiqueta: 'Media', clase: 'btn-amber' },
  { v: 'baja', etiqueta: 'Baja', clase: 'btn-verde' },
]

/**
 * Formulario de 3 pasos: tipo → descripción + urgencia → ubicación.
 * `coordPreseleccionada` viene si el usuario tocó el mapa antes.
 * `tipoInicial` permite abrir el modal con un tipo ya elegido (p. ej. el botón
 * de "departamentos derrumbados"), saltando directo al paso 2.
 */
export default function ReportarModal({
  onCerrar,
  onCreado,
  coordPreseleccionada,
  tipoInicial,
}: {
  onCerrar: () => void
  onCreado: () => void
  coordPreseleccionada?: { lat: number; lng: number } | null
  tipoInicial?: NecesidadTipo
}) {
  const [paso, setPaso] = useState(tipoInicial ? 2 : 1)
  const [tipo, setTipo] = useState<NecesidadTipo>(tipoInicial ?? 'otro')
  const [descripcion, setDescripcion] = useState('')
  const [urgencia, setUrgencia] = useState<NecesidadUrgencia>(
    tipoInicial === 'derrumbe' ? 'alta' : 'media',
  )
  const [zona, setZona] = useState('')
  const [contacto, setContacto] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    coordPreseleccionada ?? null,
  )
  const [fuente, setFuente] = useState<FuenteUbicacion | null>(null)
  const [gpsEstado, setGpsEstado] = useState<'idle' | 'buscando' | 'error'>(
    'idle',
  )
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function usarGPS() {
    setGpsEstado('buscando')
    try {
      const u = await obtenerUbicacion()
      setCoord({ lat: u.lat, lng: u.lng })
      setFuente(u.fuente)
      setGpsEstado('idle')
    } catch {
      setGpsEstado('error')
    }
  }

  async function enviar() {
    setGuardando(true)
    setErrorMsg('')
    try {
      await crearNecesidad({
        tipo,
        urgencia,
        descripcion: descripcion.trim() || TIPO_META[tipo].etiqueta,
        zona: zona.trim() || null,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        contacto: contacto.trim() || null,
        origen: 'web',
      })
      onCreado()
    } catch (e) {
      setErrorMsg((e as Error).message)
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-bandera-azul">
            Reportar necesidad
          </h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Indicador de pasos */}
        <div className="flex gap-2 mb-5">
          {[1, 2, 3].map((p) => (
            <div
              key={p}
              className={`h-2 flex-1 rounded-full ${
                p <= paso ? 'bg-bandera-azul' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* PASO 1: tipo */}
        {paso === 1 && (
          <div>
            <p className="font-bold mb-3">¿Qué necesitas?</p>
            <div className="grid grid-cols-2 gap-3">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTipo(t)
                    setPaso(2)
                  }}
                  className={`card flex flex-col items-center py-5 border-2 ${
                    tipo === t ? 'border-bandera-azul' : 'border-transparent'
                  }`}
                >
                  <span className="text-3xl">{TIPO_META[t].emoji}</span>
                  <span className="font-bold mt-1">{TIPO_META[t].etiqueta}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2: descripción + urgencia */}
        {paso === 2 && (
          <div className="space-y-4">
            <div>
              <p className="font-bold mb-2">Describe brevemente</p>
              <textarea
                className="input min-h-[90px]"
                placeholder="Ej: Familia con 2 niños sin agua desde ayer"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div>
              <p className="font-bold mb-2">Urgencia</p>
              <div className="grid grid-cols-3 gap-2">
                {URGENCIAS.map((u) => (
                  <button
                    key={u.v}
                    onClick={() => setUrgencia(u.v)}
                    className={`${u.clase} ${
                      urgencia === u.v ? 'ring-4 ring-black/20' : 'opacity-80'
                    }`}
                  >
                    {u.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-bold mb-2">Zona (opcional)</p>
              <input
                className="input"
                placeholder="Ej: Petare, parte alta"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPaso(1)} className="btn-gris flex-1">
                ← Atrás
              </button>
              <button onClick={() => setPaso(3)} className="btn-azul flex-1">
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: ubicación + contacto */}
        {paso === 3 && (
          <div className="space-y-4">
            <div>
              <p className="font-bold mb-2">Ubicación</p>
              <button
                onClick={usarGPS}
                disabled={gpsEstado === 'buscando'}
                className="btn-azul w-full disabled:opacity-70"
              >
                {gpsEstado === 'buscando' ? (
                  <>
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Buscando tu ubicación…
                  </>
                ) : (
                  <>📍 {coord ? 'Actualizar mi ubicación' : 'Usar mi ubicación'}</>
                )}
              </button>
              {gpsEstado === 'buscando' && (
                <p className="text-xs text-gray-500 mt-2">
                  Esto puede tardar unos segundos. Si el GPS no responde, usamos
                  tu ubicación aproximada por red.
                </p>
              )}
              {coord && gpsEstado !== 'buscando' && (
                <p className="text-sm text-green-700 mt-2">
                  ✅ Ubicación lista: {coord.lat.toFixed(4)},{' '}
                  {coord.lng.toFixed(4)}
                  {fuente === 'ip' && (
                    <span className="block text-amber-600">
                      Aproximada por red — puedes tocar el mapa para ajustarla.
                    </span>
                  )}
                </p>
              )}
              {gpsEstado === 'error' && (
                <p className="text-sm text-bandera-rojo mt-2">
                  No pudimos obtener tu ubicación. Cierra y toca el mapa para
                  marcar el punto, o intenta de nuevo.
                </p>
              )}
            </div>
            <div>
              <p className="font-bold mb-2">Contacto (opcional, privado)</p>
              <input
                className="input"
                placeholder="Teléfono o usuario — solo lo ven los voluntarios"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
              />
            </div>
            {errorMsg && <p className="text-bandera-rojo">⚠️ {errorMsg}</p>}
            <div className="flex gap-2">
              <button onClick={() => setPaso(2)} className="btn-gris flex-1">
                ← Atrás
              </button>
              <button
                onClick={enviar}
                disabled={guardando}
                className="btn-verde flex-1 disabled:opacity-60"
              >
                {guardando ? 'Enviando…' : 'Enviar reporte'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
