import { supabase } from './supabase'
import { esTelefonoValido, mensajeTelefono } from '../components/EntradaTelefono'
import { validarDocumentoPsicologo } from './documentos'
import type { TipoDocumento } from './types'

export interface SolicitudPsicologo {
  id: string
  perfil_id: string
  nombre: string
  telefono: string
  pais: string | null
  tipo_documento: TipoDocumento | null
  documento: string | null
  mensaje: string | null
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  revisado_por: string | null
  revisado_en: string | null
  nota_revision: string | null
  creado_en: string
}

const COLS =
  'id, perfil_id, nombre, telefono, pais, tipo_documento, documento, mensaje, estado, revisado_por, revisado_en, nota_revision, creado_en'

/**
 * Crea una solicitud para ser psicólogo/a. El teléfono es OBLIGATORIO (es
 * cómo el equipo va a contactar y verificar a la persona) y el documento se
 * valida igual que en el registro: cédula/pasaporte venezolano o RUT/
 * pasaporte chileno.
 */
export async function crearSolicitudPsicologo(args: {
  nombre: string
  telefono: string
  pais: string
  tipoDoc: TipoDocumento
  documento: string
  mensaje?: string
}): Promise<void> {
  const nombre = args.nombre.trim()
  if (!nombre) throw new Error('Escribe tu nombre.')
  if (!esTelefonoValido(args.telefono)) throw new Error(mensajeTelefono())

  const check = validarDocumentoPsicologo(args.pais, args.tipoDoc, args.documento)
  if (!check.valido) throw new Error(check.mensaje)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) {
    throw new Error('Debes iniciar sesión para enviar la solicitud.')
  }

  const { error } = await supabase.from('solicitudes_psicologo').insert({
    perfil_id: auth.user.id,
    nombre,
    telefono: args.telefono,
    pais: args.pais,
    tipo_documento: args.tipoDoc,
    documento: args.documento.trim(),
    mensaje: args.mensaje?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya tienes una solicitud pendiente de revisión.')
    }
    throw error
  }

  // Aviso best-effort por WhatsApp a los admins (no bloquea ni falla el
  // flujo si no está configurado: ver supabase/functions/notificar-solicitud-psicologo).
  void supabase.functions
    .invoke('notificar-solicitud-psicologo', {
      body: { nombre, telefono: args.telefono, pais: args.pais },
    })
    .catch(() => {})
}

/** Mis solicitudes (la más reciente primero) — para ver el estado de la mía. */
export async function misSolicitudesPsicologo(): Promise<SolicitudPsicologo[]> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) return []
  const { data, error } = await supabase
    .from('solicitudes_psicologo')
    .select(COLS)
    .eq('perfil_id', auth.user.id)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return (data ?? []) as SolicitudPsicologo[]
}

/** Todas las solicitudes (admin/lider_psicologo). Útil para el panel. */
export async function listarSolicitudesPsicologo(): Promise<SolicitudPsicologo[]> {
  const { data, error } = await supabase
    .from('solicitudes_psicologo')
    .select(COLS)
    .order('creado_en', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as SolicitudPsicologo[]
}

/** Aprueba (otorga el rol 'psicologo') o rechaza una solicitud. */
export async function revisarSolicitudPsicologo(
  id: string,
  aprobar: boolean,
  nota?: string,
): Promise<void> {
  const { error } = await supabase.rpc('revisar_solicitud_psicologo', {
    p_id: id,
    p_aprobar: aprobar,
    p_nota: nota?.trim() || null,
  })
  if (error) throw error
}
