// Geocodificación con Google Maps (precisa, con números de casa/departamento).
//
// Usa el SDK JavaScript de Google Maps cargado en el navegador (NO la API REST,
// que no permite CORS). La clave va en la variable de entorno
// VITE_GOOGLE_MAPS_KEY y debe estar RESTRINGIDA por dominio en Google Cloud
// (así es seguro tenerla en el frontend). Si no hay clave, devolvemos null y el
// que llama cae a OpenStreetMap.

let promesaCarga: Promise<void> | null = null

function cargarSDK(key: string): Promise<void> {
  // Ya cargado.
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
    return Promise.resolve()
  }
  if (promesaCarga) return promesaCarga
  promesaCarga = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&loading=async&language=es&region=VE`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar Google Maps'))
    document.head.appendChild(s)
  })
  return promesaCarga
}

/** ¿Está configurada la clave de Google Maps? */
export function hayGoogleMaps(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY)
}

/**
 * Geocodifica una dirección con Google. Restringe el país (cc, p. ej. 've') para
 * no caer fuera. Devuelve coordenadas exactas o null si no la reconoce / no hay
 * clave configurada.
 */
export async function geocodificarGoogle(
  texto: string,
  cc?: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
  if (!key) return null
  try {
    await cargarSDK(key)
    const google = (window as unknown as { google: any }).google
    const geocoder = new google.maps.Geocoder()
    const resp = await geocoder.geocode({
      address: texto,
      ...(cc ? { componentRestrictions: { country: cc } } : {}),
      region: cc,
    })
    const r = resp?.results?.[0]
    if (r?.geometry?.location) {
      return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() }
    }
  } catch {
    /* sin red, clave inválida o sin resultados: caemos al respaldo */
  }
  return null
}
