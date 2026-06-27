from __future__ import annotations

import argparse

from fuente import fetch_pagina, map_persona
from geocode import Geocoder
from supabase_sync import subir_en_lotes


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Scraper de desaparecidos → Supabase (con geocodificación)."
    )
    ap.add_argument("--desde", type=int, default=1, help="página inicial")
    ap.add_argument("--hasta", type=int, default=0, help="página final (0 = hasta que se acabe)")
    ap.add_argument("--tam", type=int, default=50, help="personas por página")
    ap.add_argument("--sin-geo", action="store_true", help="no geocodificar (más rápido)")
    ap.add_argument("--sin-subir", action="store_true", help="no subir a Supabase (solo probar)")
    args = ap.parse_args()

    geo = None if args.sin_geo else Geocoder()
    pagina = args.desde
    total = 0

    while True:
        if args.hasta and pagina > args.hasta:
            break
        print(f"Página {pagina}…")
        try:
            crudas = fetch_pagina(pagina, args.tam)
        except Exception as exc:
            print(f"  ✗ error al traer la página {pagina}: {exc}")
            break
        if not crudas:
            print("  (sin más resultados)")
            break

        filas = []
        for raw in crudas:
            p = map_persona(raw)
            if not p:
                continue
            if geo and p.ultima_ubicacion:
                p.lat, p.lng = geo.geocodificar(p.ultima_ubicacion)
            filas.append(p.to_row())

        if not args.sin_subir:
            subir_en_lotes(filas)
        total += len(filas)
        print(f"  ✓ {len(filas)} personas (acumulado: {total})")
        pagina += 1

    print(f"Listo. {total} personas procesadas.")


if __name__ == "__main__":
    main()
