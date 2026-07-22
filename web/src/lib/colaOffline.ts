import type { NuevoReporte } from './reportes'

// Cola LOCAL de reportes creados sin Internet. Se guardan en el teléfono
// (localStorage) y se envían solos al recuperar la conexión. Los reportes son
// pequeños (texto + coordenadas + teléfono), sin fotos, así que caben de sobra.
const CLAVE = 'esperanza.colaReportes'

// Evento que disparamos al cambiar la cola, para que la interfaz (contador de
// pendientes) se actualice al instante sin sondear.
export const EVENTO_COLA = 'esperanza:cola-cambio'

export interface ReporteEnCola {
  // Id de la necesidad (se genera en el cliente): al sincronizar se inserta con
  // este mismo id, así reintentar no crea duplicados.
  id: string
  reporte: NuevoReporte
  creado_en: string
}

function leer(): ReporteEnCola[] {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as ReporteEnCola[]) : []
  } catch {
    return []
  }
}

function guardar(cola: ReporteEnCola[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_COLA))
  } catch {
    /* sin window */
  }
}

/** Añade un reporte a la cola local (con su id ya asignado). */
export function encolarReporte(id: string, reporte: NuevoReporte): void {
  const cola = leer()
  // Evita duplicar si por alguna razón se encola dos veces el mismo id.
  if (cola.some((x) => x.id === id)) return
  cola.push({ id, reporte, creado_en: new Date().toISOString() })
  guardar(cola)
}

export function reportesEnCola(): ReporteEnCola[] {
  return leer()
}

export function contarEnCola(): number {
  return leer().length
}

export function quitarDeCola(id: string) {
  guardar(leer().filter((x) => x.id !== id))
}
