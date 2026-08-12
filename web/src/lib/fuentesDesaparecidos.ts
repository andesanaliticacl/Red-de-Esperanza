/**
 * Atribución de las fuentes externas de desaparecidos.
 *
 * Los registros importados NO son nuestros: son publicaciones de otros
 * registros ciudadanos que espejamos. Enlazar a la publicación original no
 * es un detalle de cortesía — es lo que permite que una familia llegue al
 * canal donde de verdad pueden actualizar el caso (marcarlo localizado,
 * corregirlo o pedir que lo bajen). Sin ese enlace, el espejo se vuelve un
 * callejón sin salida.
 */

export interface FuenteDesaparecidos {
  /** Nombre legible para el pie del popup. */
  etiqueta: string
  /** Portada del sitio de origen. */
  sitio: string
  /**
   * URL de la publicación concreta a partir del `id_fuente`, si se puede
   * reconstruir. Devuelve null para caer al sitio genérico.
   */
  enlaceDe?: (idFuente: string) => string | null
}

const CTB_PREFIJO = 'ctb:'

export const FUENTES_DESAPARECIDOS: Record<string, FuenteDesaparecidos> = {
  colombiatebusca: {
    etiqueta: 'Colombia te busca',
    sitio: 'https://colombiatebusca.com',
    // `id_fuente` se guarda como "ctb:<uuid>" y la ficha vive en
    // /?person=<uuid>, así que el enlace directo sale del propio id.
    enlaceDe: (idFuente) =>
      idFuente.startsWith(CTB_PREFIJO)
        ? `https://colombiatebusca.com/?person=${idFuente.slice(CTB_PREFIJO.length)}`
        : null,
  },
  desaparecidos_terremoto_vzla: {
    etiqueta: 'Desaparecidos Terremoto Venezuela',
    sitio: 'https://desaparecidosterremotovenezuela.com',
  },
}

/** Fuente de un registro, o null si lo creó alguien en esta app. */
export function fuenteDe(
  fuente: string | null | undefined,
): FuenteDesaparecidos | null {
  if (!fuente) return null
  return FUENTES_DESAPARECIDOS[fuente] ?? null
}

/** Enlace a la publicación original (o a la portada del sitio de origen). */
export function enlaceFuente(
  fuente: string | null | undefined,
  idFuente: string | null | undefined,
): string | null {
  const f = fuenteDe(fuente)
  if (!f) return null
  const directo = idFuente && f.enlaceDe ? f.enlaceDe(idFuente) : null
  return directo ?? f.sitio
}
