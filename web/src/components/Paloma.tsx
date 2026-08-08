/**
 * Paloma de la marca, dibujada como SVG.
 *
 * Antes era el emoji 🕊️, que cada sistema operativo dibuja a su manera: en
 * Android, en iPhone y en Windows salían tres palomas distintas, así que el
 * logo nunca se veía igual. Esta se ve idéntica en todos lados, hereda el
 * color del texto (currentColor) y escala sin pixelarse.
 */
export default function Paloma({
  className = 'h-5 w-5',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Cuerpo: del pico (derecha) a la cola (abajo izquierda). */}
      <path
        d="M28 8.6c-1.4-.5-2.6-.2-3.5.7-1.3-1.6-3.2-2.5-5.3-2.5-3.6 0-6.6 2.6-7.2 6.1-.4 2.3-1.6 4.2-3.5 5.6L4 22.2c2.9 2 6.3 3.1 9.9 3.1 6.9 0 12.8-4.6 14.6-10.9l3.1-2.2-3.5-.5c.4-1.1 0-2.2-.1-3.1Z"
        fill="currentColor"
      />
      {/* Ala levantada: se separa del cuerpo con un hueco, para que se lea
          como ala y no como una mancha. */}
      <path
        d="M13.4 12.6 4.9 7.4c-.8-.5-1.7.5-1.1 1.2l6.1 7.3"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
