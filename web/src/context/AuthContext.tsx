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

  // Carga el perfil; si no existe (registro nuevo), lo CREA desde los datos
  // que se guardaron al registrarse (user_metadata). Antes esto lo hacía un
  // trigger en la base de datos, pero ahora se hace aquí para que el registro
  // nunca falle por la BD.
  async function asegurarPerfil(user: {
    id: string
    email?: string
    user_metadata?: Record<string, unknown>
  }) {
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    if (data) {
      setPerfil(data as Perfil)
      return
    }

    // No tiene perfil todavía → lo creamos con lo que escribió en el registro.
    const m = (user.user_metadata ?? {}) as Record<string, string>
    let rol = ['voluntario', 'rescatista', 'centro_acopio'].includes(m.rol)
      ? m.rol
      : 'ciudadano'
    // Voluntario/rescatista solo en Venezuela.
    if (
      (rol === 'voluntario' || rol === 'rescatista') &&
      (m.pais || 'Venezuela') !== 'Venezuela'
    ) {
      rol = 'ciudadano'
    }
    const nombre = m.nombre || user.email || 'Usuario'
    const completo = {
      id: user.id,
      nombre,
      email: user.email || null,
      rol,
      tipo_documento: m.tipo_documento || null,
      documento: m.documento || null,
      telefono: m.telefono || null,
      ciudad: m.ciudad || null,
      estado: m.estado || null,
      pais: m.pais || null,
    }

    let res = await supabase.from('perfiles').insert(completo).select().maybeSingle()
    if (res.error) {
      // Respaldo: si el insert completo falla, creamos un perfil mínimo.
      res = await supabase
        .from('perfiles')
        .insert({ id: user.id, nombre, rol })
        .select()
        .maybeSingle()
    }
    setPerfil((res.data as Perfil | null) ?? (completo as unknown as Perfil))
  }

  async function refrescarPerfil() {
    if (session?.user) await asegurarPerfil(session.user)
  }

  useEffect(() => {
    let activo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return
      setSession(data.session)
      if (data.session?.user) await asegurarPerfil(data.session.user)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s?.user) await asegurarPerfil(s.user)
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
