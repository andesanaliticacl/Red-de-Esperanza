import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  pushSoportado,
  permisoPush,
  yaSuscrito,
  activarPush,
  desactivarPush,
} from '../lib/push'

/**
 * Activar/desactivar los avisos que llegan con la app cerrada.
 *
 * Antes vivía DENTRO del panel de la campana y ocupaba su tercio superior
 * cada vez que alguien abría a leer sus notificaciones. Es configuración del
 * dispositivo, no un aviso, así que ahora va en el menú, junto a "Instalar
 * app", que es de la misma familia. La campana quedó solo con la lista.
 */
export default function BotonAvisosPush({ onAccion }: { onAccion?: () => void }) {
  const { perfil } = useAuth()
  const [suscrito, setSuscrito] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState('')

  const soporta = pushSoportado()

  useEffect(() => {
    if (soporta) void yaSuscrito().then(setSuscrito)
  }, [soporta])

  // Sin cuenta no hay a quién avisar; sin soporte no hay nada que ofrecer.
  if (!perfil?.id || !soporta) return null

  async function alternar() {
    if (!perfil?.id) return
    setTrabajando(true)
    setAviso('')
    try {
      if (suscrito) {
        await desactivarPush()
        setSuscrito(false)
        onAccion?.()
        return
      }
      const r = await activarPush(perfil.id)
      if (r.ok) {
        setSuscrito(true)
        onAccion?.()
      } else if (r.motivo === 'denegado') {
        setAviso('Los bloqueaste. Actívalos en los permisos del navegador.')
      } else if (r.motivo === 'no-soportado') {
        setAviso('En iPhone, primero instala la app (Compartir → Agregar a inicio).')
      } else {
        setAviso('No se pudo activar.')
      }
    } finally {
      setTrabajando(false)
    }
  }

  const Icono = suscrito ? Bell : BellOff

  return (
    <>
      <button
        onClick={() => void alternar()}
        disabled={trabajando}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
      >
        <Icono className="h-5 w-5 shrink-0 text-white/60" aria-hidden="true" />
        <span className="font-medium">
          {trabajando
            ? 'Un momento…'
            : suscrito
              ? 'Avisos activados'
              : 'Activar avisos'}
        </span>
      </button>
      {(aviso || permisoPush() === 'denied') && (
        <p className="px-4 pb-2 text-[11px] text-red-300">
          {aviso || 'Están bloqueados en el navegador.'}
        </p>
      )}
    </>
  )
}
