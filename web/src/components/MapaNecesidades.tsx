import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useDesaparecidosMapa, type ZonaMapa } from '../hooks/useDesaparecidos'
import {
  iconoDesaparecido,
  iconoNecesidad,
  iconoAcopio,
  iconoHospital,
  iconoUsuario,
} from '../lib/iconos'
import IconoRuta from './IconoRuta'

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

/** Ajusta el mapa a los resultados de la búsqueda de desaparecidos. */
function AjustarABusqueda({ puntos }: { puntos: [number, number][] }) {
  const map = useMap()
  const clave = puntos.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (puntos.length === 0) return
    if (puntos.length === 1) {
      map.flyTo(puntos[0], 13, { duration: 0.6 })
      return
    }
    map.fitBounds(L.latLngBounds(puntos), { padding: [60, 60], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return null
}
import { CENTRO_VENEZUELA, ZOOM_INICIAL, enlaceComoLlegar } from '../lib/geo'
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
  const RADIO = 0.00012 // ≈ 13 m: suficiente para distinguirlos sin "mentir"
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
    // Varios en el mismo punto → los repartimos en círculo.
    const n = grupo.length
    grupo.forEach((it, i) => {
      const angulo = (2 * Math.PI * i) / n
      // Corregimos la longitud por la latitud para que el círculo se vea redondo.
      const cosLat = Math.cos((it.lat * Math.PI) / 180) || 1
      const lat = it.lat + RADIO * Math.cos(angulo)
      const lng = it.lng + (RADIO * Math.sin(angulo)) / cosLat
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
  resaltadaId,
  ajustarVista = false,
  verDesaparecidos = false,
  busquedaDesap = '',
}: {
  necesidades: Necesidad[]
  acopios?: CentroAcopio[]
  miUbicacion?: { lat: number; lng: number } | null
  miFoto?: string | null
  /** Si la capa de desaparecidos está visible (controlada desde la vista). */
  verDesaparecidos?: boolean
  /** Texto de búsqueda por nombre de desaparecido. */
  busquedaDesap?: string
  /** Si se pasa, el popup muestra un botón para escribirle a esa necesidad. */
  onMensaje?: (n: Necesidad) => void
  /**
   * Si se pasa, el popup de una necesidad aún sin atender muestra un botón
   * "Asignarme" para que el rescatista/voluntario la tome desde el mapa
   * (esto avisa a quien la creó que alguien ya va en camino).
   */
  onAsignarme?: (n: Necesidad) => void
  /** Id de una necesidad a resaltar (icono grande con halo) y centrar. */
  resaltadaId?: string
  /** Ajusta el mapa para mostrar todas las necesidades (donde estén). */
  ajustarVista?: boolean
}) {
  const puntos: [number, number][] = necesidades
    .filter((n) => n.lat != null && n.lng != null)
    .map((n) => [n.lat as number, n.lng as number])

  // Repartimos en círculo los marcadores que caen casi en el mismo sitio,
  // así nunca queda uno escondido debajo de otro. Mezclamos necesidades y
  // acopios para que también se separen entre sí.
  const posiciones = separarSolapados([
    ...necesidades
      .filter((n) => n.lat != null && n.lng != null)
      .map((n) => ({ id: n.id, lat: n.lat as number, lng: n.lng as number })),
    ...acopios.map((a) => ({ id: `acopio:${a.id}`, lat: a.lat, lng: a.lng })),
  ])

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
  const q = busquedaDesap.trim().toLowerCase()
  // Si hay búsqueda activa, ajustamos el mapa a los resultados.
  const puntosBusqueda: [number, number][] =
    verDesap && q
      ? desapVisibles
          .filter((d) => d.lat != null && d.lng != null)
          .map((d) => posDesap.get(d.id) ?? [d.lat as number, d.lng as number])
      : []

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

      {/* Zonas sin atender: círculo rojo translúcido que late (~radio_km).
          Muestra a rescatistas/voluntarios un ÁREA, no un punto. El marcador
          🚩 del centro lo dibuja el bucle de necesidades de abajo. */}
      {necesidades
        .filter((n) => n.tipo === 'zona_sin_atender' && n.lat != null && n.lng != null)
        .map((n) => (
          <Circle
            key={`zona:${n.id}`}
            center={[n.lat as number, n.lng as number]}
            radius={(n.radio_km ?? 10) * 1000}
            pathOptions={{
              className: 'zona-pulsante',
              color: '#CC0001',
              weight: 2,
              fillColor: '#CC0001',
              fillOpacity: 0.15,
            }}
          />
        ))}

      {/* Todos los marcadores se muestran siempre (sin agrupar). */}
      {necesidades
        .filter((n) => n.lat != null && n.lng != null)
        .map((n) => (
          <Marker
            key={n.id}
            position={posiciones.get(n.id) ?? [n.lat as number, n.lng as number]}
            icon={iconoNecesidad(n.tipo, n.estado, n.id === resaltadaId)}
            zIndexOffset={n.id === resaltadaId ? 2000 : 0}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-bold">
                  {TIPO_META[n.tipo].emoji} {TIPO_META[n.tipo].etiqueta}
                </div>
                <div className="text-sm">{n.descripcion}</div>
                {n.zona && <div className="text-xs text-gray-600">📍 {n.zona}</div>}
                {n.tipo === 'zona_sin_atender' && (
                  <div className="text-xs text-bandera-rojo font-semibold">
                    ⭕ Zona de ~{n.radio_km ?? 10} km a la redonda
                  </div>
                )}
                <div className="text-xs">
                  Urgencia: {URGENCIA_META[n.urgencia].etiqueta}
                </div>
                {(n.estado === 'en_proceso' || n.estado === 'resuelta') && (
                  <div className="text-xs font-semibold">
                    {n.estado === 'en_proceso' ? '🔵 En proceso' : '✅ Resuelta'}
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
            </Popup>
          </Marker>
        ))}

      {acopios.map((a) => {
        const esHospital = (a.descripcion ?? '').toLowerCase().includes('hospital')
        return (
        <Marker
          key={a.id}
          position={posiciones.get(`acopio:${a.id}`) ?? [a.lat, a.lng]}
          icon={esHospital ? iconoHospital : iconoAcopio}
        >
          <Popup>
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
            <a
              href={enlaceComoLlegar(a.lat, a.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center mt-1 bg-bandera-azul !text-white font-semibold px-3 py-1.5 rounded-lg no-underline"
            >
              <IconoRuta className="mr-1" /> Cómo llegar
            </a>
            {/* La fuente solo se muestra en los importados por scraping
                (tienen id_fuente); los creados en la app no la llevan. */}
            {a.id_fuente && (
              <div className="text-[10px] text-gray-400 mt-1">
                Fuente: Desaparecidos Terremoto Venezuela
              </div>
            )}
          </Popup>
        </Marker>
        )
      })}

      {/* Desaparecidos: solo si la capa está activada. Se cargan por zona
          visible y se agrupan en clusters (burbujas con número). */}
      <RastreadorZona activo={verDesap} onZona={setZona} />
      {verDesap && <AjustarABusqueda puntos={puntosBusqueda} />}
      {verDesap && (
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
          >
            <Popup>
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
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
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
