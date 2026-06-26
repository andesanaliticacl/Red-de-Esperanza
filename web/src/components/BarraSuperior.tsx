import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Barra de navegación que se adapta al rol del usuario. */
export default function BarraSuperior() {
  const { session, rol, perfil, cerrarSesion } = useAuth()
  const loc = useLocation()

  // En el mapa a pantalla completa no mostramos barra (la vista trae la suya).
  if (loc.pathname === '/') return null

  const enlaces: { to: string; etiqueta: string }[] = []
  if (session) enlaces.push({ to: '/mis-reportes', etiqueta: 'Mis reportes' })
  if (
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'verificador' ||
    rol === 'admin'
  )
    enlaces.push({ to: '/voluntario', etiqueta: 'Atender' })
  if (rol === 'verificador' || rol === 'admin')
    enlaces.push({ to: '/verificar', etiqueta: 'Verificar' })
  if (rol === 'admin') enlaces.push({ to: '/admin', etiqueta: 'Admin' })

  return (
    <header className="sticky top-0 z-[1000] bg-bandera-azul text-white px-4 py-3 flex items-center gap-3 shadow">
      <Link to="/" className="font-extrabold text-lg whitespace-nowrap">
        🕊️ Esperanza
      </Link>
      <nav className="flex gap-1 overflow-x-auto flex-1">
        {enlaces.map((e) => (
          <Link
            key={e.to}
            to={e.to}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap ${
              loc.pathname === e.to ? 'bg-white/25' : 'hover:bg-white/15'
            }`}
          >
            {e.etiqueta}
          </Link>
        ))}
      </nav>
      {session ? (
        <button
          onClick={cerrarSesion}
          className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg"
          title={perfil?.nombre ?? ''}
        >
          Salir
        </button>
      ) : (
        <Link
          to="/login"
          className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg"
        >
          Ingresar
        </Link>
      )}
    </header>
  )
}
