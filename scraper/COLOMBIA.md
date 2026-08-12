# Sincronización con colombiatebusca.com

Espeja el registro ciudadano de personas desaparecidas de Colombia
(terremoto 2026) hacia la tabla `desaparecidos`, con `fuente='colombiatebusca'`.

## Lo que hay que entender antes de correrlo

**Esto es una sincronización, no una importación.** No es un matiz técnico:

- El origen marca a la gente como **"Localizada"** cuando aparece (al escribir
  esto, **935 de 5.079** ya lo estaban, y sube cada día). Si se corre una sola
  vez y se olvida, Red de Esperanza mostraría a cientos de personas ya
  encontradas como si siguieran desaparecidas. Eso hace daño a las familias y
  manda rescatistas a buscar a quien ya apareció.
- Su política de datos deja **pedir el ocultamiento** de una publicación.
  Si alguien ejerce ese derecho allá y aquí seguimos publicándolo, le
  rompimos el derecho a que lo bajen.
- Al localizar a una persona, el origen **reduce sus datos públicos** (deja de
  publicar ubicación y edad). El sync replica eso: esos campos se borran aquí
  también. Si no, terminaríamos mostrando más datos de una persona encontrada
  que la propia fuente.

Por eso hay que correrlo **periódicamente** (un cron diario es lo razonable),
no una sola vez.

## Requisitos

`scraper/scraper/.env` con:

```
SUPABASE_URL=https://hqoirxajavaaasvdfjoy.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_TU_CLAVE   # service_role, Settings > API
```

## Uso

```bash
cd scraper/scraper

# Prueba en seco (no escribe nada). Empieza SIEMPRE por aquí.
py main.py colombia --sin-subir --hasta 2

# Sincronización real (altas + corrección de estado).
py main.py colombia

# Además, retira aquí lo que el origen dejó de publicar.
py main.py colombia --retirar
```

Opciones útiles: `--hasta N` (limitar páginas), `--cortesia S` (pausa entre
peticiones, 1 s por defecto), `--sin-geo` (no geocodificar).

## Decisiones que conviene no revertir sin pensarlo

- **Se leen solo páginas públicas.** El `robots.txt` del sitio prohíbe
  `/admin/`, `/login.php`, `/core.php` y `/estado.php`: ninguna se toca. No se
  resuelve ningún captcha ni se entra a su panel.
- **Las fotos se enlazan, no se copian.** Se apunta a la miniatura en su
  servidor. Además de no rehospedar la imagen de nadie, tiene un efecto útil:
  si allá borran la foto, aquí desaparece sola. Se usa `type=thumb` y no
  `full` para no cargarles el ancho de banda en cada popup del mapa.
- **No se guarda el documento de identidad.** El origen ya lo publica
  enmascarado (`****880`): llega inservible y es dato sensible.
- **No se inventa un contacto.** En el origen, escribirle a la familia pasa
  por un formulario privado que el reportante decide si responde. La app
  enlaza a la publicación original en vez de abrir un canal paralelo que
  nadie modera.
- **`--retirar` solo funciona en recorridos COMPLETOS.** Con `--desde`/`--hasta`
  se ignora y avisa. Lo que no se leyó parece "ya no está en el origen" cuando
  en realidad estaba en una página que nunca se pidió: en pruebas, un
  `--hasta 2 --retirar` habría borrado 123 registros que seguían publicados.
- **`--retirar` tiene además una guarda del 25 %:** si faltara más de eso, no
  borra nada y avisa. Un listado caído a medias no debe vaciar la tabla: un
  registro de más se corrige en la próxima corrida, uno de menos es una
  persona que dejó de buscarse.
- **El listado se pide ordenado por más ANTIGUO** (`sort=oldest`). Con el orden
  por defecto (más recientes primero), cada reporte nuevo empuja todo una
  posición: recorriendo 254 páginas se perderían registros ya leídos y se
  repetirían otros. Con `oldest`, lo nuevo se agrega al final y lo ya
  recorrido no se mueve.

## Pendiente

El permiso para republicar estos datos conviene tenerlo **por escrito de quien
administra el sitio** (no solo de alguien que colabora ahí). Lo ideal sigue
siendo un feed/acuerdo de intercambio en vez de leer HTML: se rompe menos y
permite sincronizar en ambos sentidos.
