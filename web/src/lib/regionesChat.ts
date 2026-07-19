import { ESTADOS_VENEZUELA } from './types'

/**
 * Países y regiones/estados que puede elegir el chat en vivo. La red arrancó
 * en Venezuela y ahora suma Chile (temporal de lluvias 2026); se puede seguir
 * agregando países aquí sin tocar el resto del componente.
 */
export interface PaisChat {
  pais: string
  /** true = las salas de ESTE país usan el nombre del estado/región TAL CUAL
   *  (sin prefijo de país), para no romper el historial de chat ya existente
   *  desde antes de que hubiera selector de país. Solo Venezuela lo necesita. */
  salaSinPrefijo?: boolean
  regiones: readonly string[]
}

// 16 regiones oficiales de Chile.
export const REGIONES_CHILE = [
  'Arica y Parinacota',
  'Tarapacá',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaíso',
  'Metropolitana de Santiago',
  "Libertador General Bernardo O'Higgins",
  'Maule',
  'Ñuble',
  'Biobío',
  'La Araucanía',
  'Los Ríos',
  'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo',
  'Magallanes y de la Antártica Chilena',
] as const

export const PAISES_CHAT: PaisChat[] = [
  { pais: 'Venezuela', salaSinPrefijo: true, regiones: ESTADOS_VENEZUELA },
  { pais: 'Chile', regiones: REGIONES_CHILE },
]

function normalizar(txt: string): string {
  return txt.trim().toLowerCase()
}

/**
 * Clave de la sala de chat para un país + estado/región. Venezuela conserva
 * su esquema original (solo el nombre del estado) para no perder el
 * historial; los países nuevos usan "pais/region".
 */
export function claveSala(pais: string, region: string): string {
  const p = PAISES_CHAT.find((x) => x.pais === pais)
  if (p?.salaSinPrefijo) return normalizar(region)
  return `${normalizar(pais)}/${normalizar(region)}`
}

/** Regiones disponibles para un país (vacío si no está en la lista). */
export function regionesDe(pais: string): readonly string[] {
  return PAISES_CHAT.find((p) => p.pais === pais)?.regiones ?? []
}
