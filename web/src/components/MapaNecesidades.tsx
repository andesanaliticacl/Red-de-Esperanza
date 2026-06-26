import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { iconoNecesidad, iconoAcopio } from '../lib/iconos'
import { CENTRO_VENEZUELA, ZOOM_INICIAL, enlaceComoLlegar } from '../lib/geo'
import {
  TIPO_META,
  URGENCIA_META,
  type Necesidad,
  type CentroAcopio,
} from '../lib/types'

export default function MapaNecesidades({
  necesidades,
  acopios = [],
}: {
  necesidades: Necesidad[]
  acopios?: CentroAcopio[]
}) {
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

      {/* Fase 5: agrupamos los marcadores en clusters para que el mapa siga
          fluido aunque haya miles de reportes. */}
      <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
        {necesidades
        .filter((n) => n.lat != null && n.lng != null)
        .map((n) => (
          <Marker
            key={n.id}
            position={[n.lat as number, n.lng as number]}
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
                <a
                  href={enlaceComoLlegar(n.lat as number, n.lng as number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1 bg-bandera-azul text-white font-semibold px-3 py-1.5 rounded-lg no-underline"
                >
                  🧭 Cómo llegar
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      {acopios.map((a) => (
        <Marker key={a.id} position={[a.lat, a.lng]} icon={iconoAcopio}>
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
              className="inline-block mt-1 bg-bandera-azul text-white font-semibold px-3 py-1.5 rounded-lg no-underline"
            >
              🧭 Cómo llegar
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
