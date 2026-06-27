from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional


@dataclass
class PersonaDesaparecida:
    """Una persona desaparecida tal como la guardamos en Supabase."""

    nombre: str
    # Id en la web de origen (ej. "p43ccdad40d7c"). Sirve para upsert sin duplicar.
    id_fuente: Optional[str] = None
    edad: Optional[int] = None
    genero: Optional[str] = None
    ultima_ubicacion: Optional[str] = None       # texto: "Av norte 11 con Av Panteón"
    fecha_desaparicion: Optional[str] = None
    estado: str = "no_encontrado"                # no_encontrado | encontrado
    foto_url: Optional[str] = None               # URL de la imagen (no la imagen)
    contacto_familiar: Optional[str] = None      # "MARIO WhatsApp 0412..."
    lat: Optional[float] = None                  # se rellena al geocodificar
    lng: Optional[float] = None
    fuente: str = "desaparecidos_terremoto_vzla"

    def to_row(self) -> dict:
        """Fila lista para insertar en la tabla `desaparecidos` de Supabase."""
        d = asdict(self)
        # Solo enviamos columnas que existen en la tabla.
        return {k: v for k, v in d.items() if v is not None}


@dataclass
class CentroAcopio:
    """Un centro de acopio / hospital tal como lo guardamos en `centros_acopio`.

    En la tabla, `lat` y `lng` son NOT NULL, así que un centro sin coordenadas
    (que no se pudo geocodificar) NO se sube. La descripción guarda el tipo
    original ("Hospital", "Centro de acopio") para mostrarlo con su mismo logo.
    """

    nombre: str
    # Id en la web origen, para upsert sin duplicar (requiere columna id_fuente).
    id_fuente: Optional[str] = None
    descripcion: Optional[str] = None            # "Hospital" / "Centro de acopio" + notas
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    estado_region: Optional[str] = None          # estado/región/provincia
    pais: str = "Venezuela"
    contacto: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    estado: str = "abierto"                       # estado operativo (abierto/cerrado)

    def to_row(self) -> dict:
        """Fila para la tabla `centros_acopio`. La columna se llama `estado`
        (operativo) y la región va en una columna también llamada `estado` en
        migración 07… ojo: en la tabla la región se llama `estado` y NO hay
        conflicto porque el estado operativo vive en `estado` de acopio_estado.

        Para evitar la ambigüedad mapeamos:
          - estado_region  -> columna `estado`   (región; migración 07)
        y NO enviamos un estado operativo separado (la tabla no lo tiene como
        columna distinta; el acopio usa `estado` para la región).
        """
        row = {
            "nombre": self.nombre,
            "id_fuente": self.id_fuente,
            "descripcion": self.descripcion,
            "direccion": self.direccion,
            "ciudad": self.ciudad,
            "estado": self.estado_region,   # columna `estado` = región (migración 07)
            "pais": self.pais,
            "contacto": self.contacto,
            "lat": self.lat,
            "lng": self.lng,
        }
        return {k: v for k, v in row.items() if v is not None}
