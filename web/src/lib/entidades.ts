import { supabase } from './supabase'

/**
 * Entidades y profesionales verificados (migración 61).
 *
 * Una sola categoría de ROL ('entidad') para todas: lo que distingue a
 * bomberos de una junta vecinal es la CATEGORÍA y el TIER, que son datos.
 * Así las políticas de la base se escriben una vez y no hay que reescribir
 * media base cada vez que aparece un tipo nuevo de organización.
 */

export type CategoriaEntidad =
  | 'bomberos'
  | 'municipalidad'
  | 'rescate'
  | 'animal'
  | 'psicosocial'
  | 'junta_vecinal'
  | 'ong'
  | 'empresa'
  | 'profesional'

/**
 * Nivel de confianza que se muestra al público. Lo fija el equipo AL
 * APROBAR, según cómo pudo verificar: una insignia que cubre por igual a
 * bomberos y a una junta vecinal de doce casas deja de significar algo.
 */
export type TierEntidad = 'oficial' | 'verificada' | 'profesional'

export const TIER_META: Record<
  TierEntidad,
  { etiqueta: string; descripcion: string; color: string }
> = {
  oficial: {
    etiqueta: 'Entidad oficial',
    descripcion: 'Institución pública o reconocida, verificada por canal oficial.',
    color: '#0F766E',
  },
  verificada: {
    etiqueta: 'Organización verificada',
    descripcion: 'Organización real, verificada por el equipo de la red.',
    color: '#0369A1',
  },
  profesional: {
    etiqueta: 'Profesional verificado/a',
    descripcion: 'Persona con documento y profesión verificados.',
    color: '#7C3AED',
  },
}

/**
 * Categorías. `sede` indica si tiene un lugar físico que va al mapa: una
 * brigada de bomberos sí; un veterinario voluntario, no. `tierSugerido` es
 * solo el valor por defecto que ve el admin al revisar — la decisión final
 * es suya, porque es quien sabe qué tan bien pudo verificarla.
 *
 * El icono vive en `iconosTipo.tsx` (ICONO_CATEGORIA_ENTIDAD), como el
 * resto de los iconos de la app.
 */
export const CATEGORIA_META: Record<
  CategoriaEntidad,
  {
    etiqueta: string
    ejemplos: string
    sede: boolean
    tierSugerido: TierEntidad
    /** Si por defecto se le factura. Es solo la SUGERENCIA que ve el admin
     *  al aprobar: una municipalidad chica puede ir liberada y una ONG
     *  grande puede aportar, así que la decisión final es suya. */
    facturablePorDefecto: boolean
  }
> = {
  bomberos: {
    etiqueta: 'Bomberos o defensa civil',
    ejemplos: 'Cuerpo de bomberos, protección civil',
    sede: true,
    tierSugerido: 'oficial',
    facturablePorDefecto: false,
  },
  municipalidad: {
    etiqueta: 'Municipalidad o gobierno local',
    ejemplos: 'Alcaldía, gobernación, oficina de emergencias',
    sede: true,
    tierSugerido: 'oficial',
    facturablePorDefecto: true,
  },
  rescate: {
    etiqueta: 'Organismo de rescate',
    ejemplos: 'Brigada rescatista, Cruz Roja, socorro andino',
    sede: true,
    tierSugerido: 'oficial',
    facturablePorDefecto: false,
  },
  animal: {
    // Dice "ONG de animales" con todas sus letras: cuando la etiqueta era
    // solo "Rescate y ayuda animal", un refugio animalista no se daba por
    // aludido y buscaba una casilla de "ONG" que no existía.
    etiqueta: 'ONG de animales o rescate animal',
    ejemplos: 'Refugio, ONG animalista, brigada veterinaria, albergue',
    sede: true,
    tierSugerido: 'verificada',
    facturablePorDefecto: false,
  },
  psicosocial: {
    etiqueta: 'Apoyo psicológico o psicosocial',
    ejemplos: 'Fundación, red de contención emocional',
    sede: false,
    tierSugerido: 'verificada',
    facturablePorDefecto: false,
  },
  junta_vecinal: {
    etiqueta: 'Junta vecinal u organización del barrio',
    ejemplos: 'Junta de vecinos, comité de emergencia, ONG del pueblo',
    sede: true,
    tierSugerido: 'verificada',
    facturablePorDefecto: false,
  },
  // La casilla que faltaba: una fundación humanitaria que trabaja con
  // PERSONAS no era bomberos, ni rescate, ni animal, ni junta vecinal.
  ong: {
    etiqueta: 'ONG o fundación (ayuda a personas)',
    ejemplos: 'Fundación, corporación, banco de alimentos, albergue',
    sede: true,
    tierSugerido: 'verificada',
    facturablePorDefecto: false,
  },
  empresa: {
    etiqueta: 'Empresa privada',
    ejemplos: 'Compañía que aporta recursos, equipos o servicios',
    sede: true,
    tierSugerido: 'verificada',
    facturablePorDefecto: true,
  },
  profesional: {
    etiqueta: 'Soy profesional y ofrezco mi ayuda',
    ejemplos: 'Veterinario/a, médico/a, psicólogo/a…',
    sede: false,
    tierSugerido: 'profesional',
    facturablePorDefecto: false,
  },
}

/** Orden en que se muestran las categorías al registrarse. */
export const CATEGORIAS_ORDEN: CategoriaEntidad[] = [
  'bomberos',
  'rescate',
  'animal',
  'ong',
  'municipalidad',
  'junta_vecinal',
  'psicosocial',
  'empresa',
  'profesional',
]

/**
 * Psicólogo/a se ofrece en la misma lista que el resto (una sola puerta
 * para quien se registra), pero por detrás va a su circuito propio
 * —`solicitudes_psicologo`—, que ya trae asignación y seguimiento de
 * pacientes. Migrarlo a este flujo sería romper algo que funciona a cambio
 * de elegancia.
 */
export const PROFESION_PSICOLOGO = 'Psicólogo/a'

/** Al elegirla se habilita un campo para escribir cuál. */
export const PROFESION_OTRA = 'Otra'

/**
 * Profesiones sugeridas para la categoría 'profesional'. Es una lista corta
 * a propósito: sugiere las más pedidas y deja el resto por "Otra".
 *
 * Arquitecto/a o constructor/a no es un relleno: tras un terremoto, saber
 * si una casa se puede habitar es de lo primero que hace falta, y no lo
 * puede decir cualquiera.
 */
export const PROFESIONES = [
  PROFESION_PSICOLOGO,
  'Médico/a',
  'Enfermero/a',
  'Paramédico/a',
  'Veterinario/a',
  'Arquitecto/a o constructor/a',
  'Trabajador/a social',
  PROFESION_OTRA,
] as const

/** Lo que ve cualquiera: el perfil público, sin nada fiscal. */
export interface Entidad {
  id: string
  nombre: string
  categoria: CategoriaEntidad
  tier: TierEntidad
  profesion: string | null
  descripcion: string | null
  logo_url: string | null
  contacto_publico: string | null
  web: string | null
  pais: string | null
  zona: string | null
  ciudad: string | null
  lat: number | null
  lng: number | null
  verificada_en: string | null
  verificada_por: string | null
  metodo_verificacion: string | null
  suspendida: boolean
  creado_en: string
}

/**
 * La entidad COMPLETA, con lo fiscal. Solo la leen el admin y los miembros
 * de la propia entidad: la dirección fiscal y el correo de facturación no
 * son datos públicos (migración 62).
 */
export interface EntidadCompleta extends Entidad {
  /** Nombre legal, el que va en la factura. Casi nunca es el público:
   *  se muestra "Bomberos de Coquimbo" pero se factura a "Cuerpo de
   *  Bomberos de Coquimbo". Facturar con el nombre público rebota. */
  razon_social: string | null
  /** RUT de empresa (Chile), NIT (Colombia) o RIF (Venezuela). */
  id_fiscal: string | null
  direccion_fiscal: string | null
  contacto_facturacion: string | null
  facturable: boolean
}

export interface SolicitudEntidad {
  id: string
  perfil_id: string
  nombre: string
  categoria: CategoriaEntidad
  profesion: string | null
  descripcion: string | null
  pais: string | null
  zona: string | null
  ciudad: string | null
  telefono: string
  email_contacto: string | null
  web: string | null
  tipo_documento: string | null
  documento: string | null
  mensaje: string | null
  /** Sede marcada en el mapa (migración 63). Null en las que no tienen local. */
  direccion: string | null
  lat: number | null
  lng: number | null
  // Datos para facturar (migración 62). Se piden en el registro solo a las
  // categorías que se cobran; el resto los deja vacíos.
  razon_social: string | null
  id_fiscal: string | null
  direccion_fiscal: string | null
  contacto_facturacion: string | null
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  revisado_por: string | null
  revisado_en: string | null
  nota_revision: string | null
  entidad_id: string | null
  creado_en: string
}

const COLS_ENTIDAD =
  'id, nombre, categoria, tier, profesion, descripcion, logo_url, contacto_publico, web, pais, zona, ciudad, direccion, lat, lng, verificada_en, verificada_por, metodo_verificacion, suspendida, creado_en'

const COLS_ENTIDAD_COMPLETA = `${COLS_ENTIDAD}, razon_social, id_fiscal, direccion_fiscal, contacto_facturacion, facturable`

const COLS_SOLICITUD =
  'id, perfil_id, nombre, categoria, profesion, descripcion, pais, zona, ciudad, telefono, email_contacto, web, tipo_documento, documento, mensaje, direccion, lat, lng, razon_social, id_fiscal, direccion_fiscal, contacto_facturacion, estado, revisado_por, revisado_en, nota_revision, entidad_id, creado_en'

/** Datos que se mandan al registrarse como entidad (van en la metadata). */
export interface DatosSolicitudEntidad {
  nombre: string
  categoria: CategoriaEntidad
  profesion?: string
  descripcion?: string
  telefono?: string
  email_contacto?: string
  web?: string
  mensaje?: string
  /** Sede: dirección escrita y punto exacto marcado en el mapa. */
  direccion?: string
  lat?: number | null
  lng?: number | null
  razon_social?: string
  id_fiscal?: string
  direccion_fiscal?: string
  contacto_facturacion?: string
}

/**
 * Valida los datos antes de mandarlos. Devuelve el mensaje del primer
 * problema, o null si está todo bien. Se usa igual desde el registro (donde
 * aún no hay sesión) y desde el perfil.
 */
export function validarSolicitudEntidad(
  d: DatosSolicitudEntidad,
): string | null {
  if (!d.nombre.trim()) {
    return d.categoria === 'profesional'
      ? 'Escribe tu nombre y apellido.'
      : 'Escribe el nombre de la organización.'
  }
  if (d.categoria === 'profesional') {
    const p = d.profesion?.trim()
    // Vacío o el literal "Otra" sin especificar no sirven: "Otra" no le dice
    // nada a quien después busca a un profesional por lo que sabe hacer.
    if (!p || p === PROFESION_OTRA) return 'Indica tu profesión.'
  }
  // A las categorías que se facturan se les pide el identificador fiscal de
  // entrada: perseguirlo después de aprobar no funciona nunca, y sin él no
  // se puede emitir la factura.
  if (CATEGORIA_META[d.categoria].facturablePorDefecto) {
    if (!d.razon_social?.trim()) {
      return 'Escribe la razón social (el nombre legal que va en la factura).'
    }
    if (!d.id_fiscal?.trim()) {
      return 'Escribe el RUT de la empresa (Chile), el NIT (Colombia) o el RIF (Venezuela).'
    }
  }
  return null
}

/**
 * Crea la solicitud desde una sesión ya iniciada (p. ej. alguien que ya
 * tiene cuenta y quiere registrar su organización). En el REGISTRO no se usa
 * esto: allí los datos viajan en la metadata y la crea handle_new_user(),
 * porque si el correo exige confirmación todavía no hay sesión.
 */
export async function crearSolicitudEntidad(
  d: DatosSolicitudEntidad & { pais?: string; zona?: string; ciudad?: string },
): Promise<void> {
  const problema = validarSolicitudEntidad(d)
  if (problema) throw new Error(problema)

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) {
    throw new Error('Debes iniciar sesión para enviar la solicitud.')
  }

  const { error } = await supabase.from('solicitudes_entidad').insert({
    perfil_id: auth.user.id,
    nombre: d.nombre.trim(),
    categoria: d.categoria,
    profesion: d.profesion?.trim() || null,
    descripcion: d.descripcion?.trim() || null,
    pais: d.pais ?? null,
    zona: d.zona ?? null,
    ciudad: d.ciudad ?? null,
    telefono: d.telefono?.trim() || 'sin telefono',
    email_contacto: d.email_contacto?.trim() || null,
    web: d.web?.trim() || null,
    mensaje: d.mensaje?.trim() || null,
    direccion: d.direccion?.trim() || null,
    lat: d.lat ?? null,
    lng: d.lng ?? null,
    razon_social: d.razon_social?.trim() || null,
    id_fiscal: d.id_fiscal?.trim() || null,
    direccion_fiscal: d.direccion_fiscal?.trim() || null,
    contacto_facturacion: d.contacto_facturacion?.trim() || null,
  })
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya tienes una solicitud pendiente de revisión.')
    }
    throw error
  }
}

/** Mis solicitudes (la más reciente primero), para ver en qué va la mía. */
export async function misSolicitudesEntidad(): Promise<SolicitudEntidad[]> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) return []
  const { data, error } = await supabase
    .from('solicitudes_entidad')
    .select(COLS_SOLICITUD)
    .eq('perfil_id', auth.user.id)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return (data ?? []) as SolicitudEntidad[]
}

/** Todas las solicitudes (solo admin, por RLS). Para la bandeja del panel. */
export async function listarSolicitudesEntidad(): Promise<SolicitudEntidad[]> {
  const { data, error } = await supabase
    .from('solicitudes_entidad')
    .select(COLS_SOLICITUD)
    .order('creado_en', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as SolicitudEntidad[]
}

/**
 * Aprueba (crea la entidad y otorga el rol) o rechaza una solicitud.
 * `metodo` queda guardado y se MUESTRA en el perfil público: decir cómo se
 * verificó vale mucho más que un check genérico.
 */
export async function revisarSolicitudEntidad(args: {
  id: string
  aprobar: boolean
  tier?: TierEntidad
  metodo?: string
  nota?: string
  /** Si se le va a facturar. La base rechaza marcarla sin id_fiscal. */
  facturable?: boolean
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('revisar_solicitud_entidad', {
    p_id: args.id,
    p_aprobar: args.aprobar,
    p_tier: args.aprobar ? (args.tier ?? null) : null,
    p_metodo_verificacion: args.metodo?.trim() || null,
    p_nota: args.nota?.trim() || null,
    p_facturable: args.aprobar ? (args.facturable ?? false) : false,
  })
  if (error) throw error
  return (data as string | null) ?? null
}

/**
 * Entidades visibles (mapa y listado público). Lee la VISTA
 * `entidades_publicas`, no la tabla: la tabla tiene la dirección fiscal y
 * el correo de facturación, que no son datos públicos (migración 62).
 */
export async function listarEntidades(filtros?: {
  pais?: string | null
  zona?: string | null
  categoria?: CategoriaEntidad | null
}): Promise<Entidad[]> {
  let q = supabase.from('entidades_publicas').select(COLS_ENTIDAD)
  if (filtros?.pais) q = q.eq('pais', filtros.pais)
  if (filtros?.zona) q = q.eq('zona', filtros.zona)
  if (filtros?.categoria) q = q.eq('categoria', filtros.categoria)
  const { data, error } = await q.order('nombre').limit(500)
  if (error) throw error
  return (data ?? []) as Entidad[]
}

/** Una entidad por id (perfil público, sin datos fiscales). */
export async function obtenerEntidad(id: string): Promise<Entidad | null> {
  const { data, error } = await supabase
    .from('entidades_publicas')
    .select(COLS_ENTIDAD)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Entidad) ?? null
}

/**
 * La entidad de la sesión actual, COMPLETA: aquí sí van los datos fiscales,
 * porque la ve su propio equipo en su panel (y el admin).
 */
export async function miEntidad(): Promise<EntidadCompleta | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) return null
  const { data, error } = await supabase
    .from('entidad_miembros')
    .select(`entidad_id, entidades!inner(${COLS_ENTIDAD_COMPLETA})`)
    .eq('perfil_id', auth.user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const fila = data as unknown as { entidades: EntidadCompleta }
  return fila.entidades ?? null
}

/** Todas las entidades con sus datos fiscales (solo admin, por RLS). */
export async function listarEntidadesCompletas(): Promise<EntidadCompleta[]> {
  const { data, error } = await supabase
    .from('entidades')
    .select(COLS_ENTIDAD_COMPLETA)
    .order('nombre')
    .limit(500)
  if (error) throw error
  return (data ?? []) as EntidadCompleta[]
}

// ============================================================
// Equipo verificado (migración 64): la entidad avala a sus propios
// rescatistas/voluntarios. Distinto de `entidad_miembros` (que es para
// quienes ADMINISTRAN la ficha pública, un permiso mucho más fuerte).
// ============================================================

/** Candidato encontrado al buscar por teléfono (para verificar). */
export interface CandidatoEquipo {
  id: string
  nombre: string | null
  rol: string
  telefono: string | null
  pais: string | null
  ciudad: string | null
  /** Si ya está verificado (por esta u otra entidad). */
  ya_verificado_por: string | null
  ya_verificado_entidad: string | null
}

/** Un miembro ya verificado del equipo de una entidad. */
export interface MiembroEquipo {
  perfil_id: string
  nombre: string | null
  rol: string
  telefono: string | null
  verificado_en: string
  verificado_por: string | null
  nota: string | null
}

/**
 * Busca a alguien por su teléfono EXACTO (tal como está guardado, con
 * prefijo) para verificarlo. Solo devuelve resultados con rol voluntario o
 * rescatista — no es un buscador libre de usuarios.
 */
export async function buscarCandidatoEquipo(
  telefono: string,
): Promise<CandidatoEquipo[]> {
  const { data, error } = await supabase.rpc('entidad_buscar_candidato', {
    p_telefono: telefono.trim(),
  })
  if (error) throw error
  return (data ?? []) as CandidatoEquipo[]
}

/** Verifica (o re-confirma) a una persona como parte del equipo de la entidad. */
export async function verificarMiembroEquipo(args: {
  entidadId: string
  perfilId: string
  nota?: string
}): Promise<void> {
  const { error } = await supabase.rpc('entidad_verificar_miembro', {
    p_entidad_id: args.entidadId,
    p_perfil_id: args.perfilId,
    p_nota: args.nota?.trim() || null,
  })
  if (error) throw error
}

/** Quita la verificación de una persona (deja de aparecer como del equipo). */
export async function quitarVerificacionEquipo(perfilId: string): Promise<void> {
  const { error } = await supabase.rpc('entidad_quitar_verificacion', {
    p_perfil_id: perfilId,
  })
  if (error) throw error
}

/** Equipo verificado de una entidad (con teléfono — solo para quien la administra). */
export async function listarEquipoEntidad(
  entidadId: string,
): Promise<MiembroEquipo[]> {
  const { data, error } = await supabase.rpc('entidad_listar_equipo', {
    p_entidad_id: entidadId,
  })
  if (error) throw error
  return (data ?? []) as MiembroEquipo[]
}
