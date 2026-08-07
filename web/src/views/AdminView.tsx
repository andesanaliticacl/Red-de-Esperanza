import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useNecesidades } from '../hooks/useNecesidades'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  listarCatastrofes,
  crearCatastrofe,
  type Catastrofe,
} from '../lib/catastrofes'
import {
  ROL_META,
  TIPO_META,
  TIPOS_ALERTA,
  COLOR_ROL,
  type Perfil,
  type RolUsuario,
} from '../lib/types'

// País de un rescatista según el PREFIJO de su teléfono (+56 Chile, +58
// Venezuela). Si el número no tiene un prefijo reconocible, se usa el país
// del perfil como respaldo; si tampoco, "Otro".
function paisDeRescatista(p: Perfil): 'Chile' | 'Venezuela' | 'Otro' {
  const tel = (p.telefono ?? '').replace(/\s+/g, '')
  if (tel.startsWith('+56')) return 'Chile'
  if (tel.startsWith('+58')) return 'Venezuela'
  const pais = (p.pais ?? '').trim().toLowerCase()
  if (pais === 'chile') return 'Chile'
  if (pais === 'venezuela') return 'Venezuela'
  return 'Otro'
}

// PAUSADO: 'verificador' se mantiene fuera de la lista mientras la verificación
// está oculta. Para reactivarla, vuelve a añadirlo aquí.
const ROLES: RolUsuario[] = [
  'ciudadano',
  'voluntario',
  'rescatista',
  'psicologo',
  'centro_acopio',
  'acopio_admin',
  'lider_voluntarios',
  'lider_psicologo',
  'admin',
]

type Pestana = 'resumen' | 'alertas' | 'usuarios' | 'visitas'

const PESTANAS: { v: Pestana; etiqueta: string }[] = [
  { v: 'resumen', etiqueta: '📊 Resumen' },
  { v: 'alertas', etiqueta: '🔔 Alertas' },
  { v: 'usuarios', etiqueta: '👥 Usuarios' },
  { v: 'visitas', etiqueta: '🌍 Visitas' },
]

/** Filas por página en la tabla de usuarios. */
const POR_PAGINA = 50

export default function AdminView() {
  const { necesidades } = useNecesidades([
    'sin_verificar',
    'verificada',
    'en_proceso',
    'resuelta',
  ])
  // Solo la página visible de la tabla (no todos los usuarios).
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [conteoPorRol, setConteoPorRol] = useState<Record<RolUsuario, number>>(
    {} as Record<RolUsuario, number>,
  )
  const [totalUsuarios, setTotalUsuarios] = useState(0)
  const [rescatistas, setRescatistas] = useState<
    Pick<Perfil, 'telefono' | 'pais'>[]
  >([])
  const [pagina, setPagina] = useState(0)
  const [totalFiltrado, setTotalFiltrado] = useState(0)
  const [cargandoTabla, setCargandoTabla] = useState(false)
  const [visitas, setVisitas] = useState<{ pais: string | null }[]>([])
  // Filtro de usuarios por nombre, correo o teléfono.
  const [busqUsuario, setBusqUsuario] = useState('')
  const [pestana, setPestana] = useState<Pestana>('resumen')
  // Cambio de rol pendiente de confirmar (un clic al azar no debe hacer admin
  // a nadie).
  const [cambioRol, setCambioRol] = useState<{
    perfil: Perfil
    rol: RolUsuario
  } | null>(null)
  // Catástrofes: las define aquí la coordinación (migración 57). Con país y
  // ciudad, la app asigna sola el evento de cada reporte y quien pide ayuda
  // no tiene que elegir nada.
  const [catastrofes, setCatastrofes] = useState<Catastrofe[]>([])
  const [catNombre, setCatNombre] = useState('')
  const [catPais, setCatPais] = useState('')
  const [catCiudad, setCatCiudad] = useState('')
  const [catGuardando, setCatGuardando] = useState(false)
  const [catError, setCatError] = useState('')

  async function cargarCatastrofes() {
    try {
      setCatastrofes(await listarCatastrofes())
    } catch {
      setCatastrofes([])
    }
  }

  async function crearCatastrofeNueva() {
    setCatGuardando(true)
    setCatError('')
    try {
      const nueva = await crearCatastrofe(catNombre, catPais, catCiudad)
      setCatastrofes((prev) => [nueva, ...prev])
      setCatNombre('')
      setCatPais('')
      setCatCiudad('')
    } catch (e) {
      setCatError((e as Error).message)
    } finally {
      setCatGuardando(false)
    }
  }

  // Antes se descargaban TODOS los perfiles al abrir (en páginas de 1000)
  // solo para contarlos y pintar la tabla. Con miles de usuarios eso es lento
  // y trae al navegador correos y teléfonos que no hacen falta. Ahora:
  //  · los conteos se piden al servidor (solo el número, sin filas),
  //  · la tabla se pagina y se busca también en el servidor.

  /** Cuántos usuarios hay de cada rol, sin traerse las filas. */
  async function cargarConteos() {
    const pares = await Promise.all(
      ROLES.map(async (r) => {
        const { count } = await supabase
          .from('perfiles')
          .select('id', { count: 'exact', head: true })
          .eq('rol', r)
        return [r, count ?? 0] as const
      }),
    )
    const mapa = Object.fromEntries(pares) as Record<RolUsuario, number>
    setConteoPorRol(mapa)
    setTotalUsuarios(Object.values(mapa).reduce((a, b) => a + b, 0))
  }

  /** Solo los rescatistas, y solo las dos columnas que necesita el desglose
   *  por país. Son pocos comparados con el total de usuarios. */
  async function cargarRescatistas() {
    const { data } = await supabase
      .from('perfiles')
      .select('telefono, pais')
      .eq('rol', 'rescatista')
      .limit(5000)
    setRescatistas((data ?? []) as Pick<Perfil, 'telefono' | 'pais'>[])
  }

  /** Una página de la tabla, con la búsqueda aplicada en el servidor. */
  async function cargarPagina(pagina: number, busqueda: string) {
    setCargandoTabla(true)
    const desde = pagina * POR_PAGINA
    let consulta = supabase
      .from('perfiles')
      .select('*', { count: 'exact' })
      .order('creado_en', { ascending: true })
      .range(desde, desde + POR_PAGINA - 1)

    const q = busqueda.trim()
    if (q) {
      const patron = `%${q}%`
      consulta = consulta.or(
        `nombre.ilike.${patron},email.ilike.${patron},telefono.ilike.${patron}`,
      )
    }

    const { data, count } = await consulta
    setPerfiles((data ?? []) as Perfil[])
    setTotalFiltrado(count ?? 0)
    setCargandoTabla(false)
  }

  async function cargarVisitas() {
    const { data } = await supabase.from('visitas').select('pais').limit(100000)
    if (data) setVisitas(data as { pais: string | null }[])
  }

  useEffect(() => {
    cargarConteos()
    cargarRescatistas()
    cargarVisitas()
    cargarCatastrofes()
  }, [])

  // La tabla se recarga al cambiar de página. La búsqueda espera 350 ms para
  // no lanzar una consulta por cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => void cargarPagina(pagina, busqUsuario), 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, busqUsuario])

  // Al escribir una búsqueda nueva se vuelve a la primera página (si no, se
  // podría quedar en la página 5 de un resultado que solo tiene una).
  useEffect(() => {
    setPagina(0)
  }, [busqUsuario])

  // Visitantes únicos y desglose por país (de mayor a menor).
  const totalVisitas = visitas.length
  const visitasPorPais = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of visitas) {
      const p = v.pais?.trim() || 'Desconocido'
      m.set(p, (m.get(p) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [visitas])

  // Conteo de usuarios por rol (lo cuenta el servidor, no el navegador).
  const conteoRoles = useMemo(
    () => ROLES.map((rol) => ({ rol, n: conteoPorRol[rol] ?? 0 })),
    [conteoPorRol],
  )

  // Rescatistas separados por país (por prefijo del teléfono).
  const rescatistasPorPais = useMemo(() => {
    const m = { Venezuela: 0, Chile: 0, Otro: 0 }
    for (const r of rescatistas) {
      m[paisDeRescatista(r as Perfil)] += 1
    }
    return m
  }, [rescatistas])
  const totalRescatistas =
    rescatistasPorPais.Venezuela +
    rescatistasPorPais.Chile +
    rescatistasPorPais.Otro

  const stats = useMemo(() => {
    const c = (estado: string) =>
      necesidades.filter((n) => n.estado === estado).length
    return {
      // Sin verificación: "recibidas" = nuevas + (datos previos ya verificados).
      recibidas: c('sin_verificar') + c('verificada'),
      en_proceso: c('en_proceso'),
      resuelta: c('resuelta'),
      voluntarios: (
        [
          'voluntario',
          'rescatista',
          'psicologo',
          'lider_voluntarios',
          'lider_psicologo',
        ] as RolUsuario[]
      ).reduce((suma, r) => suma + (conteoPorRol[r] ?? 0), 0),
    }
  }, [necesidades, conteoPorRol])

  // Conteo de alertas/necesidades por tipo (activas: no resueltas ni
  // rechazadas), para ver de un vistazo dónde está concentrada la demanda.
  const necesidadesPorTipo = useMemo(() => {
    const activas = necesidades.filter(
      (n) => n.estado !== 'resuelta' && n.estado !== 'rechazada',
    )
    return TIPOS_ALERTA.map((tipo) => ({
      tipo,
      n: activas.filter((n) => n.tipo === tipo).length,
    })).filter((t) => t.n > 0)
  }, [necesidades])
  const totalAlertasActivas = necesidadesPorTipo.reduce((a, t) => a + t.n, 0)

  async function confirmarCambioRol() {
    if (!cambioRol) return
    const { perfil, rol } = cambioRol
    setCambioRol(null)
    const { error } = await supabase
      .from('perfiles')
      .update({ rol })
      .eq('id', perfil.id)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    await Promise.all([cargarConteos(), cargarRescatistas()])
    await cargarPagina(pagina, busqUsuario)
  }

  /** Oculta la sección si su pestaña no es la activa. Se mantiene montada
   *  para no volver a pedir los datos al cambiar de pestaña. */
  const tab = (p: Pestana, extra = '') =>
    `${pestana === p ? '' : 'hidden'} ${extra}`.trim()

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Panel de administración
      </h1>

      {/* El panel era una sola página larguísima; ahora va por pestañas. */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 -mb-2">
        {PESTANAS.map((p) => (
          <button
            key={p.v}
            onClick={() => setPestana(p.v)}
            aria-current={pestana === p.v}
            className={`whitespace-nowrap px-3 py-2 text-sm font-bold border-b-2 -mb-px ${
              pestana === p.v
                ? 'border-bandera-azul text-bandera-azul'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* Panel de estadísticas */}
      <section className={tab('resumen', 'grid grid-cols-2 sm:grid-cols-5 gap-3')}>
        <Tarjeta n={totalAlertasActivas} etiqueta="🔔 Alertas activas" color="#CC0001" />
        <Tarjeta n={stats.recibidas} etiqueta="Recibidas" color="#475569" />
        <Tarjeta n={stats.en_proceso} etiqueta="En proceso" color="#002FA7" />
        <Tarjeta n={stats.resuelta} etiqueta="Resueltas" color="#0891B2" />
        <Tarjeta n={stats.voluntarios} etiqueta="Equipo activo" color="#CF9B00" />
      </section>

      {/* Alertas/necesidades activas por tipo */}
      {necesidadesPorTipo.length > 0 && (
        <section className={tab('alertas')}>
          <h2 className="font-bold text-lg mb-2">
            🔔 Alertas activas por tipo ({totalAlertasActivas})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {necesidadesPorTipo.map(({ tipo, n }) => (
              <Tarjeta
                key={tipo}
                n={n}
                etiqueta={`${TIPO_META[tipo].emoji} ${TIPO_META[tipo].etiqueta}`}
                color={TIPO_META[tipo].color}
              />
            ))}
          </div>
        </section>
      )}

      {/* Usuarios registrados por rol */}
      <section className={tab('usuarios')}>
        <h2 className="font-bold text-lg mb-2">
          Usuarios registrados ({totalUsuarios})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {conteoRoles.map(({ rol, n }) => (
            <Tarjeta
              key={rol}
              n={n}
              etiqueta={`${ROL_META[rol].emoji} ${ROL_META[rol].etiqueta}`}
              color={COLOR_ROL[rol]}
            />
          ))}
        </div>
      </section>

      {/* Rescatistas por país (según el prefijo del teléfono) */}
      <section className={tab('usuarios')}>
        <h2 className="font-bold text-lg mb-2">
          🚑 Rescatistas por país ({totalRescatistas})
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Tarjeta
            n={rescatistasPorPais.Venezuela}
            etiqueta="Venezuela (+58)"
            color="#CC0001"
          />
          <Tarjeta
            n={rescatistasPorPais.Chile}
            etiqueta="Chile (+56)"
            color="#0033A0"
          />
          <Tarjeta
            n={rescatistasPorPais.Otro}
            etiqueta="Otro / sin prefijo"
            color="#475569"
          />
        </div>
      </section>

      {/* Visitantes (personas que han usado la página) */}
      <section className={tab('visitas', 'card')}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">👥 Visitantes</h2>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-bandera-azul">
              {totalVisitas}
            </div>
            <div className="text-xs text-gray-500">personas (dispositivos)</div>
          </div>
        </div>
        {visitasPorPais.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aún sin datos de visitas (o falta correr la migración 23).
          </p>
        ) : (
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Por país</p>
            <ul className="space-y-1">
              {visitasPorPais.map(([pais, n]) => (
                <li
                  key={pais}
                  className="flex items-center justify-between text-sm border-b border-gray-100 pb-1"
                >
                  <span>{pais}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Catástrofes (eventos). Con país y ciudad, cada reporte se asigna
          solo al evento que le corresponde: quien pide ayuda no elige nada. */}
      <section className={tab('alertas')}>
        <h2 className="font-bold text-lg mb-2">
          🌊 Catástrofes ({catastrofes.length})
        </h2>
        <div className="card">
          <p className="text-sm text-gray-600 mb-3">
            El <b>país</b> y la <b>ciudad</b> son los que permiten asignar cada
            reporte automáticamente. Si dejas la ciudad vacía, el evento cubre
            todo el país.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className="input text-sm"
              placeholder="Nombre. Ej: Temporal de lluvias Chile"
              maxLength={80}
              value={catNombre}
              onChange={(e) => setCatNombre(e.target.value)}
            />
            <input
              className="input text-sm"
              placeholder="País. Ej: Chile"
              maxLength={40}
              value={catPais}
              onChange={(e) => setCatPais(e.target.value)}
            />
            <input
              className="input text-sm"
              placeholder="Ciudad (opcional). Ej: Coquimbo"
              maxLength={60}
              value={catCiudad}
              onChange={(e) => setCatCiudad(e.target.value)}
            />
          </div>

          {catError && (
            <p className="text-sm text-bandera-rojo font-semibold mt-2">
              ⚠️ {catError}
            </p>
          )}

          <button
            onClick={() => void crearCatastrofeNueva()}
            disabled={catGuardando || catNombre.trim().length < 3}
            className="btn-azul mt-3 disabled:opacity-60"
          >
            {catGuardando ? 'Creando…' : '➕ Crear catástrofe'}
          </button>

          {catastrofes.length > 0 && (
            <ul className="divide-y divide-gray-100 mt-4">
              {catastrofes.map((c) => (
                <li key={c.id} className="py-2">
                  <div className="font-semibold text-gray-900">{c.nombre}</div>
                  <div className="text-xs text-gray-500">
                    {[c.ciudad, c.pais].filter(Boolean).join(', ') ||
                      'Sin país ni ciudad — no se asignará sola'}
                    {' · creada el '}
                    {new Date(c.creado_en).toLocaleDateString('es-VE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Gestión de usuarios */}
      <section className={tab('usuarios')}>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h2 className="font-bold text-lg">Usuarios y roles</h2>
          <span className="text-sm text-gray-400">
            {cargandoTabla ? 'Cargando…' : `${totalFiltrado} en total`}
          </span>
        </div>
        <input
          type="search"
          value={busqUsuario}
          onChange={(e) => setBusqUsuario(e.target.value)}
          placeholder="🔎 Buscar por nombre, correo o teléfono…"
          className="input mb-2"
        />
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
                    {p.email && (
                      <div className="text-xs text-gray-500 break-all">
                        ✉️ {p.email}
                      </div>
                    )}
                    {p.telefono && (
                      <div className="text-xs text-gray-500">📞 {p.telefono}</div>
                    )}
                    {p.zona && (
                      <div className="text-xs text-gray-500">📍 {p.zona}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <select
                      className="rounded-lg border px-2 py-1.5"
                      value={p.rol}
                      onChange={(e) =>
                        setCambioRol({
                          perfil: p,
                          rol: e.target.value as RolUsuario,
                        })
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

        {/* Paginación: la tabla ya no descarga a todos los usuarios de golpe. */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            onClick={() => setPagina((n) => Math.max(0, n - 1))}
            disabled={pagina === 0 || cargandoTabla}
            className="btn-gris px-4 py-2 text-sm disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">
            Página {pagina + 1} de {Math.max(1, Math.ceil(totalFiltrado / POR_PAGINA))}
          </span>
          <button
            onClick={() => setPagina((n) => n + 1)}
            disabled={
              cargandoTabla ||
              (pagina + 1) * POR_PAGINA >= totalFiltrado
            }
            className="btn-gris px-4 py-2 text-sm disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </section>

      {/* Un clic al azar en el desplegable no debe convertir a nadie en
          administrador: se confirma antes. */}
      <ConfirmDialog
        abierto={cambioRol !== null}
        emoji="🛡️"
        titulo="¿Cambiar el rol?"
        mensaje={
          cambioRol
            ? `${cambioRol.perfil.nombre ?? 'Este usuario'} pasará de "${
                cambioRol.perfil.rol
              }" a "${cambioRol.rol}".`
            : undefined
        }
        textoConfirmar="Sí, cambiar"
        peligro={cambioRol?.rol === 'admin'}
        onConfirmar={() => void confirmarCambioRol()}
        onCancelar={() => setCambioRol(null)}
      />

      {/* Notas de cierre del equipo */}
      <section className={tab('resumen')}>
        <h2 className="font-bold text-lg mb-2">Notas de cierre</h2>
        <Link
          to="/notas-cierre"
          className="card flex items-center gap-3 no-underline"
        >
          <span className="text-2xl">📝</span>
          <div className="flex-1">
            <div className="font-semibold text-bandera-azul">
              Ver todas las notas de cierre
            </div>
            <div className="text-sm text-gray-600">
              Los comentarios que el equipo deja al cerrar cada caso.
            </div>
          </div>
          <span className="text-bandera-azul">→</span>
        </Link>
      </section>

      {/* Monitoreo de todas las conversaciones */}
      <section className={tab('resumen')}>
        <h2 className="font-bold text-lg mb-2">Conversaciones</h2>
        <Link
          to="/panel-x7k2/conversaciones"
          className="card flex items-center gap-3 no-underline"
        >
          <span className="text-2xl">💬</span>
          <div className="flex-1">
            <div className="font-semibold text-bandera-azul">
              Monitorear todas las conversaciones
            </div>
            <div className="text-sm text-gray-600">
              Revisa los chats entre quienes reportan y quienes atienden (solo
              lectura).
            </div>
          </div>
          <span className="text-bandera-azul">→</span>
        </Link>
      </section>

      {/* Scraping de personas desaparecidas */}
      <section className={tab('resumen')}>
        <h2 className="font-bold text-lg mb-2">Personas desaparecidas</h2>
        <Link
          to="/panel-x7k2/scraping"
          className="card flex items-center gap-3 no-underline"
        >
          <span className="text-2xl">🔍</span>
          <div className="flex-1">
            <div className="font-semibold text-bandera-azul">
              Ejecutar y administrar el scraping
            </div>
            <div className="text-sm text-gray-600">
              Actualiza el registro de desaparecidos y gestiona lo que se ve en
              el mapa.
            </div>
          </div>
          <span className="text-bandera-azul">→</span>
        </Link>
      </section>

      {/* Centros de acopio: gestión unificada (también internacionales) */}
      <section className={tab('resumen')}>
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

