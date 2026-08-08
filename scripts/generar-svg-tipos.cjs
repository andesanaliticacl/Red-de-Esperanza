/**
 * Genera web/src/lib/svgTipos.ts a partir de los iconos de lucide-react.
 *
 * Los marcadores del mapa los dibuja Leaflet con HTML plano (divIcon), así que
 * ahí no se pueden usar componentes de React. En vez de duplicar trazos a mano
 * —que se desincronizarían con el resto de la app—, este script los extrae del
 * paquete y deja un archivo con el SVG ya armado.
 *
 * Volver a ejecutar si se agrega un tipo:  node scripts/generar-svg-tipos.cjs
 */
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'web', 'node_modules', 'lucide-react', 'dist', 'esm', 'icons')

// tipo de necesidad -> icono de lucide (mismo criterio que src/lib/iconosTipo.tsx)
const MAPA = {
  rescate: 'siren',
  atencion_psicologica: 'heart-handshake',
  agua_comida: 'soup',
  medicinas: 'pill',
  refugio: 'house',
  derrumbe: 'building-2',
  inundacion: 'waves',
  incendio: 'flame',
  sacos_arena: 'boxes',
  zona_sin_atender: 'flag',
  zona_aislada: 'construction',
  mascota: 'paw-print',
  otro: 'circle-help',
  acopio: 'package',
  _hospital: 'cross',
  _desaparecido: 'user-round',
}

/** Extrae el array __iconNode del archivo del icono. */
function nodosDe(nombre, saltos = 0) {
  if (saltos > 5) throw new Error('demasiados alias siguiendo ' + nombre)
  const src = fs.readFileSync(path.join(DIR, nombre + '.mjs'), 'utf8')
  // Algunos nombres son ALIAS que reexportan otro archivo
  // (p. ej. waves.mjs → waves-horizontal.mjs). Se sigue el rastro.
  const alias = src.match(/export \{ default \} from '\.\/([^']+)\.mjs'/)
  if (alias) return nodosDe(alias[1], saltos + 1)
  const m = src.match(/const __iconNode = (\[[\s\S]*?\n\];)/)
  if (!m) throw new Error('no se pudo leer __iconNode de ' + nombre)
  // El archivo es JS válido: lo evaluamos en un ámbito controlado.
  return eval(m[1].replace(/;$/, ''))
}

/** Convierte los nodos a elementos SVG en texto. */
function cuerpoSvg(nodos) {
  return nodos
    .map(([etiqueta, attrs]) => {
      const props = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${etiqueta} ${props}/>`
    })
    .join('')
}

const lineas = Object.entries(MAPA).map(([tipo, icono]) => {
  const cuerpo = cuerpoSvg(nodosDe(icono))
  return `  '${tipo}': '${cuerpo.replace(/'/g, "\'")}',`
})

const salida = `// GENERADO por scripts/generar-svg-tipos.cjs — no editar a mano.
// Trazos de los iconos (lucide) listos para meter en el HTML de un marcador
// de Leaflet, que no admite componentes de React.
export const SVG_TIPO: Record<string, string> = {
${lineas.join('\n')}
}

/**
 * SVG completo del icono de un tipo, en blanco, para pintarlo dentro del pin
 * de color. \`tam\` es el lado en píxeles.
 */
export function svgIcono(tipo: string, tam: number): string {
  const cuerpo = SVG_TIPO[tipo] ?? SVG_TIPO.otro
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + tam + '" height="' + tam +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + cuerpo + '</svg>'
  )
}
`

fs.writeFileSync(path.join(__dirname, '..', 'web', 'src', 'lib', 'svgTipos.ts'), salida)
console.log('svgTipos.ts generado con', lineas.length, 'iconos')
