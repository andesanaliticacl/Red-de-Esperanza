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
