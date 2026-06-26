import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  obtenerUbicacion,
  distanciaMetros,
  enlaceComoLlegar,
} from '../lib/geo'
import type { CentroAcopio } from '../lib/types'

const PAISES_SUGERIDOS = [
  'Venezuela', 'Chile', 'Colombia', 'Perú', 'Ecuador', 'Argentina',
  'Brasil', 'Panamá', 'México', 'España', 'Estados Unidos', 'Portugal',
]

export default function CentrosAcopioView() {
  const { perfil, rol } = useAuth()
  const puedeRegistrar = rol === 'centro_acopio' || rol === 'admin'

  const [centros, setCentros] = useState<CentroAcopio[]>([])
  const [cargando, setCargando] = useState(true)
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null)
  const [abrirForm, setAbrirForm] = useState(false)

  async function cargar() {
    const { data } = await supabase
      .from('centros_acopio')
      .select('*')
      .order('pais', { ascending: true })
    setCentros((data ?? []) as CentroAcopio[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  // Agrupa por país; dentro, ordena por cercanía si hay ubicación, si no por nombre.
  const porPais = useMemo(() => {
    const grupos = new Map<string, CentroAcopio[]>()
    for (const c of centros) {
      const k = c.pais || 'Otro'
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k)!.push(c)
    }
    for (const [, lista] of grupos) {
      lista.sort((a, b) => {
        if (yo) {
          return (
            distanciaMetros(yo.lat, yo.lng, a.lat, a.lng) -
            distanciaMetros(yo.lat, yo.lng, b.lat, b.lng)
          )
        }
        return a.nombre.localeCompare(b.nombre)
      })
    }
    // Venezuela primero, luego el resto alfabético.
    return [...grupos.entries()].sort((a, b) => {
      if (a[0] === 'Venezuela') return -1
      if (b[0] === 'Venezuela') return 1
      return a[0].localeCompare(b[0])
    })
  }, [centros, yo])

  async function usarMiUbicacion() {
    try {
      const u = await obtenerUbicacion()
      setYo({ lat: u.lat, lng: u.lng })
    } catch {
      /* sin ubicación: queda el orden por nombre */
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/" className="text-bandera-azul font-semibold">
          ← Mapa
        </Link>
        <h1 className="text-2xl font-extrabold text-bandera-azul ml-auto">
          Centros de acopio
        </h1>
      </div>

      <p className="text-gray-600 text-sm">
        Lugares donde llevar o enviar ayuda humanitaria para Venezuela. Si estás
        en otro país, busca el centro más cercano para coordinar tu donación.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={usarMiUbicacion} className="btn-azul py-2.5 px-4">
          📍 Ordenar por cercanía
        </button>
        {puedeRegistrar && (
          <button
            onClick={() => setAbrirForm((v) => !v)}
            className="btn-verde py-2.5 px-4"
          >
            {abrirForm ? 'Cerrar' : '＋ Registrar mi centro'}
          </button>
        )}
      </div>

      {abrirForm && puedeRegistrar && (
        <FormCentro
          creadoPor={perfil?.id ?? null}
          paisInicial={perfil?.estado ? 'Venezuela' : 'Venezuela'}
          onCreado={() => {
            setAbrirForm(false)
            cargar()
          }}
        />
      )}

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : centros.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          Aún no hay centros de acopio registrados.
        </div>
      ) : (
        porPais.map(([pais, lista]) => (
          <section key={pais} className="space-y-2">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <span className="text-xl">
                {pais === 'Venezuela' ? '🇻🇪' : '🌎'}
              </span>
              {pais}{' '}
              <span className="text-sm font-normal text-gray-400">
                ({lista.length})
              </span>
            </h2>
            {lista.map((c, i) => (
              <div key={c.id} className="card flex items-start gap-3">
                <div className="text-2xl">📦</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">
                    {c.nombre}
                    {yo && i === 0 && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        más cercano
                      </span>
                    )}
                  </div>
                  {(c.ciudad || c.direccion) && (
                    <div className="text-sm text-gray-600">
                      📍 {[c.direccion, c.ciudad].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {c.descripcion && (
                    <div className="text-sm text-gray-700 mt-0.5">
                      {c.descripcion}
                    </div>
                  )}
                  {yo && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      a ~{(distanciaMetros(yo.lat, yo.lng, c.lat, c.lng) / 1000).toFixed(1)} km
                    </div>
                  )}
                </div>
                <a
                  href={enlaceComoLlegar(c.lat, c.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-amber py-2 px-3 text-sm whitespace-nowrap no-underline"
                >
                  🧭 Ir
                </a>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  )
}

function FormCentro({
  creadoPor,
  paisInicial,
  onCreado,
}: {
  creadoPor: string | null
  paisInicial: string
  onCreado: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [pais, setPais] = useState(paisInicial)
  const [ciudad, setCiudad] = useState('')
  const [direccion, setDireccion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [estado, setEstado] = useState<'idle' | 'guardando'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function usarGPS() {
    try {
      const u = await obtenerUbicacion()
      setLat(u.lat.toFixed(6))
      setLng(u.lng.toFixed(6))
    } catch {
      setErrorMsg('No pudimos obtener la ubicación. Escríbela a mano.')
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const nLat = parseFloat(lat)
    const nLng = parseFloat(lng)
    if (Number.isNaN(nLat) || Number.isNaN(nLng)) {
      setErrorMsg('Falta la ubicación (lat/lng). Usa el botón de GPS.')
      return
    }
    setEstado('guardando')
    const { error } = await supabase.from('centros_acopio').insert({
      nombre: nombre.trim(),
      pais: pais.trim() || 'Venezuela',
      ciudad: ciudad.trim() || null,
      direccion: direccion.trim() || null,
      descripcion: descripcion.trim() || null,
      lat: nLat,
      lng: nLng,
      creado_por: creadoPor,
    })
    if (error) {
      setErrorMsg(error.message)
      setEstado('idle')
    } else {
      onCreado()
    }
  }

  return (
    <form onSubmit={guardar} className="card space-y-3 border-2 border-green-200">
      <h3 className="font-bold">Registrar centro de acopio</h3>
      <input
        className="input"
        placeholder="Nombre del centro"
        required
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input"
          placeholder="País"
          list="paises-acopio"
          required
          value={pais}
          onChange={(e) => setPais(e.target.value)}
        />
        <datalist id="paises-acopio">
          {PAISES_SUGERIDOS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <input
          className="input"
          placeholder="Ciudad"
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
        />
      </div>
      <input
        className="input"
        placeholder="Dirección (calle, número, referencia)"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
      />
      <input
        className="input"
        placeholder="Qué reciben / horario (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Lat"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />
        <input
          className="input"
          placeholder="Lng"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
        />
        <button type="button" onClick={usarGPS} className="btn-gris px-3">
          📍
        </button>
      </div>
      {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}
      <button
        type="submit"
        disabled={estado === 'guardando'}
        className="btn-verde w-full disabled:opacity-60"
      >
        {estado === 'guardando' ? 'Guardando…' : 'Guardar centro'}
      </button>
    </form>
  )
}
