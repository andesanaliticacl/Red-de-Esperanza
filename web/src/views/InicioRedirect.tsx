import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Tras iniciar sesión, manda a cada usuario a su vista según el rol. */
export default function InicioRedirect() {
  const { cargando, rol } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-full flex items-center justify-center text-gray-500">
        Cargando…
      </div>
    )
  }

  switch (rol) {
    case 'admin':
      return <Navigate to="/admin" replace />
    // PAUSADO: el verificador, por ahora, entra como el resto del personal.
    case 'verificador':
    case 'voluntario':
    case 'rescatista':
      return <Navigate to="/voluntario" replace />
    default:
      return <Navigate to="/" replace />
  }
}
