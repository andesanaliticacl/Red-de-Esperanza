import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { RolUsuario } from '../lib/types'

/**
 * Protege una ruta exigiendo sesión y, opcionalmente, uno de varios roles.
 * Si no hay sesión → manda a /login. Si el rol no alcanza → manda al mapa.
 */
export default function ProtectedRoute({
  roles,
  children,
}: {
  roles?: RolUsuario[]
  children: React.ReactNode
}) {
  const { session, rol, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-full flex items-center justify-center text-gray-500">
        Cargando…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (roles && (!rol || !roles.includes(rol))) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
