from __future__ import annotations

import html
import re
import time
from typing import Iterator, Optional

import requests

from models import PersonaDesaparecida

# ============================================================
# Fuente: colombiatebusca.com (registro ciudadano de personas
# desaparecidas en Colombia, terremoto 2026).
#
# LEE SOLO PÁGINAS PÚBLICAS. El robots.txt del sitio permite `/` y prohíbe
# /admin/, /login.php, /core.php y /estado.php — ninguna de esas se toca
# aquí. Tampoco se resuelve ningún captcha ni se toca su panel.
#
# POR QUÉ ESTO ES UNA SINCRONIZACIÓN Y NO UNA COPIA (importa):
# la fuente marca a la gente como "Localizada" cuando aparece (al escribir
# esto, 935 de 5.079 ya lo estaban) y su política deja pedir el ocultamiento
# de una publicación. Si copiáramos una sola vez, Red de Esperanza mostraría
# a cientos de personas ya encontradas como si siguieran desaparecidas, y
# quien pidió ser borrado seguiría publicado aquí para siempre. Por eso:
#
#   · Se recorren AMBOS estados (missing y found), no solo los que faltan.
#   · El upsert va por `id_fuente`, así el estado se corrige en cada corrida.
#   · La foto se enlaza a su servidor (no se copia): si allá la borran,
#     aquí deja de verse sola.
#   · `ids_vistos()` permite detectar las publicaciones que desaparecieron
#     del origen para poder retirarlas también aquí.
#
# Correr esto seguido (no una sola vez) es lo que lo mantiene honesto.
# ============================================================

BASE = "https://colombiatebusca.com"
FUENTE = "colombiatebusca"

# User-Agent identificable: si el sitio quiere ver o limitar este tráfico,
# tiene que poder reconocerlo. Nada de disfrazarse de navegador anónimo.
USER_AGENT = "RedDeEsperanza/1.0 (+https://reddeesperanza.com; sync desaparecidos Colombia)"

# El listado público pagina de 20 en 20.
POR_PAGINA = 20

_SESION = requests.Session()
_SESION.headers.update({"User-Agent": USER_AGENT})

# --- Trozos de la tarjeta (<article class="card">) del listado público ---
_RE_TARJETA = re.compile(r'<article class="card">(.*?)</article>', re.S)
# Ojo: en el HTML el separador viene escapado (`&amp;person=`), así que no se
# puede anclar a `&`. El UUID ya es suficientemente específico por sí solo.
_RE_PERSONA = re.compile(r'person=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
_RE_FOTO = re.compile(r'<img src="(/media\.php\?id=[^"]+)"')
_RE_ESTADO = re.compile(r'badge badge-(missing|found)"')
_RE_CATEGORIA = re.compile(r'badge badge-category">([^<]*)<')
_RE_NOMBRE = re.compile(r'<h2><a[^>]*>([^<]*)</a></h2>')
_RE_CODIGO = re.compile(r'card-code">\s*(CTB-[0-9A-F]+)\s*<')
# Línea "▣ ****880  - 81 años - masculino" (el documento va enmascarado en
# origen y NO se guarda: es dato sensible y llega inservible igual).
_RE_EDAD = re.compile(r'(\d{1,3})\s*años')
_RE_GENERO = re.compile(r'-\s*(masculino|femenino)\s*<', re.I)
_RE_UBICACION = re.compile(r'<p class="meta">⌖\s*([^<]+)</p>')


def _texto(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    limpio = html.unescape(v).strip()
    return limpio or None


def _parsear_tarjeta(bloque: str) -> Optional[PersonaDesaparecida]:
    """Convierte una tarjeta del listado en PersonaDesaparecida. None si le
    falta lo mínimo (id de origen o nombre)."""
    m_id = _RE_PERSONA.search(bloque)
    m_nombre = _RE_NOMBRE.search(bloque)
    if not m_id or not m_nombre:
        return None

    uuid = m_id.group(1)
    nombre = _texto(m_nombre.group(1))
    if not nombre:
        return None

    m_estado = _RE_ESTADO.search(bloque)
    # "found" en origen = "Localizada" = ya apareció.
    encontrada = bool(m_estado and m_estado.group(1) == "found")

    m_foto = _RE_FOTO.search(bloque)
    # Se enlaza la miniatura de SU servidor a propósito (ver cabecera): no se
    # rehospeda la foto de nadie, y si allá la quitan, aquí desaparece sola.
    foto = f"{BASE}{html.unescape(m_foto.group(1))}" if m_foto else None

    m_edad = _RE_EDAD.search(bloque)
    edad = int(m_edad.group(1)) if m_edad else None
    # Edades imposibles: dato sucio del formulario de origen.
    if edad is not None and not (0 <= edad <= 120):
        edad = None

    m_genero = _RE_GENERO.search(bloque)
    genero = m_genero.group(1).lower() if m_genero else None

    m_ubi = _RE_UBICACION.search(bloque)
    ubicacion = _texto(m_ubi.group(1)) if m_ubi else None

    m_cod = _RE_CODIGO.search(bloque)
    codigo = m_cod.group(1) if m_cod else None
    m_cat = _RE_CATEGORIA.search(bloque)
    categoria = _texto(m_cat.group(1)) if m_cat else None

    # El contacto NO se scrapea y se deja VACÍO a propósito: en origen está
    # detrás de un formulario privado (el tercero escribe y el reportante
    # decide si responde). Inventar aquí un contacto sería saltarse ese
    # filtro. La app enlaza a la publicación original —que sí tiene ese
    # formulario— reconstruyendo la URL desde `id_fuente`.
    referencia = " · ".join(x for x in (codigo, categoria) if x)

    return PersonaDesaparecida(
        nombre=nombre,
        id_fuente=f"ctb:{uuid}",
        edad=edad,
        genero=genero,
        ultima_ubicacion=ubicacion,
        # La fecha que muestra la tarjeta es la de PUBLICACIÓN, no la de la
        # desaparición: mapearla a fecha_desaparicion seria inventar un dato.
        fecha_desaparicion=None,
        estado="encontrado" if encontrada else "no_encontrado",
        foto_url=foto,
        # Referencia legible (código de la publicación + categoría), no un
        # teléfono: sirve para citar el caso al hablar con el origen.
        contacto_familiar=referencia or None,
        # Sin esto la capa del mapa no los muestra bajo el filtro "Colombia".
        pais="Colombia",
        fuente=FUENTE,
    )


def _pedir(status: str, pagina: int, cortesia: float) -> str:
    """Descarga una página del listado público. `status`: missing | found."""
    if cortesia > 0:
        time.sleep(cortesia)
    r = _SESION.get(
        BASE + "/",
        params={"status": status, "page": pagina},
        timeout=30,
    )
    r.raise_for_status()
    return r.text


def recorrer(
    *,
    desde: int = 1,
    hasta: int = 0,
    cortesia: float = 1.0,
    estados: tuple[str, ...] = ("missing", "found"),
) -> Iterator[PersonaDesaparecida]:
    """Recorre el listado público y va entregando personas.

    Por defecto recorre los DOS estados: sin traer también las "Localizadas"
    no habria forma de corregir aqui a quien ya aparecio (ver cabecera).

    `cortesia` = segundos de espera entre peticiones. No lo bajes a 0 contra
    el sitio real: son ~254 páginas por estado y no es nuestro servidor.
    """
    for status in estados:
        pagina = desde
        vacias = 0
        while True:
            if hasta and pagina > hasta:
                break
            try:
                htm = _pedir(status, pagina, cortesia)
            except requests.RequestException as e:
                print(f"  [!] {status} pág {pagina}: {e} — corto este estado")
                break

            tarjetas = _RE_TARJETA.findall(htm)
            if not tarjetas:
                # Dos páginas seguidas sin tarjetas = se acabó el listado.
                vacias += 1
                if vacias >= 2:
                    break
                pagina += 1
                continue
            vacias = 0

            for bloque in tarjetas:
                p = _parsear_tarjeta(bloque)
                if p is not None:
                    yield p

            # Menos de una página completa = era la última.
            if len(tarjetas) < POR_PAGINA:
                break
            pagina += 1


# Datos que el origen DEJA DE PUBLICAR cuando la persona aparece (su tarjeta
# pasa a decir "Caso localizado · datos públicos reducidos por privacidad").
_CAMPOS_SENSIBLES = ("ultima_ubicacion", "lat", "lng", "edad", "genero")


def fila_sincronizada(p: PersonaDesaparecida) -> dict:
    """Fila para el upsert, respetando la reducción de datos del origen.

    `to_row()` omite los campos vacíos, y en un UPSERT eso significa "no
    toques esta columna". Para alguien que pasó de "por localizar" a
    "Localizada" eso dejaría aquí su última ubicación y su edad, que allá ya
    dejaron de publicarse: terminaríamos mostrando MÁS datos de una persona
    encontrada que la propia fuente. Por eso, al estar localizada, esos
    campos se mandan explícitamente en null para que se borren aquí también.
    """
    fila = p.to_row()
    if p.estado == "encontrado":
        for campo in _CAMPOS_SENSIBLES:
            fila[campo] = None
    return fila


def variantes_ubicacion(texto: Optional[str]) -> list[str]:
    """Formas cada vez más gruesas de un texto de ubicación, para geocodificar.

    La gente escribe a mano: "Andinapoles, Trujillo valle", "caicedonia,
    valle", "Bogota, Bogota". Muchas veces la primera parte es un caserío mal
    escrito que Nominatim no conoce, pero el departamento del final sí. Sin
    esto, esos registros se quedan SIN coordenadas y entonces no aparecen en
    el mapa — que para una persona buscada es lo mismo que no estar.

    Ojo con la precisión: si solo resuelve el departamento, el pin queda en
    su centro, no en el punto exacto. Es aproximado a propósito, y es mejor
    que invisible.
    """
    if not texto:
        return []
    limpio = re.sub(r"\s+", " ", texto).strip(" ,.")
    if not limpio:
        return []

    variantes = [limpio]
    partes = [p.strip() for p in limpio.split(",") if p.strip()]
    if len(partes) > 1:
        # "ciudad, departamento" -> probar el departamento solo.
        ultima = partes[-1]
        if ultima.lower() != limpio.lower():
            variantes.append(ultima)
        # …y la primera suelta, por si el departamento venía mal escrito.
        primera = partes[0]
        if primera.lower() not in (v.lower() for v in variantes):
            variantes.append(primera)
    return variantes


def ids_vistos(personas: list[PersonaDesaparecida]) -> set[str]:
    """`id_fuente` de todo lo que sigue publicado en el origen.

    Sirve para lo contrario del alta: comparar contra lo que ya tenemos con
    fuente='colombiatebusca' y detectar lo que allá retiraron (por pedido de
    la familia, moderación o duplicado) y que aquí habría que retirar también.
    """
    return {p.id_fuente for p in personas if p.id_fuente}
