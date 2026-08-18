import { supabase } from './supabase'

/**
 * "Yo tengo": lo que alguien OFRECE, no lo que pide.
 *
 * Vive en su propia tabla y no como un tipo más de `necesidades` porque el
 * ciclo de vida es distinto: una necesidad se RESUELVE (alguien fue y la
 * atendió), una oferta se AGOTA (se acabó) o se RETIRA (ya no puedo
 * seguir ofreciéndola). Ver migración 77.
 */

export type OfertaTipo =
  | 'agua'
  | 'comida'
  | 'medicinas'
  | 'refugio'
  | 'electricidad'
  | 'internet'
  | 'transporte'
  | 'higiene'
  | 'herramientas'
  | 'comunidad'
  | 'profesional'
  | 'otro'

export type OfertaEstado = 'disponible' | 'agotada' | 'retirada'

export interface Oferta {
  id: string
  tipo: OfertaTipo
  descripcion: string
  pais: string | null
  zona: string | null
  lat: number | null
  lng: number | null
  /** Invitación pública: grupo de WhatsApp, sitio, formulario. */
  enlace: string | null
  estado: OfertaEstado
  ofrecido_por: string | null
  creado_en: string
  actualizado_en: string
}

/**
 * Los colores son VERDES Y AZULES a propósito, para que se distingan de las
 * necesidades (rojos y naranjas) de un vistazo. Pero el color no basta: en el
 * mapa la oferta se dibuja además con OTRA FORMA, porque un porcentaje nada
 * despreciable de la gente no distingue rojo de verde, y aquí se toman
 * decisiones urgentes.
 */
export const OFERTA_META: Record<
  OfertaTipo,
  { etiqueta: string; emoji: string; color: string; ejemplo: string }
> = {
  agua: {
    etiqueta: 'Agua',
    emoji: '💧',
    color: '#0369A1',
    ejemplo: 'Tengo agua potable para repartir',
  },
  comida: {
    etiqueta: 'Comida',
    emoji: '🥫', // el mismo que 'Agua / Comida' en el resto de la app
    color: '#EA580C',
    ejemplo: 'Preparo comida caliente, pueden venir a buscarla',
  },
  medicinas: {
    etiqueta: 'Medicinas',
    emoji: '💊',
    color: '#CF9B00',
    ejemplo: 'Tengo remedios básicos y material de curación',
  },
  refugio: {
    etiqueta: 'Techo',
    emoji: '🏠',
    color: '#7C3AED',
    ejemplo: 'Puedo alojar a una familia',
  },
  electricidad: {
    etiqueta: 'Energía',
    emoji: '🔌',
    color: '#CA8A04',
    ejemplo: 'Tengo generador, pueden cargar el celular',
  },
  internet: {
    etiqueta: 'Internet',
    emoji: '📶',
    color: '#0891B2',
    ejemplo: 'Tengo wifi abierto para quien necesite avisar que está bien',
  },
  transporte: {
    etiqueta: 'Transporte',
    emoji: '🚚',
    color: '#B45309',
    ejemplo: 'Tengo camioneta para mover cosas o personas',
  },
  higiene: {
    etiqueta: 'Baño y ducha',
    emoji: '🚿',
    color: '#0D9488',
    ejemplo: 'Pueden venir a ducharse o lavar ropa',
  },
  herramientas: {
    etiqueta: 'Herramientas',
    emoji: '🚜', // el mismo que 'Maquinaria pesada'
    color: '#78350F',
    ejemplo: 'Tengo herramientas para remover escombros',
  },
  // No es un recurso físico sino un PUNTO DE ENCUENTRO: no se agota, no hay
  // que ir a buscarlo y sirve a cien personas a la vez. Por eso es la única
  // que puede ir sin coordenadas y con un enlace en vez de una dirección.
  comunidad: {
    etiqueta: 'Comunidad',
    emoji: '💬',
    color: '#16A34A',
    ejemplo: 'Grupo de WhatsApp del barrio para coordinarnos',
  },
  // Lo que más escasea tras un terremoto no es material, es alguien que sepa.
  // Un médico, un veterinario, un eléctrico o un albañil que ofrezca sus
  // horas es una oferta como cualquier otra y no tenía dónde publicarse.
  profesional: {
    etiqueta: 'Un profesional',
    emoji: '🩺', // el mismo oficio que la categoría 'profesional' de entidades
    color: '#0F766E',
    ejemplo: 'Soy enfermera y puedo atender curaciones',
  },
  otro: {
    etiqueta: 'Otro',
    emoji: '❓', // el mismo 'Otro' que en los tipos de necesidad
    color: '#475569',
    ejemplo: 'Cuenta qué puedes ofrecer',
  },
}

/** Orden en que se ofrecen al publicar. Lo más pedido primero. */
export const OFERTAS_ORDEN: OfertaTipo[] = [
  'agua',
  'comida',
  'medicinas',
  'refugio',
  'electricidad',
  'internet',
  'higiene',
  'transporte',
  'herramientas',
  'comunidad',
  'profesional',
  'otro',
]

/** La única que se publica con un enlace de invitación y sin dirección. */
export const TIPOS_CON_ENLACE: OfertaTipo[] = ['comunidad']

export interface NuevaOferta {
  tipo: OfertaTipo
  descripcion: string
  zona?: string | null
  lat?: number | null
  lng?: number | null
  enlace?: string | null
  /** Se guarda en `contactos_oferta`, nunca en la tabla pública. */
  contacto?: string | null
}

export function validarOferta(o: NuevaOferta): string | null {
  if (!o.descripcion?.trim() || o.descripcion.trim().length < 3) {
    return 'Cuenta brevemente qué ofreces.'
  }
  if (o.tipo === 'comunidad' && !o.enlace?.trim()) {
    return 'Pega el enlace de invitación al grupo, o nadie podrá entrar.'
  }
  // El resto SÍ necesita ubicación: sin ella, "tengo agua" no le sirve a
  // nadie porque no se puede llegar.
  if (o.tipo !== 'comunidad' && (o.lat == null || o.lng == null)) {
    return 'Marca en el mapa dónde estás, para que puedan llegar.'
  }
  return null
}

/**
 * Publica una oferta. Requiere sesión: a diferencia de un SOS —donde pedir
 * registro costaría vidas— una oferta no es urgente, y exigir cuenta es lo
 * que frena la publicidad disfrazada de ayuda.
 */
export async function crearOferta(o: NuevaOferta): Promise<Oferta> {
  const error = validarOferta(o)
  if (error) throw new Error(error)

  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) throw new Error('Entra con tu cuenta para publicar lo que ofreces.')

  const { data, error: err } = await supabase
    .from('ofertas')
    .insert({
      tipo: o.tipo,
      descripcion: o.descripcion.trim(),
      zona: o.zona?.trim() || null,
      lat: o.lat ?? null,
      lng: o.lng ?? null,
      enlace: o.enlace?.trim() || null,
      ofrecido_por: uid,
    })
    .select()
    .single()
  if (err) throw err

  if (o.contacto?.trim()) {
    // Si falla, la oferta ya existe y no se pierde: el contacto es deseable
    // pero no imprescindible, porque el enlace o el mapa ya permiten llegar.
    const { error: errC } = await supabase
      .from('contactos_oferta')
      .insert({ oferta_id: data.id, contacto: o.contacto.trim() })
    if (errC) console.error('No se pudo guardar el contacto:', errC.message)
  }

  return data as Oferta
}

export async function listarOfertas(filtros?: {
  pais?: string | null
  tipo?: OfertaTipo | null
}): Promise<Oferta[]> {
  let q = supabase
    .from('ofertas')
    .select(
      'id, tipo, descripcion, pais, zona, lat, lng, enlace, estado, ofrecido_por, creado_en, actualizado_en',
    )
    .eq('estado', 'disponible')
    .order('creado_en', { ascending: false })
    .limit(500)
  if (filtros?.pais) q = q.eq('pais', filtros.pais)
  if (filtros?.tipo) q = q.eq('tipo', filtros.tipo)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Oferta[]
}

/**
 * 'agotada' y 'retirada' se distinguen porque dicen cosas distintas: la
 * primera significa que la ayuda llegó a alguien, la segunda que nunca
 * alcanzó a llegar. Mezclarlas perdería justamente el dato que importa.
 */
export async function cambiarEstadoOferta(
  id: string,
  estado: Exclude<OfertaEstado, 'disponible'>,
): Promise<void> {
  const { error } = await supabase.from('ofertas').update({ estado }).eq('id', id)
  if (error) throw error
}
