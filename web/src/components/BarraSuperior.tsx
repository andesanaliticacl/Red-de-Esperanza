import { Link, useLocation } from 'react-router-dom'
import MenuUsuario from './MenuUsuario'

/** Barra superior: marca a la izquierda y menú de usuario a la derecha. */
export default function BarraSuperior() {
  const loc = useLocation()

  // En el mapa a pantalla completa la vista trae su propia cabecera.
  if (loc.pathname === '/') return null

  return (
    <header className="sticky top-0 z-[1000] bg-bandera-azul text-white px-4 py-3 flex items-center gap-3 shadow">
      <Link to="/" className="font-extrabold text-lg whitespace-nowrap">
        🕊️ Esperanza
      </Link>
      {/* Toda la navegación (incluido "Atender solicitudes") vive en el menú de
          usuario, para que se vea ordenado en todos los dispositivos. */}
      <div className="flex-1" />
      <MenuUsuario />
    </header>
  )
}
