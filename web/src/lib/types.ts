// Tipos compartidos en toda la app web.

export type NecesidadTipo =
  | 'rescate'
  | 'atencion_psicologica'
  | 'agua_comida'
  | 'medicinas'
  | 'refugio'
  | 'derrumbe'
  | 'inundacion'
  | 'incendio'
  | 'sacos_arena'
  | 'zona_sin_atender'
  | 'zona_aislada'
  | 'mascota'
  | 'otro'
  | 'acopio'

export type NecesidadUrgencia = 'alta' | 'media' | 'baja'

export type NecesidadEstado =
  | 'sin_verificar'
  | 'verificada'
  | 'en_proceso'
  | 'resuelta'
  | 'rechazada'

export type RolUsuario =
  | 'ciudadano'
  | 'voluntario'
  | 'rescatista'
  | 'psicologo'
  | 'centro_acopio'
  | 'acopio_admin'
  | 'lider_voluntarios'
  | 'lider_psicologo'
  | 'verificador'
  | 'admin'

/** Roles que un usuario puede elegir al registrarse (sin verificador/admin). */
export type RolRegistro =
  | 'ciudadano'
  | 'voluntario'
  | 'rescatista'
  | 'psicologo'
  | 'centro_acopio'

export type TipoDocumento = 'cedula' | 'pasaporte'

export interface Necesidad {
  id: string
  tipo: NecesidadTipo
  urgencia: NecesidadUrgencia
  estado: NecesidadEstado
  descripcion: string
  zona: string | null
  lat: number | null
  lng: number | null
  /** Radio en km cuando el reporte es una ZONA (tipo zona_sin_atender). */
  radio_km: number | null
  /** Foto (URL pública) — solo para necesidades de tipo mascota. */
  foto_url?: string | null
  origen: string | null
  reportado_por: string | null
  asignado_a: string | null
  creado_en: string
  /** Ciclo de vida de 4 días: última renovación y cuántas veces se renovó. */
  ultimo_refresco?: string | null
  refrescos?: number
  /** Catástrofe (evento) a la que pertenece el reporte. Opcional. */
  catastrofe_id?: string | null
  // Borrado suave: un líder/admin la quitó del mapa (spam, duplicado, etc.).
  // Sigue en la base para dejar registro; deja de verse en el mapa público.
  eliminada_del_mapa?: boolean
  eliminada_en?: string | null
  eliminada_por?: string | null
  motivo_eliminacion?: string | null
  // Campos pesados/sensibles que no se traen en las vistas públicas.
  texto_crudo?: string | null
  verificada_por?: string | null
  actualizado_en?: string
}

export interface Mensaje {
  id: string
  necesidad_id: string
  autor: string
  cuerpo: string
  creado_en: string
}

/** Mensaje del chat global comunitario (agrupado por ciudad). */
export interface MensajeGlobal {
  id: string
  ciudad: string
  nombre: string
  cuerpo: string
  autor: string | null
  creado_en: string
  respuesta_a: string | null
  respuesta_nombre: string | null
  respuesta_cuerpo: string | null
}

/** Perfil mínimo público (para mostrar "atendido por …"). */
export interface PerfilPublico {
  id: string
  nombre: string | null
  rol: RolUsuario
  foto_url?: string | null
  ciudad?: string | null
}

export type EventoTipo =
  | 'cuenta_creada'
  | 'reporte_creado'
  | 'sos_creado'
  | 'reporte_verificado'
  | 'reporte_rechazado'
  | 'reporte_asignado'
  | 'reporte_resuelto'
  | 'mensaje_enviado'

export interface Evento {
  id: string
  tipo: EventoTipo
  necesidad_id: string | null
  actor: string | null
  rol_actor: RolUsuario | null
  datos: Record<string, unknown>
  creado_en: string
}

export interface EstadisticasUsuario {
  id: string
  nombre: string | null
  rol: RolUsuario
  ciudad: string | null
  estado: string | null
  reportes_creados: number
  sos_creados: number
  atendidos_resueltos: number
  verificaciones: number
  mensajes_enviados: number
  ultima_actividad: string | null
}

export interface CentroAcopio {
  id: string
  nombre: string
  descripcion: string | null
  pais: string
  estado: string | null
  ciudad: string | null
  direccion: string | null
  contacto: string | null
  /** Red social o enlace del centro (Instagram, web…). Opcional. */
  red_social: string | null
  lat: number
  lng: number
  creado_por: string | null
  creado_en: string
  /** Id en la web de origen: si está, vino del scraping (mostrar la fuente). */
  id_fuente: string | null
  /** Ciclo de vida de 4 días: última renovación y cuántas veces se renovó. */
  ultimo_refresco?: string | null
  refrescos?: number
  /** Los hospitales viven en esta tabla pero NUNCA vencen. */
  es_hospital?: boolean
  /** El centro atiende animales/mascotas (cambia el ícono en el mapa). */
  atiende_animales?: boolean
}

export interface Perfil {
  id: string
  nombre: string | null
  email: string | null
  rol: RolUsuario
  tipo_documento: TipoDocumento | null
  documento: string | null
  telefono: string | null
  ciudad: string | null
  estado: string | null
  pais: string | null
  zona: string | null
  foto_url: string | null
  creado_en: string
}

// Etiquetas legibles por rol.
export const ROL_META: Record<RolUsuario, { etiqueta: string; emoji: string }> = {
  ciudadano: { etiqueta: 'Ciudadano', emoji: '🙋' },
  voluntario: { etiqueta: 'Voluntario', emoji: '🤝' },
  rescatista: { etiqueta: 'Rescatista', emoji: '🚑' },
  psicologo: { etiqueta: 'Psicólogo/a', emoji: '🧠' },
  centro_acopio: { etiqueta: 'Centro de acopio', emoji: '📦' },
  acopio_admin: { etiqueta: 'Admin de centros de acopio', emoji: '🗂️' },
  lider_voluntarios: { etiqueta: 'Líder de voluntarios', emoji: '⭐' },
  lider_psicologo: { etiqueta: 'Psicólogo/a líder', emoji: '🧠' },
  verificador: { etiqueta: 'Verificador', emoji: '✅' },
  admin: { etiqueta: 'Administrador', emoji: '🛡️' },
}

// Estados de Venezuela (+ Distrito Capital) para el registro.
export const ESTADOS_VENEZUELA = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar',
  'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón',
  'Guárico', 'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas',
  'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo',
  'Yaracuy', 'Zulia',
] as const

// Metadatos visuales por tipo de necesidad.
export const TIPO_META: Record<
  NecesidadTipo,
  { etiqueta: string; emoji: string; color: string }
> = {
  rescate: { etiqueta: 'Rescate', emoji: '🆘', color: '#CC0001' },
  atencion_psicologica: {
    etiqueta: 'Apoyo emocional',
    emoji: '💙',
    color: '#7C3AED',
  },
  agua_comida: { etiqueta: 'Agua / Comida', emoji: '🥫', color: '#EA580C' },
  medicinas: { etiqueta: 'Medicinas', emoji: '💊', color: '#CF9B00' },
  refugio: { etiqueta: 'Refugio', emoji: '🏠', color: '#7C3AED' },
  derrumbe: { etiqueta: 'Edificio derrumbado', emoji: '🏚️', color: '#7F1D1D' },
  inundacion: { etiqueta: 'Inundación', emoji: '🌊', color: '#0369A1' },
  incendio: { etiqueta: 'Incendio', emoji: '🔥', color: '#C2410C' },
  sacos_arena: { etiqueta: 'Sacos de arena', emoji: '🧱', color: '#92400E' },
  zona_sin_atender: { etiqueta: 'Zona sin atender', emoji: '🚩', color: '#CC0001' },
  zona_aislada: { etiqueta: 'Zona aislada', emoji: '🏝️', color: '#4338CA' },
  mascota: { etiqueta: 'Mascota / animal', emoji: '🐾', color: '#B45309' },
  otro: { etiqueta: 'Otro', emoji: '❓', color: '#475569' },
  acopio: { etiqueta: 'Centro de acopio', emoji: '📦', color: '#16A34A' },
}

export const URGENCIA_META: Record<
  NecesidadUrgencia,
  { etiqueta: string; orden: number }
> = {
  alta: { etiqueta: 'Alta', orden: 0 },
  media: { etiqueta: 'Media', orden: 1 },
  baja: { etiqueta: 'Baja', orden: 2 },
}
