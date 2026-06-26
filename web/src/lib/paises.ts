// Países (en español) con su código ISO (para imágenes de bandera) y su código
// telefónico. Venezuela primero por ser el foco de la plataforma.
//
// Nota: usamos imágenes de bandera (flagcdn) en vez de emoji, porque Windows
// no renderiza los emoji de banderas (muestra las letras del país).
export interface Pais {
  nombre: string
  iso: string // código ISO-3166 alfa-2 en minúscula (para flagcdn)
  codigo: string // código telefónico internacional
}

export const PAISES_MUNDO: Pais[] = [
  { nombre: 'Venezuela', iso: 've', codigo: '+58' },
  { nombre: 'Argentina', iso: 'ar', codigo: '+54' },
  { nombre: 'Bolivia', iso: 'bo', codigo: '+591' },
  { nombre: 'Brasil', iso: 'br', codigo: '+55' },
  { nombre: 'Canadá', iso: 'ca', codigo: '+1' },
  { nombre: 'Chile', iso: 'cl', codigo: '+56' },
  { nombre: 'Colombia', iso: 'co', codigo: '+57' },
  { nombre: 'Costa Rica', iso: 'cr', codigo: '+506' },
  { nombre: 'Cuba', iso: 'cu', codigo: '+53' },
  { nombre: 'Ecuador', iso: 'ec', codigo: '+593' },
  { nombre: 'El Salvador', iso: 'sv', codigo: '+503' },
  { nombre: 'España', iso: 'es', codigo: '+34' },
  { nombre: 'Estados Unidos', iso: 'us', codigo: '+1' },
  { nombre: 'Francia', iso: 'fr', codigo: '+33' },
  { nombre: 'Guatemala', iso: 'gt', codigo: '+502' },
  { nombre: 'Honduras', iso: 'hn', codigo: '+504' },
  { nombre: 'Italia', iso: 'it', codigo: '+39' },
  { nombre: 'México', iso: 'mx', codigo: '+52' },
  { nombre: 'Nicaragua', iso: 'ni', codigo: '+505' },
  { nombre: 'Panamá', iso: 'pa', codigo: '+507' },
  { nombre: 'Paraguay', iso: 'py', codigo: '+595' },
  { nombre: 'Perú', iso: 'pe', codigo: '+51' },
  { nombre: 'Portugal', iso: 'pt', codigo: '+351' },
  { nombre: 'Puerto Rico', iso: 'pr', codigo: '+1' },
  { nombre: 'Reino Unido', iso: 'gb', codigo: '+44' },
  { nombre: 'República Dominicana', iso: 'do', codigo: '+1' },
  { nombre: 'Uruguay', iso: 'uy', codigo: '+598' },
  { nombre: 'Alemania', iso: 'de', codigo: '+49' },
  { nombre: 'Australia', iso: 'au', codigo: '+61' },
  { nombre: 'Austria', iso: 'at', codigo: '+43' },
  { nombre: 'Bélgica', iso: 'be', codigo: '+32' },
  { nombre: 'Suiza', iso: 'ch', codigo: '+41' },
  { nombre: 'Países Bajos', iso: 'nl', codigo: '+31' },
  { nombre: 'Noruega', iso: 'no', codigo: '+47' },
  { nombre: 'Suecia', iso: 'se', codigo: '+46' },
  { nombre: 'Dinamarca', iso: 'dk', codigo: '+45' },
  { nombre: 'Irlanda', iso: 'ie', codigo: '+353' },
  { nombre: 'Japón', iso: 'jp', codigo: '+81' },
  { nombre: 'China', iso: 'cn', codigo: '+86' },
  { nombre: 'Trinidad y Tobago', iso: 'tt', codigo: '+1' },
  { nombre: 'Aruba', iso: 'aw', codigo: '+297' },
  { nombre: 'Curazao', iso: 'cw', codigo: '+599' },
  { nombre: 'Otro', iso: '', codigo: '' },
]

const POR_NOMBRE: Record<string, Pais> = Object.fromEntries(
  PAISES_MUNDO.map((p) => [p.nombre, p]),
)

/** Código ISO de un país por su nombre ('' si no se conoce). */
export function isoDe(pais: string): string {
  return POR_NOMBRE[pais]?.iso ?? ''
}
