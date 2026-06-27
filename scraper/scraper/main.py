from __future__ import annotations

import argparse
import json
import sys

from fuente import Fuente, map_centro, map_persona
from geocode import Geocoder
from supabase_sync import (
    faltan_credenciales,
    registrar_corrida,
    subir_centros,
    subir_en_lotes,
)


def _muestra(crudos: list, n: int) -> None:
    """Imprime los primeros N registros CRUDOS para ver los nombres de campo
    reales que devuelve la API (útil para afinar el mapeo desde el log)."""
    if not n:
        return
    print(f"  --- muestra de {min(n, len(crudos))} registro(s) crudo(s) ---")
    for raw in crudos[:n]:
        print("  " + json.dumps(raw, ensure_ascii=False)[:1200])
    print("  --- fin de la muestra ---")


def correr_personas(args, geo) -> int:
    total = 0
    with Fuente(headless=not args.ver, lento=args.cortesia) as f:
        pagina = args.desde
        primera = True
        while True:
            if args.hasta and pagina > args.hasta:
                break
            print(f"Página {pagina}…")
            try:
                crudas = f.fetch_personas(pagina, args.tam)
            except Exception as exc:
                print(f"  ✗ error en la página {pagina}: {exc}")
                # Reintento simple: una pausa y otra vez antes de rendirse.
                try:
                    f._page.wait_for_timeout(4000)  # type: ignore[attr-defined]
                    crudas = f.fetch_personas(pagina, args.tam)
                except Exception as exc2:
                    print(f"  ✗ falló el reintento: {exc2}")
                    break
            if not crudas:
                print("  (sin más resultados)")
                break
            if primera:
                _muestra(crudas, args.muestra)
                primera = False

            filas = []
            for raw in crudas:
                p = map_persona(raw)
                if not p:
                    continue
                if geo and p.lat is None and p.ultima_ubicacion:
                    p.lat, p.lng = geo.geocodificar(p.ultima_ubicacion)
                filas.append(p.to_row())

            if not args.sin_subir:
                subir_en_lotes(filas)
            total += len(filas)
            print(f"  ✓ {len(filas)} personas (acumulado: {total})")
            if total and total % 1000 < args.tam:
                registrar_corrida("personas", "corriendo", total)
            pagina += 1
    return total


def _geocode_centro(geo, c):
    """Geocodifica un centro con fallback: prueba la dirección completa y, si
    falla, va quitando el primer segmento (la calle) hasta llegar a la
    ciudad/región, que Nominatim sí reconoce."""
    intentos: list[str] = []
    base = ", ".join([x for x in (c.direccion, c.ciudad, c.estado_region) if x])
    if base:
        intentos.append(base)
    if c.direccion and "," in c.direccion:
        partes = [p.strip() for p in c.direccion.split(",") if p.strip()]
        for i in range(1, len(partes)):
            cola = ", ".join(partes[i:] + [x for x in (c.ciudad, c.estado_region) if x])
            if cola and cola not in intentos:
                intentos.append(cola)
    for t in intentos:
        lat, lng = geo.geocodificar(t, pais=c.pais)
        if lat is not None:
            return lat, lng
    return None, None


def correr_centros(args, geo) -> int:
    with Fuente(headless=not args.ver, lento=args.cortesia) as f:
        print("Buscando centros de acopio / hospitales…")
        crudos = f.fetch_centros()
        print(f"  {len(crudos)} registros crudos")
        _muestra(crudos, args.muestra)

        filas = []
        omitidos = 0
        for raw in crudos:
            c = map_centro(raw)
            if not c:
                continue
            if geo and c.lat is None:
                c.lat, c.lng = _geocode_centro(geo, c)
            # La tabla exige lat/lng NOT NULL: descartamos los sin coordenadas.
            if c.lat is None or c.lng is None:
                omitidos += 1
                continue
            filas.append(c.to_row())
        if omitidos:
            print(f"  ({omitidos} sin coordenadas, omitidos)")

        if not args.sin_subir:
            subir_centros(filas)
        print(f"  ✓ {len(filas)} centros subidos")
    return len(filas)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Scraper desaparecidosterremotovenezuela.com → Supabase."
    )
    ap.add_argument("modo", nargs="?", default="personas",
                    choices=["personas", "centros", "todo"],
                    help="qué scrapear ('todo' = personas + centros)")
    ap.add_argument("--desde", type=int, default=1, help="página inicial (personas)")
    ap.add_argument("--hasta", type=int, default=0, help="página final (0 = hasta el final)")
    ap.add_argument("--tam", type=int, default=50, help="registros por página")
    ap.add_argument("--sin-geo", action="store_true", help="no geocodificar (más rápido)")
    ap.add_argument("--sin-subir", action="store_true", help="no subir a Supabase (probar)")
    ap.add_argument("--ver", action="store_true", help="mostrar el navegador (no headless)")
    ap.add_argument("--cortesia", type=float, default=0.0,
                    help="pausa extra entre peticiones, en segundos")
    ap.add_argument("--muestra", type=int, default=0,
                    help="imprime los primeros N registros crudos (para depurar campos)")
    ap.add_argument("--refrescar-geo", action="store_true",
                    help="borra la caché de geocodificación antes de empezar")
    args = ap.parse_args()

    # Chequeo TEMPRANO de credenciales: si faltan y vamos a subir, avisamos ya
    # (antes de geocodificar nada, que es lo lento).
    if not args.sin_subir and faltan_credenciales():
        print(
            "ERROR: no encuentro las credenciales de Supabase.\n"
            "  Crea el archivo  scraper\\scraper\\.env  con estas dos líneas:\n"
            "    SUPABASE_URL=https://hqoirxajavaaasvdfjoy.supabase.co\n"
            "    SUPABASE_SERVICE_KEY=sb_secret_tu_clave\n"
            "  (o usa --sin-subir para probar sin subir a la base de datos).",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.refrescar_geo:
        from geocode import CACHE_FILE
        try:
            CACHE_FILE.unlink()
            print("Caché de geocodificación borrada (se geocodifica de nuevo).")
        except FileNotFoundError:
            pass

    geo = None if args.sin_geo else Geocoder()

    registrar_corrida(args.modo, "corriendo", 0)
    try:
        if args.modo == "centros":
            total = correr_centros(args, geo)
        elif args.modo == "todo":
            print("=== 1/2: PERSONAS ===")
            tp = correr_personas(args, geo)
            print("=== 2/2: CENTROS DE ACOPIO Y HOSPITALES ===")
            tc = correr_centros(args, geo)
            total = tp + tc
            print(f"Personas: {tp} · Centros: {tc}")
        else:
            total = correr_personas(args, geo)
    except Exception as exc:
        registrar_corrida(args.modo, "error", detalle=str(exc))
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
    registrar_corrida(args.modo, "ok", total)
    print(f"Listo. {total} registros procesados.")


if __name__ == "__main__":
    main()
