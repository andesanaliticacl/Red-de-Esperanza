import type { LucideIcon } from 'lucide-react'
import {
  Siren,
  HeartHandshake,
  HandHeart,
  Soup,
  Pill,
  Home,
  Building2,
  TriangleAlert,
  Waves,
  Flame,
  Boxes,
  Tractor,
  Flag,
  Construction,
  PawPrint,
  CircleHelp,
  Package,
  PackageCheck,
  Cross,
  Landmark,
  LifeBuoy,
  Brain,
  Users,
  User,
  Star,
  Shield,
  Stethoscope,
  ShieldCheck,
  BadgeCheck,
} from 'lucide-react'
import type { NecesidadTipo, RolUsuario } from './types'
import type { CategoriaEntidad, TierEntidad } from './entidades'

/**
 * Icono profesional (trazo, un solo color) por tipo de necesidad. Sustituye a
 * los emojis en la interfaz: los emojis multicolor le daban a la app un aire
 * infantil y cada sistema operativo los dibuja distinto. Los iconos de trazo
 * se ven iguales en todos lados y dejan que el COLOR del tipo (TIPO_META)
 * sea quien hable.
 *
 * El emoji de TIPO_META sigue existiendo para donde no se puede pintar SVG:
 * las <option> de los desplegables y los marcadores del mapa (HTML plano).
 */
export const ICONO_TIPO: Record<NecesidadTipo, LucideIcon> = {
  rescate: Siren,
  atencion_psicologica: HeartHandshake,
  agua_comida: Soup,
  medicinas: Pill,
  refugio: Home,
  derrumbe: Building2,
  // Mismo edificio que el derrumbe pero con la señal de alerta: en pie y
  // peligroso, no caído.
  edificio_inhabitable: TriangleAlert,
  inundacion: Waves,
  incendio: Flame,
  sacos_arena: Boxes,
  maquinaria: Tractor,
  zona_sin_atender: Flag,
  zona_aislada: Construction,
  mascota: PawPrint,
  otro: CircleHelp,
  acopio: Package,
}

/** Hospital no es un NecesidadTipo (es un subtipo de acopio). */
export const ICONO_HOSPITAL: LucideIcon = Cross

/** Icono por categoría de entidad verificada (migración 61). */
export const ICONO_CATEGORIA_ENTIDAD: Record<CategoriaEntidad, LucideIcon> = {
  bomberos: Flame,
  municipalidad: Landmark,
  rescate: LifeBuoy,
  animal: PawPrint,
  psicosocial: Brain,
  junta_vecinal: Users,
  ong: HeartHandshake,
  empresa: Building2,
  profesional: Stethoscope,
}

/** Insignia por nivel de confianza. El escudo lleno es el más fuerte. */
export const ICONO_TIER: Record<TierEntidad, LucideIcon> = {
  oficial: ShieldCheck,
  verificada: BadgeCheck,
  profesional: Stethoscope,
}

/** Icono por rol de usuario. Mismo criterio que ICONO_TIPO: reemplaza los
 *  emojis (🙋🤝🚑…) de ROL_META en las tarjetas de "¿Cómo participas?" del
 *  registro y de editar perfil, que habían quedado desactualizadas frente
 *  al resto de la app. El emoji de ROL_META sigue existiendo para donde no
 *  se puede pintar SVG (el chat, las pastillas de rol chiquitas). */
export const ICONO_ROL: Record<RolUsuario, LucideIcon> = {
  ciudadano: User,
  voluntario: HandHeart,
  rescatista: Siren,
  psicologo: Brain,
  centro_acopio: Package,
  acopio_admin: PackageCheck,
  lider_voluntarios: Star,
  lider_psicologo: Brain,
  verificador: BadgeCheck,
  admin: Shield,
  entidad: Building2,
}
