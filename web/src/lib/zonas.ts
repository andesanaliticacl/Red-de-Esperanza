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
