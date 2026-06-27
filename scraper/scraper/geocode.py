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

    # Códigos de país ISO para acotar la búsqueda en Nominatim.
    _CC = {
        "venezuela": "ve", "colombia": "co", "brasil": "br", "brazil": "br",
        "perú": "pe", "peru": "pe", "ecuador": "ec", "chile": "cl",
        "argentina": "ar", "panamá": "pa", "panama": "pa",
    }

    def geocodificar(
        self, texto: Optional[str], pais: Optional[str] = "Venezuela"
    ) -> tuple[Optional[float], Optional[float]]:
        """Devuelve (lat, lng) aproximados de un texto de ubicación.
        `pais` acota la búsqueda (por defecto Venezuela). Usa caché en disco."""
        if not texto:
            return None, None
        clave = f"{texto.strip()}|{(pais or '').strip()}".lower()
        if clave in self._cache:
            v = self._cache[clave]
            return (v[0], v[1]) if v else (None, None)

        cc = self._CC.get((pais or "").strip().lower())
        # Varios intentos, de más específico a más amplio, para subir la tasa
        # de aciertos: (1) con país y código de país, (2) con país sin código,
        # (3) solo el texto sin país.
        intentos: list[tuple[str, Optional[str]]] = []
        if pais:
            intentos.append((f"{texto}, {pais}", cc))
            intentos.append((f"{texto}, {pais}", None))
        intentos.append((texto, None))

        try:
            for q, codigo in intentos:
                res = self._consultar(q, codigo)
                time.sleep(1.1)  # respetar el límite de 1/seg
                if res:
                    self._cache[clave] = [res[0], res[1]]
                    self._guardar()
                    return res
            # Se consultó y NO se encontró: lo recordamos para no repetir.
            self._cache[clave] = None
            self._guardar()
            return None, None
        except Exception:
            # Error transitorio (timeout/red): NO lo cacheamos, para reintentar
            # en la próxima corrida en vez de marcarlo como "sin coordenadas".
            return None, None

    def _consultar(
        self, q: str, codigo: Optional[str]
    ) -> Optional[tuple[float, float]]:
        params = {"q": q, "format": "json", "limit": 1}
        if codigo:
            params["countrycodes"] = codigo
        r = requests.get(
            NOMINATIM, params=params, headers={"User-Agent": USER_AGENT}, timeout=20
        )
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
        return None
