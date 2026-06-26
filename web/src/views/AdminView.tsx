import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useNecesidades } from '../hooks/useNecesidades'
import type { Perfil, RolUsuario } from '../lib/types'

// PAUSADO: 'verificador' se mantiene fuera de la lista mientras la verificación
// está oculta. Para reactivarla, vuelve a añadirlo aquí.
const ROLES: RolUsuario[] = [
  'ciudadano',
  'voluntario',
  'rescatista',
  'centro_acopio',
  'admin',
]

export default function AdminView() {
  const { necesidades } = useNecesidades([
    'sin_verificar',
    'verificada',
    'en_proceso',
    'resuelta',
  ])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])

  async function cargarPerfiles() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .order('creado_en', { ascending: true })
    if (!error) setPerfiles((data ?? []) as Perfil[])
  }

  useEffect(() => {
    cargarPerfiles()
  }, [])

  const stats = useMemo(() => {
    const c = (estado: string) =>
      necesidades.filter((n) => n.estado === estado).length
    return {
      // Sin verificación: "recibidas" = nuevas + (datos previos ya verificados).
      recibidas: c('sin_verificar') + c('verificada'),
      en_proceso: c('en_proceso'),
      resuelta: c('resuelta'),
      voluntarios: perfiles.filter(
        (p) => p.rol === 'voluntario' || p.rol === 'rescatista',
      ).length,
    }
  }, [necesidades, perfiles])

  async function cambiarRol(id: string, rol: RolUsuario) {
    const { error } = await supabase
      .from('perfiles')
      .update({ rol })
      .eq('id', id)
    if (error) alert('Error: ' + error.message)
    else cargarPerfiles()
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Panel de administración
      </h1>

      {/* Panel de estadísticas */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta n={stats.recibidas} etiqueta="Recibidas" color="#475569" />
        <Tarjeta n={stats.en_proceso} etiqueta="En proceso" color="#002FA7" />
        <Tarjeta n={stats.resuelta} etiqueta="Resueltas" color="#0891B2" />
        <Tarjeta n={stats.voluntarios} etiqueta="Equipo activo" color="#CF9B00" />
      </section>

      {/* Gestión de usuarios */}
      <section>
        <h2 className="font-bold text-lg mb-2">Usuarios y roles</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-sm text-gray-500">
              <tr>
                <th className="p-3">Usuario</th>
                <th className="p-3">Rol</th>
              </tr>
            </thead>
            <tbody>
              {perfiles.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{p.nombre ?? '(sin nombre)'}</div>
                    {p.zona && (
                      <div className="text-xs text-gray-500">📍 {p.zona}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <select
                      className="rounded-lg border px-2 py-1.5"
                      value={p.rol}
                      onChange={(e) =>
                        cambiarRol(p.id, e.target.value as RolUsuario)
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Centros de acopio: gestión unificada (también internacionales) */}
      <section>
        <h2 className="font-bold text-lg mb-2">Centros de acopio</h2>
        <Link to="/acopios" className="card flex items-center gap-3 no-underline">
          <span className="text-2xl">📦</span>
          <div className="flex-1">
            <div className="font-semibold text-bandera-azul">
              Ver y registrar centros de acopio
            </div>
            <div className="text-sm text-gray-600">
              Incluye centros internacionales para enviar ayuda a Venezuela.
            </div>
          </div>
          <span className="text-bandera-azul">→</span>
        </Link>
      </section>
    </div>
  )
}

function Tarjeta({
  n,
  etiqueta,
  color,
}: {
  n: number
  etiqueta: string
  color: string
}) {
  return (
    <div className="card text-center">
      <div className="text-4xl font-extrabold" style={{ color }}>
        {n}
      </div>
      <div className="text-sm text-gray-600 mt-1">{etiqueta}</div>
    </div>
  )
}

