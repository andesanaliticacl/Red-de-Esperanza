import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROL_META } from '../lib/types'
import ChatGlobal from './ChatGlobal'

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

  const meta = rol ? ROL_META[rol] : null
  const nombreCorto = perfil?.nombre?.split(' ')[0] ?? null
  const esStaff =
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'verificador' ||
    rol === 'admin'

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
          <span className="text-lg leading-none">{meta?.emoji ?? '👤'}</span>
        )}
        {nombreCorto && (
          <span className="hidden sm:inline max-w-[8rem] truncate">
            {nombreCorto}
          </span>
        )}
        <span className="text-xs opacity-70">▾</span>
      </button>

      {abierto && createPortal(
        <>
          {/* Capa para cerrar al tocar fuera */}
          <div className="fixed inset-0 z-[2400]" onClick={cerrar} />
          <div className="fixed right-2 top-16 z-[2500] w-64 max-w-[88vw] bg-white rounded-2xl shadow-2xl border overflow-hidden text-gray-800">
            {/* Cabecera de identidad */}
            <div className="p-4 bg-gray-50 border-b">
              {session ? (
                <>
                  <div className="font-bold truncate">
                    {perfil?.nombre ?? 'Mi cuenta'}
                  </div>
                  {meta && (
                    <span className="inline-block mt-1 text-xs bg-bandera-azul/10 text-bandera-azul font-semibold px-2 py-0.5 rounded-full">
                      {meta.emoji} {meta.etiqueta}
                    </span>
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-600">
                  Estás como <b>invitado</b>. Inicia sesión para reportes y chats
                  privados.
                </div>
              )}
            </div>

            <nav className="py-1">
              {session && (
                <ItemLink to="/perfil" emoji="👤" texto="Mi perfil" onClick={cerrar} />
              )}
              {session && (
                <ItemLink
                  to="/mis-reportes"
                  emoji="📋"
                  texto="Mis reportes"
                  onClick={cerrar}
                />
              )}
              {session && (
                <ItemLink
                  to="/conversaciones"
                  emoji="💬"
                  texto="Mis conversaciones"
                  onClick={cerrar}
                />
              )}
              {session && (
                <ItemLink
                  to="/historial"
                  emoji="🕘"
                  texto="Historial"
                  onClick={cerrar}
                />
              )}
              {esStaff && (
                <ItemLink
                  to="/voluntario"
                  emoji="🤝"
                  texto="Atender necesidades"
                  onClick={cerrar}
                />
              )}
              <ItemLink to="/acopios" emoji="📦" texto="Centros de acopio" onClick={cerrar} />
              <button
                onClick={() => {
                  cerrar()
                  setChat(true)
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
              >
                <span className="text-lg">💬</span>
                <span className="font-medium">Chat en vivo</span>
              </button>
              {rol === 'admin' && (
                <ItemLink to="/admin" emoji="🛡️" texto="Administración" onClick={cerrar} />
              )}
            </nav>

            <div className="border-t p-2">
              {session ? (
                <button
                  onClick={salir}
                  className="w-full text-left px-3 py-2 rounded-lg text-bandera-rojo font-semibold hover:bg-red-50"
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
                    className="w-full text-center px-3 py-2 rounded-lg text-bandera-azul font-semibold no-underline"
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
    </>
  )
}

function ItemLink({
  to,
  emoji,
  texto,
  onClick,
}: {
  to: string
  emoji: string
  texto: string
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 no-underline text-gray-800"
    >
      <span className="text-lg">{emoji}</span>
      <span className="font-medium">{texto}</span>
    </Link>
  )
}
