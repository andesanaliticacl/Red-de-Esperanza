import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  obtenerUbicacion,
  distanciaMetros,
  enlaceComoLlegar,
} from '../lib/geo'
import { PAISES_MUNDO, isoDe } from '../lib/paises'
import Bandera from '../components/Bandera'
import IconoRuta from '../components/IconoRuta'
import EntradaTelefono from '../components/EntradaTelefono'

/** Enlace de WhatsApp a partir de un teléfono (solo dígitos). */
function enlaceWhatsApp(contacto: string): string {
  const digitos = contacto.replace(/\D/g, '')
  return `https://wa.me/${digitos}`
}
import SelectorBandera, {
  type OpcionBandera,
} from '../components/SelectorBandera'
import { ESTADOS_VENEZUELA, type CentroAcopio } from '../lib/types'

export default function CentrosAcopioView() {
  const { perfil, rol } = useAuth()
  const puedeRegistrar = rol === 'centro_acopio' || rol === 'admin'

  const [centros, setCentros] = useState<CentroAcopio[]>([])
  const [cargando, setCargando] = useState(true)
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null)
  const [abrirForm, setAbrirForm] = useState(false)

  // Filtros
  const [fPais, setFPais] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fCiudad, setFCiudad] = useState('')

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

  // Opciones de filtro derivadas de los datos existentes.
  const paisesDisponibles = useMemo(
    () => [...new Set(centros.map((c) => c.pais).filter(Boolean))].sort(),
    [centros],
  )
  const estadosDisponibles = useMemo(
    () =>
      [
        ...new Set(
          centros
            .filter((c) => !fPais || c.pais === fPais)
            .map((c) => c.estado)
            .filter((x): x is string => Boolean(x)),
        ),
      ].sort(),
    [centros, fPais],
  )

  const centrosFiltrados = useMemo(
    () =>
      centros.filter((c) => {
        if (fPais && c.pais !== fPais) return false
        if (fEstado && (c.estado ?? '') !== fEstado) return false
        if (
          fCiudad.trim() &&
          !(c.ciudad ?? '')
            .toLowerCase()
            .includes(fCiudad.trim().toLowerCase())
        )
          return false
        return true
      }),
    [centros, fPais, fEstado, fCiudad],
  )

  const hayFiltro = Boolean(fPais || fEstado || fCiudad.trim())

  // Agrupa por país; dentro, ordena por cercanía si hay ubicación, si no por nombre.
  const porPais = useMemo(() => {
    const grupos = new Map<string, CentroAcopio[]>()
    for (const c of centrosFiltrados) {
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
  }, [centrosFiltrados, yo])

  async function usarMiUbicacion() {
    try {
      const u = await obtenerUbicacion()
      setYo({ lat: u.lat, lng: u.lng })
    } catch {
      /* sin ubicación: queda el orden por nombre */
    }
  }

  // El dueño (o un admin) puede borrar el centro que creó.
  async function borrarCentro(c: CentroAcopio) {
    if (!confirm(`¿Eliminar el centro "${c.nombre}"?`)) return
    const { error } = await supabase
      .from('centros_acopio')
      .delete()
      .eq('id', c.id)
    if (error) alert('No se pudo eliminar: ' + error.message)
    else cargar()
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="relative flex items-center justify-center">
        <Link
          to="/"
          className="absolute left-0 text-bandera-azul font-semibold"
        >
          ← Mapa
        </Link>
        <h1 className="text-2xl font-extrabold text-bandera-azul text-center">
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
          onCreado={() => {
            setAbrirForm(false)
            cargar()
          }}
        />
      )}

      {/* Filtros: país (mundo) · estado · ciudad */}
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-2">
        <SelectorBandera
          opciones={[
            { value: '', iso: '', etiqueta: 'Todos los países' },
            ...paisesDisponibles.map(
              (p): OpcionBandera => ({ value: p, iso: isoDe(p), etiqueta: p }),
            ),
          ]}
          valor={fPais}
          onChange={(v) => {
            setFPais(v)
            setFEstado('')
          }}
          placeholder="Todos los países"
        />
        <select
          className="input"
          value={fEstado}
          onChange={(e) => setFEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {estadosDisponibles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Buscar ciudad…"
          value={fCiudad}
          onChange={(e) => setFCiudad(e.target.value)}
        />
      </div>
      {hayFiltro && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {centrosFiltrados.length} resultado(s)
          </span>
          <button
            onClick={() => {
              setFPais('')
              setFEstado('')
              setFCiudad('')
            }}
            className="text-bandera-rojo font-semibold"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : centros.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          Aún no hay centros de acopio registrados.
        </div>
      ) : centrosFiltrados.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          No hay centros que coincidan con el filtro.
        </div>
      ) : (
        porPais.map(([pais, lista]) => (
          <section key={pais} className="space-y-2">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Bandera iso={isoDe(pais)} />
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
                  {(c.ciudad || c.direccion || c.estado) && (
                    <div className="text-sm text-gray-600">
                      📍{' '}
                      {[c.direccion, c.ciudad, c.estado]
                        .filter(Boolean)
                        .join(', ')}
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
                <div className="flex flex-col gap-2">
                  <a
                    href={enlaceComoLlegar(c.lat, c.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-amber py-2 px-3 text-sm whitespace-nowrap no-underline text-center"
                  >
                    <IconoRuta className="mr-1" /> Cómo llegar
                  </a>
                  {c.contacto && (
                    <a
                      href={enlaceWhatsApp(c.contacto)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-verde py-2 px-3 text-sm whitespace-nowrap no-underline text-center"
                    >
                      💬 Contactar
                    </a>
                  )}
                  {(c.creado_por === perfil?.id || rol === 'admin') && (
                    <button
                      onClick={() => borrarCentro(c)}
                      className="py-2 px-3 text-sm whitespace-nowrap rounded-2xl font-bold border-2 border-bandera-rojo text-bandera-rojo"
                    >
                      🗑️ Borrar
                    </button>
                  )}
                </div>
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
  onCreado,
}: {
  creadoPor: string | null
  onCreado: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [pais, setPais] = useState('Venezuela')
  const [region, setRegion] = useState('') // estado / región
  const [ciudad, setCiudad] = useState('')
  const [direccion, setDireccion] = useState('')
  const [contacto, setContacto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [gps, setGps] = useState<'idle' | 'buscando' | 'error'>('idle')
  const [estado, setEstado] = useState<'idle' | 'guardando'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const hayUbicacion = !Number.isNaN(parseFloat(lat)) && !Number.isNaN(parseFloat(lng))

  async function usarGPS() {
    setGps('buscando')
    try {
      const u = await obtenerUbicacion()
      setLat(u.lat.toFixed(6))
      setLng(u.lng.toFixed(6))
      setGps('idle')
    } catch {
      setGps('error')
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const nLat = parseFloat(lat)
    const nLng = parseFloat(lng)
    if (Number.isNaN(nLat) || Number.isNaN(nLng)) {
      setErrorMsg('La ubicación es obligatoria. Toca “Usar mi ubicación GPS”.')
      return
    }
    setEstado('guardando')
    const { error } = await supabase.from('centros_acopio').insert({
      nombre: nombre.trim(),
      pais: pais.trim() || 'Venezuela',
      estado: region.trim() || null,
      ciudad: ciudad.trim() || null,
      direccion: direccion.trim() || null,
      contacto: contacto.trim() || null,
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
        <SelectorBandera
          opciones={PAISES_MUNDO.map((p) => ({
            value: p.nombre,
            iso: p.iso,
            etiqueta: p.nombre,
          }))}
          valor={pais}
          onChange={(v) => {
            setPais(v)
            setRegion('')
          }}
        />
        {pais === 'Venezuela' ? (
          <select
            className="input"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            <option value="">Estado…</option>
            {ESTADOS_VENEZUELA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            placeholder="Estado / región"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        )}
      </div>
      <input
        className="input"
        placeholder="Ciudad"
        value={ciudad}
        onChange={(e) => setCiudad(e.target.value)}
      />
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
      <div>
        <p className="text-sm font-semibold mb-1">
          Contacto del encargado (WhatsApp)
        </p>
        <EntradaTelefono valor={contacto} onChange={setContacto} />
        <p className="text-xs text-gray-500 mt-1">
          Para que la gente pueda escribirte y coordinar la ayuda.
        </p>
      </div>
      {/* Ubicación obligatoria */}
      <div
        className={`rounded-xl border-2 p-3 ${
          hayUbicacion ? 'border-green-300 bg-green-50' : 'border-gray-200'
        }`}
      >
        <p className="font-semibold text-sm mb-2">
          Ubicación del centro <span className="text-bandera-rojo">*</span>
        </p>
        <button
          type="button"
          onClick={usarGPS}
          disabled={gps === 'buscando'}
          className="btn-azul w-full disabled:opacity-70"
        >
          {gps === 'buscando' ? (
            <>
              <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Detectando ubicación…
            </>
          ) : hayUbicacion ? (
            <>🔄 Actualizar mi ubicación</>
          ) : (
            <>📍 Usar mi ubicación GPS</>
          )}
        </button>
        {hayUbicacion && (
          <p className="text-sm text-green-700 mt-2">
            ✅ Ubicación lista: {parseFloat(lat).toFixed(4)},{' '}
            {parseFloat(lng).toFixed(4)}
          </p>
        )}
        {gps === 'error' && (
          <p className="text-sm text-bandera-rojo mt-2">
            No pudimos obtener tu ubicación. Activa el GPS e inténtalo de nuevo.
          </p>
        )}
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
