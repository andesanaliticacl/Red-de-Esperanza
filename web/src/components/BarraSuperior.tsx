import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MenuUsuario from './MenuUsuario'

/** Barra superior: marca a la izquierda y menú de usuario a la derecha. */
export default function BarraSuperior() {
  const { rol } = useAuth()
  const loc = useLocation()

  // En el mapa a pantalla completa la vista trae su propia cabecera.
  if (loc.pathname === '/') return null

  // Accesos rápidos visibles solo en escritorio; en móvil viven en el menú.
  const esStaff =
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'verificador' ||
    rol === 'admin'

  return (
    <header className="sticky top-0 z-[1000] bg-bandera-azul text-white px-4 py-3 flex items-center gap-3 shadow">
      <Link to="/" className="font-extrabold text-lg whitespace-nowrap">
        🕊️ Esperanza
      </Link>

      <nav className="hidden md:flex gap-1 flex-1">
        {esStaff && (
          <EnlaceTop to="/voluntario" activo={loc.pathname === '/voluntario'}>
            Atender
          </EnlaceTop>
        )}
        <EnlaceTop to="/acopios" activo={loc.pathname === '/acopios'}>
          📦 Acopios
        </EnlaceTop>
        {rol === 'admin' && (
          <EnlaceTop to="/admin" activo={loc.pathname === '/admin'}>
            Admin
          </EnlaceTop>
        )}
      </nav>

      <div className="flex-1 md:flex-none" />
      <MenuUsuario />
    </header>
  )
}

function EnlaceTop({
  to,
  activo,
  children,
}: {
  to: string
  activo: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap ${
        activo ? 'bg-white/25' : 'hover:bg-white/15'
      }`}
    >
      {children}
    </Link>
  )
}
