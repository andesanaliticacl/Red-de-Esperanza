import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  User,
  ClipboardList,
  MessageCircle,
  History,
  HandHeart,
  Siren,
  Brain,
  Package,
  NotebookPen,
  Shield,
  HelpCircle,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROL_META } from '../lib/types'
import ChatGlobal from './ChatGlobal'
import TutorialModal from './TutorialModal'
import BotonInstalar from './BotonInstalar'
import BotonAvisosPush from './BotonAvisosPush'

/**
 * Menú de usuario: un solo botón que despliega el perfil y todas las opciones
 * (perfil, reportes, historial, acopios, chat en vivo, salir). Mantiene la
 * barra ordenada en móvil, donde antes los botones se salían de pantalla.
 *
 * `claro` = variante para fondos claros (lo usa el mapa de inicio).
 */
export default function MenuUsuario({ claro = false }: { claro?: boolean }) {
  const { session, rol, perfil, cerrarSesion } = useAuth()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [chat, setChat] = useState(false)
  const [verTutorial, setVerTutorial] = useState(false)

  const meta = rol ? ROL_META[rol] : null
  const nombreCorto = perfil?.nombre?.split(' ')[0] ?? null
  const esStaff =
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'lider_voluntarios' ||
    rol === 'verificador' ||
    rol === 'admin'
  const esEquipoPsicologia =
    rol === 'psicologo' || rol === 'lider_psicologo' || rol === 'admin'

  const disparador = claro
    ? 'bg-white/95 text-bandera-azul shadow'
    : 'bg-white/15 hover:bg-white/25 text-white'

  function cerrar() {
    setAbierto(false)
  }

  async function salir() {
    cerrar()
    await cerrarSesion()
    navigate('/')
  }

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        className={`flex items-center gap-2 font-semibold px-3 py-2 rounded-xl ${disparador}`}
        aria-label="Menú"
      >
        {perfil?.foto_url ? (
          <img
            src={perfil.foto_url}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <User className="h-5 w-5" aria-hidden="true" />
        )}
        {nombreCorto && (
          <span className="hidden sm:inline max-w-[8rem] truncate">
            {nombreCorto}
          </span>
        )}
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden="true" />
      </button>

      {abierto && createPortal(
        <>
          {/* Capa para cerrar al tocar fuera */}
          <div className="fixed inset-0 z-[2400]" onClick={cerrar} />
          <div className="fixed right-2 top-16 z-[2500] w-64 max-w-[88vw] bg-tinta-900 rounded-2xl shadow-alta border border-white/10 overflow-hidden text-white">
            {/* Cabecera de identidad */}
            <div className="p-4 bg-white/[0.06] border-b border-white/10">
              {session ? (
                <>
                  <div className="font-bold truncate">
                    {perfil?.nombre ?? 'Mi cuenta'}
                  </div>
                  {meta && (
                    <span className="inline-block mt-1 text-xs bg-white/10 text-white font-semibold px-2 py-0.5 rounded-full">
                      {meta.emoji} {meta.etiqueta}
                    </span>
                  )}
                </>
              ) : (
                <div className="text-sm text-white/70">
                  Estás como <b>invitado</b>. Inicia sesión para reportes y chats
                  privados.
                </div>
              )}
            </div>

            <nav className="py-1">
              {session && (
                <ItemLink to="/perfil" icono={User} texto="Mi perfil" onClick={cerrar} />
              )}
              {session && (
                <ItemLink
                  to="/mis-reportes"
                  icono={ClipboardList}
                  texto="Mis reportes"
                  onClick={cerrar}
                />
              )}
              {session && (
                <ItemLink
                  to="/conversaciones"
                  icono={MessageCircle}
                  texto="Mis conversaciones"
                  onClick={cerrar}
                />
              )}
              {session && (
                <ItemLink
                  to="/historial"
                  icono={History}
                  texto="Historial"
                  onClick={cerrar}
                />
              )}
              {esStaff && (
                <ItemLink
                  to="/voluntario"
                  icono={HandHeart}
                  texto="Atender solicitudes"
                  onClick={cerrar}
                />
              )}
              {esStaff && (
                <ItemLink
                  to="/voluntario/historico-sos"
                  icono={Siren}
                  texto="Histórico de SOS"
                  onClick={cerrar}
                />
              )}
              {esEquipoPsicologia && (
                <ItemLink
                  to="/psicologia"
                  icono={Brain}
                  texto="Atender solicitudes psicológicas"
                  onClick={cerrar}
                />
              )}
              <ItemLink to="/acopios" icono={Package} texto="Centros de acopio" onClick={cerrar} />
              {/* El admin NO usa el chat en vivo: en su lugar monitorea TODAS
                  las conversaciones (solo lectura). El resto sí ve el chat. */}
              {rol === 'admin' ? (
                <ItemLink
                  to="/panel-x7k2/conversaciones"
                  icono={MessageCircle}
                  texto="Todas las conversaciones"
                  onClick={cerrar}
                />
              ) : (
                <button
                  onClick={() => {
                    cerrar()
                    setChat(true)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <MessageCircle className="h-5 w-5 shrink-0 text-white/60" aria-hidden="true" />
                  <span className="font-medium">Chat en vivo</span>
                </button>
              )}
              {(rol === 'admin' ||
                rol === 'lider_voluntarios' ||
                rol === 'lider_psicologo') && (
                <ItemLink
                  to="/notas-cierre"
                  icono={NotebookPen}
                  texto="Notas de cierre"
                  onClick={cerrar}
                />
              )}
              {rol === 'admin' && (
                <ItemLink to="/panel-x7k2" icono={Shield} texto="Administración" onClick={cerrar} />
              )}

              {/* Ayuda e instalación (antes estaban sueltas en el mapa). */}
              <button
                onClick={() => {
                  cerrar()
                  setVerTutorial(true)
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <HelpCircle className="h-5 w-5 shrink-0 text-white/60" aria-hidden="true" />
                <span className="font-medium">¿Cómo funciona?</span>
              </button>
              {/* Avisos con la app cerrada: es configuración del aparato,
                  igual que instalar. Antes vivía dentro de la campana y
                  ocupaba su tercio superior cada vez que se abría a leer. */}
              <BotonAvisosPush onAccion={cerrar} />
              {/* Solo aparece si la app se puede instalar (Android/iOS). */}
              <BotonInstalar variante="menu" onAccion={cerrar} />
            </nav>

            <div className="border-t border-white/10 p-2">
              {session ? (
                <button
                  onClick={salir}
                  className="w-full text-left px-3 py-2 rounded-lg text-red-400 font-semibold transition-colors hover:bg-red-500/15 hover:text-red-300"
                >
                  Cerrar sesión
                </button>
              ) : (
                <div className="flex flex-col gap-1">
                  <Link
                    to="/login"
                    onClick={cerrar}
                    className="w-full text-center px-3 py-2 rounded-lg bg-bandera-azul text-white font-semibold no-underline"
                  >
                    Iniciar sesión
                  </Link>
                  <Link
                    to="/registro"
                    onClick={cerrar}
                    className="w-full text-center px-3 py-2 rounded-lg text-white/80 font-semibold no-underline transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Crear cuenta
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}

      {chat &&
        createPortal(
          <div className="fixed inset-0 z-[2600] bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4">
            <div className="bg-white w-full sm:max-w-md h-full sm:h-[80vh] sm:rounded-3xl overflow-hidden flex flex-col">
              <ChatGlobal onCerrar={() => setChat(false)} />
            </div>
          </div>,
          document.body,
        )}

      {verTutorial && <TutorialModal onCerrar={() => setVerTutorial(false)} />}
    </>
  )
}

function ItemLink({
  to,
  icono: Icono,
  texto,
  onClick,
}: {
  to: string
  icono: LucideIcon
  texto: string
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 no-underline text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icono className="h-5 w-5 shrink-0 text-white/60" aria-hidden="true" />
      <span className="font-medium">{texto}</span>
    </Link>
  )
}
