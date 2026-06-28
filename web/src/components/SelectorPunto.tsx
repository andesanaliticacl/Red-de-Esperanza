import { useEffect } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { CENTRO_VENEZUELA } from '../lib/geo'

/** Pin rojo (gota) para marcar el punto exacto, arrastrable. */
const pinRojo = L.divIcon({
  className: '',
  html: `
    <div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:#CC0001;border:3px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:15px;line-height:1;">📍</span>
    </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
})

/** Recentra el mapa cuando el punto cambia desde fuera (geocodificar/GPS). */
function Recentrar({ coord }: { coord: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (coord) map.setView([coord.lat, coord.lng], Math.max(map.getZoom(), 16))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coord?.lat, coord?.lng])
  return null
}

/** Tocar el mapa coloca el punto ahí. */
function ClicParaUbicar({
  onCambio,
}: {
  onCambio: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onCambio(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/**
 * Mini-mapa para fijar el punto EXACTO: el usuario arrastra el pin (o toca el
 * mapa) hasta la casa/edificio. Así se logra precisión real sin depender de que
 * la base de direcciones tenga el número exacto.
 */
export default function SelectorPunto({
  coord,
  onCambio,
  altura = 200,
}: {
  coord: { lat: number; lng: number } | null
  onCambio: (lat: number, lng: number) => void
  altura?: number
}) {
  return (
    <div
      className="rounded-xl overflow-hidden border-2 border-gray-200"
      style={{ height: altura }}
    >
      <MapContainer
        center={coord ? [coord.lat, coord.lng] : CENTRO_VENEZUELA}
        zoom={coord ? 16 : 6}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recentrar coord={coord} />
        <ClicParaUbicar onCambio={onCambio} />
        {coord && (
          <Marker
            position={[coord.lat, coord.lng]}
            icon={pinRojo}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng()
                onCambio(p.lat, p.lng)
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
