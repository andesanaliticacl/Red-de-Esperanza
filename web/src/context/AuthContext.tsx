import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil, RolUsuario } from '../lib/types'

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  rol: RolUsuario | null // null = no autenticado (ciudadano anónimo)
  cargando: boolean
  refrescarPerfil: () => Promise<void>
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  async function cargarPerfil(userId: string) {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('No se pudo cargar el perfil:', error.message)
      setPerfil(null)
    } else {
      setPerfil(data as Perfil)
    }
  }

  async function refrescarPerfil() {
    if (session?.user) await cargarPerfil(session.user.id)
  }

  useEffect(() => {
    let activo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return
      setSession(data.session)
      if (data.session?.user) await cargarPerfil(data.session.user.id)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s?.user) await cargarPerfil(s.user.id)
      else setPerfil(null)
    })

    return () => {
      activo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setPerfil(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        rol: perfil?.rol ?? null,
        cargando,
        refrescarPerfil,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
