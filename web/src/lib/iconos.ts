import L from 'leaflet'
import { TIPO_META, type NecesidadTipo, type NecesidadEstado } from './types'

/**
 * Íconos de Leaflet como divIcon (sin imágenes externas → evita el clásico
 * problema de marcadores invisibles con Vite). El color sale del tipo.
 * (Verificación pausada: ya no se distingue 'sin verificar' con borde punteado.)
 */
// Tamaño uniforme para CUALQUIER marcador que esté FUERA de Venezuela: todos
// quedan pequeños e iguales (la emergencia es dentro del país).
export const TAM_FUERA = 40

// Caché de íconos: el divIcon de una necesidad solo depende de
// (tipo, estado, resaltada, fuera). Sin caché se reconstruía el HTML de CADA
// marcador en CADA render (cientos de veces) → mapa lento al entrar. Con caché
// se crea una sola vez por combinación y se reutiliza la misma instancia.
const _cacheNecesidad = new Map<string, L.DivIcon>()

export function iconoNecesidad(
  tipo: NecesidadTipo,
  estado: NecesidadEstado,
  resaltada = false,
  fuera = false,
  // En teléfonos los marcadores van un poco más pequeños para no saturar la
  // pantalla ni recargar el dibujado. En escritorio: compacto = false.
  compacto = false,
): L.DivIcon {
  const clave = `${tipo}|${estado}|${resaltada ? 1 : 0}|${fuera ? 1 : 0}|${compacto ? 1 : 0}`
  const enCache = _cacheNecesidad.get(clave)
  if (enCache) return enCache
  const { color, emoji } = TIPO_META[tipo]
  // El marcador NO desaparece al ser atendido: cambia de aspecto.
  //  · en proceso → borde azul (alguien ya lo tomó), sigue bien visible.
  //  · resuelta    → atenuado + check verde.
  const borde =
    estado === 'en_proceso'
      ? '3px solid #002FA7'
      : estado === 'resuelta'
        ? '3px solid #16A34A'
        : '3px solid #ffffff'
  const opacidad = estado === 'resuelta' ? 0.5 : 1
  // Pequeña insignia de estado encima del pin (solo "resuelta" lleva insignia;
  // "en proceso" se anuncia con un cartelito debajo, ver más abajo).
  const insignia =
    estado === 'resuelta'
      ? '<span style="position:absolute;top:-6px;right:-6px;background:#16A34A;color:#fff;border-radius:9999px;font-size:9px;padding:1px 4px;border:1.5px solid #fff;">✓</span>'
      : ''

  // El derrumbe se ve más explícito: pin más grande, halo que late y una
  // insignia ⚠️ para que se entienda al instante que es un edificio colapsado.
  const esDerrumbe = tipo === 'derrumbe'
  const esAcopio = tipo === 'acopio'
  // Las NECESIDADES que crea el usuario (comida, medicina, refugio, derrumbe,
  // zona…) se ven grandes (54px) para sobresalir sobre los desaparecidos (24px).
  // Los CENTROS DE ACOPIO van más pequeños (36px), igual que los hospitales.
  // FUERA de Venezuela, cualquier marcador va pequeño y uniforme (TAM_FUERA).
  // Fuera de Venezuela ya van pequeños y uniformes (no se reducen más).
  const escala = compacto && !fuera ? 0.78 : 1
  // En móvil el EMOJI se reduce un poco más que el pin (se pedía más pequeño).
  const escalaEmoji = compacto && !fuera ? 0.62 : 1
  const tam = Math.round(
    (fuera ? TAM_FUERA : resaltada ? 60 : esAcopio ? 36 : 54) * escala,
  )
  const fuente = Math.round(
    (fuera
      ? Math.round(TAM_FUERA * 0.46)
      : resaltada
        ? 28
        : esAcopio
          ? 18
          : 26) * escalaEmoji,
  )
  // En móvil quitamos la SOMBRA del pin: es de lo más caro de repintar al mover
  // el mapa. Sin ella el teléfono dibuja cada marcador mucho más rápido (mismo
  // color, forma y emoji). En escritorio se mantiene la sombra.
  const sombra = compacto ? '' : 'box-shadow:0 2px 6px rgba(0,0,0,.4);'
  const halo = resaltada
    ? '<span class="pulso-resaltado"></span>'
    : esDerrumbe
      ? '<span class="pulso-derrumbe"></span>'
      : ''
  const insigniaPeligro =
    esDerrumbe && estado !== 'en_proceso' && estado !== 'resuelta'
      ? '<span style="position:absolute;top:-7px;right:-7px;font-size:14px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5));">⚠️</span>'
      : ''

  // Cuando alguien ya tomó la necesidad, mostramos un cartelito visible debajo
  // del pin para que NADIE pierda el tiempo yendo dos veces al mismo punto.
  // Centramos con un marco de ancho fijo posicionado en píxel ENTERO
  // (left:50% + margin-left:-100px) en vez de transform:translateX(-50%): así el
  // texto no cae en medio píxel y el navegador no lo difumina al re-muestrear.
  const etiquetaEnCamino =
    estado === 'en_proceso'
      ? `<div style="position:absolute;top:${tam + 1}px;left:50%;margin-left:-100px;
            width:200px;text-align:center;pointer-events:none;">
            <span style="display:inline-block;background:#002FA7;color:#fff;
              font-size:10px;font-weight:700;line-height:1.2;padding:2px 7px;
              border-radius:9999px;white-space:nowrap;border:1px solid #fff;
              box-shadow:0 1px 3px rgba(0,0,0,.45);
              -webkit-font-smoothing:antialiased;">🚑 Atendiendo solicitud</span>
          </div>`
      : ''

  const icono = L.divIcon({
    className: 'marcador-necesidad',
    html: `
      <div style="position:relative;width:${tam}px;height:${tam}px;">
        ${halo}
        <div style="
          background:${color};
          width:${tam}px;height:${tam}px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:${borde};
          ${sombra}
          opacity:${opacidad};
          display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:${fuente}px;line-height:1;">${emoji}</span>
        </div>
        ${insignia}${insigniaPeligro}${etiquetaEnCamino}
      </div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam],
    popupAnchor: [0, -tam + 2],
  })
  _cacheNecesidad.set(clave, icono)
  return icono
}

// Caja de centro de acopio (gota verde con 📦). El tamaño cambia según el país:
// los de DENTRO de Venezuela se ven más grandes (son los relevantes para la
// emergencia); los de FUERA (donaciones desde la diáspora) van más pequeños.
function iconoCaja(tam: number, sinSombra = false): L.DivIcon {
  const fuente = Math.round(tam * 0.46)
  const sombra = sinSombra ? '' : 'box-shadow:0 2px 6px rgba(0,0,0,.4);'
  return L.divIcon({
    className: 'marcador-necesidad',
    html: `
      <div style="position:relative;width:${tam}px;height:${tam}px;">
        <div style="
          background:#16A34A;width:${tam}px;height:${tam}px;
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          border:3px solid #fff;${sombra}
          display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:${fuente}px;line-height:1;">📦</span>
        </div>
      </div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam],
    popupAnchor: [0, -tam + 2],
  })
}

export const iconoAcopio: L.DivIcon = iconoCaja(36) // dentro de Venezuela
export const iconoAcopioCompacto: L.DivIcon = iconoCaja(30, true) // móvil (menor, sin sombra)
export const iconoAcopioFuera: L.DivIcon = iconoCaja(TAM_FUERA) // fuera (pequeño)

// Hospital: pin rojo con cruz médica blanca, para distinguirlo a simple vista
// del centro de acopio (caja verde).
function iconoCruz(tam: number, sinSombra = false): L.DivIcon {
  const svg = Math.round(tam * 0.47)
  const sombra = sinSombra ? '' : 'box-shadow:0 2px 5px rgba(0,0,0,0.4);'
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${tam}px; height:${tam}px; border-radius:50% 50% 50% 0;
        transform: rotate(-45deg);
        background:#CC0001; border:2px solid white;
        ${sombra}
        display:flex; align-items:center; justify-content:center;">
        <svg width="${svg}" height="${svg}" viewBox="0 0 24 24" style="transform: rotate(45deg);">
          <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="white"/>
        </svg>
      </div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam],
    popupAnchor: [0, -tam + 4],
  })
}

export const iconoHospital: L.DivIcon = iconoCruz(36) // dentro de Venezuela
export const iconoHospitalCompacto: L.DivIcon = iconoCruz(30, true) // móvil (menor, sin sombra)
export const iconoHospitalFuera: L.DivIcon = iconoCruz(TAM_FUERA) // fuera (pequeño)

/**
 * Marcador de "mi ubicación".
 *  · Con foto: círculo con la foto de perfil y anillo azul + halo que late.
 *  · Sin foto: punto azul estilo "estás aquí" con halo que late.
 */
export function iconoUsuario(fotoUrl?: string | null): L.DivIcon {
  if (fotoUrl) {
    return L.divIcon({
      className: 'marcador-usuario',
      html: `
        <div style="position:relative;width:44px;height:44px;">
          <span class="pulso-ubicacion" style="width:44px;height:44px;"></span>
          <div style="position:absolute;top:2px;left:2px;width:40px;height:40px;
            border-radius:50%;border:3px solid #002FA7;background:#fff;overflow:hidden;
            box-shadow:0 2px 6px rgba(0,0,0,.4);">
            <img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;" />
          </div>
        </div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22],
    })
  }
  return L.divIcon({
    className: 'marcador-usuario',
    html: `
      <div style="position:relative;width:26px;height:26px;">
        <span class="pulso-ubicacion" style="width:26px;height:26px;"></span>
        <div style="position:absolute;top:4px;left:4px;width:18px;height:18px;
          border-radius:50%;background:#002FA7;border:3px solid #fff;
          box-shadow:0 1px 4px rgba(0,0,0,.45);"></div>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  })
}

// Ícono para personas desaparecidas
// Ícono de persona desaparecida: más PEQUEÑO que los de necesidad/SOS, para
// darles prioridad visual a las emergencias urgentes.
const _iconoDesap = (encontrado: boolean) =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        width:24px; height:24px; border-radius:50%;
        background:${encontrado ? '#16a34a' : '#7c3aed'};
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
        display:flex; align-items:center; justify-content:center;
        font-size:12px;
      ">${encontrado ? '✅' : '🔍'}</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
// Solo hay dos variantes; se crean una vez y se reutilizan (no por cada marcador).
const _desapPorLocalizar = _iconoDesap(false)
const _desapEncontrado = _iconoDesap(true)
export const iconoDesaparecido = (encontrado: boolean): L.DivIcon =>
  encontrado ? _desapEncontrado : _desapPorLocalizar
