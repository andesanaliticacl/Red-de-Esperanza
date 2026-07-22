import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

/**
 * Comprime una foto de mascota a WebP liviano (~0,3 MB máx, 1200px) y la sube
 * al bucket público `mascotas` de Supabase Storage. Devuelve la URL pública
 * para guardarla en la necesidad. Mismo criterio que las fotos de perfil, así
 * la base/Storage no se llena de imágenes pesadas.
 */
export async function subirFotoMascota(file: File): Promise<string> {
  const comprimida = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  })
  const ruta = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const { error } = await supabase.storage
    .from('mascotas')
    .upload(ruta, comprimida, { upsert: false, contentType: 'image/webp' })
  if (error) throw error
  const { data } = supabase.storage.from('mascotas').getPublicUrl(ruta)
  return data.publicUrl
}
