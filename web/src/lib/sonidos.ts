// Sonidos de notificación generados con la Web Audio API (sin archivos).
//  · Mensaje: dos tonos suaves ascendentes (discreto).
//  · SOS: sirena estridente que oscila y se repite (alarmante).

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      ctx = new AC()
    }
    // Los navegadores arrancan el contexto "suspendido" hasta que hay un gesto
    // del usuario; al estar navegando la app, reanudarlo aquí suele bastar.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tono(
  c: AudioContext,
  tipo: OscillatorType,
  f1: number,
  f2: number,
  inicio: number,
  dur: number,
  vol: number,
) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = tipo
  o.frequency.setValueAtTime(f1, inicio)
  if (f2 !== f1) {
    o.frequency.linearRampToValueAtTime(f2, inicio + dur / 2)
    o.frequency.linearRampToValueAtTime(f1, inicio + dur)
  }
  g.gain.setValueAtTime(0.0001, inicio)
  g.gain.linearRampToValueAtTime(vol, inicio + 0.02)
  g.gain.setValueAtTime(vol, inicio + dur - 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur)
  o.connect(g).connect(c.destination)
  o.start(inicio)
  o.stop(inicio + dur + 0.02)
}

/** Notificación de mensaje nuevo: discreta. */
export function sonarMensaje() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  tono(c, 'sine', 660, 660, t, 0.12, 0.18)
  tono(c, 'sine', 880, 880, t + 0.13, 0.14, 0.18)
}

/** Notificación de SOS: sirena alarmante y repetida. */
export function sonarSOS() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  // tres barridos tipo sirena, más fuertes y con onda estridente.
  for (let i = 0; i < 3; i++) {
    tono(c, 'sawtooth', 900, 440, t + i * 0.5, 0.45, 0.32)
  }
}
