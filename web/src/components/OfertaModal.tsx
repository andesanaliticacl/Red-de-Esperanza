import { useEffect, useState } from 'react'
import { obtenerUbicacion } from '../lib/geo'
import EntradaTelefono, { esTelefonoValido } from './EntradaTelefono'
import {
  crearOferta,
  OFERTAS_ORDEN,
  OFERTA_META,
  TIPOS_CON_ENLACE,
  validarOferta,
  type OfertaTipo,
} from '../lib/ofertas'

/**
 * "Yo tengo": publicar algo que se OFRECE.
 *
 * Se muestran 6 tipos y el resto queda tras "Ver más". No es un capricho
 * estético: son 11 tipos y ponerlos todos de golpe es un muro de botones
 * justo cuando la persona tiene menos paciencia. Los 6 primeros cubren lo
 * que más se pide en una emergencia.
 */
const VISIBLES = 6

export default function OfertaModal({
  onCerrar,
  onCreada,
}: {
  onCerrar: () => void
  onCreada?: () => void
}) {
  const [tipo, setTipo] = useState<OfertaTipo | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [enlace, setEnlace] = useState('')
  const [contacto, setContacto] = useState('')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [gps, setGps] = useState<'idle' | 'buscando' | 'error'>('idle')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  const necesitaEnlace = tipo != null && TIPOS_CON_ENLACE.includes(tipo)

  // La ubicación se pide sola en cuanto se elige un tipo que la necesita, para
  // que esté lista cuando la persona termine de escribir y no tenga que
  // esperar al final.
  useEffect(() => {
    if (!tipo || necesitaEnlace || coord) return
    setGps('buscando')
    obtenerUbicacion()
      .then((u) => {
        setCoord({ lat: u.lat, lng: u.lng })
        setGps('idle')
      })
      .catch(() => setGps('error'))
  }, [tipo, necesitaEnlace, coord])

  async function publicar() {
    if (!tipo) return
    setError('')
    const datos = {
      tipo,
      descripcion,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      enlace: enlace || null,
      contacto: contacto || null,
    }
    const problema = validarOferta(datos)
    if (problema) {
      setError(problema)
      return
    }
    if (contacto && !esTelefonoValido(contacto)) {
      setError('Revisa el número de teléfono.')
      return
    }
    setEnviando(true)
    try {
      await crearOferta(datos)
      setListo(true)
      onCreada?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <Marco onCerrar={onCerrar}>
        <div className="text-center py-6">
          <div className="text-5xl mb-3">🤝</div>
          <h2 className="text-xl font-extrabold mb-2">Publicado, gracias</h2>
          <p className="text-sm text-gray-600 mb-5">
            Ya aparece en el mapa para quien lo necesite. Cuando se acabe,
            márcalo como agotado para que nadie vaya en vano.
          </p>
          <button onClick={onCerrar} className="btn-azul py-2.5 px-6">
            Cerrar
          </button>
        </div>
      </Marco>
    )
  }

  const lista = verTodos ? OFERTAS_ORDEN : OFERTAS_ORDEN.slice(0, VISIBLES)

  return (
    <Marco onCerrar={onCerrar}>
      {/* Volver: al elegir un tipo la cuadrícula sigue arriba, pero si te
          equivocaste de casilla el camino de salida tiene que estar a la
          vista. Sin esto había que cerrar todo y empezar de nuevo. */}
      {tipo && (
        <button
          onClick={() => {
            setTipo(null)
            setError('')
          }}
          className="mb-2 flex items-center gap-1 text-sm font-bold text-gray-500"
        >
          ← Volver
        </button>
      )}
      <h2 className="text-xl font-extrabold mb-1">🤝 Yo tengo</h2>
      <p className="text-sm text-gray-600 mb-4">
        Cuenta qué puedes ofrecer. Aparecerá en el mapa para quien lo necesite.
      </p>

      {/* Cuadrícula compacta: icono y una palabra, sin descripciones largas. */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {lista.map((t) => {
          const meta = OFERTA_META[t]
          const activo = tipo === t
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={activo}
              className={`rounded-2xl border-2 p-2 flex flex-col items-center gap-1 text-center transition-colors ${
                activo
                  ? 'text-white border-transparent'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
              style={activo ? { backgroundColor: meta.color } : undefined}
            >
              <span className="text-2xl leading-none">{meta.emoji}</span>
              <span className="text-[11px] font-bold leading-tight">
                {meta.etiqueta}
              </span>
            </button>
          )
        })}
      </div>

      {!verTodos && (
        <button
          onClick={() => setVerTodos(true)}
          className="text-sm font-bold text-bandera-azul mb-4"
        >
          Ver más opciones
        </button>
      )}

      {tipo && (
        <div className="space-y-3 mt-2">
          <div>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={OFERTA_META[tipo].ejemplo}
              className="w-full rounded-2xl border-2 border-gray-200 p-3 text-sm"
            />
          </div>

          {necesitaEnlace ? (
            <div>
              <input
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="w-full rounded-2xl border-2 border-gray-200 p-3 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                💬 Pega el enlace de invitación al grupo. Un grupo no está en
                ningún lugar del mapa: se entra por el enlace.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              {gps === 'buscando' && '📍 Buscando tu ubicación…'}
              {gps === 'error' &&
                '📍 No pudimos ubicarte. Activa la ubicación y vuelve a elegir el tipo.'}
              {gps === 'idle' &&
                coord &&
                '📍 Listo: se publicará en tu ubicación actual.'}
            </p>
          )}

          <div>
            <EntradaTelefono valor={contacto} onChange={setContacto} />
            <p className="text-xs text-gray-500 mt-1">
              Opcional. Solo lo ven quienes tienen cuenta, nunca es público.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-2.5">
              {error}
            </p>
          )}

          <button
            onClick={publicar}
            disabled={enviando}
            className="btn-azul w-full py-3 disabled:opacity-60"
          >
            {enviando ? 'Publicando…' : 'Publicar lo que tengo'}
          </button>
        </div>
      )}
    </Marco>
  )
}

function Marco({
  children,
  onCerrar,
}: {
  children: React.ReactNode
  onCerrar: () => void
}) {
  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto relative">
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute top-3 right-4 text-2xl text-gray-400"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
