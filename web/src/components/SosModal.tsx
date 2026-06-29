import { useState } from 'react'
import { crearNecesidad } from '../lib/reportes'
import { obtenerUbicacion, type FuenteUbicacion } from '../lib/geo'
import EntradaTelefono from './EntradaTelefono'

// Número único de emergencias de Venezuela (VEN 911, nacional desde 2013).
const NUMERO_EMERGENCIA = '911'

/**
 * Vista EMERGENCIA: flujo de 2 toques.
 * (1) Usar mi ubicación → (2) Enviar SOS. Crea rescate/urgencia alta.
 */
export default function SosModal({ onCerrar }: { onCerrar: () => void }) {
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [fuente, setFuente] = useState<FuenteUbicacion | null>(null)
  const [paso, setPaso] = useState<'inicio' | 'listo' | 'enviado'>('inicio')
  const [texto, setTexto] = useState('')
  const [personas, setPersonas] = useState('')
  // Teléfono OBLIGATORIO con código de país, para que te puedan contactar.
  const [contacto, setContacto] = useState('')
  const [gps, setGps] = useState<'idle' | 'buscando' | 'error'>('idle')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function usarUbicacion() {
    setGps('buscando')
    try {
      const u = await obtenerUbicacion()
      setCoord({ lat: u.lat, lng: u.lng })
      setFuente(u.fuente)
      setGps('idle')
      setPaso('listo')
    } catch {
      setGps('error')
    }
  }

  async function enviarSOS() {
    // El teléfono es OBLIGATORIO: sin él, los rescatistas no pueden ubicarte.
    if (contacto.replace(/\D/g, '').length < 8) {
      setErrorMsg('Escribe tu número de teléfono (con código de país) para que puedan contactarte.')
      return
    }
    setEnviando(true)
    setErrorMsg('')
    const detalle = [
      texto.trim(),
      personas.trim() ? `Personas afectadas: ${personas.trim()}` : '',
    ]
      .filter(Boolean)
      .join('. ')
    try {
      await crearNecesidad({
        tipo: 'rescate',
        urgencia: 'alta',
        descripcion: detalle || 'SOS — Necesito rescate',
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        contacto,
        origen: 'sos',
      })
      setPaso('enviado')
    } catch (e) {
      setErrorMsg((e as Error).message || 'No se pudo enviar. Intenta de nuevo.')
      setEnviando(false)
    }
  }

  // Campo de teléfono obligatorio (con código de país). Se reutiliza en el
  // flujo normal y en el respaldo cuando falla el GPS.
  const campoTelefono = (
    <div className="w-full mb-4 text-left">
      <p className="text-sm font-bold mb-1">📱 Tu teléfono (obligatorio)</p>
      <p className="text-xs text-white/80 mb-2">
        Para que un rescatista te llame o te escriba por WhatsApp. Es privado.
      </p>
      <div className="text-black">
        <EntradaTelefono valor={contacto} onChange={setContacto} requerido />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[2000] bg-bandera-rojo/95 text-white flex flex-col p-6">
      <button
        onClick={onCerrar}
        className="self-end text-3xl leading-none"
        aria-label="Cerrar"
      >
        ✕
      </button>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto w-full">
        {paso === 'enviado' ? (
          <>
            <div className="text-6xl mb-4">🆘</div>
            <h2 className="text-3xl font-extrabold mb-3">Alerta enviada</h2>
            <p className="text-lg mb-2">
              Avisamos a los rescatistas y voluntarios cercanos. Mantén el
              teléfono contigo.
            </p>
            <p className="text-base mb-6 text-white/90">
              Si es una emergencia de vida o muerte, llama también a emergencias:
            </p>
            <a
              href={`tel:${NUMERO_EMERGENCIA}`}
              className="btn bg-white text-bandera-rojo w-full text-2xl py-6 no-underline mb-3"
            >
              📞 Llamar al {NUMERO_EMERGENCIA}
            </a>
            <button
              onClick={onCerrar}
              className="btn bg-white/20 text-white w-full"
            >
              Entendido
            </button>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">🆘</div>
            <h2 className="text-3xl font-extrabold mb-2">Necesito rescate</h2>
            <p className="text-lg mb-6 text-white/90">
              Enviaremos tu ubicación a los rescatistas.
            </p>

            {paso === 'inicio' ? (
              <button
                onClick={usarUbicacion}
                disabled={gps === 'buscando'}
                className="btn bg-white text-bandera-rojo w-full text-xl py-5 disabled:opacity-80"
              >
                {gps === 'buscando' ? (
                  <>
                    <span className="inline-block h-5 w-5 rounded-full border-2 border-bandera-rojo/30 border-t-bandera-rojo animate-spin" />
                    Buscando tu ubicación…
                  </>
                ) : (
                  <>📍 1. Usar mi ubicación</>
                )}
              </button>
            ) : (
              <>
                <p className="mb-4">
                  ✅ Ubicación lista
                  {coord && (
                    <span className="block text-sm text-white/80">
                      {coord.lat.toFixed(4)}, {coord.lng.toFixed(4)}
                      {fuente === 'ip' && ' (aproximada por red)'}
                    </span>
                  )}
                </p>
                <input
                  className="input text-black mb-3"
                  placeholder="Mensaje (opcional)"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <input
                  className="input text-black mb-4"
                  placeholder="¿A cuántas personas afecta? (opcional)"
                  inputMode="numeric"
                  value={personas}
                  onChange={(e) => setPersonas(e.target.value)}
                />
                {campoTelefono}
                <button
                  onClick={enviarSOS}
                  disabled={enviando}
                  className="btn bg-white text-bandera-rojo w-full text-2xl py-6 disabled:opacity-70"
                >
                  {enviando ? 'Enviando…' : '2. ENVIAR SOS'}
                </button>
              </>
            )}

            {gps === 'error' && (
              <div className="mt-4 space-y-3">
                <p className="text-white">
                  No pudimos obtener tu ubicación. Activa el GPS e intenta de
                  nuevo, o envía el SOS sin ubicación.
                </p>
                <button
                  onClick={usarUbicacion}
                  className="btn bg-white/20 text-white w-full"
                >
                  🔄 Reintentar ubicación
                </button>
                {campoTelefono}
                <button
                  onClick={enviarSOS}
                  disabled={enviando}
                  className="btn bg-white text-bandera-rojo w-full disabled:opacity-70"
                >
                  {enviando ? 'Enviando…' : 'Enviar SOS sin ubicación'}
                </button>
              </div>
            )}

            {errorMsg && <p className="mt-4 text-white font-semibold">⚠️ {errorMsg}</p>}

            <a
              href={`tel:${NUMERO_EMERGENCIA}`}
              className="mt-6 block text-white underline text-lg"
            >
              📞 ¿Vida o muerte? Llama al {NUMERO_EMERGENCIA}
            </a>
          </>
        )}
      </div>
    </div>
  )
}
