// Divisiones territoriales por país (con el nombre correcto de cada una).
// No todos los países usan "Estado": hay regiones, provincias, departamentos,
// comunidades… Aquí guardamos la etiqueta y la lista de cada país.
//
// Se indexa por código ISO-3166 alfa-2 (en minúscula), igual que PAISES_MUNDO.
import { ESTADOS_VENEZUELA } from './types'

export interface ZonasPais {
  /** Cómo se llama la división en ese país (Estado, Región, Provincia…). */
  etiqueta: string
  /** Lista de zonas. Si está vacía, se pide en texto libre. */
  opciones: string[]
}

const ZONAS: Record<string, ZonasPais> = {
  ve: { etiqueta: 'Estado', opciones: [...ESTADOS_VENEZUELA] },

  cl: {
    etiqueta: 'Región',
    opciones: [
      'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
      'Valparaíso', 'Metropolitana de Santiago', "Libertador General Bernardo O'Higgins",
      'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos',
      'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena',
    ],
  },

  co: {
    etiqueta: 'Departamento',
    opciones: [
      'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar',
      'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó',
      'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira',
      'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío',
      'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima',
      'Valle del Cauca', 'Vaupés', 'Vichada',
    ],
  },

  ar: {
    etiqueta: 'Provincia',
    opciones: [
      'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', 'Catamarca', 'Chaco',
      'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
      'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro',
      'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
      'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
    ],
  },

  pe: {
    etiqueta: 'Departamento',
    opciones: [
      'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca',
      'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín',
      'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua',
      'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali',
    ],
  },

  ec: {
    etiqueta: 'Provincia',
    opciones: [
      'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi',
      'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja',
      'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza',
      'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas', 'Sucumbíos',
      'Tungurahua', 'Zamora Chinchipe',
    ],
  },

  mx: {
    etiqueta: 'Estado',
    opciones: [
      'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
      'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima',
      'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
      'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
      'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
      'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán',
      'Zacatecas',
    ],
  },

  bo: {
    etiqueta: 'Departamento',
    opciones: [
      'Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando',
      'Potosí', 'Santa Cruz', 'Tarija',
    ],
  },

  uy: {
    etiqueta: 'Departamento',
    opciones: [
      'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores',
      'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú',
      'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano',
      'Tacuarembó', 'Treinta y Tres',
    ],
  },

  py: {
    etiqueta: 'Departamento',
    opciones: [
      'Asunción', 'Alto Paraguay', 'Alto Paraná', 'Amambay', 'Boquerón',
      'Caaguazú', 'Caazapá', 'Canindeyú', 'Central', 'Concepción', 'Cordillera',
      'Guairá', 'Itapúa', 'Misiones', 'Ñeembucú', 'Paraguarí', 'Presidente Hayes',
      'San Pedro',
    ],
  },

  pa: {
    etiqueta: 'Provincia',
    opciones: [
      'Bocas del Toro', 'Coclé', 'Colón', 'Chiriquí', 'Darién', 'Herrera',
      'Los Santos', 'Panamá', 'Panamá Oeste', 'Veraguas',
      'Comarca Emberá-Wounaan', 'Comarca Guna Yala', 'Comarca Ngäbe-Buglé',
    ],
  },

  cr: {
    etiqueta: 'Provincia',
    opciones: [
      'Alajuela', 'Cartago', 'Guanacaste', 'Heredia', 'Limón', 'Puntarenas',
      'San José',
    ],
  },

  es: {
    etiqueta: 'Comunidad autónoma',
    opciones: [
      'Andalucía', 'Aragón', 'Asturias', 'Islas Baleares', 'Canarias',
      'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña',
      'Comunidad Valenciana', 'Extremadura', 'Galicia', 'La Rioja', 'Madrid',
      'Murcia', 'Navarra', 'País Vasco', 'Ceuta', 'Melilla',
    ],
  },

  us: {
    etiqueta: 'Estado',
    opciones: [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Carolina del Norte',
      'Carolina del Sur', 'Colorado', 'Connecticut', 'Dakota del Norte',
      'Dakota del Sur', 'Delaware', 'Florida', 'Georgia', 'Hawái', 'Idaho',
      'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Luisiana', 'Maine',
      'Maryland', 'Massachusetts', 'Míchigan', 'Minnesota', 'Misisipi', 'Misuri',
      'Montana', 'Nebraska', 'Nevada', 'Nueva Jersey', 'Nueva York',
      'Nuevo Hampshire', 'Nuevo México', 'Ohio', 'Oklahoma', 'Oregón',
      'Pensilvania', 'Rhode Island', 'Tennessee', 'Texas', 'Utah', 'Vermont',
      'Virginia', 'Virginia Occidental', 'Washington', 'Washington D.C.',
      'Wisconsin', 'Wyoming',
    ],
  },
}

/** Etiqueta genérica cuando no tenemos la lista del país. */
const ETIQUETA_GENERICA = 'Estado / Región / Provincia'

/**
 * Devuelve la división territorial de un país por su ISO. Si no la tenemos,
 * devuelve una etiqueta genérica y sin opciones (se pide en texto libre).
 */
export function zonasDePais(iso?: string): ZonasPais {
  if (iso && ZONAS[iso]) return ZONAS[iso]
  return { etiqueta: ETIQUETA_GENERICA, opciones: [] }
}

// Principales ciudades por zona (para sugerir al escribir). No pretende ser
// exhaustivo: son sugerencias; la persona siempre puede escribir otra ciudad.
// Por ahora Venezuela (núcleo) y Chile; el resto usa texto libre sin sugerencias.
const CIUDADES: Record<string, Record<string, string[]>> = {
  ve: {
    Amazonas: ['Puerto Ayacucho'],
    Anzoátegui: ['Barcelona', 'Puerto La Cruz', 'El Tigre', 'Anaco', 'Lechería', 'Cantaura'],
    Apure: ['San Fernando de Apure', 'Guasdualito', 'Achaguas'],
    Aragua: ['Maracay', 'La Victoria', 'Turmero', 'Cagua', 'El Limón', 'Villa de Cura'],
    Barinas: ['Barinas', 'Socopó', 'Barinitas'],
    Bolívar: ['Ciudad Bolívar', 'Ciudad Guayana', 'Puerto Ordaz', 'Upata', 'Caicara del Orinoco'],
    Carabobo: ['Valencia', 'Puerto Cabello', 'Guacara', 'Naguanagua', 'Los Guayos', 'Tocuyito'],
    Cojedes: ['San Carlos', 'Tinaquillo'],
    'Delta Amacuro': ['Tucupita'],
    'Distrito Capital': ['Caracas'],
    Falcón: ['Coro', 'Punto Fijo', 'Puerto Cumarebo'],
    Guárico: ['San Juan de los Morros', 'Calabozo', 'Valle de la Pascua', 'Zaraza'],
    'La Guaira': ['La Guaira', 'Catia La Mar', 'Maiquetía', 'Naiguatá'],
    Lara: ['Barquisimeto', 'Carora', 'El Tocuyo', 'Cabudare', 'Quíbor'],
    Mérida: ['Mérida', 'El Vigía', 'Ejido', 'Tovar'],
    Miranda: ['Los Teques', 'Guarenas', 'Guatire', 'Petare', 'Charallave', 'Cúa', 'Santa Teresa del Tuy', 'Ocumare del Tuy'],
    Monagas: ['Maturín', 'Punta de Mata', 'Caripito'],
    'Nueva Esparta': ['Porlamar', 'La Asunción', 'Pampatar', 'Juan Griego', 'Punta de Piedras'],
    Portuguesa: ['Guanare', 'Acarigua', 'Araure', 'Píritu'],
    Sucre: ['Cumaná', 'Carúpano', 'Güiria'],
    Táchira: ['San Cristóbal', 'Táriba', 'Rubio', 'San Antonio del Táchira', 'La Fría'],
    Trujillo: ['Trujillo', 'Valera', 'Boconó'],
    Yaracuy: ['San Felipe', 'Yaritagua', 'Chivacoa'],
    Zulia: ['Maracaibo', 'Cabimas', 'Ciudad Ojeda', 'San Francisco', 'Santa Bárbara del Zulia', 'Machiques'],
  },
  cl: {
    'Arica y Parinacota': ['Arica', 'Putre'],
    Tarapacá: ['Iquique', 'Alto Hospicio', 'Pozo Almonte'],
    Antofagasta: ['Antofagasta', 'Calama', 'Tocopilla', 'Mejillones'],
    Atacama: ['Copiapó', 'Vallenar', 'Caldera'],
    Coquimbo: ['La Serena', 'Coquimbo', 'Ovalle', 'Illapel'],
    Valparaíso: ['Valparaíso', 'Viña del Mar', 'Quilpué', 'Villa Alemana', 'San Antonio', 'Quillota'],
    'Metropolitana de Santiago': ['Santiago', 'Puente Alto', 'Maipú', 'La Florida', 'Las Condes', 'San Bernardo', 'Ñuñoa'],
    "Libertador General Bernardo O'Higgins": ['Rancagua', 'San Fernando', 'Rengo', 'Machalí'],
    Maule: ['Talca', 'Curicó', 'Linares', 'Cauquenes'],
    Ñuble: ['Chillán', 'San Carlos', 'Bulnes'],
    Biobío: ['Concepción', 'Talcahuano', 'Los Ángeles', 'Coronel', 'Chiguayante', 'San Pedro de la Paz'],
    'La Araucanía': ['Temuco', 'Padre Las Casas', 'Villarrica', 'Angol', 'Pucón'],
    'Los Ríos': ['Valdivia', 'La Unión', 'Río Bueno', 'Panguipulli'],
    'Los Lagos': ['Puerto Montt', 'Osorno', 'Castro', 'Ancud', 'Puerto Varas'],
    'Aysén del General Carlos Ibáñez del Campo': ['Coyhaique', 'Puerto Aysén'],
    'Magallanes y de la Antártica Chilena': ['Punta Arenas', 'Puerto Natales'],
  },
}

/**
 * Ciudades sugeridas para una zona concreta de un país. Vacío = sin sugerencias
 * (la persona escribe la ciudad a mano). Siempre se permite texto libre.
 */
export function ciudadesDeZona(iso?: string, zona?: string): string[] {
  if (!iso || !zona) return []
  return CIUDADES[iso]?.[zona] ?? []
}
