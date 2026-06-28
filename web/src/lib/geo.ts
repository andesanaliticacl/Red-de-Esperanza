// Utilidades geográficas sin dependencias (no usamos PostGIS).

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanciaMetros(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000 // radio de la Tierra en metros
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Centro aproximado de Venezuela (Caracas) para el mapa inicial. */
export const CENTRO_VENEZUELA: [number, number] = [10.48, -66.9]
export const ZOOM_INICIAL = 11

/**
 * Enlace de navegación hacia un punto. Abre Google Maps con la ruta y el
 * tiempo estimado desde la ubicación actual del usuario (turn-by-turn).
 * Funciona en móvil (abre la app de Maps) y en escritorio (web).
 */
export function enlaceComoLlegar(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

/**
 * Convierte una dirección escrita (calle, urbanización, ciudad…) en coordenadas
 * usando Nominatim (OpenStreetMap). Devuelve null si no la encuentra. Se llama
 * solo al enviar/guardar (no en cada tecla), así que respeta el uso razonable
 * del servicio.
 *
 * Por defecto se restringe a Venezuela (para reportes locales como derrumbes o
 * zonas), pero acepta un país/código distinto: los centros de acopio pueden
 * estar en cualquier país.
 */
export async function geocodificarDireccion(
  texto: string,
  opciones: { pais?: string; cc?: string } = {},
): Promise<{ lat: number; lng: number } | null> {
  const limpio = texto.trim()
  if (!limpio) return null
  const pais = (opciones.pais ?? 'Venezuela').trim()
  const codigo = (opciones.cc ?? 've').toLowerCase()
  const q = encodeURIComponent(pais ? `${limpio}, ${pais}` : limpio)
  const restriccion = codigo ? `&countrycodes=${codigo}` : ''
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1${restriccion}&q=${q}`
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    const j = await r.json()
    if (Array.isArray(j) && j[0]?.lat && j[0]?.lon) {
      return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) }
    }
  } catch {
    /* sin conexión o bloqueado: devolvemos null y se usa otro método */
  }
  return null
}

export type FuenteUbicacion = 'gps' | 'ip'
export interface Ubicacion {
  lat: number
  lng: number
  fuente: FuenteUbicacion
  /** Precisión aproximada en metros (solo GPS). */
  precision?: number
}

/** Ubicación aproximada a partir de la IP (respaldo cuando no hay GPS). */
export async function ubicacionPorIP(): Promise<Ubicacion | null> {
  // Dos proveedores gratuitos sin clave; si el primero falla, probamos el otro.
  const fuentes = [
    async () => {
      const r = await fetch('https://ipwho.is/')
      const j = await r.json()
      if (j?.success && typeof j.latitude === 'number')
        return { lat: j.latitude, lng: j.longitude }
      return null
    },
    async () => {
      const r = await fetch('https://ipapi.co/json/')
      const j = await r.json()
      if (typeof j?.latitude === 'number')
        return { lat: j.latitude, lng: j.longitude }
      return null
    },
  ]
  for (const f of fuentes) {
    try {
      const u = await f()
      if (u) return { ...u, fuente: 'ip' }
    } catch {
      /* probamos la siguiente */
    }
  }
  return null
}

/**
 * Obtiene la ubicación del usuario: primero intenta GPS (alta precisión) y,
 * si falla o se agota el tiempo, cae automáticamente a ubicación por IP.
 * Lanza error solo si ambos métodos fallan.
 */
export function obtenerUbicacion(
  opciones: { timeoutGps?: number } = {},
): Promise<Ubicacion> {
  const timeoutGps = opciones.timeoutGps ?? 8000
  return new Promise((resolve, reject) => {
    let resuelto = false
    const caerAIp = async (motivo: string) => {
      if (resuelto) return
      const u = await ubicacionPorIP()
      if (resuelto) return
      if (u) {
        resuelto = true
        resolve(u)
      } else {
        resuelto = true
        reject(new Error(motivo))
      }
    }

    if (!('geolocation' in navigator)) {
      void caerAIp('Tu dispositivo no permite ubicación.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resuelto) return
        resuelto = true
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          fuente: 'gps',
          precision: pos.coords.accuracy,
        })
      },
      () => void caerAIp('No pudimos obtener tu ubicación.'),
      { enableHighAccuracy: true, timeout: timeoutGps, maximumAge: 30000 },
    )
  })
}
