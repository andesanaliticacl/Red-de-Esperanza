import { useState } from 'react'
import EntradaTelefono from './EntradaTelefono'
import SelectorBandera from './SelectorBandera'
import { PAISES_MUNDO } from '../lib/paises'
import { crearSolicitudPsicologo } from '../lib/solicitudesPsicologo'
import type { TipoDocumento } from '../lib/types'

const OPCIONES_PAIS = PAISES_MUNDO.map((p) => ({
  value: p.nombre,
  iso: p.iso,
  etiqueta: p.nombre,
}))

/**
 * Formulario para pedir ser psicólogo/a: NO otorga el rol, crea una
 * solicitud que revisa el equipo de psicología (admin o líder de
 * psicología). Teléfono obligatorio; documento validado (cédula/pasaporte
 * venezolano o RUT/pasaporte chileno).
 */
export default function SolicitarPsicologoModal({
  nombreInicial,
  telefonoInicial,
  paisInicial,
  onCerrar,
  onEnviada,
}: {
  nombreInicial: string
  telefonoInicial: string
  paisInicial: string
  onCerrar: () => void
  onEnviada: () => void
}) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [telefono, setTelefono] = useState(telefonoInicial)
  const [pais, setPais] = useState(paisInicial || 'Venezuela')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('cedula')
  const [documento, setDocumento] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setEnviando(true)
    try {
      await crearSolicitudPsicologo({ nombre, telefono, pais, tipoDoc, documento, mensaje })
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
            🧠 Solicitar ser psicólogo/a
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
          Esto NO te da el rol de inmediato: el equipo de psicología revisa
          tu solicitud, te contacta por teléfono y, si corresponde, te
          otorga el rol.
        </p>

        <label className="block text-sm font-semibold">
          Nombre
          <input
            className="input mt-1"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>

        <div>
          <p className="text-sm font-semibold mb-1">
            Teléfono <span className="text-bandera-rojo">*</span>
          </p>
          <p className="text-xs text-gray-500 mb-1">
            Obligatorio: es cómo te contactará el equipo.
          </p>
          <EntradaTelefono valor={telefono} onChange={setTelefono} requerido />
        </div>

        <div>
          <p className="text-sm font-semibold mb-1">País</p>
          <SelectorBandera opciones={OPCIONES_PAIS} valor={pais} onChange={setPais} />
        </div>

        <div>
          <p className="text-sm font-semibold mb-1">Documento</p>
          <div className="flex gap-2 mb-2">
            {(['cedula', 'pasaporte'] as TipoDocumento[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTipoDoc(t)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold border-2 ${
                  tipoDoc === t
                    ? 'border-bandera-azul text-bandera-azul'
                    : 'border-gray-200 text-gray-500'
                }`}
              >
                {t === 'cedula' ? (pais === 'Chile' ? 'RUT' : 'Cédula') : 'Pasaporte'}
              </button>
            ))}
          </div>
          <input
            className="input"
            required
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder={
              tipoDoc === 'cedula'
                ? pais === 'Chile'
                  ? 'Ej: 12.345.678-5'
                  : 'Ej: V-12345678'
                : 'N.º de pasaporte'
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            Se valida: cédula/pasaporte venezolano o RUT/pasaporte chileno.
          </p>
        </div>

        <label className="block text-sm font-semibold">
          Mensaje (opcional)
          <textarea
            className="input mt-1 min-h-[70px]"
            maxLength={500}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Cuéntanos tu experiencia o motivación…"
          />
        </label>

        {errorMsg && (
          <p className="text-bandera-rojo text-sm font-semibold">⚠️ {errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="btn-azul w-full text-lg py-3 disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  )
}
