import type { CSSProperties } from 'react'
import { BadgeCheck } from 'lucide-react'

// Color único para "verificado por una entidad" (celeste), a propósito
// DISTINTO de los colores de TIER_META: ese es el nivel de confianza de la
// entidad en SU propio perfil; este es la insignia de sus rescatistas/
// voluntarios en cualquier parte de la app (chat, "atiende…", mapa).
export const COLOR_VERIFICADO = '#0EA5E9'

/**
 * Insignia chica junto a un nombre: "Verificado por <entidad>". Se muestra
 * solo si la persona fue verificada por una entidad (migración 64).
 */
export default function InsigniaVerificado({
  entidadNombre,
  compacta = false,
}: {
  entidadNombre: string
  compacta?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-bold shrink-0"
      style={{
        color: COLOR_VERIFICADO,
        backgroundColor: `${COLOR_VERIFICADO}14`,
        padding: compacta ? '1px 6px' : '2px 8px',
        fontSize: compacta ? 10 : 11,
      }}
      title={`Verificado por ${entidadNombre}`}
    >
      <BadgeCheck
        className={compacta ? 'h-3 w-3' : 'h-3.5 w-3.5'}
        strokeWidth={2.5}
        aria-hidden="true"
      />
      {!compacta && <span>Verificado</span>}
    </span>
  )
}

/** Contorno celeste sutil para resaltar un elemento (tarjeta, fila) ligado
 *  a una persona verificada — el "contorno celeste" pedido para que se note
 *  a simple vista, sin depender de leer texto. */
export function estiloContornoVerificado(activo: boolean): CSSProperties {
  if (!activo) return {}
  return {
    boxShadow: `0 0 0 2px ${COLOR_VERIFICADO}, 0 0 0 5px ${COLOR_VERIFICADO}22`,
  }
}
