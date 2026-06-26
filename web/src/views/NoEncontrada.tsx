import { Link } from 'react-router-dom'

/** Página amigable para rutas que no existen (en vez del 404 técnico). */
export default function NoEncontrada() {
  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="card max-w-sm text-center">
        <div className="text-6xl mb-3">🕊️</div>
        <h1 className="text-2xl font-extrabold text-bandera-azul mb-2">
          No encontramos esta página
        </h1>
        <p className="text-gray-600 mb-5">
          Puede que el enlace esté roto o que la página se haya movido. Pero
          tranquilo: la red sigue aquí para ayudarte.
        </p>
        <Link to="/" className="btn-azul w-full no-underline">
          🗺️ Volver al mapa
        </Link>
        <p className="text-xs text-gray-400 mt-4">
          De parte del equipo de Red de Esperanza 💙
        </p>
      </div>
    </div>
  )
}
