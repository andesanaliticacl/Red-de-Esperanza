// Geocodificación con Google Maps (precisa, con números de casa/departamento).
//
// Usa el SDK JavaScript de Google Maps cargado en el navegador (NO la API REST,
// que no permite CORS). La clave va en la variable de entorno
// VITE_GOOGLE_MAPS_KEY y debe estar RESTRINGIDA por dominio en Google Cloud
// (así es seguro tenerla en el frontend). Si no hay clave, devolvemos null y el
// que llama cae a OpenStreetMap.

let promesaCarga: Promise<void> | null = null

function cargarSDK(key: string, libraries = ''): Promise<void> {
  // Ya cargado.
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
    return Promise.resolve()
  }
  if (promesaCarga) return promesaCarga
  promesaCarga = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&loading=async&language=es&region=VE${libraries ? `&libraries=${libraries}` : ''}`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar Google Maps'))
    document.head.appendChild(s)
  })
  return promesaCarga
}

async function asegurarPlaces(google: any) {
  if (google.maps.places) return true
  if (typeof google.maps.importLibrary === 'function') {
    await google.maps.importLibrary('places')
    return Boolean(google.maps.places)
  }
  return false
}

/** ¿Está configurada la clave de Google Maps? */
export function hayGoogleMaps(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY)
}

export interface ResultadoGeo {
  lat: number
  lng: number
  /** true si Google ubicó la dirección EXACTA (no el centro de la ciudad). */
  preciso: boolean
}

export interface HospitalGoogle {
  placeId: string
  nombre: string
  direccion: string
  lat?: number
  lng?: number
}

export class GoogleMapsConfigError extends Error {}

/**
 * Geocodifica una dirección con Google. Restringe el país (cc, p. ej. 've') para
 * no caer fuera. Devuelve coordenadas (con un indicador de precisión) o null si
 * no la reconoce / no hay clave configurada.
 */
export async function geocodificarGoogle(
  texto: string,
  cc?: string,
): Promise<ResultadoGeo | null> {
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
      // ROOFTOP / RANGE_INTERPOLATED = punto exacto de la dirección.
      // GEOMETRIC_CENTER / APPROXIMATE = aproximado (calle, barrio o ciudad).
      const tipo = r.geometry.location_type
      const preciso =
        !r.partial_match &&
        (tipo === 'ROOFTOP' || tipo === 'RANGE_INTERPOLATED')
      return {
        lat: r.geometry.location.lat(),
        lng: r.geometry.location.lng(),
        preciso,
      }
    }
  } catch {
    /* sin red, clave inválida o sin resultados: caemos al respaldo */
  }
  return null
}

export async function buscarHospitalesGoogle(
  texto: string,
): Promise<HospitalGoogle[]> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
  const limpio = texto.trim()
  if (limpio.length < 3) return []
  if (!key || key === 'tu_clave_de_google_maps') {
    throw new GoogleMapsConfigError('Falta configurar VITE_GOOGLE_MAPS_KEY en web/.env.')
  }
  try {
    await cargarSDK(key, 'places')
    const google = (window as unknown as { google: any }).google
    if (!(await asegurarPlaces(google))) return []

    const service = new google.maps.places.AutocompleteService()

    return await new Promise<HospitalGoogle[]>((resolve, reject) => {
      const timeout = window.setTimeout(() => resolve([]), 6000)
      service.getPlacePredictions(
        {
          input: limpio,
          componentRestrictions: { country: 've' },
          bounds: new google.maps.LatLngBounds(
            { lat: 0.5, lng: -73.6 },
            { lat: 13, lng: -59 },
          ),
        },
        (results: any[] | null, status: string) => {
          window.clearTimeout(timeout)
          if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
            reject(
              new GoogleMapsConfigError(
                'Google Maps rechazo la solicitud. Revisa que la clave tenga Places API habilitada y permita este dominio.',
              ),
            )
            return
          }
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !results
          ) {
            resolve([])
            return
          }
          resolve(
            results.slice(0, 6).map((r) => ({
              placeId: r.place_id,
              nombre:
                r.structured_formatting?.main_text ??
                r.description.split(',')[0],
              direccion:
                r.structured_formatting?.secondary_text ?? r.description,
            })),
          )
        },
      )
    })
  } catch (e) {
    if (e instanceof GoogleMapsConfigError) throw e
    return []
  }
}

export async function detalleLugarGoogle(
  placeId: string,
): Promise<HospitalGoogle | null> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
  if (!placeId) return null
  if (!key || key === 'tu_clave_de_google_maps') {
    throw new GoogleMapsConfigError('Falta configurar VITE_GOOGLE_MAPS_KEY en web/.env.')
  }
  try {
    await cargarSDK(key, 'places')
    const google = (window as unknown as { google: any }).google
    if (!(await asegurarPlaces(google))) return null

    const service = new google.maps.places.PlacesService(
      document.createElement('div'),
    )

    return await new Promise<HospitalGoogle | null>((resolve) => {
      const timeout = window.setTimeout(() => resolve(null), 6000)
      service.getDetails(
        {
          placeId,
          fields: ['place_id', 'name', 'formatted_address', 'geometry'],
        },
        (place: any | null, status: string) => {
          window.clearTimeout(timeout)
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place?.geometry?.location
          ) {
            resolve(null)
            return
          }
          resolve({
            placeId: place.place_id,
            nombre: place.name,
            direccion: place.formatted_address,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          })
        },
      )
    })
  } catch {
    return null
  }
}
