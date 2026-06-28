import { useEffect, useState } from 'react'
import {
  TIPO_META,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'
import { crearNecesidad } from '../lib/reportes'
import {
  obtenerUbicacion,
  geocodificarDireccion,
  type FuenteUbicacion,
} from '../lib/geo'

// Opciones del menú "Reportar necesidad". El rescate NO va aquí: tiene su
// propio botón rojo "🆘 SOS" (SosModal). En su lugar va "Zona sin atender".
const TIPOS: NecesidadTipo[] = [
  'zona_sin_atender',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'otro',
]
// Radios disponibles para una "zona sin atender" (km). Por defecto 10.
const RADIOS_ZONA = [5, 10, 20]
const URGENCIAS: { v: NecesidadUrgencia; etiqueta: string; clase: string }[] = [
  { v: 'alta', etiqueta: 'Alta', clase: 'btn-rojo' },
  { v: 'media', etiqueta: 'Media', clase: 'btn-amber' },
  { v: 'baja', etiqueta: 'Baja', clase: 'btn-verde' },
]

/**
 * Reportar necesidad. La ubicación se detecta SIEMPRE por GPS/IP.
 *  · rescate: TODO en una sola pantalla (sin pasos) para no perder tiempo.
 *  · derrumbe: pide la dirección del edificio.
 *  · resto: detalle → ubicación + contacto.
 * Ya no se pide "zona": en una emergencia la gente no debe perder tiempo escribiendo.
 */
export default function ReportarModal({
  onCerrar,
  onCreado,
  coordInicial,
  fuenteInicial,
}: {
  onCerrar: () => void
  onCreado: () => void
  coordInicial?: { lat: number; lng: number } | null
  fuenteInicial?: FuenteUbicacion | null
}) {
  const [paso, setPaso] = useState(1)
  const [tipo, setTipo] = useState<NecesidadTipo>('otro')
  const [descripcion, setDescripcion] = useState('')
  const [urgencia, setUrgencia] = useState<NecesidadUrgencia>('media')
  const [zona, setZona] = useState('') // "dirección" en derrumbe y zona sin atender
  const [radioKm, setRadioKm] = useState(10) // tamaño de la "zona sin atender"
  // Para derrumbe / zona: la ubicación sale de la DIRECCIÓN escrita; el GPS de
  // la persona es solo una OPCIÓN ("usar mi ubicación actual") por si no la sabe.
  const [modoUbic, setModoUbic] = useState<'direccion' | 'gps'>('direccion')
  const [contacto, setContacto] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    coordInicial ?? null,
  )
  const [fuente, setFuente] = useState<FuenteUbicacion | null>(
    fuenteInicial ?? null,
  )
  const [gpsEstado, setGpsEstado] = useState<'idle' | 'buscando' | 'error'>(
    coordInicial ? 'idle' : 'buscando',
  )
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const esDerrumbe = tipo === 'derrumbe'
  const esZona = tipo === 'zona_sin_atender'
  const esRescate = tipo === 'rescate'
  // Tipos cuya ubicación se toma de la DIRECCIÓN escrita (no del GPS automático).
  const usaDireccion = esDerrumbe || esZona

  async function actualizarUbicacion() {
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

  // Si no llegó una ubicación inicial, la buscamos automáticamente al abrir.
  useEffect(() => {
    if (!coordInicial) actualizarUbicacion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function elegirTipo(t: NecesidadTipo) {
    setTipo(t)
    if (t === 'derrumbe' || t === 'rescate' || t === 'zona_sin_atender')
      setUrgencia('alta')
    // Derrumbe / zona arrancan en modo "dirección" (no GPS automático).
    setModoUbic('direccion')
    setPaso(2)
  }

  async function enviar() {
    setGuardando(true)
    setErrorMsg('')
    try {
      let lat = coord?.lat ?? null
      let lng = coord?.lng ?? null

      // Derrumbe / zona en modo DIRECCIÓN: la ubicación sale de la dirección
      // escrita (no de dónde esté la persona). Solo si eligió "usar mi
      // ubicación actual" (modo gps) se usa el GPS.
      if (usaDireccion && modoUbic === 'direccion') {
        const dir = zona.trim()
        if (!dir) {
          throw new Error(
            'Escribe la dirección, o toca “usar mi ubicación actual”.',
          )
        }
        const g = await geocodificarDireccion(dir)
        if (!g) {
          throw new Error(
            'No encontramos esa dirección. Revísala o usa tu ubicación actual.',
          )
        }
        lat = g.lat
        lng = g.lng
      }

      await crearNecesidad({
        tipo,
        urgencia,
        descripcion: descripcion.trim() || TIPO_META[tipo].etiqueta,
        zona: usaDireccion ? zona.trim() || null : null,
        lat,
        lng,
        radio_km: esZona ? radioKm : null,
        contacto: contacto.trim() || null,
        origen: esRescate ? 'sos' : 'web',
      })
      onCreado()
    } catch (e) {
      setErrorMsg((e as Error).message)
      setGuardando(false)
    }
  }

  // Bloques reutilizables (ubicación automática + contacto).
  const bloqueUbicacion = (
    <div>
      <p className="font-bold mb-2">Ubicación</p>
      <div className="rounded-xl border bg-gray-50 p-3">
        {gpsEstado === 'buscando' ? (
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full border-2 border-gray-300 border-t-bandera-azul animate-spin" />
            Detectando tu ubicación…
          </p>
        ) : coord ? (
          <p className="text-sm text-green-700">
            ✅ Ubicación detectada: {coord.lat.toFixed(4)},{' '}
            {coord.lng.toFixed(4)}
            {fuente === 'ip' && (
              <span className="block text-amber-600">Aproximada por red.</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-bandera-rojo">
            No pudimos detectar tu ubicación. Activa el GPS e inténtalo de nuevo.
          </p>
        )}
        <button
          onClick={actualizarUbicacion}
          disabled={gpsEstado === 'buscando'}
          className="btn-gris mt-2 py-2 px-3 text-sm disabled:opacity-60"
        >
          🔄 Actualizar ubicación
        </button>
      </div>
    </div>
  )

  function activarGps() {
    setModoUbic('gps')
    actualizarUbicacion()
  }

  // Ubicación para derrumbe / zona: por defecto usa la DIRECCIÓN escrita; el
  // GPS de la persona es solo una opción para cuando no sabe la dirección.
  const bloqueUbicacionDireccion = (
    <div>
      <p className="font-bold mb-2">
        Ubicación {esZona ? 'de la zona' : 'del edificio'}
      </p>
      {modoUbic === 'direccion' ? (
        <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
          {zona.trim() ? (
            <p className="text-sm text-gray-700">
              📍 Usaremos la dirección que indicaste:
              <span className="block font-semibold mt-0.5">{zona.trim()}</span>
            </p>
          ) : (
            <p className="text-sm text-amber-700">
              No escribiste una dirección. Vuelve atrás para escribirla, o usa
              tu ubicación actual.
            </p>
          )}
          <button
            onClick={activarGps}
            className="btn-gris w-full py-2 px-3 text-sm"
          >
            📍 No sé la dirección — usar mi ubicación actual
          </button>
        </div>
      ) : (
        <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
          {gpsEstado === 'buscando' ? (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-gray-300 border-t-bandera-azul animate-spin" />
              Detectando tu ubicación…
            </p>
          ) : coord ? (
            <p className="text-sm text-green-700">
              ✅ Tu ubicación actual: {coord.lat.toFixed(4)},{' '}
              {coord.lng.toFixed(4)}
              {fuente === 'ip' && (
                <span className="block text-amber-600">Aproximada por red.</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-bandera-rojo">
              No pudimos detectar tu ubicación. Activa el GPS e inténtalo de
              nuevo.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={actualizarUbicacion}
              disabled={gpsEstado === 'buscando'}
              className="btn-gris py-2 px-3 text-sm disabled:opacity-60"
            >
              🔄 Actualizar
            </button>
            <button
              onClick={() => setModoUbic('direccion')}
              className="text-sm text-bandera-azul font-semibold px-2"
            >
              ↩ Usar la dirección
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const bloqueContacto = (
    <div>
      <p className="font-bold mb-1">
        Contacto <span className="text-bandera-rojo">(ideal)</span>
      </p>
      <p className="text-xs text-gray-500 mb-2">
        Déjalo para que quien tome tu caso pueda comunicarse contigo. Es
        privado: solo lo ve quien te ayuda.
      </p>
      <input
        className="input"
        placeholder="Teléfono o WhatsApp"
        inputMode="tel"
        value={contacto}
        onChange={(e) => setContacto(e.target.value)}
      />
    </div>
  )

  const selectorUrgencia = (
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
  )

  const titulo = esRescate
    ? 'Pedir rescate'
    : esDerrumbe && paso > 1
      ? 'Edificio derrumbado'
      : esZona && paso > 1
        ? 'Zona sin atender'
        : 'Reportar necesidad'

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-bandera-azul">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Indicador de pasos (no aplica al rescate, que es de una sola pantalla) */}
        {!esRescate && (
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
        )}

        {/* PASO 1: tipo */}
        {paso === 1 && (
          <div>
            <p className="font-bold mb-3">¿Qué quieres reportar?</p>
            <div className="grid grid-cols-2 gap-3">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  onClick={() => elegirTipo(t)}
                  className={`card flex flex-col items-center py-5 border-2 ${
                    tipo === t ? 'border-bandera-azul' : 'border-transparent'
                  }`}
                >
                  <span className="text-3xl">{TIPO_META[t].emoji}</span>
                  <span className="font-bold mt-1 text-center text-sm">
                    {TIPO_META[t].etiqueta}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* RESCATE: todo en una sola pantalla */}
        {paso > 1 && esRescate && (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              🆘 Pedir rescate. Enviamos tu ubicación a los rescatistas. Con un
              contacto te ubican más rápido.
            </div>
            <div>
              <p className="font-bold mb-2">¿Qué pasa? (opcional)</p>
              <textarea
                className="input min-h-[70px]"
                placeholder="Ej: 2 personas atrapadas"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            {bloqueUbicacion}
            {bloqueContacto}
            {errorMsg && <p className="text-bandera-rojo">⚠️ {errorMsg}</p>}
            <div className="flex gap-2">
              <button onClick={() => setPaso(1)} className="btn-gris flex-1">
                ← Atrás
              </button>
              <button
                onClick={enviar}
                disabled={guardando}
                className="btn-rojo flex-1 disabled:opacity-60"
              >
                {guardando ? 'Enviando…' : '🆘 Enviar rescate'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 2 (no rescate): detalle */}
        {paso === 2 && !esRescate && (
          <div className="space-y-4">
            {esDerrumbe ? (
              <>
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  🏚️ Reporta un edificio o departamento colapsado. Indica su
                  dirección; en el siguiente paso, si no la sabes, podrás usar tu
                  ubicación actual.
                </div>
                <div>
                  <p className="font-bold mb-2">Dirección del edificio</p>
                  <input
                    className="input"
                    placeholder="Calle, edificio, urbanización, referencia…"
                    value={zona}
                    onChange={(e) => setZona(e.target.value)}
                  />
                </div>
                <div>
                  <p className="font-bold mb-2">Detalles (opcional)</p>
                  <textarea
                    className="input min-h-[80px]"
                    placeholder="Ej: 4 pisos, posible gente atrapada en el 2.º"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>
              </>
            ) : esZona ? (
              <>
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  🚩 Marca una <strong>zona</strong> donde aún no ha llegado
                  ayuda, para que rescatistas y voluntarios sepan dónde ir. Se
                  verá en el mapa como un círculo, no como un punto.
                </div>
                <div>
                  <p className="font-bold mb-2">Dirección o referencia de la zona</p>
                  <input
                    className="input"
                    placeholder="Sector, urbanización, pueblo, carretera…"
                    value={zona}
                    onChange={(e) => setZona(e.target.value)}
                  />
                </div>
                <div>
                  <p className="font-bold mb-2">Tamaño de la zona</p>
                  <div className="grid grid-cols-3 gap-2">
                    {RADIOS_ZONA.map((km) => (
                      <button
                        key={km}
                        onClick={() => setRadioKm(km)}
                        className={`btn-gris py-2.5 ${
                          radioKm === km ? 'ring-4 ring-bandera-azul/30 font-bold' : 'opacity-80'
                        }`}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-bold mb-2">Detalles (opcional)</p>
                  <textarea
                    className="input min-h-[80px]"
                    placeholder="Ej: caseríos incomunicados tras el derrumbe de la vía"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="font-bold mb-2">Describe brevemente</p>
                <textarea
                  className="input min-h-[90px]"
                  placeholder="Ej: Familia con 2 niños sin agua desde ayer"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
            )}
            {selectorUrgencia}
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

        {/* PASO 3 (no rescate): ubicación + contacto */}
        {paso === 3 && !esRescate && (
          <div className="space-y-4">
            {usaDireccion ? bloqueUbicacionDireccion : bloqueUbicacion}
            {bloqueContacto}
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
