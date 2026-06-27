from __future__ import annotations

import os
from typing import Iterable

import requests

# Sube las personas a la tabla `desaparecidos` de Supabase usando la API REST
# (PostgREST). Usa UPSERT por `id_fuente` para no duplicar al re-scrapear.
#
# Necesita dos variables de entorno (NO las subas al repo):
#   SUPABASE_URL         -> https://hqoirxajavaaasvdfjoy.supabase.co
#   SUPABASE_SERVICE_KEY -> la "service_role" key (Settings > API). Solo se usa
#                           aquí, en tu máquina; nunca en el frontend.

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def _headers() -> dict:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        # merge-duplicates = UPSERT sobre el índice único id_fuente
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def subir_lote(filas: list[dict]) -> None:
    """Inserta/actualiza un lote de personas (upsert por id_fuente)."""
    if not filas:
        return
    if not SUPABASE_URL or not SERVICE_KEY:
        raise RuntimeError(
            "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en las variables de entorno."
        )
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/desaparecidos?on_conflict=id_fuente",
        headers=_headers(),
        json=filas,
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"Error subiendo lote ({r.status_code}): {r.text[:300]}")


def subir_en_lotes(filas: Iterable[dict], tam: int = 200) -> int:
    """Sube todo en lotes de `tam` filas. Devuelve cuántas subió."""
    lote: list[dict] = []
    total = 0
    for fila in filas:
        lote.append(fila)
        if len(lote) >= tam:
            subir_lote(lote)
            total += len(lote)
            print(f"  · subidas {total}…")
            lote = []
    if lote:
        subir_lote(lote)
        total += len(lote)
    return total
