import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import { supabase } from '../lib/supabase'
import EntradaTelefono from '../components/EntradaTelefono'
import ConfirmDialog from '../components/ConfirmDialog'
import InsigniaVerificado from '../components/InsigniaVerificado'
import {
  miEntidad,
  listarEntidadesCompletas,
  buscarCandidatoEquipo,
  verificarMiembroEquipo,
  quitarVerificacionEquipo,
  listarEquipoEntidad,
  TIER_META,
  CATEGORIA_META,
  type EntidadCompleta,
  type CandidatoEquipo,
  type MiembroEquipo,
} from '../lib/entidades'
import { TIPO_META, type Necesidad } from '../lib/types'

const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Panel donde una entidad verifica a sus propios rescatistas/voluntarios
 * (migración 64). Distinto de "editar entidad": esto NO toca el perfil
 * público ni los datos fiscales, solo dice "esta persona trabaja conmigo".
 *
 * El admin de la red puede gestionar el equipo de CUALQUIER entidad (elige
 * cuál desde el selector); el admin de una entidad solo ve y gestiona la
 * suya — la propia base ya rechaza cualquier intento de tocar otra
 * (`entidad_verificar_miembro` valida `es_admin_de_entidad`).
 */
export default function EntidadView() {
  const { rol } = useAuth()
  const { notificar } = useNotificaciones()
  const esAdminRed = rol === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()

  // Admin de red: elige qué entidad gestionar. Admin de entidad: la suya sola.
  const [entidades, setEntidades] = useState<EntidadCompleta[]>([])
  const [miPropiaEntidad, setMiPropiaEntidad] = useState<EntidadCompleta | null>(
    null,
  )
  const [cargandoEntidad, setCargandoEntidad] = useState(true)
  const entidadIdParam = searchParams.get('entidad')

  useEffect(() => {
    let vivo = true
    setCargandoEntidad(true)
    Promise.all([
      esAdminRed ? listarEntidadesCompletas() : Promise.resolve([]),
      miEntidad(),
    ])
      .then(([lista, propia]) => {
        if (!vivo) return
        setEntidades(lista)
        setMiPropiaEntidad(propia)
      })
      .finally(() => vivo && setCargandoEntidad(false))
    return () => {
      vivo = false
    }
  }, [esAdminRed])

  const entidad = useMemo(() => {
    if (esAdminRed && entidadIdParam) {
      return entidades.find((e) => e.id === entidadIdParam) ?? null
    }
    return miPropiaEntidad
  }, [esAdminRed, entidadIdParam, entidades, miPropiaEntidad])

  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  const [cargandoEquipo, setCargandoEquipo] = useState(false)
  const [actividad, setActividad] = useState<Necesidad[]>([])

  async function cargarEquipo(entidadId: string) {
    setCargandoEquipo(true)
    try {
      const lista = await listarEquipoEntidad(entidadId)
      setEquipo(lista)
      const ids = lista.map((m) => m.perfil_id)
      if (ids.length > 0) {
        const { data } = await supabase
          .from('necesidades')
          .select(
            'id, tipo, urgencia, estado, descripcion, zona, asignado_a, creado_en',
          )
          .in('asignado_a', ids)
          .gte('creado_en', FECHA_MINIMA_VISIBLE)
          .order('creado_en', { ascending: false })
          .limit(20)
        setActividad((data ?? []) as unknown as Necesidad[])
      } else {
        setActividad([])
      }
    } catch (e) {
      notificar('No se pudo cargar el equipo: ' + (e as Error).message, 'alerta')
    } finally {
      setCargandoEquipo(false)
    }
  }

  useEffect(() => {
    if (entidad) void cargarEquipo(entidad.id)
    else {
      setEquipo([])
      setActividad([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad?.id])

  // Buscar candidato por teléfono
  const [telBusqueda, setTelBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<CandidatoEquipo[] | null>(null)
  const [verificando, setVerificando] = useState<string | null>(null)

  async function buscar() {
    if (!telBusqueda.trim()) {
      notificar('Escribe el teléfono de la persona a buscar.', 'alerta')
      return
    }
    setBuscando(true)
    setResultados(null)
    try {
      const r = await buscarCandidatoEquipo(telBusqueda)
      setResultados(r)
      if (r.length === 0) {
        notificar(
          'No encontramos a nadie con ese teléfono y rol voluntario/rescatista.',
          'alerta',
        )
      }
    } catch (e) {
      notificar('No se pudo buscar: ' + (e as Error).message, 'alerta')
    } finally {
      setBuscando(false)
    }
  }

  async function verificar(c: CandidatoEquipo) {
    if (!entidad) return
    setVerificando(c.id)
    try {
      await verificarMiembroEquipo({ entidadId: entidad.id, perfilId: c.id })
      notificar(`✅ ${c.nombre ?? 'Persona'} verificada como parte de tu equipo.`, 'exito')
      setResultados(null)
      setTelBusqueda('')
      await cargarEquipo(entidad.id)
    } catch (e) {
      notificar('No se pudo verificar: ' + (e as Error).message, 'alerta')
    } finally {
      setVerificando(null)
    }
  }

  const [aQuitar, setAQuitar] = useState<MiembroEquipo | null>(null)
  async function confirmarQuitar() {
    const m = aQuitar
    setAQuitar(null)
    if (!m || !entidad) return
    try {
      await quitarVerificacionEquipo(m.perfil_id)
      notificar('Verificación retirada.', 'exito')
      await cargarEquipo(entidad.id)
    } catch (e) {
      notificar('No se pudo quitar: ' + (e as Error).message, 'alerta')
    }
  }

  if (cargandoEntidad) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center text-gray-500">
        Cargando…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul flex items-center gap-2">
        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        Mi equipo verificado
      </h1>
      <p className="text-sm text-gray-600">
        Verifica a los rescatistas y voluntarios que trabajan de verdad con tu
        entidad. Quedan con una insignia celeste visible en el chat, el mapa y
        en cualquier alerta que atiendan — así todos saben que son de tu
        equipo.
      </p>

      {esAdminRed && (
        <section className="card">
          <label className="block text-sm font-bold text-tinta-800 mb-1">
            Entidad a gestionar (como admin puedes elegir cualquiera)
          </label>
          <select
            className="input"
            value={entidadIdParam ?? miPropiaEntidad?.id ?? ''}
            onChange={(e) =>
              setSearchParams(
                e.target.value ? { entidad: e.target.value } : {},
              )
            }
          >
            <option value="">Elige una entidad…</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} · {CATEGORIA_META[e.categoria]?.etiqueta ?? e.categoria}
              </option>
            ))}
          </select>
        </section>
      )}

      {!entidad ? (
        <div className="card text-center text-gray-500 py-8">
          {esAdminRed
            ? 'Elige una entidad arriba para gestionar su equipo.'
            : 'Tu cuenta no administra ninguna entidad todavía.'}
        </div>
      ) : (
        <>
          <section className="card">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-extrabold text-lg">{entidad.nombre}</div>
                <span
                  className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: TIER_META[entidad.tier].color,
                    backgroundColor: `${TIER_META[entidad.tier].color}14`,
                  }}
                >
                  {TIER_META[entidad.tier].etiqueta}
                </span>
              </div>
              <Link
                to="/perfil"
                className="text-xs font-semibold text-bandera-azul no-underline"
              >
                Volver a mi perfil
              </Link>
            </div>
          </section>

          {/* Buscar y verificar */}
          <section className="card space-y-2">
            <h2 className="font-bold">Verificar a alguien nuevo</h2>
            <p className="text-xs text-gray-500">
              Pídele su número de teléfono (el mismo con el que se registró en
              la red) y búscalo aquí. Solo aparece si ya tiene cuenta como
              voluntario/a o rescatista.
            </p>
            <EntradaTelefono valor={telBusqueda} onChange={setTelBusqueda} />
            <button
              onClick={buscar}
              disabled={buscando}
              className="btn-azul w-full flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>

            {resultados && resultados.length > 0 && (
              <div className="space-y-2 pt-2">
                {resultados.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-tinta-200 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{c.nombre}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {c.rol} · {c.telefono}
                      </div>
                      {c.ya_verificado_por && (
                        <div className="text-xs font-semibold text-amber-600 mt-0.5">
                          {c.ya_verificado_por === entidad.id
                            ? 'Ya es parte de tu equipo.'
                            : `Ya está verificado por ${c.ya_verificado_entidad}.`}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => verificar(c)}
                      disabled={
                        verificando === c.id ||
                        c.ya_verificado_por === entidad.id ||
                        (!!c.ya_verificado_por &&
                          c.ya_verificado_por !== entidad.id &&
                          !esAdminRed)
                      }
                      className="btn-verde px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {verificando === c.id ? '…' : '✓ Verificar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Equipo actual */}
          <section>
            <h2 className="font-bold text-lg mb-2">
              Equipo verificado ({equipo.length})
            </h2>
            {cargandoEquipo ? (
              <div className="card text-center text-gray-500 py-6">
                Cargando…
              </div>
            ) : equipo.length === 0 ? (
              <div className="card text-center text-gray-500 py-6">
                Todavía no has verificado a nadie.
              </div>
            ) : (
              <div className="space-y-2">
                {equipo.map((m) => (
                  <div
                    key={m.perfil_id}
                    className="card flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate flex items-center gap-1.5">
                        {m.nombre}
                        <InsigniaVerificado
                          entidadNombre={entidad.nombre}
                          compacta
                        />
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {m.rol} · {m.telefono}
                      </div>
                      <div className="text-xs text-gray-400">
                        Verificado el {fechaCorta(m.verificado_en)}
                      </div>
                    </div>
                    <button
                      onClick={() => setAQuitar(m)}
                      className="text-tinta-400 hover:text-bandera-rojo p-2"
                      aria-label={`Quitar verificación de ${m.nombre}`}
                      title="Quitar verificación"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actividad reciente del equipo */}
          {actividad.length > 0 && (
            <section>
              <h2 className="font-bold text-lg mb-2">
                Actividad reciente de tu equipo
              </h2>
              <div className="space-y-2">
                {actividad.map((n) => (
                  <div key={n.id} className="card flex items-center gap-3">
                    <div className="text-2xl">{TIPO_META[n.tipo].emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">
                        {TIPO_META[n.tipo].etiqueta}
                        {n.zona ? ` · ${n.zona}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {n.estado === 'resuelta'
                          ? '✅ Resuelta'
                          : n.estado === 'en_proceso'
                            ? '🚑 En camino'
                            : n.estado}
                        {' · '}
                        {fechaCorta(n.creado_en)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        abierto={!!aQuitar}
        emoji="✋"
        titulo={`¿Quitar a ${aQuitar?.nombre ?? 'esta persona'} de tu equipo?`}
        mensaje="Dejará de aparecer como verificado/a por tu entidad."
        textoConfirmar="Sí, quitar"
        peligro
        onConfirmar={confirmarQuitar}
        onCancelar={() => setAQuitar(null)}
      />
    </div>
  )
}
