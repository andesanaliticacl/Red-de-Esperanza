import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  obtenerUbicacion,
  geocodificarDireccion,
  parsearCoordenadas,
  paisPorCoordenadas,
  paisPorTexto,
  distanciaMetros,
  enlaceComoLlegar,
} from '../lib/geo'

/**
 * País a MOSTRAR de un centro. Los scrapeados (con id_fuente) guardaron mal el
 * país (el scraper puso "Venezuela" por defecto aunque estén en España,
 * Argentina, EE. UU.…). Como su ubicación SÍ es correcta, lo deducimos: primero
 * por el TEXTO (nombre/dirección, que separa bien casos de frontera como
 * Texas→EE. UU.) y, si no, por las COORDENADAS. Los creados por usuarios (sin
 * id_fuente) ya tienen el país bueno.
 */
function paisMostrado(c: CentroAcopio): string {
  if (!c.id_fuente) return c.pais
  const texto = [c.nombre, c.direccion, c.ciudad, c.estado]
    .filter(Boolean)
    .join(' ')
  return paisPorTexto(texto) ?? paisPorCoordenadas(c.lat, c.lng) ?? c.pais
}
import SelectorPunto from '../components/SelectorPunto'
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
import { type CentroAcopio } from '../lib/types'
import { zonasDePais, ciudadesDeZona } from '../lib/zonas'

export default function CentrosAcopioView() {
  const { perfil, rol } = useAuth()
  const puedeRegistrar = rol === 'centro_acopio' || rol === 'admin'
  // El admin y el "acopio_admin" pueden editar CUALQUIER centro (agregarle
  // teléfono, red social, corregir dirección…), no solo el que crearon.
  const puedeEditarTodo = rol === 'acopio_admin' || rol === 'admin'

  const [centros, setCentros] = useState<CentroAcopio[]>([])
  const [cargando, setCargando] = useState(true)
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null)
  const [abrirForm, setAbrirForm] = useState(false)
  // Centro que se está editando (null = ninguno).
  const [editando, setEditando] = useState<CentroAcopio | null>(null)

  // Filtros
  const [fPais, setFPais] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fCiudad, setFCiudad] = useState('')

  async function cargar() {
    // Supabase devuelve máx. 1000 filas por defecto: subimos el tope para que
    // NO se queden fuera los centros de países con pocos (España, EE. UU.,
    // Argentina…) y así aparezcan en el filtro por país.
    const { data } = await supabase
      .from('centros_acopio')
      .select('*')
      .order('pais', { ascending: true })
      .limit(10000)
    setCentros((data ?? []) as CentroAcopio[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  // Opciones de filtro derivadas de los datos existentes.
  const paisesDisponibles = useMemo(
    () => [...new Set(centros.map(paisMostrado).filter(Boolean))].sort(),
    [centros],
  )
  const estadosDisponibles = useMemo(
    () =>
      [
        ...new Set(
          centros
            .filter((c) => !fPais || paisMostrado(c) === fPais)
            .map((c) => c.estado)
            .filter((x): x is string => Boolean(x)),
        ),
      ].sort(),
    [centros, fPais],
  )

  const centrosFiltrados = useMemo(
    () =>
      centros.filter((c) => {
        if (fPais && paisMostrado(c) !== fPais) return false
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
      const k = paisMostrado(c) || 'Otro'
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

      {/* Editar un centro existente (admin / acopio_admin / dueño). */}
      {editando && (
        <FormCentro
          creadoPor={perfil?.id ?? null}
          centro={editando}
          onCancelar={() => setEditando(null)}
          onCreado={() => {
            setEditando(null)
            cargar()
          }}
        />
      )}

      {abrirForm && puedeRegistrar && !editando && (
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
                  {c.red_social && (
                    <a
                      href={
                        c.red_social.startsWith('http')
                          ? c.red_social
                          : `https://${c.red_social}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 text-sm whitespace-nowrap rounded-2xl font-bold border-2 border-bandera-azul text-bandera-azul no-underline text-center"
                    >
                      🔗 Red social
                    </a>
                  )}
                  {(puedeEditarTodo || c.creado_por === perfil?.id) && (
                    <button
                      onClick={() => {
                        setEditando(c)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="py-2 px-3 text-sm whitespace-nowrap rounded-2xl font-bold border-2 border-bandera-azul text-bandera-azul"
                    >
                      ✏️ Editar
                    </button>
                  )}
                  {(c.creado_por === perfil?.id || puedeEditarTodo) && (
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
  centro,
  onCreado,
  onCancelar,
}: {
  creadoPor: string | null
  /** Si se pasa, el formulario EDITA ese centro en vez de crear uno nuevo. */
  centro?: CentroAcopio
  onCreado: () => void
  onCancelar?: () => void
}) {
  const editar = Boolean(centro)
  const [nombre, setNombre] = useState(centro?.nombre ?? '')
  const [pais, setPais] = useState(centro?.pais ?? 'Venezuela')
  const [region, setRegion] = useState(centro?.estado ?? '') // estado / región…
  const [ciudad, setCiudad] = useState(centro?.ciudad ?? '')
  // Al editar dejamos escribir la ciudad libremente (ya viene rellena).
  const [ciudadOtra, setCiudadOtra] = useState(Boolean(centro?.ciudad))
  const [direccion, setDireccion] = useState(centro?.direccion ?? '')
  const [contacto, setContacto] = useState(centro?.contacto ?? '')
  const [redSocial, setRedSocial] = useState(centro?.red_social ?? '')
  const [descripcion, setDescripcion] = useState(centro?.descripcion ?? '')
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    centro ? { lat: centro.lat, lng: centro.lng } : null,
  )
  const [coordsTexto, setCoordsTexto] = useState('')
  const [gps, setGps] = useState<'idle' | 'buscando' | 'error'>('idle')
  const [geoEstado, setGeoEstado] = useState<'idle' | 'buscando'>('idle')
  const [estado, setEstado] = useState<'idle' | 'guardando'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function consultaDireccion() {
    return [direccion, ciudad, region]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ')
  }

  async function usarGPS() {
    setGps('buscando')
    try {
      const u = await obtenerUbicacion()
      setCoord({ lat: u.lat, lng: u.lng })
      setGps('idle')
    } catch {
      setGps('error')
    }
  }

  // Busca la dirección (Google si hay clave; si no, OpenStreetMap) y centra el
  // pin ahí; luego se puede arrastrar al punto EXACTO.
  async function buscarDireccion() {
    const consulta = consultaDireccion()
    if (!consulta) {
      setErrorMsg('Escribe la dirección (calle y ciudad) para buscarla.')
      return
    }
    setErrorMsg('')
    setGeoEstado('buscando')
    const g = await geocodificarDireccion(consulta, {
      pais: pais.trim() || 'Venezuela',
      cc: isoDe(pais),
    })
    setGeoEstado('idle')
    if (g) setCoord(g)
    else
      setErrorMsg(
        'No encontramos esa dirección. Arrastra el pin al lugar exacto, usa tu ubicación o pega coordenadas.',
      )
  }

  function aplicarCoordsTexto() {
    const c = parsearCoordenadas(coordsTexto)
    if (c) {
      setCoord(c)
      setErrorMsg('')
    } else {
      setErrorMsg('Coordenadas no válidas. Ejemplo: 10.5061, -66.9146')
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    // El número de contacto es OBLIGATORIO: es el que verá la gente para
    // coordinar la ayuda (botón "Contactar").
    if (contacto.replace(/\D/g, '').length < 8) {
      setErrorMsg(
        'El número de contacto es obligatorio (con su código de país).',
      )
      return
    }

    let pt = coord
    // Si aún no hay punto pero sí dirección, intentamos geocodificar al guardar.
    if (!pt) {
      const consulta = consultaDireccion()
      if (consulta) {
        pt = await geocodificarDireccion(consulta, {
          pais: pais.trim() || 'Venezuela',
          cc: isoDe(pais),
        })
      }
    }
    if (!pt) {
      setErrorMsg(
        'Falta la ubicación: busca la dirección, arrastra el pin, usa tu ubicación o pega coordenadas.',
      )
      return
    }

    setEstado('guardando')
    const datos = {
      nombre: nombre.trim(),
      pais: pais.trim() || 'Venezuela',
      estado: region.trim() || null,
      ciudad: ciudad.trim() || null,
      direccion: direccion.trim() || null,
      contacto: contacto.trim() || null,
      red_social: redSocial.trim() || null,
      descripcion: descripcion.trim() || null,
      lat: pt.lat,
      lng: pt.lng,
    }
    const { error } = editar
      ? await supabase
          .from('centros_acopio')
          .update(datos)
          .eq('id', centro!.id)
      : await supabase
          .from('centros_acopio')
          .insert({ ...datos, creado_por: creadoPor })
    if (error) {
      setErrorMsg(error.message)
      setEstado('idle')
    } else {
      onCreado()
    }
  }

  // División territorial según el país (Estado / Región / Provincia / Dpto…) y
  // ciudades sugeridas para la zona elegida. Igual que en el registro de cuenta.
  const isoPais = isoDe(pais)
  const zonaInfo = zonasDePais(isoPais)
  const ciudadesSugeridas = ciudadesDeZona(isoPais, region)

  return (
    <form
      onSubmit={guardar}
      className={`card space-y-3 border-2 ${
        editar ? 'border-bandera-azul' : 'border-green-200'
      }`}
    >
      <h3 className="font-bold">
        {editar ? `✏️ Editar: ${centro!.nombre}` : 'Registrar centro de acopio'}
      </h3>
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
            setCiudad('')
            setCiudadOtra(false)
          }}
        />
        {/* Región/Estado/Provincia/Departamento: menú según el país. */}
        {zonaInfo.opciones.length > 0 ? (
          <select
            className="input"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value)
              setCiudad('')
              setCiudadOtra(false)
            }}
          >
            <option value="">{zonaInfo.etiqueta}…</option>
            {zonaInfo.opciones.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            placeholder={zonaInfo.etiqueta}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value)
              setCiudad('')
              setCiudadOtra(false)
            }}
          />
        )}
      </div>
      {/* Ciudad: menú si tenemos lista para esa zona; "Otra…" deja escribir. */}
      {ciudadesSugeridas.length > 0 && !ciudadOtra ? (
        <select
          className="input"
          value={ciudad}
          onChange={(e) => {
            if (e.target.value === '__otra__') {
              setCiudadOtra(true)
              setCiudad('')
            } else {
              setCiudad(e.target.value)
            }
          }}
        >
          <option value="">Ciudad…</option>
          {ciudadesSugeridas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__otra__">✏️ Otra ciudad…</option>
        </select>
      ) : (
        <input
          className="input"
          placeholder="Ciudad"
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
        />
      )}
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
          Contacto del encargado (WhatsApp){' '}
          <span className="text-bandera-rojo">*</span>
        </p>
        <EntradaTelefono valor={contacto} onChange={setContacto} requerido />
        <p className="text-xs text-gray-500 mt-1">
          <strong>Obligatorio.</strong> Es el número que verá la gente para
          coordinar la ayuda (botón "💬 Contactar").
        </p>
      </div>
      <input
        className="input"
        placeholder="Red social o enlace (Instagram, web…) — opcional"
        value={redSocial}
        onChange={(e) => setRedSocial(e.target.value)}
      />
      {/* Ubicación: buscar dirección (Google/OSM) y AJUSTAR el pin al punto exacto. */}
      <div
        className={`rounded-xl border-2 p-3 ${
          coord ? 'border-green-300 bg-green-50' : 'border-gray-200'
        }`}
      >
        <p className="font-semibold text-sm mb-1">
          Ubicación del centro <span className="text-bandera-rojo">*</span>
        </p>
        <p className="text-xs text-gray-500 mb-2">
          Busca la dirección y <strong>arrastra el pin</strong> al lugar exacto
          (también puedes tocar el mapa).
        </p>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={buscarDireccion}
            disabled={geoEstado === 'buscando'}
            className="btn-azul flex-1 py-2.5 text-sm disabled:opacity-60"
          >
            {geoEstado === 'buscando' ? 'Buscando…' : '🔎 Buscar dirección'}
          </button>
          <button
            type="button"
            onClick={usarGPS}
            disabled={gps === 'buscando'}
            className="btn-amber flex-1 py-2.5 text-sm disabled:opacity-60"
          >
            {gps === 'buscando' ? 'Buscando…' : '📍 Mi ubicación'}
          </button>
        </div>

        <SelectorPunto
          coord={coord}
          onCambio={(la, ln) => setCoord({ lat: la, lng: ln })}
        />

        {coord ? (
          <p className="text-xs text-green-700 mt-1.5">
            ✅ Punto fijado: {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          </p>
        ) : (
          <p className="text-xs text-amber-700 mt-1.5">
            Aún sin punto. Busca la dirección o toca el mapa.
          </p>
        )}

        <details className="mt-2">
          <summary className="text-xs text-bandera-azul font-semibold cursor-pointer">
            📌 Pegar coordenadas de Google Maps (opcional)
          </summary>
          <div className="flex gap-2 mt-2">
            <input
              className="input text-sm"
              placeholder="Ej: 10.5061, -66.9146"
              value={coordsTexto}
              onChange={(e) => setCoordsTexto(e.target.value)}
            />
            <button
              type="button"
              onClick={aplicarCoordsTexto}
              className="btn-gris py-2 px-3 text-sm"
            >
              Usar
            </button>
          </div>
        </details>

        {gps === 'error' && (
          <p className="text-sm text-bandera-rojo mt-2">
            No pudimos obtener tu ubicación. Activa el GPS e inténtalo de nuevo.
          </p>
        )}
      </div>
      {errorMsg && (
        <div className="rounded-xl border-2 border-bandera-rojo bg-red-50 p-3 text-sm font-semibold text-bandera-rojo">
          ⚠️ {errorMsg}
        </div>
      )}
      <div className="flex gap-2">
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="btn-gris flex-1"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={estado === 'guardando'}
          className={`${editar ? 'btn-azul' : 'btn-verde'} flex-1 disabled:opacity-60`}
        >
          {estado === 'guardando'
            ? 'Guardando…'
            : editar
              ? 'Guardar cambios'
              : 'Guardar centro'}
        </button>
      </div>
    </form>
  )
}
