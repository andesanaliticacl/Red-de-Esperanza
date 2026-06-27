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
