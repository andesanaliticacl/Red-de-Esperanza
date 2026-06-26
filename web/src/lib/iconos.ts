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
  // Pequeña insignia de estado encima del pin.
  const insignia =
    estado === 'en_proceso'
      ? '<span style="position:absolute;top:-6px;right:-6px;background:#002FA7;color:#fff;border-radius:9999px;font-size:9px;padding:1px 4px;border:1.5px solid #fff;">⏳</span>'
      : estado === 'resuelta'
        ? '<span style="position:absolute;top:-6px;right:-6px;background:#16A34A;color:#fff;border-radius:9999px;font-size:9px;padding:1px 4px;border:1.5px solid #fff;">✓</span>'
        : ''

  return L.divIcon({
    className: 'marcador-necesidad',
    html: `
      <div style="position:relative;">
        <div style="
          background:${color};
          width:34px;height:34px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:${borde};
          box-shadow:0 2px 6px rgba(0,0,0,.4);
          opacity:${opacidad};
          display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:16px;line-height:1;">${emoji}</span>
        </div>
        ${insignia}
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
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
