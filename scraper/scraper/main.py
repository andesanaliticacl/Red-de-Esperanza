from __future__ import annotations

import argparse
import json
import sys

from fuente import Fuente, map_centro, map_persona
from geocode import Geocoder
from supabase_sync import (
    borrar_desaparecidos,
    faltan_credenciales,
    ids_de_fuente,
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


def correr_colombia(args, geo) -> int:
    """Sincroniza colombiatebusca.com → `desaparecidos` (fuente 'colombiatebusca').

    NO es una importación de una sola vez: recorre también a las personas ya
    marcadas como "Localizada" en el origen para corregir su estado aquí, y
    puede retirar lo que allá dejaron de publicar (--retirar). Correrlo una
    sola vez y olvidarse dejaría a gente ya encontrada figurando como
    desaparecida, que es justo el daño que hay que evitar.
    """
    import fuente_colombia as fcol

    personas = list(
        fcol.recorrer(
            desde=args.desde,
            hasta=args.hasta,
            # Contra un servidor ajeno, 1 s por defecto: son ~254 páginas por
            # estado y no queremos costarles el sitio.
            cortesia=args.cortesia if args.cortesia > 0 else 1.0,
        )
    )
    if not personas:
        print("  (el origen no devolvió a nadie: no toco nada)")
        return 0

    encontradas = sum(1 for p in personas if p.estado == "encontrado")
    print(
        f"  Origen: {len(personas)} publicaciones "
        f"({len(personas) - encontradas} por localizar · {encontradas} localizadas)"
    )

    filas = []
    aproximadas = 0
    for i, p in enumerate(personas, 1):
        # A las ya localizadas no se les geocodifica nada: el origen dejó de
        # publicar su ubicación y aquí tampoco debe quedar (ver
        # fila_sincronizada), así que buscarles coordenadas sería al revés.
        if geo and p.estado != "encontrado" and p.lat is None and p.ultima_ubicacion:
            # Del texto exacto a lo más grueso (ciudad → departamento): sin
            # coordenadas el registro no se dibuja en el mapa, así que un pin
            # aproximado vale más que ninguno.
            for n, variante in enumerate(fcol.variantes_ubicacion(p.ultima_ubicacion)):
                p.lat, p.lng = geo.geocodificar(variante, pais="Colombia")
                if p.lat is not None:
                    if n > 0:
                        aproximadas += 1
                    break
        filas.append(fcol.fila_sincronizada(p))
        if i % 250 == 0:
            print(f"  · preparadas {i}/{len(personas)}…")

    por_localizar = [f for f in filas if f.get("estado") != "encontrado"]
    con_coords = sum(1 for f in por_localizar if f.get("lat") is not None)
    print(
        f"  Geocodificadas: {con_coords}/{len(por_localizar)} por localizar"
        + (f" ({aproximadas} solo a nivel de zona)" if aproximadas else "")
    )

    if args.sin_subir:
        print("  (--sin-subir: no se escribe nada en la base)")
        return len(filas)

    subidas = subir_en_lotes(filas)
    print(f"  ✓ {subidas} sincronizadas (altas + estado actualizado)")

    # --- Bajas: lo que el origen ya no publica ---
    vistos = fcol.ids_vistos(personas)
    try:
        guardados = ids_de_fuente(fcol.FUENTE)
    except Exception as exc:
        print(f"  [!] no pude leer lo ya guardado ({exc}); omito el retiro")
        return subidas

    sobran = guardados - vistos
    if not sobran:
        print("  Nada que retirar: el espejo coincide con el origen.")
        return subidas

    # Guarda de seguridad: si el listado se cayó a medias, `sobran` sería
    # enorme y borraríamos gente que sigue publicada. Ante la duda, no se
    # borra: un registro de más se arregla en la próxima corrida, uno de
    # menos es una persona que dejó de buscarse.
    proporcion = len(sobran) / max(len(guardados), 1)
    if proporcion > 0.25:
        print(
            f"  [!] {len(sobran)} de {len(guardados)} faltarían en el origen "
            f"({proporcion:.0%}). Es demasiado para ser real: probablemente la "
            "corrida quedó incompleta. NO retiro nada."
        )
        return subidas

    if not args.retirar:
        print(
            f"  {len(sobran)} publicaciones ya no están en el origen "
            "(retiradas allá). Corre con --retirar para quitarlas aquí también."
        )
        return subidas

    borradas = borrar_desaparecidos(sobran)
    print(f"  ✓ {borradas} retiradas aquí (ya no estaban en el origen)")
    return subidas


def _geocode_centro(geo, c):
    """Geocodifica un centro priorizando lo MÁS fiable: el municipio/ciudad y el
    estado (que casi siempre vienen en el nombre, p. ej. 'Edo. Carabobo
    (Guacara)'). La dirección textual de la web suele ser genérica ('Venezuela')
    y, si se usa primero, hace que el punto caiga en el lugar equivocado; por eso
    va al final y se descarta cuando es solo el país."""
    pais = c.pais or "Venezuela"
    intentos: list[str] = []

    def add(t: str | None) -> None:
        t = (t or "").strip(" ,")
        if t and t.lower() != pais.lower() and t not in intentos:
            intentos.append(t)

    # 1) Lo más específico y confiable: municipio/ciudad + estado.
    if c.ciudad and c.estado_region:
        add(f"{c.ciudad}, {c.estado_region}")
    add(c.ciudad)
    add(c.estado_region)

    # 2) Dirección textual (descartando valores genéricos = solo el país), de la
    #    calle hacia la ciudad por si la forma larga no la reconoce Nominatim.
    dir_txt = (c.direccion or "").strip()
    if dir_txt and dir_txt.lower() not in (pais.lower(), "venezuela"):
        partes = [p.strip() for p in dir_txt.split(",") if p.strip()]
        for i in range(len(partes)):
            add(", ".join(partes[i:] + [x for x in (c.ciudad, c.estado_region) if x]))

    for t in intentos:
        # forzar=True: los centros son pocos; siempre se geocodifican frescos
        # para corregir ubicaciones malas sin borrar la caché de personas.
        lat, lng = geo.geocodificar(t, pais=pais, forzar=True)
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
                    choices=["personas", "centros", "todo", "colombia"],
                    help="qué scrapear ('todo' = personas + centros; "
                         "'colombia' = sincronizar colombiatebusca.com)")
    ap.add_argument("--retirar", action="store_true",
                    help="(colombia) borra aquí lo que el origen dejó de publicar")
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
        if args.modo == "colombia":
            total = correr_colombia(args, geo)
        elif args.modo == "centros":
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
