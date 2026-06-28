// Utilidades geográficas sin dependencias (no usamos PostGIS).
import { geocodificarGoogle } from './googleGeocode'

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
async function _buscarNominatim(
  q: string,
  codigo: string,
): Promise<{ lat: number; lng: number } | null> {
  const restriccion = codigo ? `&countrycodes=${codigo}` : ''
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1${restriccion}` +
    `&q=${encodeURIComponent(q)}`
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    const j = await r.json()
    if (Array.isArray(j) && j[0]?.lat && j[0]?.lon) {
      return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) }
    }
  } catch {
    /* sin conexión o bloqueado */
  }
  return null
}

export async function geocodificarDireccion(
  texto: string,
  opciones: { pais?: string; cc?: string } = {},
): Promise<{ lat: number; lng: number } | null> {
  const limpio = texto.trim()
  if (!limpio) return null
  const pais = (opciones.pais ?? 'Venezuela').trim()
  const codigo = (opciones.cc ?? 've').toLowerCase()

  // Construimos variantes de la dirección. La gente suele meter "ruido" en el
  // medio ("strip center, local 21"), que despista al geocodificador y lo manda
  // al centro de la ciudad. Por eso probamos primero CALLE + CIUDAD + ESTADO
  // (quitando lo del medio), luego el texto completo, luego sin número, y luego
  // soltando segmentos hacia la ciudad. Así una dirección real cae bien.
  const intentos: string[] = []
  const add = (s: string) => {
    const t = s.replace(/\s*,\s*/g, ', ').replace(/^,\s*|\s*,$/g, '').trim()
    if (t && !intentos.includes(t)) intentos.push(t)
  }
  const conPais = (s: string) => (pais ? `${s}, ${pais}` : s)
  const partes = limpio.split(',').map((s) => s.trim()).filter(Boolean)

  // 1) Calle (primer segmento) + ciudad/estado (últimos 2): quita el ruido medio.
  if (partes.length >= 3) {
    add(conPais([partes[0], ...partes.slice(-2)].join(', ')))
  }
  // 2) Texto completo tal cual.
  add(conPais(limpio))
  // 3) Sin número de casa (para OSM, que a veces no lo tiene).
  const sinNumero = limpio.replace(/\b\d{1,6}\b/g, '').replace(/\s{2,}/g, ' ').trim()
  if (sinNumero && sinNumero !== limpio) add(conPais(sinNumero))
  // 4) Soltando segmentos desde el frente (de la calle hacia la ciudad).
  for (let i = 1; i < partes.length; i++) add(conPais(partes.slice(i).join(', ')))

  // Google primero (preciso): si alguna variante da un punto EXACTO, lo usamos.
  // Guardamos el primer resultado aproximado por si ninguna es exacta.
  let aprox: { lat: number; lng: number } | null = null
  for (const q of intentos) {
    const g = await geocodificarGoogle(q, codigo)
    if (g) {
      if (g.preciso) return { lat: g.lat, lng: g.lng }
      if (!aprox) aprox = { lat: g.lat, lng: g.lng }
    }
  }

  // OSM como respaldo (no tiene clave ni costo).
  for (const q of intentos) {
    const r = await _buscarNominatim(q, codigo)
    if (r) return r
  }

  // Si Google solo dio algo aproximado, mejor eso que nada (el usuario ajusta
  // el pin). Si no hubo nada, null → se muestra el aviso de "no encontrada".
  return aprox
}

/**
 * Interpreta coordenadas pegadas (p. ej. de Google Maps): "10.5061, -66.9146".
 * Acepta separador coma o espacio. Devuelve null si no son válidas o caen fuera
 * de rango. Permite ubicación EXACTA sin depender de la base de direcciones.
 */
export function parsearCoordenadas(
  texto: string,
): { lat: number; lng: number } | null {
  const m = texto
    .trim()
    .match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

// Recuadro (bounding box) aproximado de Venezuela. Sirve como filtro RÁPIDO:
// un punto claramente fuera (Chile, EE. UU., etc.) se descarta sin consultar
// nada. Para los bordes (Colombia, Brasil, Guyana) se confirma el país real.
const VE_BBOX = { sur: 0.5, norte: 13.0, oeste: -73.6, este: -59.0 }

export function dentroDelRecuadroVE(lat: number, lng: number): boolean {
  return (
    lat >= VE_BBOX.sur &&
    lat <= VE_BBOX.norte &&
    lng >= VE_BBOX.oeste &&
    lng <= VE_BBOX.este
  )
}

/** Código de país (ISO alfa-2, minúscula) de unas coordenadas, vía OSM. */
async function paisDeCoordenadas(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=3` +
      `&lat=${lat}&lon=${lng}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    const j = await r.json()
    const cc = j?.address?.country_code
    return cc ? String(cc).toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * ¿El punto está dentro de Venezuela? Las NECESIDADES (no los centros de acopio)
 * solo pueden reportarse en el país. Primero el recuadro (rápido); si está
 * dentro, se confirma el país real (para descartar bordes de Colombia/Brasil/
 * Guyana). Si no se puede confirmar (sin red), se da por válido para no bloquear
 * un reporte legítimo por un fallo de conexión.
 */
export async function estaEnVenezuela(
  lat: number,
  lng: number,
): Promise<boolean> {
  if (!dentroDelRecuadroVE(lat, lng)) return false
  const cc = await paisDeCoordenadas(lat, lng)
  if (cc === null) return true // sin certeza: no bloqueamos
  return cc === 've'
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
