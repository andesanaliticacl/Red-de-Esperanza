/**
 * Bandera de un país como imagen (flagcdn), porque los emoji de bandera no se
 * ven en Windows. Si no hay ISO (p. ej. "Otro"), muestra un globo.
 */
export default function Bandera({
  iso,
  className = '',
}: {
  iso: string
  className?: string
}) {
  if (!iso) return <span className={className}>🌎</span>
  return (
    <img
      src={`https://flagcdn.com/24x18/${iso}.png`}
      srcSet={`https://flagcdn.com/48x36/${iso}.png 2x`}
      width={24}
      height={18}
      alt=""
      loading="lazy"
      className={`inline-block rounded-sm shadow-sm ${className}`}
    />
  )
}
