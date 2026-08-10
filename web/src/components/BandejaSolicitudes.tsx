import { useEffect, useState } from 'react'
import { ShieldCheck, Brain, Check, X, Clock } from 'lucide-react'
import {
  listarSolicitudesEntidad,
  revisarSolicitudEntidad,
  CATEGORIA_META,
  TIER_META,
  type SolicitudEntidad,
  type TierEntidad,
} from '../lib/entidades'
import {
  listarSolicitudesPsicologo,
  revisarSolicitudPsicologo,
  type SolicitudPsicologo,
} from '../lib/solicitudesPsicologo'
import { ICONO_CATEGORIA_ENTIDAD } from '../lib/iconosTipo'

/**
 * Bandeja única de solicitudes: entidades y psicólogos/as en una sola
 * pantalla, con una pestaña por fuente.
 *
 * Las dos fuentes viven en tablas distintas A PROPÓSITO: el circuito de
 * psicología ya trae asignación y seguimiento de pacientes, y unificarlo
 * sería romper algo que funciona a cambio de elegancia. Lo que se unifica
 * es la BANDEJA, que es donde de verdad molestaba tener dos lugares.
 */

/** Formas rápidas de verificar, para no dejar el campo en blanco. */
const METODOS_SUGERIDOS = [
  'Llamada al número publicado en su sitio oficial',
  'Correo desde dominio institucional',
  'Documento o credencial oficial',
  'Contacto conocido del equipo',
]

type Fuente = 'entidades' | 'psicologos'

export default function BandejaSolicitudes() {
  const [fuente, setFuente] = useState<Fuente>('entidades')
  const [entidades, setEntidades] = useState<SolicitudEntidad[]>([])
  const [psicologos, setPsicologos] = useState<SolicitudPsicologo[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  async function cargar() {
    setCargando(true)
    setErrorMsg('')
    try {
      const [e, p] = await Promise.all([
        listarSolicitudesEntidad().catch(() => [] as SolicitudEntidad[]),
        listarSolicitudesPsicologo().catch(() => [] as SolicitudPsicologo[]),
      ])
      setEntidades(e)
      setPsicologos(p)
    } catch (err) {
      setErrorMsg((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  const pendientesEnt = entidades.filter((s) => s.estado === 'pendiente')
  const pendientesPsi = psicologos.filter((s) => s.estado === 'pendiente')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-lg">Solicitudes</h2>
        <button onClick={cargar} className="text-sm font-semibold text-bandera-azul">
          Actualizar
        </button>
      </div>

      <div className="flex gap-1.5">
        <BotonFuente
          activo={fuente === 'entidades'}
          onClick={() => setFuente('entidades')}
          icono={ShieldCheck}
          etiqueta="Entidades"
          pendientes={pendientesEnt.length}
        />
        <BotonFuente
          activo={fuente === 'psicologos'}
          onClick={() => setFuente('psicologos')}
          icono={Brain}
          etiqueta="Psicólogos"
          pendientes={pendientesPsi.length}
        />
      </div>

      {errorMsg && (
        <p className="rounded-xl border-2 border-bandera-rojo bg-red-50 p-3 text-sm font-semibold text-bandera-rojo">
          {errorMsg}
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : fuente === 'entidades' ? (
        <ListaEntidades solicitudes={entidades} onCambio={cargar} />
      ) : (
        <ListaPsicologos solicitudes={psicologos} onCambio={cargar} />
      )}
    </div>
  )
}

function BotonFuente({
  activo,
  onClick,
  icono: Icono,
  etiqueta,
  pendientes,
}: {
  activo: boolean
  onClick: () => void
  icono: typeof ShieldCheck
  etiqueta: string
  pendientes: number
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
        activo
          ? 'border-bandera-azul bg-bandera-azul/10 text-bandera-azul'
          : 'border-gray-200 text-gray-500 hover:border-gray-300'
      }`}
    >
      <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
      {etiqueta}
      {pendientes > 0 && (
        <span className="rounded-full bg-bandera-rojo px-1.5 py-0.5 text-[11px] font-black text-white">
          {pendientes}
        </span>
      )}
    </button>
  )
}

// ============================================================
// Entidades
// ============================================================
function ListaEntidades({
  solicitudes,
  onCambio,
}: {
  solicitudes: SolicitudEntidad[]
  onCambio: () => void
}) {
  if (solicitudes.length === 0) {
    return <p className="text-sm text-gray-500">No hay solicitudes de entidades.</p>
  }
  return (
    <div className="space-y-3">
      {solicitudes.map((s) => (
        <FichaEntidad key={s.id} s={s} onCambio={onCambio} />
      ))}
    </div>
  )
}

function FichaEntidad({
  s,
  onCambio,
}: {
  s: SolicitudEntidad
  onCambio: () => void
}) {
  const meta = CATEGORIA_META[s.categoria]
  const Icono = ICONO_CATEGORIA_ENTIDAD[s.categoria]
  const [abierto, setAbierto] = useState(false)
  const [tier, setTier] = useState<TierEntidad>(meta?.tierSugerido ?? 'verificada')
  const [metodo, setMetodo] = useState('')
  const [nota, setNota] = useState('')
  // La categoría solo sugiere: una municipalidad chica puede ir liberada y
  // una ONG grande puede aportar, así que la decisión final es del admin.
  const [facturable, setFacturable] = useState(
    meta?.facturablePorDefecto ?? false,
  )
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function revisar(aprobar: boolean) {
    // Verificar de verdad es el producto: una insignia sin proceso detrás
    // es peor que no tener insignia, porque la gente confía y no debería.
    if (aprobar && !metodo.trim()) {
      setErrorMsg('Indica cómo verificaste la entidad antes de aprobarla.')
      return
    }
    // La base también lo rechaza, pero avisar aquí evita el viaje.
    if (aprobar && facturable && !s.id_fiscal) {
      setErrorMsg(
        'No se puede marcar como facturable: la solicitud no trae RUT/RIF.',
      )
      return
    }
    setGuardando(true)
    setErrorMsg('')
    try {
      await revisarSolicitudEntidad({
        id: s.id,
        aprobar,
        tier,
        metodo,
        nota,
        facturable,
      })
      onCambio()
    } catch (e) {
      setErrorMsg((e as Error).message)
      setGuardando(false)
    }
  }

  const pendiente = s.estado === 'pendiente'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-suave">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <Icono className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-tinta-800 leading-tight">{s.nombre}</p>
          <p className="text-xs text-tinta-500">
            {meta?.etiqueta ?? s.categoria}
            {s.profesion ? ` · ${s.profesion}` : ''}
          </p>
          <p className="text-xs text-tinta-500 mt-0.5">
            {[s.ciudad, s.zona, s.pais].filter(Boolean).join(', ') || 'Sin zona'}
          </p>
        </div>
        <EtiquetaEstado estado={s.estado} />
      </div>

      {s.descripcion && (
        <p className="mt-2 text-sm text-tinta-600">{s.descripcion}</p>
      )}

      <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-tinta-600">
        <Dato etiqueta="Teléfono" valor={s.telefono} />
        <Dato etiqueta="Correo" valor={s.email_contacto} />
        <Dato etiqueta="Web" valor={s.web} />
        <Dato etiqueta="Documento" valor={s.documento} />
        <Dato etiqueta="Mensaje" valor={s.mensaje} />
      </dl>

      {/* Datos de facturación, si los trajo. Se muestran aparte porque son
          de otra naturaleza: con estos se emite la factura. */}
      {(s.razon_social || s.id_fiscal) && (
        <dl className="mt-2 grid grid-cols-1 gap-1 rounded-xl bg-amber-50/70 p-2.5 text-xs text-tinta-700">
          <p className="font-bold text-amber-900">Facturación</p>
          <Dato etiqueta="Razón social" valor={s.razon_social} />
          <Dato etiqueta="RUT / RIF" valor={s.id_fiscal} />
          <Dato etiqueta="Dirección" valor={s.direccion_fiscal} />
          <Dato etiqueta="Correo facturas" valor={s.contacto_facturacion} />
        </dl>
      )}

      {!pendiente && s.nota_revision && (
        <p className="mt-2 text-xs text-tinta-500">
          Nota: {s.nota_revision}
        </p>
      )}

      {pendiente && !abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="btn-azul w-full mt-3 py-2 text-sm"
        >
          Revisar
        </button>
      )}

      {pendiente && abierto && (
        <div className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3">
          <div>
            <p className="text-xs font-bold text-tinta-700 mb-1.5">
              Nivel de confianza
            </p>
            <div className="grid gap-1.5">
              {(Object.keys(TIER_META) as TierEntidad[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  aria-pressed={tier === t}
                  className={`rounded-xl border-2 p-2 text-left text-xs transition-colors ${
                    tier === t
                      ? 'border-bandera-azul bg-white'
                      : 'border-transparent bg-white/60 hover:border-gray-200'
                  }`}
                >
                  <span
                    className="block font-bold"
                    style={{ color: TIER_META[t].color }}
                  >
                    {TIER_META[t].etiqueta}
                  </span>
                  <span className="block text-tinta-500 leading-snug">
                    {TIER_META[t].descripcion}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-tinta-700 mb-1">
              ¿Cómo lo verificaste? <span className="text-bandera-rojo">*</span>
            </p>
            <p className="text-[11px] text-tinta-500 mb-1.5">
              Se muestra en el perfil público. Llama al número que publica la
              institución en su sitio, no al que dejaron aquí.
            </p>
            <input
              className="input text-sm"
              placeholder="Ej: llamada al +56 51 220 0000 del sitio municipal"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {METODOS_SUGERIDOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className="rounded-full bg-white border border-gray-200 px-2 py-1 text-[11px] text-tinta-600 hover:border-bandera-azul"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl bg-white p-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-bandera-azul"
              checked={facturable}
              onChange={(e) => setFacturable(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-tinta-800">
                Se le factura
              </span>
              <span className="block text-[11px] leading-snug text-tinta-500">
                {s.id_fiscal
                  ? `Se facturará a ${s.razon_social ?? s.nombre} (${s.id_fiscal}).`
                  : 'No trae RUT/RIF, así que no se puede marcar todavía.'}
              </span>
            </span>
          </label>

          <input
            className="input text-sm"
            placeholder="Nota interna (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />

          {errorMsg && (
            <p className="text-xs font-semibold text-bandera-rojo">{errorMsg}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => revisar(false)}
              disabled={guardando}
              className="btn-gris flex-1 py-2 text-sm disabled:opacity-60"
            >
              <X className="h-4 w-4 inline" aria-hidden="true" /> Rechazar
            </button>
            <button
              onClick={() => revisar(true)}
              disabled={guardando}
              className="btn-verde flex-1 py-2 text-sm disabled:opacity-60"
            >
              <Check className="h-4 w-4 inline" aria-hidden="true" />{' '}
              {guardando ? 'Guardando…' : 'Aprobar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Psicólogos (circuito propio, ver comentario de arriba)
// ============================================================
function ListaPsicologos({
  solicitudes,
  onCambio,
}: {
  solicitudes: SolicitudPsicologo[]
  onCambio: () => void
}) {
  const [guardando, setGuardando] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function revisar(id: string, aprobar: boolean) {
    setGuardando(id)
    setErrorMsg('')
    try {
      await revisarSolicitudPsicologo(id, aprobar)
      onCambio()
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setGuardando(null)
    }
  }

  if (solicitudes.length === 0) {
    return <p className="text-sm text-gray-500">No hay solicitudes de psicólogos.</p>
  }

  return (
    <div className="space-y-3">
      {errorMsg && (
        <p className="text-xs font-semibold text-bandera-rojo">{errorMsg}</p>
      )}
      {solicitudes.map((s) => (
        <div
          key={s.id}
          className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-suave"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700">
              <Brain className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-tinta-800 leading-tight">
                {s.nombre}
              </p>
              <p className="text-xs text-tinta-500">{s.pais ?? 'Sin país'}</p>
            </div>
            <EtiquetaEstado estado={s.estado} />
          </div>

          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-tinta-600">
            <Dato etiqueta="Teléfono" valor={s.telefono} />
            <Dato etiqueta="Documento" valor={s.documento} />
            <Dato etiqueta="Mensaje" valor={s.mensaje} />
          </dl>

          {s.estado === 'pendiente' && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => revisar(s.id, false)}
                disabled={guardando === s.id}
                className="btn-gris flex-1 py-2 text-sm disabled:opacity-60"
              >
                Rechazar
              </button>
              <button
                onClick={() => revisar(s.id, true)}
                disabled={guardando === s.id}
                className="btn-verde flex-1 py-2 text-sm disabled:opacity-60"
              >
                {guardando === s.id ? 'Guardando…' : 'Aprobar'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Piezas compartidas
// ============================================================
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="flex gap-1.5">
      <dt className="font-semibold shrink-0">{etiqueta}:</dt>
      <dd className="min-w-0 break-words">{valor}</dd>
    </div>
  )
}

function EtiquetaEstado({ estado }: { estado: string }) {
  const meta =
    estado === 'aprobada'
      ? { texto: 'Aprobada', clase: 'bg-green-100 text-green-800' }
      : estado === 'rechazada'
        ? { texto: 'Rechazada', clase: 'bg-gray-100 text-gray-600' }
        : { texto: 'Pendiente', clase: 'bg-amber-100 text-amber-800' }
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.clase}`}
    >
      {estado === 'pendiente' && <Clock className="h-3 w-3" aria-hidden="true" />}
      {meta.texto}
    </span>
  )
}
