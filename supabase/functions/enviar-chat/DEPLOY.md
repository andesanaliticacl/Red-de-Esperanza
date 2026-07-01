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
```

Esta migracion bloquea inserts directos desde `anon`/`authenticated` en
`chat_global` y `chat_contactos`. Desde ese momento, el unico camino de escritura
es la Edge Function `enviar-chat`.

## 3) Riesgo conocido

La geolocalizacion por IP detecta el pais del punto de salida. Si una VPN sale
por fuera de Venezuela, queda bloqueada. Si una VPN sale por una IP venezolana,
esta regla la tratara como Venezuela salvo que se agregue un proveedor especifico
de deteccion de VPN/proxy.
