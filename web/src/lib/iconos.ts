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
  const borde = '3px solid #ffffff'
  const opacidad = estado === 'resuelta' ? 0.45 : 1

  return L.divIcon({
    className: 'marcador-necesidad',
    html: `
      <div style="
        background:${color};
        width:34px;height:34px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:${borde};
        box-shadow:0 2px 6px rgba(0,0,0,.4);
        opacity:${opacidad};
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:16px;line-height:1;">${emoji}</span>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  })
}

export const iconoAcopio: L.DivIcon = iconoNecesidad('acopio', 'verificada')
