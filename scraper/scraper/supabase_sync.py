from __future__ import annotations

import os
from typing import Iterable, Optional

import requests

# Sube datos a Supabase usando la API REST (PostgREST), con UPSERT por
# `id_fuente` para no duplicar al re-scrapear.
#
# Necesita dos variables de entorno (NUNCA en el repo ni en el frontend):
#   SUPABASE_URL         -> https://xxxx.supabase.co
#   SUPABASE_SERVICE_KEY -> la "service_role" key (Settings > API). Solo aquí.

def _cargar_dotenv() -> None:
    """Carga variables desde un archivo `.env` (en esta carpeta o la de arriba)
    si existe, así no hay que ponerlas a mano en cada ventana de PowerShell.
    No pisa variables que ya estén definidas en el entorno."""
    from pathlib import Path

    aqui = Path(__file__).resolve().parent
    for d in (aqui, aqui.parent):
        f = d / ".env"
        if not f.exists():
            continue
        cargadas = []
        # utf-8-sig ignora el BOM que Windows mete al inicio del archivo.
        for linea in f.read_text(encoding="utf-8-sig").splitlines():
            linea = linea.strip().lstrip("﻿")
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            k = k.strip().lstrip("﻿")
            os.environ.setdefault(k, v.strip().strip('"').strip("'"))
            cargadas.append(k)
        if cargadas:
            print(f"[.env] leído de {f} -> {', '.join(cargadas)}")
            return


_cargar_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def faltan_credenciales() -> bool:
    return not (SUPABASE_URL and SERVICE_KEY)


def _check_env() -> None:
    if not SUPABASE_URL or not SERVICE_KEY:
        raise RuntimeError(
            "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en las variables de entorno."
        )


def _headers(prefer: str) -> dict:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _upsert(tabla: str, filas: list[dict], on_conflict: str) -> None:
    if not filas:
        return
    _check_env()
    # PostgREST exige que TODAS las filas del lote tengan las MISMAS claves.
    # Como cada fila omite sus campos vacíos, normalizamos a la unión de claves
    # rellenando con None las que falten.
    claves: set = set()
    for f in filas:
        claves.update(f.keys())
    filas = [{k: f.get(k) for k in claves} for f in filas]
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{tabla}?on_conflict={on_conflict}",
        headers=_headers("resolution=merge-duplicates,return=minimal"),
        json=filas,
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"Error subiendo a {tabla} ({r.status_code}): {r.text[:300]}")


def _subir_en_lotes(tabla: str, filas: Iterable[dict], on_conflict: str, tam: int) -> int:
    lote: list[dict] = []
    total = 0
    for fila in filas:
        lote.append(fila)
        if len(lote) >= tam:
            _upsert(tabla, lote, on_conflict)
            total += len(lote)
            print(f"  · subidas {total}…")
            lote = []
    if lote:
        _upsert(tabla, lote, on_conflict)
        total += len(lote)
    return total


# -- API pública --------------------------------------------------------------

def subir_lote(filas: list[dict]) -> None:
    """Compat: sube un lote de personas (upsert por id_fuente)."""
    _upsert("desaparecidos", filas, "id_fuente")


def subir_en_lotes(filas: Iterable[dict], tam: int = 200) -> int:
    """Sube personas en lotes. Devuelve cuántas subió."""
    return _subir_en_lotes("desaparecidos", filas, "id_fuente", tam)


def subir_centros(filas: Iterable[dict], tam: int = 100) -> int:
    """Sube centros de acopio en lotes (upsert por id_fuente)."""
    return _subir_en_lotes("centros_acopio", filas, "id_fuente", tam)


# -- Registro de la corrida (para el panel admin) -----------------------------

def registrar_corrida(
    tipo: str,
    estado: str,
    total: Optional[int] = None,
    detalle: Optional[str] = None,
) -> None:
    """Inserta/actualiza una fila en `scraper_runs` con el estado del scraper.
    Silencioso: si la tabla no existe, no rompe el scraper."""
    if not SUPABASE_URL or not SERVICE_KEY:
        return
    fila = {"tipo": tipo, "estado": estado}
    if total is not None:
        fila["total"] = total
    if detalle is not None:
        fila["detalle"] = detalle[:500]
    if estado in ("ok", "error"):
        from datetime import datetime, timezone
        fila["finalizado_en"] = datetime.now(timezone.utc).isoformat()
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/scraper_runs",
            headers=_headers("return=minimal"),
            json=fila,
            timeout=20,
        )
    except Exception:
        pass
