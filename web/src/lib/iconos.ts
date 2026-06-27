import L from 'leaflet'
import { TIPO_META, type NecesidadTipo, type NecesidadEstado } from './types'

/**
 * Íconos de Leaflet como divIcon (sin imágenes externas → evita el clásico
 * problema de marcadores invisibles con Vite). El color sale del tipo.
 * (Verificación pausada: ya no se distingue 'sin verificar' con borde punteado.)
 */
export function iconoNecesidad(
  tipo: NecesidadTipo,
  estado: NecesidadEstado,
  resaltada = false,
): L.DivIcon {
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
  // Resaltada: más grande y con halo rojo que late, para ubicarla al instante.
  const tam = resaltada ? 48 : esDerrumbe ? 42 : 34
  const fuente = resaltada ? 22 : esDerrumbe ? 20 : 16
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
  const etiquetaEnCamino =
    estado === 'en_proceso'
      ? `<div style="position:absolute;top:${tam + 1}px;left:50%;transform:translateX(-50%);
            background:#002FA7;color:#fff;font-size:10px;font-weight:700;line-height:1.2;
            padding:2px 7px;border-radius:9999px;white-space:nowrap;
            box-shadow:0 1px 3px rgba(0,0,0,.45);border:1px solid #fff;">🚑 Alguien va en camino</div>`
      : ''

  return L.divIcon({
    className: 'marcador-necesidad',
    html: `
      <div style="position:relative;width:${tam}px;height:${tam}px;">
        ${halo}
        <div style="
          background:${color};
          width:${tam}px;height:${tam}px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:${borde};
          box-shadow:0 2px 6px rgba(0,0,0,.4);
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
}

export const iconoAcopio: L.DivIcon = iconoNecesidad('acopio', 'verificada')

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
export const iconoDesaparecido = (encontrado: boolean) =>
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
