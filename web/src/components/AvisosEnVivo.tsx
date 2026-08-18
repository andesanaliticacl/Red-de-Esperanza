import { useEffect, useRef } from 'react'
import { useMovimientos } from '../hooks/useMovimientos'
import { useNotificaciones } from '../context/NotificacionesContext'

/**
 * Avisa de lo que va pasando en la red — SIN ocupar sitio en pantalla.
 *
 * Este componente no pinta nada. Cuando entra un reporte o una oferta, lanza
 * un aviso que se muestra unos segundos y se va solo.
 *
 * POR QUÉ ASÍ Y NO COMO UNA TIRA FIJA: se probaron las dos posiciones. Abajo
 * competía con SOS y Reportar por el borde inferior, que es el que más se usa
 * con una sola mano; arriba le quitaba sitio a los filtros. Medido a 320 px,
 * desplegada se comía el 52 % de la pantalla junto con los botones. Cualquier
 * lugar fijo le quita mapa a algo, y el mapa es lo que la gente vino a ver.
 *
 * Como aviso no ocupa NADA hasta que hay algo que contar, que era la idea
 * original: "que aparezca abajito como una notificación".
 *
 * Y no se pierde el historial: todo aviso queda guardado en la campana, así
 * que los últimos movimientos se siguen pudiendo revisar ahí.
 */
export default function AvisosEnVivo() {
  const movimientos = useMovimientos()
  const { notificar } = useNotificaciones()

  // Momento de montaje: lo anterior a esto es la carga inicial (las últimas
  // que ya habían pasado) y NO se avisa. Avisar de algo de hace tres días
  // como si acabara de ocurrir desinforma justo cuando más caro sale.
  const montadoEn = useRef(Date.now())
  const avisados = useRef(new Set<string>())

  useEffect(() => {
    for (const m of movimientos) {
      if (avisados.current.has(m.id)) continue
      avisados.current.add(m.id)

      // Lo anterior al montaje son los últimos movimientos que ya habían
      // pasado: entran a la campana pero NO saltan encima del mapa. Si
      // saltaran, al abrir la app te caerían cinco avisos de golpe, y encima
      // de cosas de hace horas.
      const previo = m.en <= montadoEn.current

      const que = `${m.emoji} ${m.clase === 'oferta' ? 'Ofrecen' : 'Piden'} ${m.etiqueta}`
      notificar(
        m.zona ? `${que} · ${m.zona}` : que,
        m.clase === 'oferta' ? 'exito' : 'info',
        // Solo las necesidades tienen enlace directo a su marcador; las
        // ofertas todavía no, así que ahí el aviso solo informa.
        m.clase === 'necesidad'
          ? { ruta: `/?necesidad=${m.id}`, etiqueta: 'Ver en el mapa' }
          : undefined,
        // Con la hora REAL del hecho, para que la campana los ordene bien y
        // ninguno aparente ser más reciente de lo que es.
        { silencioso: previo, ts: m.en },
      )
    }
  }, [movimientos, notificar])

  return null
}
