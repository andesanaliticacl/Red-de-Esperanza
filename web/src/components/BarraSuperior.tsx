import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MenuUsuario from './MenuUsuario'
import CampanaNotificaciones from './CampanaNotificaciones'
import Paloma from './Paloma'

/** Barra superior: marca a la izquierda y menú de usuario a la derecha. */
export default function BarraSuperior() {
  const loc = useLocation()
  const { session } = useAuth()

  // En el mapa a pantalla completa la vista trae su propia cabecera.
  if (loc.pathname === '/') return null

  // Cromo oscuro: la barra enmarca la app y le da aire de herramienta
  // profesional. El contenido que se lee va en claro, que es lo que aguanta
  // el sol de la calle y la vista cansada.
  return (
    <header className="sticky top-0 z-[1000] bg-tinta-900 text-white px-4 py-3 flex items-center gap-3 shadow-media">
      <Link
        to="/"
        className="inline-flex items-center gap-2 font-extrabold text-lg whitespace-nowrap"
      >
        <Paloma className="h-6 w-6" />
        Red de Esperanza
      </Link>
      {/* Toda la navegación (incluido "Atender solicitudes") vive en el menú de
          usuario, para que se vea ordenado en todos los dispositivos. */}
      <div className="flex-1" />
      {session && <CampanaNotificaciones />}
      <MenuUsuario />
    </header>
  )
}
