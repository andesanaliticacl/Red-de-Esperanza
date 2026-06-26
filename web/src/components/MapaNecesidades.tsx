import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { iconoNecesidad, iconoAcopio, iconoUsuario } from '../lib/iconos'
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

/** Botón flotante para centrar el mapa en mi ubicación. */
function BotonCentrarme({
  ubicacion,
}: {
  ubicacion: { lat: number; lng: number }
}) {
  const map = useMap()
  return (
    <button
      onClick={() => map.setView([ubicacion.lat, ubicacion.lng], 16)}
      className="absolute right-3 bottom-44 sm:bottom-6 z-[1100] bg-white text-bandera-azul rounded-full h-11 w-11 shadow-lg border flex items-center justify-center hover:bg-gray-50"
      title="Centrar en mi ubicación"
      aria-label="Centrar en mi ubicación"
    >
      <svg
        width="22"
        height="22"
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
    </button>
  )
}

export default function MapaNecesidades({
  necesidades,
  acopios = [],
  miUbicacion,
  miFoto,
  onMensaje,
  ajustarVista = false,
}: {
  necesidades: Necesidad[]
  acopios?: CentroAcopio[]
  miUbicacion?: { lat: number; lng: number } | null
  miFoto?: string | null
  /** Si se pasa, el popup muestra un botón para escribirle a esa necesidad. */
  onMensaje?: (n: Necesidad) => void
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

      {/* Todos los marcadores se muestran siempre (sin agrupar). */}
      {necesidades
        .filter((n) => n.lat != null && n.lng != null)
        .map((n) => (
          <Marker
            key={n.id}
            position={posiciones.get(n.id) ?? [n.lat as number, n.lng as number]}
            icon={iconoNecesidad(n.tipo, n.estado)}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-bold">
                  {TIPO_META[n.tipo].emoji} {TIPO_META[n.tipo].etiqueta}
                </div>
                <div className="text-sm">{n.descripcion}</div>
                {n.zona && <div className="text-xs text-gray-600">📍 {n.zona}</div>}
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

      {acopios.map((a) => (
        <Marker
          key={a.id}
          position={posiciones.get(`acopio:${a.id}`) ?? [a.lat, a.lng]}
          icon={iconoAcopio}
        >
          <Popup>
            <div className="font-bold">📦 {a.nombre}</div>
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
          </Popup>
        </Marker>
      ))}

      {/* Mi ubicación: marcador con mi foto + botón para centrarme. */}
      {miUbicacion && (
        <>
          <Marker
            position={[miUbicacion.lat, miUbicacion.lng]}
            icon={iconoUsuario(miFoto)}
            zIndexOffset={1000}
          >
            <Popup>📍 Tú estás aquí</Popup>
          </Marker>
          <BotonCentrarme ubicacion={miUbicacion} />
        </>
      )}
    </MapContainer>
  )
}
