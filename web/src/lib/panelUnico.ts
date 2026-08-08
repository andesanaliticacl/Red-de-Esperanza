// Coordina que solo un panel flotante (campana de notificaciones, menú de
// usuario...) esté abierto a la vez.
//
// La campana y el menú viven en componentes separados, cada uno con su
// propio "abierto" y su propio panel fixed en la MISMA esquina (right-2
// top-16, mismo z-index). Si se abren los dos (p. ej. un toque en cada uno),
// ninguno le avisaba al otro que se cerrara: el que se pinta después queda
// literalmente encima, tapando por completo al primero. Por eso "la campana
// no se ve bien, la tapa el cuadrito de perfil".

const EVENTO = 'esperanza:panel-abierto'

/** Avisa que ESTE panel se abrió, para que cualquier otro se cierre. */
export function avisarPanelAbierto(id: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENTO, { detail: id }))
}

/**
 * Se suscribe a los avisos de apertura de OTROS paneles y llama a `cerrar`
 * cuando corresponde. Devuelve la función de limpieza para el useEffect.
 */
export function alAbrirOtroPanel(id: string, cerrar: () => void): () => void {
  function alEvento(e: Event) {
    const otroId = (e as CustomEvent<string>).detail
    if (otroId !== id) cerrar()
  }
  window.addEventListener(EVENTO, alEvento)
  return () => window.removeEventListener(EVENTO, alEvento)
}
