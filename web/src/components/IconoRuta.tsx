/** Icono de navegación (flecha) para los botones de "Ir / Cómo llegar". */
export default function IconoRuta({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`inline-block align-[-2px] ${className}`}
      aria-hidden="true"
    >
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  )
}
