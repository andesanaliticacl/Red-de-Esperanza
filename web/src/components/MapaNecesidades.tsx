import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { supabase } from '../lib/supabase'
import {
  MapContainer,
  TileLayer,
  Marker,
  Pane,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
// El agrupador (clustering) solo lo usan los desaparecidos, que están OCULTOS al
// entrar. Lo cargamos bajo demanda para aligerar el paquete inicial (clave en
// el teléfono): no se descarga hasta que se activa la capa de desaparecidos.
const MarkerClusterGroup = lazy(() => import('react-leaflet-cluster'))
import { useDesaparecidosMapa, type ZonaMapa } from '../hooks/useDesaparecidos'
import {
  iconoDesaparecido,
  iconoNecesidad,
  iconoAcopio,
  iconoAcopioCompacto,
  iconoAcopioFuera,
  iconoHospital,
  iconoHospitalCompacto,
  iconoHospitalFuera,
  iconoUsuario,
} from '../lib/iconos'
import IconoRuta from './IconoRuta'

/** Fecha legible en español (p. ej. "27 jun 2026, 3:14 p. m."). */
function formatearFecha(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('es-VE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Ajusta el zoom/centro para que se vean todos los puntos dados. */
function AjustarVista({ puntos }: { puntos: [number, number][] }) {
  const map = useMap()
  const clave = puntos.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (puntos.length === 0) return
    if (puntos.length === 1) {
      map.setView(puntos[0], 14)
      return
    }
    map.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return null
}

/** Centra (con animación) el mapa en una posición cuando esta cambia. */
function CentrarEn({ posicion }: { posicion: [number, number] | null }) {
  const map = useMap()
  const clave = posicion ? posicion.join(',') : ''
  useEffect(() => {
    if (posicion) map.flyTo(posicion, 17, { duration: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return null
}

/** Informa la zona visible del mapa (para cargar solo los desaparecidos de
 *  esa zona). Emite al activarse y cada vez que el usuario mueve el mapa. */
function RastreadorZona({
  activo,
  onZona,
}: {
  activo: boolean
  onZona: (z: ZonaMapa) => void
}) {
  const map = useMap()
  function emitir() {
    const b = map.getBounds()
    onZona({
      norte: b.getNorth(),
      sur: b.getSouth(),
      este: b.getEast(),
      oeste: b.getWest(),
    })
  }
  useMapEvents({ moveend: () => activo && emitir() })
  useEffect(() => {
    if (activo) emitir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo])
  return null
}

/**
 * Reporta los límites visibles del mapa (con margen) para dibujar SOLO los
 * marcadores que caen dentro. Leaflet no recorta los marcadores fuera de
 * pantalla: si hay cientos, los pinta todos en el DOM y el teléfono se traba.
 * Recortando a la vista, en zoom de ciudad se dibujan decenas en vez de miles.
 */
function RastreadorVista({
  onBounds,
  esMovil = false,
}: {
  onBounds: (b: L.LatLngBounds) => void
  esMovil?: boolean
}) {
  const map = useMap()
  // En móvil usamos menos margen (menos marcadores fuera de pantalla = más
  // ligero). En escritorio, más margen para que al mover no parpadeen.
  const margen = esMovil ? 0.12 : 0.6
  useMapEvents({
    moveend: () => onBounds(map.getBounds().pad(margen)),
    zoomend: () => onBounds(map.getBounds().pad(margen)),
  })
  useEffect(() => {
    onBounds(map.getBounds().pad(margen))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

import {
  CENTRO_VENEZUELA,
  ZOOM_INICIAL,
  enlaceComoLlegar,
  dentroDelRecuadroVE,
} from '../lib/geo'
import {
  TIPO_META,
  URGENCIA_META,
  type Necesidad,
  type CentroAcopio,
} from '../lib/types'

/**
 * Separa los marcadores que caen casi en el mismo punto GPS para que no
 * queden uno encima de otro (p. ej. un SOS y "Medicinas" reportados desde
 * el mismo lugar). Los que comparten posición se reparten en un pequeño
 * círculo a su alrededor; los que están solos no se mueven.
 *
 * Devuelve un mapa id → posición visual desplazada.
 */
function separarSolapados(
  items: { id: string; lat: number; lng: number }[],
): Map<string, [number, number]> {
  // Radio base de separación (~31 m). Si hay muchos en el mismo punto, el
  // círculo crece para que NO se peguen y se pueda tocar cada uno.
  const RADIO = 0.00028
  const grupos = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const it of items) {
    // Redondeamos a ~5 decimales (≈ 1 m) para agrupar los que coinciden.
    const clave = `${it.lat.toFixed(5)},${it.lng.toFixed(5)}`
    const g = grupos.get(clave)
    if (g) g.push(it)
    else grupos.set(clave, [it])
  }

  const posiciones = new Map<string, [number, number]>()
  for (const grupo of grupos.values()) {
    if (grupo.length === 1) {
      const it = grupo[0]
      posiciones.set(it.id, [it.lat, it.lng])
      continue
    }
    // Varios en el mismo punto → los repartimos en círculo. El radio crece con
    // la cantidad para que, aunque sean muchos, quede aire entre cada pin.
    const n = grupo.length
    const radio = RADIO * Math.max(1, Math.sqrt(n) / 1.3)
    grupo.forEach((it, i) => {
      const angulo = (2 * Math.PI * i) / n
      // Corregimos la longitud por la latitud para que el círculo se vea redondo.
      const cosLat = Math.cos((it.lat * Math.PI) / 180) || 1
      const lat = it.lat + radio * Math.cos(angulo)
      const lng = it.lng + (radio * Math.sin(angulo)) / cosLat
      posiciones.set(it.id, [lat, lng])
    })
  }
  return posiciones
}

/**
 * Esparce los desaparecidos que caen en el MISMO punto (la geocodificación es a
 * nivel de ciudad, así que cientos pueden compartir coordenada). Los reparte en
 * un disco alrededor del punto, con radio que crece según cuántos sean. Así, al
 * hacer zoom se separan en lupitas individuales clicables, y ningún pixel
 * acumula cientos (lo que crasheaba al "explotar" el grupo).
 *
 * Devuelve id → posición visual. Es determinista (no salta entre recargas).
 */
function esparcirEnDisco(
  items: { id: string; lat: number; lng: number }[],
): Map<string, [number, number]> {
  const grupos = new Map<string, { id: string; lat: number; lng: number }[]>()
  for (const it of items) {
    const clave = `${it.lat.toFixed(4)},${it.lng.toFixed(4)}`
    const g = grupos.get(clave)
    if (g) g.push(it)
    else grupos.set(clave, [it])
  }

  const ANG = 2.399963229728653 // ángulo áureo → relleno uniforme del disco
  const posiciones = new Map<string, [number, number]>()
  for (const grupo of grupos.values()) {
    const n = grupo.length
    if (n === 1) {
      const it = grupo[0]
      posiciones.set(it.id, [it.lat, it.lng])
      continue
    }
    // Radio máximo del disco (grados): grupos grandes se esparcen más, con tope.
    const maxR = Math.min(0.03, 0.0009 * Math.sqrt(n)) // ~0.2 km (pocos) … ~3 km (cientos)
    const cosLat = Math.cos((grupo[0].lat * Math.PI) / 180) || 1
    grupo.forEach((it, i) => {
      const r = maxR * Math.sqrt((i + 0.5) / n)
      const a = i * ANG
      const lat = it.lat + r * Math.cos(a)
      const lng = it.lng + (r * Math.sin(a)) / cosLat
      posiciones.set(it.id, [lat, lng])
    })
  }
  return posiciones
}

/**
 * Controles flotantes del mapa (abajo a la derecha, apilados):
 *  · "Ver Venezuela": centra el mapa en el país para que quien esté fuera
 *    pueda ver de un vistazo todas las emergencias reportadas allá.
 *  · "Mi ubicación": centra el mapa donde está el usuario (solo si la tenemos).
 * Ambos son responsivos: el texto se acorta en pantallas pequeñas.
 */
function ControlesMapa({
  miUbicacion,
}: {
  miUbicacion?: { lat: number; lng: number } | null
}) {
  const map = useMap()
  return (
    <div className="absolute right-3 bottom-44 sm:bottom-6 z-[1100] flex flex-col items-end gap-2">
      <button
        onClick={() => map.setView(CENTRO_VENEZUELA, 6)}
        className="bg-white text-bandera-azul rounded-full shadow-lg border pl-2 pr-3 h-10 flex items-center gap-1.5 hover:bg-gray-50 font-semibold text-xs sm:text-sm"
        title="Ver las emergencias reportadas en Venezuela"
        aria-label="Ver Venezuela"
      >
        <span className="text-base leading-none">🇻🇪</span>
        <span className="whitespace-nowrap">
          Ver <span className="hidden sm:inline">emergencias en </span>Venezuela
        </span>
      </button>

      {miUbicacion && (
        <button
          onClick={() => map.setView([miUbicacion.lat, miUbicacion.lng], 16)}
          className="bg-white text-bandera-azul rounded-full shadow-lg border pl-2 pr-3 h-10 flex items-center gap-1.5 hover:bg-gray-50 font-semibold text-xs sm:text-sm"
          title="Centrar en mi ubicación actual"
          aria-label="Mi ubicación actual"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1.5" x2="12" y2="4.5" />
            <line x1="12" y1="19.5" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4.5" y2="12" />
            <line x1="19.5" y1="12" x2="22.5" y2="12" />
          </svg>
          <span className="whitespace-nowrap">Mi ubicación</span>
        </button>
      )}
    </div>
  )
}

export default function MapaNecesidades({
  necesidades,
  acopios = [],
  miUbicacion,
  miFoto,
  onMensaje,
  onAsignarme,
  puedeVerContacto = false,
  resaltadaId,
  ajustarVista = false,
  verDesaparecidos = false,
  busquedaDesap = '',
  irACoordenada = null,
  onHospitalSeleccionado,
}: {
  necesidades: Necesidad[]
  acopios?: CentroAcopio[]
  miUbicacion?: { lat: number; lng: number } | null
  miFoto?: string | null
  /** Si la capa de desaparecidos está visible (controlada desde la vista). */
  verDesaparecidos?: boolean
  /** Texto de búsqueda por nombre de desaparecido. */
  busquedaDesap?: string
  /** Si se pasa, el mapa vuela a esta coordenada (al tocar a una persona del
   *  listado de búsqueda de desaparecidos). */
  irACoordenada?: [number, number] | null
  /** Permite abrir un panel con personas asociadas a un hospital. */
  onHospitalSeleccionado?: (hospital: CentroAcopio) => void
  /** Si se pasa, el popup muestra un botón para escribirle a esa necesidad. */
  onMensaje?: (n: Necesidad) => void
  /**
   * Si se pasa, el popup de una necesidad aún sin atender muestra un botón
   * "Asignarme" para que el rescatista/voluntario la tome desde el mapa
   * (esto avisa a quien la creó que alguien ya va en camino).
   */
  onAsignarme?: (n: Necesidad) => void
  /**
   * Si es true (personal que atiende: voluntario/rescatista/admin), el popup de
   * cada necesidad muestra el TELÉFONO de quien la reportó, para poder llamarlo
   * o escribirle por WhatsApp. El contacto vive en la tabla privada
   * `contactos_necesidad` (la RLS solo deja leerlo al personal interno).
   */
  puedeVerContacto?: boolean
  /** Id de una necesidad a resaltar (icono grande con halo) y centrar. */
  resaltadaId?: string
  /** Ajusta el mapa para mostrar todas las necesidades (donde estén). */
  ajustarVista?: boolean
}) {
  const puntos: [number, number][] = useMemo(
    () =>
      necesidades
        .filter((n) => n.lat != null && n.lng != null)
        .map((n) => [n.lat as number, n.lng as number] as [number, number]),
    [necesidades],
  )

  // Repartimos en círculo los marcadores que caen casi en el mismo sitio,
  // así nunca queda uno escondido debajo de otro. Mezclamos necesidades y
  // acopios para que también se separen entre sí. Memoizado: solo se recalcula
  // cuando cambian las necesidades o los acopios (no en cada render).
  const posiciones = useMemo(
    () =>
      separarSolapados([
        ...necesidades
          .filter((n) => n.lat != null && n.lng != null)
          .map((n) => ({ id: n.id, lat: n.lat as number, lng: n.lng as number })),
        ...acopios.map((a) => ({ id: `acopio:${a.id}`, lat: a.lat, lng: a.lng })),
      ]),
    [necesidades, acopios],
  )

  // Popup "perezoso": solo se monta el contenido del marcador que está ABIERTO.
  // Antes se montaban a la vez los popups de TODOS los marcadores (cientos de
  // subárboles de React con botones/imágenes), lo que ralentizaba la entrada.
  const [abierto, setAbierto] = useState<string | null>(null)

  // Teléfono de quien reportó cada necesidad (solo para el personal que atiende).
  // Se carga al abrir el popup. undefined = aún no consultado; null = no dejó
  // teléfono; string = el contacto. Así el rescatista puede llamar/escribir.
  const [contactos, setContactos] = useState<Record<string, string | null>>({})
  async function cargarContacto(id: string) {
    if (!puedeVerContacto || id in contactos) return
    const { data } = await supabase
      .from('contactos_necesidad')
      .select('contacto')
      .eq('necesidad_id', id)
      .maybeSingle()
    setContactos((c) => ({ ...c, [id]: data?.contacto ?? null }))
  }

  // ¿Estamos en un teléfono? En móvil: íconos un poco más pequeños y, sobre
  // todo, AGRUPAMOS necesidades y acopios en burbujas con número (clustering)
  // para no dibujar cientos de marcadores a la vez —lo que trababa el teléfono.
  // En escritorio NO se agrupa: se ve exactamente igual que ahora.
  const esMovil = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 768px)').matches,
    [],
  )

  // Recorte por vista: solo dibujamos los marcadores dentro de lo que se ve
  // (con margen). Clave para el teléfono, que se trababa al pintar cientos a la
  // vez. Mientras no sepamos la vista (primer frame), no dibujamos ninguno: el
  // RastreadorVista la fija al instante y aparecen los visibles.
  const [vista, setVista] = useState<L.LatLngBounds | null>(null)
  const necesidadesEnVista = useMemo(
    () =>
      vista
        ? necesidades.filter(
            (n) =>
              n.lat != null &&
              n.lng != null &&
              vista.contains([n.lat as number, n.lng as number]),
          )
        : [],
    [necesidades, vista],
  )
  const acopiosEnVista = useMemo(
    () => (vista ? acopios.filter((a) => vista.contains([a.lat, a.lng])) : []),
    [acopios, vista],
  )

  // --- Capa de desaparecidos: se cargan SOLO cuando está activa y SOLO los de
  // la zona visible (o por nombre si hay búsqueda). Sin realtime. Escala a
  // miles de visitantes sin descargar las 66k a cada uno.
  const verDesap = verDesaparecidos
  const [zona, setZona] = useState<ZonaMapa | null>(null)
  const { desaparecidos: desapVisibles } = useDesaparecidosMapa(
    verDesap,
    zona,
    busquedaDesap,
  )
  // Esparcir los que comparten coordenada (ciudad) para que se puedan ver y
  // abrir uno por uno al acercar, sin apilar cientos en un pixel.
  const posDesap = useMemo(
    () =>
      esparcirEnDisco(
        desapVisibles
          .filter((d) => d.lat != null && d.lng != null)
          .map((d) => ({ id: d.id, lat: d.lat as number, lng: d.lng as number })),
      ),
    [desapVisibles],
  )

  return (
    <MapContainer
      center={CENTRO_VENEZUELA}
      zoom={ZOOM_INICIAL}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {ajustarVista && <AjustarVista puntos={puntos} />}

      {/* Si llegamos desde un aviso, centramos en esa necesidad. */}
      {resaltadaId && (
        <CentrarEn
          posicion={
            posiciones.get(resaltadaId) ??
            (() => {
              const n = necesidades.find((x) => x.id === resaltadaId)
              return n && n.lat != null && n.lng != null
                ? ([n.lat, n.lng] as [number, number])
                : null
            })()
          }
        />
      )}

      {/* Zonas sin atender: SOLO se muestran con su marcador 🚩 (lo dibuja el
          bucle de necesidades de abajo). Antes se pintaba además un círculo rojo
          translúcido por zona, pero al acumularse varias saturaban el mapa y lo
          tapaban por completo, así que se eliminó. */}

      {/* Orden de capas (z-index) de mayor a menor:
          · 650 NECESIDADES reportadas (lo más visible, nunca tapado).
          · 630 centros de acopio y hospitales (encima de desaparecidos, pero
                NUNCA por encima de las necesidades).
          · 600 desaparecidos (markerPane normal): conservan su tamaño, debajo. */}
      <Pane name="primerPlano" style={{ zIndex: 650 }} />
      <Pane name="acopios" style={{ zIndex: 630 }} />

      {/* Marcadores dentro de la vista (recortados para no trabar el teléfono).
          El rastreador de abajo fija la vista al cargar y al mover/zoom. */}
      <RastreadorVista onBounds={setVista} esMovil={esMovil} />
      {necesidadesEnVista
        .filter((n) => n.lat != null && n.lng != null)
        .map((n) => (
          <Marker
            key={n.id}
            position={posiciones.get(n.id) ?? [n.lat as number, n.lng as number]}
            icon={iconoNecesidad(
              n.tipo,
              n.estado,
              n.id === resaltadaId,
              !dentroDelRecuadroVE(n.lat as number, n.lng as number),
              esMovil,
            )}
            pane="primerPlano"
            zIndexOffset={n.id === resaltadaId ? 2000 : 0}
            eventHandlers={{
              popupopen: () => {
                setAbierto(n.id)
                void cargarContacto(n.id)
              },
              popupclose: () => setAbierto((p) => (p === n.id ? null : p)),
            }}
          >
            <Popup>
              {abierto === n.id && (
              <div className="space-y-1">
                <div className="font-bold">
                  {TIPO_META[n.tipo].emoji} {TIPO_META[n.tipo].etiqueta}
                </div>
                <div className="text-sm">{n.descripcion}</div>
                {n.zona && <div className="text-xs text-gray-600">📍 {n.zona}</div>}
                {n.tipo === 'zona_sin_atender' && (
                  <div className="text-xs text-bandera-rojo font-semibold">
                    ⭕ Zona de ~{(n.radio_km ?? 1.5) * 2} km de diámetro
                  </div>
                )}
                <div className="text-xs">
                  Urgencia: {URGENCIA_META[n.urgencia].etiqueta}
                </div>
                {n.creado_en && (
                  <div className="text-[11px] text-gray-400">
                    🕒 {formatearFecha(n.creado_en)}
                  </div>
                )}
                {(n.estado === 'en_proceso' || n.estado === 'resuelta') && (
                  <div className="text-xs font-semibold">
                    {n.estado === 'en_proceso' ? '🔵 En proceso' : '✅ Resuelta'}
                  </div>
                )}
                {/* Teléfono de quien reportó: solo para el personal que atiende
                    (voluntario/rescatista/admin), para poder comunicarse. */}
                {puedeVerContacto && (
                  <div className="text-xs bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5">
                    {contactos[n.id] === undefined ? (
                      <span className="text-gray-500">📞 Cargando teléfono…</span>
                    ) : contactos[n.id] ? (
                      <div>
                        <div className="font-semibold text-bandera-azul">
                          📞 Contacto de quien reportó:
                        </div>
                        <div className="font-bold text-sm break-all">
                          {contactos[n.id]}
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <a
                            href={`tel:${(contactos[n.id] as string).replace(/[^\d+]/g, '')}`}
                            className="inline-flex items-center bg-bandera-azul !text-white font-semibold px-2.5 py-1 rounded-lg no-underline"
                          >
                            📞 Llamar
                          </a>
                          <a
                            href={`https://wa.me/${(contactos[n.id] as string).replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center bg-green-600 !text-white font-semibold px-2.5 py-1 rounded-lg no-underline"
                          >
                            WhatsApp
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500">
                        📞 No dejó teléfono de contacto
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <a
                    href={enlaceComoLlegar(n.lat as number, n.lng as number)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center bg-bandera-azul !text-white font-semibold px-3 py-1.5 rounded-lg no-underline"
                  >
                    <IconoRuta className="mr-1" /> Cómo llegar
                  </a>
                  {onAsignarme &&
                    (n.estado === 'sin_verificar' ||
                      n.estado === 'verificada') && (
                      <button
                        onClick={() => onAsignarme(n)}
                        className="inline-flex items-center bg-bandera-rojo !text-white font-semibold px-3 py-1.5 rounded-lg"
                      >
                        🙋 Asignarme
                      </button>
                    )}
                  {onMensaje && (
                    <button
                      onClick={() => onMensaje(n)}
                      className="inline-flex items-center bg-green-600 !text-white font-semibold px-3 py-1.5 rounded-lg"
                    >
                      💬 Contactar
                    </button>
                  )}
                </div>
              </div>
              )}
            </Popup>
          </Marker>
        ))}

      {acopiosEnVista.map((a) => {
        const esHospital = (a.descripcion ?? '').toLowerCase().includes('hospital')
        // Fuera de Venezuela: pequeño y uniforme. Dentro: tamaño normal.
        const fuera = !dentroDelRecuadroVE(a.lat, a.lng)
        const iconoCentro = esHospital
          ? fuera
            ? iconoHospitalFuera
            : esMovil
              ? iconoHospitalCompacto
              : iconoHospital
          : fuera
            ? iconoAcopioFuera
            : esMovil
              ? iconoAcopioCompacto
              : iconoAcopio
        return (
        <Marker
          key={a.id}
          position={posiciones.get(`acopio:${a.id}`) ?? [a.lat, a.lng]}
          icon={iconoCentro}
          pane="acopios"
          eventHandlers={{
            popupopen: () => setAbierto(`acopio:${a.id}`),
            popupclose: () =>
              setAbierto((p) => (p === `acopio:${a.id}` ? null : p)),
          }}
        >
          <Popup>
            {abierto === `acopio:${a.id}` && (
            <div>
            <div className="font-bold">
              {esHospital ? '🏥' : '📦'} {a.nombre}
            </div>
            <div className="text-xs font-semibold" style={{ color: esHospital ? '#CC0001' : '#16a34a' }}>
              {esHospital ? 'Hospital' : 'Centro de acopio'}
            </div>
            <div className="text-xs text-gray-600">
              {[a.ciudad, a.pais].filter(Boolean).join(', ')}
            </div>
            {a.descripcion && <div className="text-sm">{a.descripcion}</div>}
            {/* Contacto: solo si el centro tiene un número cargado. Permite
                llamar o escribir por WhatsApp directamente. */}
            {a.contacto && a.contacto.replace(/\D/g, '').length >= 8 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <a
                  href={`tel:${a.contacto.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center bg-green-600 !text-white font-semibold px-3 py-1.5 rounded-lg no-underline text-sm"
                >
                  📞 Llamar
                </a>
                <a
                  href={`https://wa.me/${a.contacto.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center bg-emerald-500 !text-white font-semibold px-3 py-1.5 rounded-lg no-underline text-sm"
                >
                  💬 WhatsApp
                </a>
              </div>
            )}
            {a.red_social && (
              <a
                href={
                  /^https?:\/\//.test(a.red_social)
                    ? a.red_social
                    : `https://${a.red_social}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-bandera-azul mt-1 break-all"
              >
                🔗 {a.red_social}
              </a>
            )}
            <a
              href={enlaceComoLlegar(a.lat, a.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center mt-1 bg-bandera-azul !text-white font-semibold px-3 py-1.5 rounded-lg no-underline"
            >
              <IconoRuta className="mr-1" /> Cómo llegar
            </a>
            {esHospital && onHospitalSeleccionado && (
              <button
                onClick={() => onHospitalSeleccionado(a)}
                className="inline-flex items-center mt-1 ml-1 bg-bandera-rojo !text-white font-semibold px-3 py-1.5 rounded-lg"
              >
                Ver personas en este hospital
              </button>
            )}
            {/* La fuente solo se muestra en los importados por scraping
                (tienen id_fuente); los creados en la app no la llevan. */}
            {a.id_fuente && (
              <div className="text-[10px] text-gray-400 mt-1">
                Fuente: Desaparecidos Terremoto Venezuela
              </div>
            )}
            </div>
            )}
          </Popup>
        </Marker>
        )
      })}

      {/* Desaparecidos: solo si la capa está activada. Se cargan por zona
          visible y se agrupan en clusters (burbujas con número). */}
      <RastreadorZona activo={verDesap} onZona={setZona} />
      {/* Ya no volamos automáticamente a TODOS los resultados de la búsqueda:
          ahora se muestra un listado y solo volamos al tocar a una persona. */}
      <CentrarEn posicion={irACoordenada} />
      {verDesap && (
      <Suspense fallback={null}>
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={60}
        // Ya esparcimos los que comparten punto, así que ningún pixel acumula
        // cientos. Con spiderfy ACTIVO se puede abrir cada persona al acercar,
        // sin el crash de antes.
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
        zoomToBoundsOnClick={true}
      >
      {desapVisibles
        .filter((d) => d.lat != null && d.lng != null)
        .map((d) => (
          <Marker
            key={d.id}
            position={posDesap.get(d.id) ?? [d.lat as number, d.lng as number]}
            icon={iconoDesaparecido(d.estado === 'encontrado')}
            zIndexOffset={-500}
            eventHandlers={{
              popupopen: () => setAbierto(d.id),
              popupclose: () => setAbierto((p) => (p === d.id ? null : p)),
            }}
          >
            <Popup>
              {abierto === d.id && (
              <div className="space-y-1 min-w-[190px]">
                <div className="font-bold text-sm">
                  {d.estado === 'encontrado' ? '✅ Encontrado/a' : '🔍 Por localizar'}
                </div>
                {d.foto_url && (
                  <img
                    src={d.foto_url}
                    alt={d.nombre}
                    loading="lazy"
                    className="w-full max-h-44 object-cover rounded-lg border border-gray-200"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <div className="font-semibold">{d.nombre}</div>
                {d.edad && (
                  <div className="text-xs text-gray-600">
                    {d.edad} años {d.genero ? `· ${d.genero}` : ''}
                  </div>
                )}
                {d.ultima_ubicacion && (
                  <div className="text-xs text-gray-600">📍 {d.ultima_ubicacion}</div>
                )}
                {d.fecha_desaparicion && (
                  <div className="text-xs text-gray-600">
                    📅 Desapareció: {d.fecha_desaparicion}
                  </div>
                )}
                {d.contacto_familiar && (
                  <div className="text-xs font-semibold text-bandera-azul">
                    📞 {d.contacto_familiar}
                  </div>
                )}
                <a
                  href="https://desaparecidosterremotovenezuela.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs font-semibold text-white bg-bandera-azul rounded-lg py-1.5 mt-1 no-underline"
                >
                  🔗 Ver en la fuente
                </a>
                <div className="text-[10px] text-gray-400 text-center">
                  Fuente: Desaparecidos Terremoto Venezuela
                </div>
              </div>
              )}
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      </Suspense>
      )}

      {/* Mi ubicación: marcador con mi foto. */}
      {miUbicacion && (
        <Marker
          position={[miUbicacion.lat, miUbicacion.lng]}
          icon={iconoUsuario(miFoto)}
          zIndexOffset={1000}
        >
          <Popup>📍 Tú estás aquí</Popup>
        </Marker>
      )}

      {/* Controles: "Ver Venezuela" (siempre) y "Mi ubicación" (si la tenemos). */}
      <ControlesMapa miUbicacion={miUbicacion} />
    </MapContainer>
  )
}
