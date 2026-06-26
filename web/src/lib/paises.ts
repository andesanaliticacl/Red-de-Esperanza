// Países (en español) con su bandera, para registrar y filtrar centros de
// acopio. Venezuela primero por ser el foco de la plataforma.
export interface Pais {
  nombre: string
  bandera: string
}

export const PAISES_MUNDO: Pais[] = [
  { nombre: 'Venezuela', bandera: '🇻🇪' },
  { nombre: 'Argentina', bandera: '🇦🇷' },
  { nombre: 'Bolivia', bandera: '🇧🇴' },
  { nombre: 'Brasil', bandera: '🇧🇷' },
  { nombre: 'Canadá', bandera: '🇨🇦' },
  { nombre: 'Chile', bandera: '🇨🇱' },
  { nombre: 'Colombia', bandera: '🇨🇴' },
  { nombre: 'Costa Rica', bandera: '🇨🇷' },
  { nombre: 'Cuba', bandera: '🇨🇺' },
  { nombre: 'Ecuador', bandera: '🇪🇨' },
  { nombre: 'El Salvador', bandera: '🇸🇻' },
  { nombre: 'España', bandera: '🇪🇸' },
  { nombre: 'Estados Unidos', bandera: '🇺🇸' },
  { nombre: 'Francia', bandera: '🇫🇷' },
  { nombre: 'Guatemala', bandera: '🇬🇹' },
  { nombre: 'Honduras', bandera: '🇭🇳' },
  { nombre: 'Italia', bandera: '🇮🇹' },
  { nombre: 'México', bandera: '🇲🇽' },
  { nombre: 'Nicaragua', bandera: '🇳🇮' },
  { nombre: 'Panamá', bandera: '🇵🇦' },
  { nombre: 'Paraguay', bandera: '🇵🇾' },
  { nombre: 'Perú', bandera: '🇵🇪' },
  { nombre: 'Portugal', bandera: '🇵🇹' },
  { nombre: 'Puerto Rico', bandera: '🇵🇷' },
  { nombre: 'Reino Unido', bandera: '🇬🇧' },
  { nombre: 'República Dominicana', bandera: '🇩🇴' },
  { nombre: 'Uruguay', bandera: '🇺🇾' },
  { nombre: 'Alemania', bandera: '🇩🇪' },
  { nombre: 'Australia', bandera: '🇦🇺' },
  { nombre: 'Austria', bandera: '🇦🇹' },
  { nombre: 'Bélgica', bandera: '🇧🇪' },
  { nombre: 'Suiza', bandera: '🇨🇭' },
  { nombre: 'Países Bajos', bandera: '🇳🇱' },
  { nombre: 'Noruega', bandera: '🇳🇴' },
  { nombre: 'Suecia', bandera: '🇸🇪' },
  { nombre: 'Dinamarca', bandera: '🇩🇰' },
  { nombre: 'Irlanda', bandera: '🇮🇪' },
  { nombre: 'Japón', bandera: '🇯🇵' },
  { nombre: 'China', bandera: '🇨🇳' },
  { nombre: 'Trinidad y Tobago', bandera: '🇹🇹' },
  { nombre: 'Aruba', bandera: '🇦🇼' },
  { nombre: 'Curazao', bandera: '🇨🇼' },
  { nombre: 'Otro', bandera: '🌎' },
]

const MAPA_BANDERAS: Record<string, string> = Object.fromEntries(
  PAISES_MUNDO.map((p) => [p.nombre, p.bandera]),
)

/** Bandera de un país por su nombre (🌎 si no se conoce). */
export function banderaDe(pais: string): string {
  return MAPA_BANDERAS[pais] ?? '🌎'
}
