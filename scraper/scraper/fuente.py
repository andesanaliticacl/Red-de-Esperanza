from __future__ import annotations

import time
from typing import Any, Optional

from models import CentroAcopio, PersonaDesaparecida

# ============================================================
# Cliente de la web de origen: desaparecidosterremotovenezuela.com
#
# La página es un SPA (Next.js) que pide los datos a una API aparte, y esa API
# está protegida con reCAPTCHA v3 (header `X-Recaptcha-Token`). No podemos
# pedirla con `requests` pelado: hace falta un token válido que solo Google
# genera dentro de un navegador real.
#
# Solución: abrimos la página de verdad con Playwright (un Chrome headless), y
# desde DENTRO de la página llamamos a la API igual que lo hace su propio
# JavaScript: pedimos el token con grecaptcha.execute(...) y lo mandamos en el
# header. Así pasamos el reCAPTCHA y el CORS sin pelear con nada.
#
# Datos confirmados desde el Network del sitio:
#   - Origen visible:  https://desaparecidosterremotovenezuela.com
#   - API:             https://desaparecidos-terremoto-api.theempire.tech
#   - Endpoint people: GET /api/personas?page=N&pageSize=M   (header X-Recaptcha-Token)
#   - reCAPTCHA key:   6LeBfDUtAAAAAMw1Wtkd58bst6vEnLOi3_NAjGD0  (acción "list_people")
# ============================================================

SITE_URL = "https://desaparecidosterremotovenezuela.com"
API_BASE = "https://desaparecidos-terremoto-api.theempire.tech"
SITE_KEY = "6LeBfDUtAAAAAMw1Wtkd58bst6vEnLOi3_NAjGD0"
ACCION_PERSONAS = "list_people"

# JS que corre DENTRO de la página: pide un token fresco y hace el fetch a la
# API con ese token. Devuelve el JSON ya parseado (o {__error__: ...}).
_JS_FETCH = """
async ([url, key, accion]) => {
  try {
    await new Promise((res) => window.grecaptcha.ready(res));
    const token = await window.grecaptcha.execute(key, { action: accion });
    const r = await fetch(url, {
      headers: { 'X-Recaptcha-Token': token, 'Accept': 'application/json' },
    });
    if (!r.ok) return { __error__: 'HTTP ' + r.status };
    return await r.json();
  } catch (e) {
    return { __error__: String(e) };
  }
}
"""


class Fuente:
    """Sesión de scraping sobre el sitio. Úsala como context manager:

        with Fuente(headless=True) as f:
            for raw in f.fetch_personas(1, 50): ...
            centros = f.fetch_centros()
    """

    def __init__(self, headless: bool = True, lento: float = 0.0) -> None:
        self.headless = headless
        self.lento = lento  # pausa extra entre peticiones (seg), por cortesía
        self._pw = None
        self._browser = None
        self._page = None
        self._api_paths: set[str] = set()  # rutas de la API vistas en la sesión

    # -- ciclo de vida ------------------------------------------------------
    def __enter__(self) -> "Fuente":
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        # Argumentos anti-detección: ocultar la bandera de automatización. En CI
        # corremos headed bajo Xvfb (pantalla virtual) porque reCAPTCHA v3 da
        # mejor puntaje a un navegador "visible" que a uno headless.
        args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ]
        self._browser = self._pw.chromium.launch(headless=self.headless, args=args)
        ctx = self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="es-VE",
            timezone_id="America/Caracas",
            viewport={"width": 1366, "height": 768},
        )
        # Parches "stealth": que el JS de la página no detecte que es un robot.
        ctx.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['es-VE','es','en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
            const orig = navigator.permissions && navigator.permissions.query;
            if (orig) {
              navigator.permissions.query = (p) =>
                p && p.name === 'notifications'
                  ? Promise.resolve({ state: Notification.permission })
                  : orig(p);
            }
            """
        )
        self._page = ctx.new_page()

        # Registrar TODAS las peticiones a la API (para descubrir endpoints).
        def _rec(req) -> None:
            if API_BASE in req.url:
                self._api_paths.add(req.url.replace(API_BASE, "").split("?")[0])
        self._page.on("request", _rec)

        # Cargar la página real establece el contexto de reCAPTCHA (grecaptcha).
        self._page.goto(SITE_URL, wait_until="domcontentloaded", timeout=60_000)
        self._page.wait_for_function("() => !!window.grecaptcha", timeout=30_000)
        # Simular un poco de actividad humana (mejora el puntaje de reCAPTCHA v3).
        try:
            self._page.mouse.move(300, 300)
            self._page.wait_for_timeout(800)
            self._page.mouse.move(500, 450)
            self._page.mouse.wheel(0, 600)
            self._page.wait_for_timeout(1500)
        except Exception:
            pass
        return self

    def __exit__(self, *exc) -> None:
        try:
            if self._browser:
                self._browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    # -- API interna --------------------------------------------------------
    def _get_json(self, path: str, accion: str) -> Any:
        """Llama a {API_BASE}{path} con token de reCAPTCHA desde el navegador."""
        assert self._page is not None
        url = f"{API_BASE}{path}"
        data = self._page.evaluate(_JS_FETCH, [url, SITE_KEY, accion])
        if isinstance(data, dict) and "__error__" in data:
            raise RuntimeError(f"API {path}: {data['__error__']}")
        if self.lento:
            time.sleep(self.lento)
        return data

    @staticmethod
    def _lista(data: Any) -> list[dict[str, Any]]:
        """Saca la lista de registros venga directa o dentro de una clave."""
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for clave in ("data", "items", "results", "personas", "centros", "rows"):
                v = data.get(clave)
                if isinstance(v, list):
                    return v
        return []

    # -- personas -----------------------------------------------------------
    def fetch_personas(self, page: int, tam: int = 50) -> list[dict[str, Any]]:
        data = self._get_json(
            f"/api/personas?page={page}&pageSize={tam}", ACCION_PERSONAS
        )
        return self._lista(data)

    # -- centros / hospitales ----------------------------------------------
    def fetch_centros(self, tam: int = 200) -> list[dict[str, Any]]:
        """Trae centros de acopio / hospitales. Descubre el endpoint real
        observando la red al abrir la pestaña 'Hospitales, Centros y Listas',
        y luego pagina sobre ese endpoint con el token de reCAPTCHA."""
        endpoint = self._descubrir_endpoint_centros()
        # Mostrar TODO lo que la API recibió (para depurar el endpoint real).
        print(f"  endpoints de API vistos: {sorted(self._api_paths)}")
        if not endpoint:
            # Plan B: rutas probables si la intercepción no lo pilló.
            for cand in ("/api/centros", "/api/hospitales", "/api/lugares",
                         "/api/centros-acopio", "/api/places", "/api/listas"):
                try:
                    data = self._get_json(f"{cand}?page=1&pageSize={tam}", ACCION_PERSONAS)
                    if self._lista(data):
                        endpoint = cand
                        break
                except Exception:
                    continue
        if not endpoint:
            return []

        # Paginar el endpoint descubierto.
        todos: list[dict[str, Any]] = []
        page = 1
        sep = "&" if "?" in endpoint else "?"
        while True:
            try:
                data = self._get_json(
                    f"{endpoint}{sep}page={page}&pageSize={tam}", ACCION_PERSONAS
                )
            except Exception as exc:
                print(f"  ✗ centros página {page}: {exc}")
                break
            lote = self._lista(data)
            if not lote:
                break
            todos.extend(lote)
            if len(lote) < tam:
                break
            page += 1
        return todos

    def _descubrir_endpoint_centros(self) -> Optional[str]:
        """Hace clic en la pestaña de centros y captura la URL de la API que
        carga. Devuelve el path (ej. '/api/centros') o None."""
        assert self._page is not None
        capturado: dict[str, str] = {}

        def on_response(resp) -> None:
            u = resp.url
            if API_BASE in u and "/personas" not in u and "/api/" in u:
                try:
                    if "application/json" in (resp.headers.get("content-type") or ""):
                        capturado.setdefault("path", u.replace(API_BASE, "").split("?")[0])
                except Exception:
                    pass

        self._page.on("response", on_response)
        try:
            self._page.get_by_role(
                "button", name="Hospitales, Centros y Listas"
            ).click(timeout=10_000)
            self._page.wait_for_timeout(3000)
        except Exception:
            # quizá el nombre cambió; intentar por texto parcial
            try:
                self._page.click("text=Centros", timeout=5000)
                self._page.wait_for_timeout(3000)
            except Exception:
                pass
        self._page.remove_listener("response", on_response)
        return capturado.get("path")


# ============================================================
# Mapeo de los registros crudos de la API a nuestros modelos.
# Los nombres de campo son tolerantes (probamos varios) porque hasta no ver el
# cuerpo exacto del JSON no sabemos el nombre canónico de cada uno.
# ============================================================

def _primero(raw: dict[str, Any], *claves: str) -> Any:
    for k in claves:
        if k in raw and raw[k] not in (None, "", []):
            return raw[k]
    return None


def _num(v: Any) -> Optional[int]:
    try:
        return int(str(v).strip())
    except Exception:
        return None


def _float(v: Any) -> Optional[float]:
    try:
        return float(str(v).strip())
    except Exception:
        return None


def map_persona(raw: dict[str, Any]) -> Optional[PersonaDesaparecida]:
    nombre = _primero(raw, "nombre", "name", "fullName", "nombreCompleto")
    if not nombre:
        # a veces viene en nombre + apellido por separado
        nom = _primero(raw, "nombres", "firstName")
        ape = _primero(raw, "apellidos", "lastName")
        nombre = " ".join([str(x) for x in (nom, ape) if x]) or None
    if not nombre:
        return None

    estado_txt = str(
        _primero(raw, "estado", "status", "situacion") or ""
    ).lower()
    # Campo real: estado="sin-contacto" (buscado) | "localizado" (encontrado).
    # Además, si tiene `localizadoPor`, ya fue localizado.
    encontrado = (
        "localiz" in estado_txt
        or "encontr" in estado_txt
        or estado_txt in ("found", "ok")
        or bool(raw.get("localizadoPor"))
    )
    estado = "encontrado" if encontrado else "no_encontrado"

    # Contacto del familiar (teléfono). Si está vacío y la fuente marca
    # "sin contacto", lo dejamos explícito para mostrarlo en la ficha.
    contacto = _primero(raw, "contacto", "contactoFamiliar", "reporta", "contact", "telefono")
    if not contacto and "sin-contacto" in estado_txt:
        contacto = "Sin contacto"

    return PersonaDesaparecida(
        nombre=str(nombre).strip(),
        id_fuente=str(_primero(raw, "id", "_id", "slug", "uuid") or "") or None,
        edad=_num(_primero(raw, "edad", "age", "years")),
        genero=_primero(raw, "genero", "gender", "sexo"),
        ultima_ubicacion=_primero(
            raw, "ultimaUbicacion", "ubicacion", "lastLocation", "location",
            "direccion", "lugar", "sector",
        ),
        fecha_desaparicion=_primero(
            raw, "fechaDesaparicion", "fecha", "date", "sinContactoDesde", "desaparecidoDesde"
        ),
        estado=estado,
        foto_url=_primero(raw, "foto", "fotoUrl", "imageUrl", "photo", "imagen", "image"),
        contacto_familiar=contacto,
        lat=_float(_primero(raw, "lat", "latitude", "latitud")),
        lng=_float(_primero(raw, "lng", "lon", "longitude", "longitud")),
    )


def map_centro(raw: dict[str, Any]) -> Optional[CentroAcopio]:
    nombre = _primero(raw, "nombre", "name", "title")
    if not nombre:
        return None

    tipo = str(_primero(raw, "tipo", "type", "categoria") or "").strip()
    # Normalizamos la descripción/tipo visible (Hospital / Centro de acopio).
    desc = tipo or _primero(raw, "descripcion", "description")

    return CentroAcopio(
        nombre=str(nombre).strip(),
        id_fuente=str(_primero(raw, "id", "_id", "slug", "uuid") or "") or None,
        descripcion=desc,
        direccion=_primero(raw, "direccion", "address", "ubicacion", "location"),
        ciudad=_primero(raw, "ciudad", "city", "municipio"),
        estado_region=_primero(raw, "estado", "region", "provincia", "state", "departamento"),
        pais=_primero(raw, "pais", "country") or "Venezuela",
        contacto=_primero(raw, "contacto", "telefono", "phone", "contact"),
        lat=_float(_primero(raw, "lat", "latitude", "latitud")),
        lng=_float(_primero(raw, "lng", "lon", "longitude", "longitud")),
    )
