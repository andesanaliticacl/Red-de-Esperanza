import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROL_META } from '../lib/types'

/** Vista de usuario: datos de la persona, su rol y accesos útiles. */
export default function PerfilView() {
  const { perfil, rol } = useAuth()
  const meta = rol ? ROL_META[rol] : null

  const datos: { etiqueta: string; valor: string | null }[] = [
    { etiqueta: 'Nombre', valor: perfil?.nombre ?? null },
    {
      etiqueta: 'Documento',
      valor: perfil?.documento
        ? `${perfil.tipo_documento === 'pasaporte' ? 'Pasaporte' : 'Cédula'}: ${perfil.documento}`
        : null,
    },
    { etiqueta: 'Teléfono', valor: perfil?.telefono ?? null },
    {
      etiqueta: 'Ubicación',
      valor:
        [perfil?.ciudad, perfil?.estado].filter(Boolean).join(', ') || null,
    },
  ]

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Cabecera con avatar e identidad */}
      <div className="card flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-bandera-azul/10 overflow-hidden flex items-center justify-center text-3xl shrink-0">
          {perfil?.foto_url ? (
            <img
              src={perfil.foto_url}
              alt="Tu foto"
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{meta?.emoji ?? '👤'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-bandera-azul truncate">
            {perfil?.nombre ?? 'Mi cuenta'}
          </h1>
          {meta && (
            <span className="inline-block mt-1 text-sm bg-bandera-azul/10 text-bandera-azul font-semibold px-3 py-1 rounded-full">
              {meta.emoji} {meta.etiqueta}
            </span>
          )}
        </div>
        <Link
          to="/perfil/editar"
          className="btn-azul py-2 px-3 text-sm whitespace-nowrap no-underline"
        >
          ✏️ Editar
        </Link>
      </div>

      {/* Datos de la persona */}
      <section className="card divide-y">
        <h2 className="font-bold text-lg pb-2">Mis datos</h2>
        {datos.map((d) => (
          <div key={d.etiqueta} className="flex justify-between gap-3 py-2.5">
            <span className="text-gray-500">{d.etiqueta}</span>
            <span className="font-medium text-right">
              {d.valor ?? <span className="text-gray-400">—</span>}
            </span>
          </div>
        ))}
      </section>

      {/* Accesos útiles */}
      <section className="grid grid-cols-2 gap-3">
        <Acceso to="/mis-reportes" emoji="📋" texto="Mis reportes" />
        <Acceso to="/historial" emoji="🕘" texto="Historial" />
        <Acceso to="/acopios" emoji="📦" texto="Centros de acopio" />
        <Acceso to="/" emoji="🗺️" texto="Ir al mapa" />
      </section>

      <p className="text-center text-xs text-gray-400">
        Tus datos personales (documento, teléfono) son privados y nunca se
        muestran en el mapa público.
      </p>
    </div>
  )
}

function Acceso({
  to,
  emoji,
  texto,
}: {
  to: string
  emoji: string
  texto: string
}) {
  return (
    <Link
      to={to}
      className="card flex flex-col items-center justify-center gap-1 py-5 no-underline text-gray-800 hover:shadow-lg transition"
    >
      <span className="text-3xl">{emoji}</span>
      <span className="font-semibold text-sm text-center">{texto}</span>
    </Link>
  )
}
