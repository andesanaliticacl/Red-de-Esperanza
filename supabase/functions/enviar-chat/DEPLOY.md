# Chat con validacion de IP

Esta funcion es obligatoria para que el chat no pueda escribirse saltandose el
frontend. Valida la IP en servidor y solo inserta mensajes si el pais detectado
es Venezuela.

## 1) Desplegar la Edge Function

Desde la raiz del repo:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy enviar-chat --no-verify-jwt
```

`--no-verify-jwt` permite que tambien escriban invitados anonimos. La funcion
igualmente valida la IP en servidor antes de insertar.

## 2) Ejecutar la migracion

En Supabase SQL Editor, corre:

```sql
-- contenido de supabase/36_chat_solo_edge_function.sql
-- contenido de supabase/37_chat_respuestas.sql
```

Esta migracion bloquea inserts directos desde `anon`/`authenticated` en
`chat_global` y `chat_contactos`. Desde ese momento, el unico camino de escritura
es la Edge Function `enviar-chat`.

La migracion `37_chat_respuestas.sql` agrega los campos necesarios para mostrar
la cita del mensaje respondido.

## 3) Riesgo conocido

La geolocalizacion por IP detecta el pais del punto de salida. Si una VPN sale
por fuera de Venezuela, queda bloqueada. Si una VPN sale por una IP venezolana,
esta regla la tratara como Venezuela salvo que se agregue un proveedor especifico
de deteccion de VPN/proxy.

## 4) Bypass local para pruebas

Opcionalmente puedes permitir escritura desde `localhost` sin validar IP usando
un token de prueba.

En Supabase Edge Functions Secrets agrega:

```bash
CHAT_DEV_BYPASS_TOKEN=un-token-largo-y-random
```

En `web/.env` local agrega el mismo valor:

```bash
VITE_CHAT_DEV_BYPASS_TOKEN=un-token-largo-y-random
```

Este bypass solo se envia desde builds de desarrollo de Vite y la Edge Function
solo lo acepta si el `Origin` es `localhost`, `127.0.0.1` o `::1`.
