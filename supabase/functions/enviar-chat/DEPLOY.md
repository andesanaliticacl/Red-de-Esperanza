# Chat en vivo: Edge Function

Esta funcion es obligatoria para que el chat no pueda escribirse saltandose el
frontend. Exige una cuenta con sesion valida (JWT) y que la sala (`ciudad`)
sea una de las conocidas: Venezuela (salas = solo el nombre del estado, sin
prefijo, para no romper el historial anterior al selector de pais), Chile
(salas `chile/<region>`) o Colombia (salas `colombia/<departamento>`).
Agregar un pais nuevo implica sumarlo tanto aqui (`REGIONES_CHILE`/
`REGIONES_COLOMBIA`/`ESTADOS_VENEZUELA` y `paisEsperadoDeSala`) como en
`web/src/lib/regionesChat.ts` — deben quedar sincronizados.

Ya NO valida la IP de quien escribe contra el pais de la sala: cualquier
cuenta puede escribir en cualquier sala, sin importar desde donde se
conecte (esa restriccion se quito — antes exigia que la IP coincidiera con
el pais de la sala). A cambio, el pais/ciudad de conexion se guarda al
INICIAR SESION (`perfiles.ultimo_login_pais/ultimo_login_ciudad`, migracion
67) para estadistica en el panel de admin, no para bloquear nada.

## 1) Desplegar la Edge Function

Desde la raiz del repo:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy enviar-chat --no-verify-jwt
```

`--no-verify-jwt` es necesario porque la funcion valida el JWT ella misma
(vía `autorDesdeJWT`) y devuelve un error claro en vez de un 401 generico de
la plataforma.

## 2) Ejecutar la migracion

En Supabase SQL Editor, corre:

```sql
-- contenido de supabase/36_chat_solo_edge_function.sql
-- contenido de supabase/37_chat_respuestas.sql
-- contenido de supabase/38_chat_borrar_admin.sql
```

Esta migracion bloquea inserts directos desde `anon`/`authenticated` en
`chat_global` y `chat_contactos`. Desde ese momento, el unico camino de escritura
es la Edge Function `enviar-chat`.

La migracion `37_chat_respuestas.sql` agrega los campos necesarios para mostrar
la cita del mensaje respondido.

La migracion `38_chat_borrar_admin.sql` permite borrar mensajes solo al rol
admin y activa los eventos realtime de borrado.

## 3) Redesplegar tras cambios en index.ts

Cada vez que se edite `index.ts` (como al sumar un pais nuevo) hay que volver
a correr:

```bash
supabase functions deploy enviar-chat --no-verify-jwt
```

El frontend por si solo NO alcanza: la validacion de que la sala exista vive
en el servidor. Sin este redeploy, los cambios de `index.ts` no se reflejan
aunque el resto de la app ya este actualizado.
