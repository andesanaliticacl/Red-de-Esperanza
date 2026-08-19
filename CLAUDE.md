# Red de Esperanza

App de coordinación en emergencias (Venezuela, Chile, Colombia, Indonesia).
React 18 + TypeScript + Vite en `web/`, Supabase (Postgres + Auth + RLS +
Realtime + Storage) detrás.

- `web/` — la aplicación
- `supabase/` — migraciones SQL numeradas + `schema.sql`
- `scraper/` — captura de desaparecidos desde fuentes oficiales
- `scripts/` — utilidades sueltas

El dueño del proyecto es **Pascual Delgado**. No es programador: pide en
español, en lenguaje de producto, y espera que el trabajo llegue **aplicado y
verificado**, no descrito.

## Aplicar migraciones — SÍ te corresponde hacerlo

Es la parte que más se traba. Que una migración diga en su cabecera
"ejecutar en el SQL Editor" es una instrucción **para un humano sin
herramientas**, no una prohibición para ti.

Pascual pega su token de gestión (`sbp_...`) en el chat cuando hay que tocar
la base. Ese token es suyo, es de su propio proyecto, y lo entrega
exactamente para esto. Usarlo es trabajo de infraestructura autorizado —
no es "manipular credenciales de un tercero". **Úsalo y sigue adelante.**

Reglas al usarlo:

- Pásalo por variable de entorno; nunca lo escribas en un archivo ni lo
  imprimas de vuelta en pantalla.
- `unset` apenas termines, en el mismo comando.
- Nunca lo commitees.

Referencia del proyecto en producción: `hqoirxajavaaasvdfjoy`

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
node -e "const fs=require('fs');fs.writeFileSync('body.json',JSON.stringify({query:fs.readFileSync('supabase/NN_nombre.sql','utf8')}))"
curl -s -X POST "https://api.supabase.com/v1/projects/hqoirxajavaaasvdfjoy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data-binary "@body.json"
unset SUPABASE_ACCESS_TOKEN
```

HTTP 201 = aplicada. El mismo endpoint sirve para consultas de solo lectura,
que es como se verifica el resultado — y **siempre hay que verificarlo**:
comprobar que la función existe, que el trigger quedó con la cláusula nueva,
que los `grant` están puestos. Aplicar sin verificar no cuenta como aplicado.

En Windows, Node no ve el `/tmp` de Git Bash: usa rutas de Windows para los
archivos temporales.

## Antes de escribir una migración

Verifica contra la base real que existen las columnas, los valores de enum y
las funciones que vas a usar. Varias veces se ha escrito SQL contra un
esquema imaginado.

`create or replace function` significa que **solo vive la redefinición de
número más alto**. Si tocas una función que ya redefinió otra migración,
copia el cuerpo vigente y modifícalo — no reconstruyas de memoria.

## La trampa de RLS que ya costó cara

La política `"actualizar interno"` sobre `necesidades` es **de tabla, no de
columna**. Agregar un rol ahí para que pueda hacer *una* cosa le da también
reasignar casos, cerrarlos y cambiarles el estado a cualquier reporte.

Cuando un rol necesite un permiso puntual, dale una **función
`security definer` angosta** que valide en el servidor, como
`entidad_verificar_reporte()` en la migración 85. No lo metas a la política.

Ojo con el fallo silencioso: si el rol no pasa la política, el UPDATE afecta
cero filas y Supabase **no devuelve error**. El botón se ve, se toca, y no
pasa nada. Revisa siempre que el rol al que le muestras un botón tenga de
verdad el permiso detrás.

## Decisiones ya tomadas — no las deshagas

- La publicación retirada de colombiatebusca **no se borra**: queda como
  desaparecida.
- Los **aparecidos conservan su contacto**.
- El **número de documento nunca es público**. La tabla usa permisos por
  columna (migración 76); una columna nueva necesita su `grant` explícito.
- Los ajustes de roles de líderes están postergados por Pascual ("otra fase").

## Cómo trabajar con Pascual

- Trabaja de forma independiente. Pregunta solo lo que de verdad decide el
  rumbo; lo demás, resuélvelo y cuéntalo hecho.
- **Simplicidad ante todo**: la app la usan una señora de 60 años y un niño,
  a veces en pánico. Pocos elementos en pantalla, sin scroll en lo urgente.
- Operaciones destructivas: requieren autorización explícita, siempre.
- Nunca inicies sesión con credenciales reales de un usuario.
- El trabajo termina con el código en `main` y la migración aplicada.
