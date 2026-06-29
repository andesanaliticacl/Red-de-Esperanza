import { supabase } from './supabase'

// Llave VAPID PÚBLICA: es pública por diseño (va al navegador). La privada vive
// SOLO en la Edge Function 'enviar-push' como secreto del servidor.
const VAPID_PUBLIC =
  'BIFLf9_jAc1Je-AoHagHBDORmB62EKzq1PCcB7jCB_xdvKm_Nt0gxDuNhqdnV3-CGVadGIpjoMW5w8zA-0kk30A'

function base64UrlToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** ¿El navegador soporta notificaciones push? (iOS solo si está instalada). */
export function pushSoportado(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Estado actual del permiso de notificaciones. */
export function permisoPush(): NotificationPermission {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied'
}

/** ¿Este dispositivo ya está suscrito a push? */
export async function yaSuscrito(): Promise<boolean> {
  if (!pushSoportado()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return Boolean(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}

/**
 * Pide permiso, suscribe el dispositivo a push y guarda la suscripción en la
 * base. Devuelve ok=false con un motivo legible si no se pudo.
 */
export async function activarPush(
  userId: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!pushSoportado()) return { ok: false, motivo: 'no-soportado' }
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, motivo: 'denegado' }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC) as BufferSource,
    })
  }
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) return { ok: false, motivo: error.message }
  return { ok: true }
}

/** Quita la suscripción de este dispositivo (deja de recibir push). */
export async function desactivarPush(): Promise<void> {
  if (!pushSoportado()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch {
    /* silencioso */
  }
}
