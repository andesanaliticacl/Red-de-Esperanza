import { useState } from 'react'
import EntradaTelefono from './EntradaTelefono'
import {
  crearSolicitudEntidad,
  CATEGORIA_META,
  CATEGORIAS_ORDEN,
  PROFESIONES,
  PROFESION_OTRA,
  type CategoriaEntidad,
} from '../lib/entidades'
import { ICONO_CATEGORIA_ENTIDAD } from '../lib/iconosTipo'

/**
 * "Convertirme en entidad": para quien YA tiene cuenta (a diferencia del
 * registro, donde estos datos viajan en la metadata del signup). Usa
 * `crearSolicitudEntidad`, que existía en lib/entidades.ts desde la
 * migración 61 pero no estaba conectada a ninguna pantalla — el único
 * camino para pedir ser entidad era registrar una cuenta nueva. Alguien que
 * ya es "ciudadano" y quiere pasar a profesional/entidad no tenía forma de
 * hacerlo sin crear otra cuenta.
 *
 * NO otorga el rol de inmediato: crea una solicitud que revisa el admin
 * (BandejaSolicitudes), igual que el resto de las solicitudes de entidad.
 */
export default function SolicitarEntidadModal({
  nombreInicial,
  telefonoInicial,
  paisInicial,
  zonaInicial,
  ciudadInicial,
  onCerrar,
  onEnviada,
}: {
  nombreInicial: string
  telefonoInicial: string
  paisInicial: string
  zonaInicial: string
  ciudadInicial: string
  onCerrar: () => void
  onEnviada: () => void
}) {
  const [categoria, setCategoria] = useState<CategoriaEntidad | ''>('')
  const [nombre, setNombre] = useState('')
  const [profesion, setProfesion] = useState('')
  const [profesionOtra, setProfesionOtra] = useState('')
  const [telefono, setTelefono] = useState(telefonoInicial)
  const [mensaje, setMensaje] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [idFiscal, setIdFiscal] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const meta = categoria ? CATEGORIA_META[categoria] : null
  const esProfesional = categoria === 'profesional'
  const profesionFinal =
    profesion === PROFESION_OTRA ? profesionOtra.trim() : profesion

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!categoria) {
      setErrorMsg('Elige qué tipo de entidad representas.')
      return
    }
    setErrorMsg('')
    setEnviando(true)
    try {
      await crearSolicitudEntidad({
        nombre: esProfesional ? nombreInicial || nombre : nombre,
        categoria,
        profesion: esProfesional ? profesionFinal : undefined,
        telefono,
        mensaje,
        pais: paisInicial,
        zona: zonaInicial,
        ciudad: ciudadInicial,
        razon_social: meta?.facturablePorDefecto ? razonSocial : undefined,
        id_fiscal: meta?.facturablePorDefecto ? idFiscal : undefined,
      })
      onEnviada()
    } catch (err) {
      setErrorMsg((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2600] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
    >
      <form
        onSubmit={enviar}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold text-bandera-azul">
            Convertirme en entidad
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-600">
          Esto NO te da el rol de inmediato: el admin revisa tu solicitud y,
          si puede verificarte, la aprueba.
        </p>

        <div>
          <p className="text-sm font-semibold mb-1.5">¿Qué representas?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIAS_ORDEN.map((c) => {
              const Icono = ICONO_CATEGORIA_ENTIDAD[c]
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategoria(c)}
                  aria-pressed={categoria === c}
                  className={`flex items-center gap-1.5 rounded-xl border-2 p-2 text-left text-xs font-semibold ${
                    categoria === c
                      ? 'border-bandera-azul bg-bandera-azul/5 text-bandera-azul'
                      : 'border-gray-200 text-gray-600'
                  }`}
                >
                  <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {CATEGORIA_META[c].etiqueta}
                </button>
              )
            })}
          </div>
        </div>

        {categoria && !esProfesional && (
          <label className="block text-sm font-semibold">
            Nombre de la organización
            <input
              className="input mt-1"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Bomberos de Coquimbo"
            />
          </label>
        )}

        {esProfesional && (
          <div>
            <p className="text-sm font-semibold mb-1">Tu profesión</p>
            <select
              className="input"
              required
              value={profesion}
              onChange={(e) => setProfesion(e.target.value)}
            >
              <option value="" disabled>
                Elige una…
              </option>
              {PROFESIONES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {profesion === PROFESION_OTRA && (
              <input
                className="input mt-2"
                required
                value={profesionOtra}
                onChange={(e) => setProfesionOtra(e.target.value)}
                placeholder="¿Cuál?"
              />
            )}
          </div>
        )}

        {meta?.facturablePorDefecto && (
          <div className="space-y-2 rounded-xl bg-amber-50/70 border border-amber-100 p-2.5">
            <p className="text-xs font-bold text-amber-900">
              Datos para facturar
            </p>
            <input
              className="input text-sm"
              required
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Razón social (nombre legal)"
            />
            <input
              className="input text-sm"
              required
              value={idFiscal}
              onChange={(e) => setIdFiscal(e.target.value)}
              placeholder="RUT / NIT / RIF de la empresa"
            />
          </div>
        )}

        {categoria && (
          <>
            <div>
              <p className="text-sm font-semibold mb-1">
                Teléfono <span className="text-bandera-rojo">*</span>
              </p>
              <p className="text-xs text-gray-500 mb-1">
                Es como te verificamos, no se publica.
              </p>
              <EntradaTelefono valor={telefono} onChange={setTelefono} requerido />
            </div>

            <label className="block text-sm font-semibold">
              Mensaje (opcional)
              <textarea
                className="input mt-1 min-h-[60px]"
                maxLength={500}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Cuéntanos cómo podemos verificarte…"
              />
            </label>
          </>
        )}

        {errorMsg && (
          <p className="text-bandera-rojo text-sm font-semibold">⚠️ {errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={enviando || !categoria}
          className="btn-azul w-full text-lg py-3 disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  )
}
