import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

/**
 * Comprime la foto de un desaparecido (persona o mascota) a WebP liviano
 * (~0,3 MB máx, 1200px) y la sube al bucket público `desaparecidos` de
 * Supabase Storage. Devuelve la URL pública. Mismo criterio que las fotos de
 * mascota y de perfil, para no llenar el Storage de imágenes pesadas.
 */
export async function subirFotoDesaparecido(file: File): Promise<string> {
  const comprimida = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  })
  const ruta = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const { error } = await supabase.storage
    .from('desaparecidos')
    .upload(ruta, comprimida, { upsert: false, contentType: 'image/webp' })
  if (error) throw error
  const { data } = supabase.storage.from('desaparecidos').getPublicUrl(ruta)
  return data.publicUrl
}
