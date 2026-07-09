import { useEffect, useState } from 'react'
import {
  TIPO_META,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'
import { crearNecesidad } from '../lib/reportes'
import { supabase } from '../lib/supabase'
import {
  buscarHospitalesGoogle,
  detalleLugarGoogle,
  GoogleMapsConfigError,
  type HospitalGoogle,
} from '../lib/googleGeocode'
import {
  obtenerUbicacion,
  geocodificarDireccion,
  parsearCoordenadas,
  estaEnVenezuela,
  type FuenteUbicacion,
} from '../lib/geo'
import SelectorPunto from './SelectorPunto'
import EntradaTelefono, {
  esTelefonoVenezuelaValido,
  mensajeTelefonoVenezuela,
} from './EntradaTelefono'

// Opciones del menú "Reportar necesidad". El rescate NO va aquí: tiene su
// propio botón rojo "🆘 SOS" (SosModal). En su lugar va "Zona sin atender".
const TIPOS: NecesidadTipo[] = [
  'zona_sin_atender',
  'atencion_psicologica',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'otro',
]
type TipoReporte = NecesidadTipo | 'hospital'
const HOSPITAL_META = {
  etiqueta: 'Hospital',
  emoji: '🏥',
  color: '#CC0001',
}
// Tamaños (DIÁMETRO aprox.) de una "zona sin atender", en km. Por defecto 3.
// Guardamos el radio = diámetro / 2 para que el círculo sea fino y proporcional.
const TAMANOS_ZONA = [1, 3, 5]
const URGENCIAS: { v: NecesidadUrgencia; etiqueta: string; clase: string }[] = [
  { v: 'alta', etiqueta: 'Alta', clase: 'btn-rojo' },
  { v: 'media', etiqueta: 'Media', clase: 'btn-amber' },
  { v: 'baja', etiqueta: 'Baja', clase: 'btn-verde' },
]

/**
 * Reportar necesidad. Todos los tipos (menos el rescate, que va en SosModal) se
 * reportan en UNA sola pantalla con mini-mapa para fijar el punto EXACTO: buscar
 * la dirección (Google Maps si hay clave; si no, OpenStreetMap), arrastrar el
 * pin, usar el GPS o pegar coordenadas. La "zona sin atender" añade un radio.
 */
export default function ReportarModal({
  onCerrar,
  onCreado,
  coordInicial,
  fuenteInicial,
  puedeReportarHospital = false,
}: {
  onCerrar: () => void
  onCreado: (tipo?: TipoReporte) => void
  coordInicial?: { lat: number; lng: number } | null
  fuenteInicial?: FuenteUbicacion | null
  puedeReportarHospital?: boolean
}) {
  const [paso, setPaso] = useState(1)
  const [tipo, setTipo] = useState<TipoReporte>('otro')
  const [descripcion, setDescripcion] = useState('')
  const [nombrePaciente, setNombrePaciente] = useState('')
  const [cedulaPaciente, setCedulaPaciente] = useState('')
  const [nombreHospital, setNombreHospital] = useState('')
  const [hospitalConfirmado, setHospitalConfirmado] =
    useState<HospitalGoogle | null>(null)
  const [sugerenciasHospital, setSugerenciasHospital] = useState<HospitalGoogle[]>([])
  const [buscandoHospital, setBuscandoHospital] = useState(false)
  const [seleccionandoHospital, setSeleccionandoHospital] = useState(false)
  const [urgencia, setUrgencia] = useState<NecesidadUrgencia>('media')
  const [zona, setZona] = useState('') // dirección / referencia del lugar
  const [tamZonaKm, setTamZonaKm] = useState(3) // diámetro aprox. de la zona
  // Teléfono OBLIGATORIO con código de país (para que el botón de WhatsApp
  // abra el chat). Se guarda completo, p. ej. "+58 4121234567".
  const [contacto, setContacto] = useState('')
  // Punto fijado (el pin). coordAuto = ubicación detectada del usuario, que se
  // usa como punto por defecto en las necesidades comunes (no en derrumbe/zona,
  // que están donde está el edificio/zona, no donde está quien reporta).
  const [coordAuto, setCoordAuto] = useState<{ lat: number; lng: number } | null>(
    coordInicial ?? null,
  )
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    coordInicial ?? null,
  )
  const [fuente, setFuente] = useState<FuenteUbicacion | null>(
    fuenteInicial ?? null,
  )
  const [gpsEstado, setGpsEstado] = useState<'idle' | 'buscando' | 'error'>(
    coordInicial ? 'idle' : 'buscando',
  )
  const [geoEstado, setGeoEstado] = useState<'idle' | 'buscando'>('idle')
  const [coordsTexto, setCoordsTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const esDerrumbe = tipo === 'derrumbe'
  const esZona = tipo === 'zona_sin_atender'
  const esAtencionPsicologica = tipo === 'atencion_psicologica'
  const esHospital = tipo === 'hospital'
  const requiereUbicacion = !esAtencionPsicologica
  const tiposDisponibles: TipoReporte[] = puedeReportarHospital
    ? [...TIPOS, 'hospital']
    : TIPOS
  const metaTipo = tipo === 'hospital' ? HOSPITAL_META : TIPO_META[tipo]

  async function actualizarUbicacion() {
    setGpsEstado('buscando')
    try {
      const u = await obtenerUbicacion()
      setCoord({ lat: u.lat, lng: u.lng })
      setCoordAuto({ lat: u.lat, lng: u.lng })
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

  useEffect(() => {
    if (!esHospital) return
    const q = nombreHospital.trim()
    if (hospitalConfirmado?.nombre === q) return
    setHospitalConfirmado(null)
    if (q.length < 3) {
      setSugerenciasHospital([])
      setBuscandoHospital(false)
      return
    }
    let cancelado = false
    setBuscandoHospital(true)
    const t = window.setTimeout(async () => {
      try {
        const resultados = await buscarHospitalesGoogle(q)
        if (!cancelado) {
          setSugerenciasHospital(resultados)
          setErrorMsg('')
        }
      } catch (e) {
        if (!cancelado) {
          setSugerenciasHospital([])
          setErrorMsg(
            e instanceof GoogleMapsConfigError
              ? e.message
              : 'No pudimos consultar Google Maps. Intenta de nuevo.',
          )
        }
      } finally {
        if (!cancelado) {
          setBuscandoHospital(false)
        }
      }
    }, 450)
    return () => {
      cancelado = true
      window.clearTimeout(t)
    }
  }, [esHospital, nombreHospital, hospitalConfirmado?.nombre])

  function elegirTipo(t: TipoReporte) {
    setTipo(t)
    if (t === 'derrumbe' || t === 'rescate' || t === 'zona_sin_atender')
      setUrgencia('alta')
    if (t === 'atencion_psicologica') setUrgencia('media')
    // Derrumbe / zona: el pin NO empieza en la ubicación de quien reporta.
    setCoord(
      t === 'derrumbe' ||
        t === 'zona_sin_atender' ||
        t === 'hospital' ||
        t === 'atencion_psicologica'
        ? null
        : coordAuto,
    )
    setErrorMsg('')
    setPaso(2)
  }

  // Geocodifica la dirección escrita (Google → OSM) y centra el pin ahí; luego
  // se puede arrastrar al punto exacto. Si no la encuentra, avisa sin bloquear.
  async function buscarDireccion() {
    const dir = zona.trim()
    if (!dir) {
      setErrorMsg('Escribe primero la dirección para buscarla en el mapa.')
      return
    }
    setErrorMsg('')
    setGeoEstado('buscando')
    const g = await geocodificarDireccion(dir)
    setGeoEstado('idle')
    if (g) {
      setCoord(g)
      setFuente(null)
    } else {
      setErrorMsg(
        'No encontramos esa dirección. Arrastra el pin al lugar exacto, usa tu ubicación o pega las coordenadas.',
      )
    }
  }

  function aplicarCoordsTexto() {
    const c = parsearCoordenadas(coordsTexto)
    if (c) {
      setCoord(c)
      setFuente(null)
      setErrorMsg('')
    } else {
      setErrorMsg('Coordenadas no válidas. Ejemplo: 10.5061, -66.9146')
    }
  }

  async function enviar() {
    setGuardando(true)
    setErrorMsg('')
    try {
      // El teléfono es OBLIGATORIO: sin él, nadie puede contactar a la persona.
      if (!esHospital && !esTelefonoVenezuelaValido(contacto)) {
        throw new Error(mensajeTelefonoVenezuela())
      }
      if (esHospital && !nombreHospital.trim()) {
        throw new Error('Escribe el nombre del hospital.')
      }
      if (esHospital && !hospitalConfirmado) {
        throw new Error('Selecciona un hospital confirmado por Google Maps.')
      }
      if (esHospital && !zona.trim()) {
        throw new Error('Escribe la direccion o referencia del hospital.')
      }

      if (esAtencionPsicologica && !nombrePaciente.trim()) {
        throw new Error(
          'Escribe tu nombre o el nombre de la persona que necesita apoyo.',
        )
      }
      if (esAtencionPsicologica && !cedulaPaciente.trim()) {
        throw new Error('Escribe la cedula de identidad para identificar el caso.')
      }
      if (
        esAtencionPsicologica &&
        cedulaPaciente.replace(/\D/g, '').length < 6
      ) {
        throw new Error(
          'La cedula no parece valida. Escribe solo los numeros, por ejemplo 12345678.',
        )
      }
      if (esAtencionPsicologica && !descripcion.trim()) {
        throw new Error(
          'Cuentanos brevemente que apoyo necesitas. Puedes escribirlo con tus palabras.',
        )
      }

      let lat = esAtencionPsicologica ? null : coord?.lat ?? null
      let lng = esAtencionPsicologica ? null : coord?.lng ?? null

      // Si aún no hay punto pero sí dirección, intentamos geocodificar.
      if (!esAtencionPsicologica && (lat === null || lng === null) && zona.trim()) {
        const g = await geocodificarDireccion(zona.trim())
        if (g) {
          lat = g.lat
          lng = g.lng
        }
      }
      if (!esAtencionPsicologica && (lat === null || lng === null)) {
        throw new Error(
          'Falta la ubicación. Busca la dirección, arrastra el pin, usa tu ubicación o pega coordenadas.',
        )
      }

      // Las necesidades SOLO pueden reportarse dentro de Venezuela.
      if (
        !esAtencionPsicologica &&
        lat !== null &&
        lng !== null &&
        !(await estaEnVenezuela(lat, lng))
      ) {
        throw new Error(
          'Las necesidades solo se pueden reportar dentro de Venezuela. El punto está fuera del país: corrige la dirección o mueve el pin.',
        )
      }

      if (esHospital) {
        const hospital = hospitalConfirmado
        if (!hospital?.lat || !hospital?.lng) {
          throw new Error('Selecciona un hospital confirmado por Google Maps.')
        }
        const { data: auth } = await supabase.auth.getUser()
        const detalle = descripcion.trim()
        const { error } = await supabase.from('centros_acopio').insert({
          nombre: hospital.nombre,
          descripcion: detalle ? `Hospital. ${detalle}` : 'Hospital',
          pais: 'Venezuela',
          direccion: hospital.direccion,
          contacto: null,
          red_social: null,
          lat: hospital.lat,
          lng: hospital.lng,
          creado_por: auth?.user?.id ?? null,
        })
        if (error) throw error
        onCreado('hospital')
        return
      }

      await crearNecesidad({
        tipo: tipo as NecesidadTipo,
        urgencia,
        descripcion: esAtencionPsicologica
          ? [
              `Nombre: ${nombrePaciente.trim()}`,
              `CI: ${cedulaPaciente.replace(/\D/g, '')}`,
              `Solicitud: ${descripcion.trim()}`,
            ].join('\n')
          : descripcion.trim() || metaTipo.etiqueta,
        zona: esAtencionPsicologica ? null : zona.trim() || null,
        lat,
        lng,
        radio_km: esZona ? tamZonaKm / 2 : null,
        contacto,
        contactoObligatorio: true,
        origen: 'web',
      })
      onCreado(tipo)
    } catch (e) {
      setErrorMsg((e as Error).message)
      setGuardando(false)
    }
  }

  // Bloque de ubicación con mini-mapa (común a todos los tipos).
  const bloqueUbicacionMapa = (
    <div>
      <p className="font-bold mb-1">
        Ubicación{' '}
        {esZona
          ? 'de la zona'
          : esDerrumbe
            ? 'del edificio'
            : esHospital
              ? 'del hospital'
              : 'del reporte'}{' '}
        <span className="text-bandera-rojo">*</span>
      </p>
      <p className="text-xs text-gray-500 mb-2">
        Búscala y luego <strong>arrastra el pin</strong> al punto exacto (también
        puedes tocar el mapa).
      </p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={buscarDireccion}
          disabled={geoEstado === 'buscando'}
          className="btn-azul flex-1 py-2.5 text-sm disabled:opacity-60"
        >
          {geoEstado === 'buscando' ? 'Buscando…' : '🔎 Buscar dirección'}
        </button>
        <button
          type="button"
          onClick={actualizarUbicacion}
          disabled={gpsEstado === 'buscando'}
          className="btn-amber flex-1 py-2.5 text-sm disabled:opacity-60"
        >
          {gpsEstado === 'buscando' ? 'Buscando…' : '📍 Mi ubicación'}
        </button>
      </div>

      <SelectorPunto
        coord={coord}
        onCambio={(la, ln) => setCoord({ lat: la, lng: ln })}
      />

      {coord ? (
        <p className="text-xs text-green-700 mt-1.5">
          ✅ Punto fijado: {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          {fuente === 'ip' && ' (aproximado por red)'}
        </p>
      ) : (
        <p className="text-xs text-amber-700 mt-1.5">
          Aún sin punto. Busca la dirección o toca el mapa.
        </p>
      )}

      <details className="mt-2">
        <summary className="text-xs text-bandera-azul font-semibold cursor-pointer">
          📌 Pegar coordenadas de Google Maps (opcional)
        </summary>
        <div className="flex gap-2 mt-2">
          <input
            className="input text-sm"
            placeholder="Ej: 10.5061, -66.9146"
            value={coordsTexto}
            onChange={(e) => setCoordsTexto(e.target.value)}
          />
          <button
            type="button"
            onClick={aplicarCoordsTexto}
            className="btn-gris py-2 px-3 text-sm"
          >
            Usar
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          En Google Maps: mantén pulsado el lugar → copia los números que salen.
        </p>
      </details>
    </div>
  )

  const bloqueContacto = (
    <div>
      <p className="font-bold mb-1">
        Teléfono de contacto <span className="text-bandera-rojo">*</span>
      </p>
      <p className="text-xs text-gray-600 mb-2">
        📱 <strong>Obligatorio.</strong> Es la forma de que un rescatista o
        voluntario te llame o te escriba por WhatsApp.<br />Es <strong>privado</strong>: solo lo ve quien te
        ayuda, nunca aparece en el mapa público.
      </p>
      <EntradaTelefono valor={contacto} onChange={setContacto} requerido />
    </div>
  )

  const bloqueDatosPsicologia = (
    <div className="space-y-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
      <p className="text-sm text-purple-950">
        Queremos llamarte por tu nombre y cuidar tu caso con respeto. Estos datos
        ayudan a que el equipo pueda identificarte y contactarte sin exponerte en
        el mapa público.
      </p>
      <label className="block">
        <span className="font-bold">
          ¿Cómo te llamas? <span className="text-bandera-rojo">*</span>
        </span>
        <input
          className="input mt-1"
          placeholder="Nombre y apellido"
          value={nombrePaciente}
          onChange={(e) => setNombrePaciente(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="font-bold">
          Cédula de identidad <span className="text-bandera-rojo">*</span>
        </span>
        <input
          className="input mt-1"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Ej: 12345678"
          value={cedulaPaciente}
          onChange={(e) => setCedulaPaciente(e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-xs text-gray-500 mt-1 block">
          Escribe solo números.
        </span>
      </label>
      <div>
        <p className="font-bold mb-1">
          Un teléfono donde podamos contactarte{' '}
          <span className="text-bandera-rojo">*</span>
        </p>
        <p className="text-xs text-gray-600 mb-2">
          Es privado y solo lo verá el equipo psicológico para coordinar el
          primer contacto contigo.
        </p>
        <EntradaTelefono valor={contacto} onChange={setContacto} requerido />
      </div>
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

  const selectorUrgenciaPsicologia = (
    <div>
      <p className="font-bold mb-2">¿Cómo te sientes en este momento?</p>
      <div className="grid gap-2">
        {[
          {
            v: 'alta' as NecesidadUrgencia,
            t: 'Necesito apoyo lo antes posible',
            d: 'Me siento en crisis, con mucho miedo, angustia o sin poder calmarme.',
          },
          {
            v: 'media' as NecesidadUrgencia,
            t: 'Necesito hablar con alguien pronto',
            d: 'Estoy afectado/a, triste, ansioso/a o con recuerdos difíciles.',
          },
          {
            v: 'baja' as NecesidadUrgencia,
            t: 'Quiero orientación y acompañamiento',
            d: 'Puedo esperar, pero necesito apoyo emocional.',
          },
        ].map((u) => (
          <button
            key={u.v}
            type="button"
            onClick={() => setUrgencia(u.v)}
            className={`text-left rounded-xl border-2 p-3 ${
              urgencia === u.v
                ? 'border-bandera-azul bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <span className="block font-bold text-sm">{u.t}</span>
            <span className="block text-xs text-gray-600 mt-0.5">{u.d}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const avisoError = errorMsg && (
    <div className="rounded-xl border-2 border-bandera-rojo bg-red-50 p-3 text-sm font-semibold text-bandera-rojo">
      ⚠️ {errorMsg}
    </div>
  )

  // Textos por tipo.
  const intro = esDerrumbe
    ? '🏚️ Reporta un edificio o departamento colapsado. Indica la dirección y ajusta el pin al lugar exacto.'
    : esZona
      ? null // la zona lleva su propio aviso con <strong>
      : esAtencionPsicologica
        ? '🧠 Si sobreviviste al terremoto, si perdiste a alguien, si tienes miedo, ansiedad, insomnio o solo necesitas hablar, no estás solo/a. Este espacio es para pedir apoyo psicológico con calma, respeto y privacidad.'
      : esHospital
        ? '🏥 Registra un hospital para que aparezca en el mapa y en el filtro de hospitales.'
        : `${metaTipo.emoji} Indica qué necesitas y el lugar exacto. Ajusta el pin si hace falta.`

  const etiquetaDir = esDerrumbe
    ? 'Dirección del edificio'
    : esZona
      ? 'Dirección o referencia de la zona'
      : esHospital
        ? 'Dirección del hospital'
        : 'Dirección o lugar (opcional)'

  const placeholderDir = esDerrumbe
    ? 'Calle, número, edificio, urbanización...'
    : esZona
      ? 'Sector, urbanización, pueblo, carretera...'
      : esHospital
        ? 'Calle, avenida, sector o referencia'
        : 'Calle, número, sector, referencia...'

  const etiquetaDetalle =
    esHospital
      ? 'Información adicional (opcional)'
      : esAtencionPsicologica
        ? 'Cuéntanos, con tus palabras, qué estás viviendo'
      : esDerrumbe || esZona ? 'Detalles (opcional)' : '¿Qué necesitas?'

  const placeholderDetalle = esDerrumbe
    ? 'Ej: 4 pisos, posible gente atrapada en el 2do'
    : esZona
      ? 'Ej: caseríos incomunicados tras el derrumbe de la vía'
      : esAtencionPsicologica
        ? 'Ej: No puedo dormir, siento mucha angustia, perdí a un familiar, necesito hablar con alguien...'
      : esHospital
        ? 'Ej: emergencia, triaje, disponibilidad, referencia de acceso'
        : 'Ej: Familia con 2 niños sin agua desde ayer'

  const titulo =
    paso > 1 ? metaTipo.etiqueta : 'Reportar necesidad'
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

        {/* PASO 1: tipo */}
        {paso === 1 && (
          <div>
            <p className="font-bold mb-3">¿Qué quieres reportar?</p>
            <div className="grid grid-cols-2 gap-3">
              {tiposDisponibles.map((t) => {
                const meta = t === 'hospital' ? HOSPITAL_META : TIPO_META[t]
                return (
                  <button
                    key={t}
                    onClick={() => elegirTipo(t)}
                    className={`card flex flex-col items-center py-5 border-2 ${
                      tipo === t ? 'border-bandera-azul' : 'border-transparent'
                    }`}
                  >
                    <span className="text-3xl">{meta.emoji}</span>
                    <span className="font-bold mt-1 text-center text-sm">
                      {meta.etiqueta}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* PASO 2: TODO en una sola pantalla, con mini-mapa */}
        {paso > 1 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {esZona ? (
                <>
                  🚩 Marca una <strong>zona</strong> donde aún no ha llegado
                  ayuda, para que rescatistas y voluntarios sepan dónde ir. Se
                  verá en el mapa como un círculo.
                </>
              ) : (
                intro
              )}
            </div>

            {esHospital && (
              <div>
                <p className="font-bold mb-2">
                  Nombre del hospital <span className="text-bandera-rojo">*</span>
                </p>
                <input
                  className="input"
                  placeholder="Ej: Hospital Jose Maria Vargas"
                  value={nombreHospital}
                  onChange={(e) => setNombreHospital(e.target.value)}
                />
                {buscandoHospital && (
                  <p className="text-xs text-gray-500 mt-1">
                    Buscando en Google Maps...
                  </p>
                )}
                {seleccionandoHospital && (
                  <p className="text-xs text-gray-500 mt-1">
                    Confirmando lugar en Google Maps...
                  </p>
                )}
                {!buscandoHospital &&
                  !seleccionandoHospital &&
                  nombreHospital.trim().length >= 3 &&
                  !hospitalConfirmado &&
                  sugerenciasHospital.length === 0 && (
                    <p className="text-xs text-bandera-rojo font-semibold mt-1">
                      No encontramos un hospital confirmado con ese nombre.
                    </p>
                  )}
                {!hospitalConfirmado && sugerenciasHospital.length > 0 && (
                  <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                    {sugerenciasHospital.map((h) => (
                      <button
                        key={h.placeId}
                        type="button"
                        onClick={async () => {
                          setSeleccionandoHospital(true)
                          setErrorMsg('')
                          const detalle = await detalleLugarGoogle(h.placeId)
                          setSeleccionandoHospital(false)
                          if (!detalle?.lat || !detalle?.lng) {
                            setErrorMsg(
                              'No pudimos confirmar ese lugar en Google Maps. Elige otro resultado.',
                            )
                            return
                          }
                          setHospitalConfirmado(detalle)
                          setNombreHospital(detalle.nombre)
                          setZona(detalle.direccion)
                          setCoord({ lat: detalle.lat, lng: detalle.lng })
                          setFuente(null)
                          setSugerenciasHospital([])
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0"
                      >
                        <span className="block text-sm font-bold text-bandera-azul">
                          {h.nombre}
                        </span>
                        <span className="block text-xs text-gray-600">
                          {h.direccion}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {hospitalConfirmado && (
                  <p className="text-xs text-green-700 font-semibold mt-1">
                    Hospital confirmado por Google Maps.
                  </p>
                )}
              </div>
            )}

            {esAtencionPsicologica && bloqueDatosPsicologia}

            {requiereUbicacion && (
              <div>
                <p className="font-bold mb-2">{etiquetaDir}</p>
                <input
                  className={`input ${esHospital ? 'bg-gray-50 text-gray-700' : ''}`}
                  placeholder={placeholderDir}
                  value={zona}
                  readOnly={esHospital}
                  onChange={(e) => setZona(e.target.value)}
                />
                {esHospital && (
                  <p className="text-xs text-gray-500 mt-1">
                    Se completa al seleccionar un hospital confirmado por Google Maps.
                  </p>
                )}
              </div>
            )}

            {esZona && (
              <div>
                <p className="font-bold mb-2">Tamaño de la zona (diámetro)</p>
                <div className="grid grid-cols-3 gap-2">
                  {TAMANOS_ZONA.map((km) => (
                    <button
                      key={km}
                      onClick={() => setTamZonaKm(km)}
                      className={`btn-gris py-2.5 ${
                        tamZonaKm === km
                          ? 'ring-4 ring-bandera-azul/30 font-bold'
                          : 'opacity-80'
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            )}

            {requiereUbicacion && bloqueUbicacionMapa}

            <div>
              <p className="font-bold mb-2">{etiquetaDetalle}</p>
              <textarea
                className="input min-h-[70px]"
                placeholder={placeholderDetalle}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            {!esHospital &&
              (esAtencionPsicologica
                ? selectorUrgenciaPsicologia
                : selectorUrgencia)}
            {!esHospital && !esAtencionPsicologica && bloqueContacto}
            {avisoError}

            <div className="flex gap-2">
              <button onClick={() => setPaso(1)} className="btn-gris flex-1">
                ← Atrás
              </button>
              <button
                onClick={enviar}
                disabled={guardando}
                className="btn-verde flex-1 disabled:opacity-60"
              >
                {guardando ? 'Enviando…' : esHospital ? 'Guardar hospital' : 'Enviar reporte'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
