from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

import requests

# Geocodificador gratuito de OpenStreetMap (Nominatim). Política de uso:
#  - máximo 1 petición por segundo
#  - User-Agent identificable
# Para 66k direcciones esto es lento, por eso CACHEAMOS en disco: cada texto se
# consulta una sola vez aunque corramos el scraper muchas veces.

CACHE_FILE = Path(__file__).resolve().parent.parent / "cache_geocode.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "RedDeEsperanza/1.0 (desaparecidos; contacto: developer@theempire.tech)"


class Geocoder:
    def __init__(self) -> None:
        self._cache: dict[str, Optional[list[float]]] = {}
        if CACHE_FILE.exists():
            try:
                self._cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            except Exception:
                self._cache = {}

    def _guardar(self) -> None:
        CACHE_FILE.write_text(
            json.dumps(self._cache, ensure_ascii=False), encoding="utf-8"
        )

    def geocodificar(self, texto: Optional[str]) -> tuple[Optional[float], Optional[float]]:
        """Devuelve (lat, lng) aproximados de un texto de ubicación en Venezuela.
        Devuelve (None, None) si no se encuentra. Usa caché en disco."""
        if not texto:
            return None, None
        clave = texto.strip().lower()
        if clave in self._cache:
            v = self._cache[clave]
            return (v[0], v[1]) if v else (None, None)

        try:
            r = requests.get(
                NOMINATIM,
                params={
                    "q": f"{texto}, Venezuela",
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "ve",
                },
                headers={"User-Agent": USER_AGENT},
                timeout=20,
            )
            data = r.json()
            if data:
                lat = float(data[0]["lat"])
                lng = float(data[0]["lon"])
                self._cache[clave] = [lat, lng]
                self._guardar()
                time.sleep(1.1)  # respetar el límite de 1/seg
                return lat, lng
        except Exception:
            pass

        self._cache[clave] = None
        self._guardar()
        time.sleep(1.1)
        return None, None
