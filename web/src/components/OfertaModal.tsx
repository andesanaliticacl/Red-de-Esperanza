import { useEffect, useState } from 'react'
import { obtenerUbicacion } from '../lib/geo'
import EntradaTelefono, { esTelefonoValido } from './EntradaTelefono'
import {
  crearOferta,
  OFERTAS_ORDEN,
  OFERTA_META,
  TIPOS_CON_ENLACE,
  PROFESIONES_RAPIDAS,
  PROFESION_VETERINARIO,
  validarOferta,
  type OfertaTipo,
} from '../lib/ofertas'
import { ICONO_OFERTA } from '../lib/iconosTipo'

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
  onVolver,
}: {
  onCerrar: () => void
  onCreada?: () => void
  /** Vuelve a la lista de Reportar, de donde se entra. */
  onVolver?: () => void
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
  // Especie a la que va dirigida la comida de mascota.
  const [especie, setEspecie] = useState<'Perro' | 'Gato' | 'Otro' | null>(null)
  // Profesión ofrecida y si se está escribiendo una que no está en los
  // atajos.
  const [profesion, setProfesion] = useState('')
  const [profesionOtra, setProfesionOtra] = useState(false)

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
      descripcion:
        tipo === 'comida_mascota' && especie
          ? `Para ${especie.toLowerCase()}. ${descripcion}`
          : descripcion,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      enlace: enlace || null,
      profesion: tipo === 'profesional' ? profesion : null,
      contacto: contacto || null,
    }
    if (tipo === 'profesional' && !profesion.trim()) {
      setError('Dinos qué profesión ofreces.')
      return
    }
    if (tipo === 'comida_mascota' && !especie) {
      setError('Dinos para qué animal es: perro, gato u otro.')
      return
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
      <h2 className="text-xl font-extrabold mb-1">🤝 Yo tengo</h2>
      <p className="text-sm text-gray-600 mb-4">
        Cuenta qué puedes ofrecer. Aparecerá en el mapa para quien lo necesite.
      </p>

      {/* Cuadrícula compacta: icono y una palabra, sin descripciones largas. */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {lista.map((t) => {
          const meta = OFERTA_META[t]
          const Icono = ICONO_OFERTA[t]
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
              {/* Icono y no emoji: el resto de la app usa iconos en todos sus
                  selectores, y las ofertas eran las únicas con emojis. Se
                  veían como si vinieran de otra aplicación. */}
              <Icono
                className="h-6 w-6"
                strokeWidth={2}
                style={activo ? undefined : { color: meta.color }}
                aria-hidden="true"
              />
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
          {/* ¿Para qué animal? Un saco de alimento para perro no le sirve a
              quien tiene un gato, y al revés. Va como botones y no como texto
              libre para que quien busca pueda filtrarlo después. */}
          {/* ¿Qué profesión? Médico y veterinario con un toque, el resto se
              escribe: son los dos que más se ofrecen en una emergencia, y la
              lista completa de oficios no cabe. Elegir "Veterinario/a" hace
              además que la oferta salga en el filtro 🐾 Mascotas. */}
          {tipo === 'profesional' && (
            <div>
              <p className="text-sm font-bold mb-1.5">¿Cuál es tu profesión?</p>
              <div className="grid grid-cols-3 gap-2">
                {[...PROFESIONES_RAPIDAS, 'Otra'].map((p) => {
                  const activa =
                    p === 'Otra' ? profesionOtra : profesion === p
                  const esVet = p === PROFESION_VETERINARIO
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        if (p === 'Otra') {
                          setProfesionOtra(true)
                          setProfesion('')
                        } else {
                          setProfesionOtra(false)
                          setProfesion(p)
                        }
                      }}
                      aria-pressed={activa}
                      className={`rounded-xl border-2 py-2 text-xs font-bold leading-tight ${
                        activa
                          ? esVet
                            ? 'border-teal-600 bg-teal-50 text-teal-700'
                            : 'border-bandera-azul bg-bandera-azul/10 text-bandera-azul'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {esVet ? '🐾 ' : ''}
                      {p === 'Otra' ? 'Otra' : p.replace('/a', '')}
                    </button>
                  )
                })}
              </div>
              {profesionOtra && (
                <input
                  value={profesion}
                  onChange={(e) => setProfesion(e.target.value)}
                  placeholder="¿Cuál? Ej: enfermera, eléctrico, albañil…"
                  className="mt-2 w-full rounded-2xl border-2 border-gray-200 p-3 text-sm"
                />
              )}
              {profesion === PROFESION_VETERINARIO && (
                <p className="mt-1.5 text-xs font-semibold text-teal-700">
                  🐾 Tu oferta saldrá también en el filtro de Mascotas.
                </p>
              )}
            </div>
          )}

          {tipo === 'comida_mascota' && (
            <div>
              <p className="text-sm font-bold mb-1.5">¿Para qué animal es?</p>
              <div className="grid grid-cols-3 gap-2">
                {(['Perro', 'Gato', 'Otro'] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEspecie(e)}
                    aria-pressed={especie === e}
                    className={`rounded-xl border-2 py-2 text-sm font-bold ${
                      especie === e
                        ? 'border-amber-600 bg-amber-50 text-amber-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
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

      {/* "← Atrás" con el MISMO aspecto y el mismo sitio que en el resto de
          Reportar (btn-gris, ancho completo, al final). Con un tipo elegido
          vuelve a la cuadrícula; sin elegir nada, vuelve a Reportar, que es
          de donde se entra. Antes esa segunda salida no existía: había que
          cerrar todo y empezar de cero. */}
      {(tipo || onVolver) && (
        <button
          type="button"
          onClick={() => {
            if (tipo) {
              setTipo(null)
              setError('')
            } else {
              onVolver?.()
            }
          }}
          className="btn-gris w-full mt-2"
        >
          ← Atrás
        </button>
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
