import { Component, type ReactNode } from 'react'

/**
 * Captura errores de render (incluidos fallos al cargar un chunk lazy tras un
 * nuevo despliegue) para que la app NUNCA quede en pantalla en blanco: muestra
 * un mensaje y un botón para recargar.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false }

  static getDerivedStateFromError() {
    return { error: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Error capturado por ErrorBoundary:', error)
    // Si el fallo es por un chunk viejo (deploy nuevo), recargamos una vez.
    const msg = String((error as Error)?.message ?? '')
    if (/loading chunk|dynamically imported module|failed to fetch/i.test(msg)) {
      const ya = sessionStorage.getItem('esperanza.recargado')
      if (!ya) {
        sessionStorage.setItem('esperanza.recargado', '1')
        location.reload()
      }
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
          <div className="card max-w-sm text-center">
            <div className="text-4xl mb-2">🕊️</div>
            <h1 className="text-xl font-extrabold text-bandera-azul mb-2">
              Algo se interrumpió
            </h1>
            <p className="text-gray-600 mb-4 text-sm">
              Hubo un problema al mostrar esta pantalla. Vuelve a cargar para
              continuar.
            </p>
            <button
              onClick={() => location.reload()}
              className="btn-azul w-full"
            >
              🔄 Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
