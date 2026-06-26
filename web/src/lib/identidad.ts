// Identidad ligera para participar en el chat global sin necesidad de cuenta.
// Se guarda en localStorage: un apodo y el estado (de Venezuela) elegido.

const CLAVE = 'esperanza.identidad'

export interface Identidad {
  nombre: string
  estado: string
}

export function leerIdentidad(): Identidad | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const v = JSON.parse(crudo)
    if (v && typeof v.nombre === 'string' && typeof v.estado === 'string')
      return v as Identidad
  } catch {
    /* localStorage no disponible */
  }
  return null
}

export function guardarIdentidad(id: Identidad): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(id))
  } catch {
    /* ignoramos: el chat seguirá funcionando solo en memoria */
  }
}
