from __future__ import annotations

from typing import Any, Optional

import requests

from models import PersonaDesaparecida

# ============================================================
# Cliente de la web de origen (desaparecidosterremotovenezuela.com)
#
# La página es Next.js y carga las personas por una API en segundo plano (no
# están en el HTML). Necesitamos ESA URL. Cómo obtenerla (1 minuto):
#   1. Abre la página en Chrome y pulsa F12 → pestaña "Red" (Network).
#   2. Filtra por "Fetch/XHR".
#   3. Recarga la página o pulsa "Siguiente". Verás una petición que devuelve
#      un JSON con la lista de personas (nombre, foto, ubicación…).
#   4. Click derecho sobre ella → "Copy" → "Copy as cURL" (o copia la URL).
#   5. Pásamela y completo BASE y los nombres de campos exactos abajo.
# ============================================================

# TODO: confirmar con la petición real del Network. Valores PROBABLES:
API_BASE = "https://desaparecidosterremotovenezuela.com/api/personas"
PARAM_PAGINA = "page"
PARAM_TAMANO = "pageSize"


def fetch_pagina(page: int, tam: int = 50) -> list[dict[str, Any]]:
    """Trae una página de personas como lista de diccionarios crudos.
    Ajustar según la respuesta real de la API."""
    r = requests.get(
        API_BASE,
        params={PARAM_PAGINA: page, PARAM_TAMANO: tam},
        headers={"Accept": "application/json", "User-Agent": "RedDeEsperanza/1.0"},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    # La lista puede venir directa o dentro de una clave ("data"/"items"/"results").
    if isinstance(data, list):
        return data
    for clave in ("data", "items", "results", "personas"):
        if isinstance(data.get(clave), list):
            return data[clave]
    return []


def _num(v: Any) -> Optional[int]:
    try:
        return int(str(v).strip())
    except Exception:
        return None


def map_persona(raw: dict[str, Any]) -> Optional[PersonaDesaparecida]:
    """Convierte un registro crudo de la API a nuestro modelo.
    Ajustar los nombres de campo a los que devuelva la API real."""
    nombre = raw.get("nombre") or raw.get("name") or raw.get("fullName")
    if not nombre:
        return None

    # Estado: "sin contacto" → no_encontrado ; "localizado" → encontrado.
    estado_txt = str(raw.get("estado") or raw.get("status") or "").lower()
    estado = "encontrado" if ("localiz" in estado_txt or "encontr" in estado_txt) else "no_encontrado"

    return PersonaDesaparecida(
        nombre=str(nombre).strip(),
        id_fuente=str(raw.get("id") or raw.get("slug") or "") or None,
        edad=_num(raw.get("edad") or raw.get("age")),
        genero=raw.get("genero") or raw.get("gender"),
        ultima_ubicacion=raw.get("ubicacion") or raw.get("lastLocation") or raw.get("location"),
        fecha_desaparicion=raw.get("fecha") or raw.get("date") or raw.get("sinContactoDesde"),
        estado=estado,
        foto_url=raw.get("foto") or raw.get("imageUrl") or raw.get("photo"),
        contacto_familiar=raw.get("contacto") or raw.get("reporta") or raw.get("contact"),
    )
