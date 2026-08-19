import type { Necesidad, NecesidadTipo, RolUsuario } from './types'

export const ROLES_PSICOLOGIA: RolUsuario[] = [
  'psicologo',
  'lider_psicologo',
  'admin',
]

export function esRolPsicologia(rol: RolUsuario | null | undefined): boolean {
  return !!rol && ROLES_PSICOLOGIA.includes(rol)
}

export function esLiderPsicologia(rol: RolUsuario | null | undefined): boolean {
  return rol === 'lider_psicologo' || rol === 'admin'
}

export function esRolRescatista(rol: RolUsuario | null | undefined): boolean {
  return (
    rol === 'rescatista' ||
    rol === 'lider_voluntarios' ||
    rol === 'psicologo' ||
    rol === 'lider_psicologo' ||
    rol === 'admin'
  )
}

export function puedeAtenderNecesidades(
  rol: RolUsuario | null | undefined,
): boolean {
  return (
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'lider_voluntarios' ||
    rol === 'psicologo' ||
    rol === 'lider_psicologo' ||
    rol === 'admin'
  )
}

export function puedeGestionarComoLider(
  rol: RolUsuario | null | undefined,
): boolean {
  return rol === 'lider_voluntarios' || rol === 'lider_psicologo' || rol === 'admin'
}

export function puedeVerTipoNecesidad(
  tipo: NecesidadTipo,
  rol: RolUsuario | null | undefined,
): boolean {
  if (tipo !== 'atencion_psicologica') return true
  return esRolPsicologia(rol)
}

export function puedeVerNecesidad(
  necesidad: Pick<Necesidad, 'tipo'>,
  rol: RolUsuario | null | undefined,
): boolean {
  return puedeVerTipoNecesidad(necesidad.tipo, rol)
}

/**
 * Lo único que una entidad aprobada puede acreditar (migración 85).
 *
 * Una entidad pasó por el filtro más caro de la red —un admin revisó su
 * solicitud y la verificó por canal oficial—, así que se le confía la
 * estrella. Pero solo en lo suyo: un veterinario o una organización de
 * rescate animal sabe si un perro herido es real; sobre un derrumbe no
 * sabe más que cualquiera, y una insignia que cubre todo deja de decir
 * nada.
 */
export const TIPOS_VERIFICABLES_POR_ENTIDAD: NecesidadTipo[] = ['mascota']

/**
 * Reportes que solo acredita el equipo de psicología. Son los datos más
 * sensibles de la red y tienen su propio resguardo en RLS.
 *
 * En la base existe además el tipo heredado 'apoyo_emocional', que ya no se
 * puede reportar desde la app; la migración 86 también lo excluye allá.
 */
export const TIPOS_PSICOLOGIA: NecesidadTipo[] = ['atencion_psicologica']

export function esRolEntidad(rol: RolUsuario | null | undefined): boolean {
  return rol === 'entidad'
}

/** El equipo de coordinación: acredita cualquier reporte. */
export function puedeVerificarTodo(rol: RolUsuario | null | undefined): boolean {
  return (
    puedeGestionarComoLider(rol) || rol === 'verificador' || rol === 'acopio_admin'
  )
}

/**
 * ¿Esta persona puede poner o quitar la estrella en ESTE reporte?
 *
 * `entidadVigente` lo decide la vista (rol 'entidad' + entidad no
 * suspendida): aquí no se consulta la base. La base vuelve a validarlo
 * igual — esto es solo para no mostrar un botón que va a fallar.
 */
export function puedeVerificarNecesidad(
  necesidad: Pick<Necesidad, 'tipo'>,
  rol: RolUsuario | null | undefined,
  entidadVigente = false,
): boolean {
  // El líder de acopios acredita todo menos psicología: esos reportes tienen
  // equipo propio y su propio resguardo en RLS (migración 86).
  if (rol === 'acopio_admin') {
    return !TIPOS_PSICOLOGIA.includes(necesidad.tipo)
  }
  if (puedeVerificarTodo(rol)) return true
  if (esRolEntidad(rol) && entidadVigente) {
    return TIPOS_VERIFICABLES_POR_ENTIDAD.includes(necesidad.tipo)
  }
  return false
}
