import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNecesidades } from '../hooks/useNecesidades'
import type { Perfil, RolUsuario } from '../lib/types'

const ROLES: RolUsuario[] = ['ciudadano', 'voluntario', 'verificador', 'admin']

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
      sin_verificar: c('sin_verificar'),
      verificada: c('verificada'),
      en_proceso: c('en_proceso'),
      resuelta: c('resuelta'),
      voluntarios: perfiles.filter(
        (p) => p.rol === 'voluntario' || p.rol === 'verificador',
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
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tarjeta n={stats.sin_verificar} etiqueta="Sin verificar" color="#475569" />
        <Tarjeta n={stats.verificada} etiqueta="Verificadas" color="#16A34A" />
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

      {/* Crear centro de acopio */}
      <FormAcopio />
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

function FormAcopio() {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok'>('idle')

  function usarGPS() {
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toString())
      setLng(pos.coords.longitude.toString())
    })
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('guardando')
    const { error } = await supabase.from('centros_acopio').insert({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    })
    if (error) {
      alert('Error: ' + error.message)
      setEstado('idle')
    } else {
      setEstado('ok')
      setNombre('')
      setDescripcion('')
      setLat('')
      setLng('')
      setTimeout(() => setEstado('idle'), 2500)
    }
  }

  return (
    <section>
      <h2 className="font-bold text-lg mb-2">Nuevo centro de acopio</h2>
      <form onSubmit={guardar} className="card space-y-3">
        <input
          className="input"
          placeholder="Nombre del centro"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <input
          className="input"
          placeholder="Descripción (qué reciben, horario…)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Lat"
            required
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <input
            className="input"
            placeholder="Lng"
            required
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
          <button type="button" onClick={usarGPS} className="btn-gris px-3">
            📍
          </button>
        </div>
        <button
          type="submit"
          disabled={estado === 'guardando'}
          className="btn-azul w-full disabled:opacity-60"
        >
          {estado === 'ok'
            ? '✅ Guardado'
            : estado === 'guardando'
              ? 'Guardando…'
              : 'Crear centro de acopio'}
        </button>
      </form>
    </section>
  )
}
