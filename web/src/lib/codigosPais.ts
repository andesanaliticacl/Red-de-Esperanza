// Códigos telefónicos de país para el selector al reportar. El teléfono se
// guarda con su código (ej. "+58 4122016429") para que el botón de WhatsApp
// (wa.me) abra el chat directo. Venezuela va primero por ser el país de la
// emergencia. Lista corta con los países más probables de la diáspora.

export interface CodigoPais {
  cc: string // código sin "+", ej. "58"
  nombre: string
  bandera: string
}

export const CODIGOS_PAIS: CodigoPais[] = [
  { cc: '58', nombre: 'Venezuela', bandera: '🇻🇪' },
  { cc: '57', nombre: 'Colombia', bandera: '🇨🇴' },
  { cc: '56', nombre: 'Chile', bandera: '🇨🇱' },
  { cc: '51', nombre: 'Perú', bandera: '🇵🇪' },
  { cc: '593', nombre: 'Ecuador', bandera: '🇪🇨' },
  { cc: '507', nombre: 'Panamá', bandera: '🇵🇦' },
  { cc: '55', nombre: 'Brasil', bandera: '🇧🇷' },
  { cc: '54', nombre: 'Argentina', bandera: '🇦🇷' },
  { cc: '598', nombre: 'Uruguay', bandera: '🇺🇾' },
  { cc: '52', nombre: 'México', bandera: '🇲🇽' },
  { cc: '1', nombre: 'EE.UU. / Canadá', bandera: '🇺🇸' },
  { cc: '34', nombre: 'España', bandera: '🇪🇸' },
  { cc: '39', nombre: 'Italia', bandera: '🇮🇹' },
  { cc: '351', nombre: 'Portugal', bandera: '🇵🇹' },
]

/**
 * Arma el contacto final a partir del código de país y el número local. Quita
 * espacios, guiones y el "0" inicial (los nacionales suelen escribir 0412…, que
 * en formato internacional se omite). Devuelve "" si no hay número válido.
 */
export function armarTelefono(cc: string, numero: string): string {
  const local = numero.replace(/\D/g, '').replace(/^0+/, '')
  if (!local) return ''
  return `+${cc} ${local}`
}

/** Cantidad de dígitos del número local (sin código), para validar. */
export function digitosLocales(numero: string): number {
  return numero.replace(/\D/g, '').replace(/^0+/, '').length
}
