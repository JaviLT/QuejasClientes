// Quejas de Clientes — lógica compartida de adjuntos (Supabase Storage, bucket "adjuntos-quejas").
// La usan tanto Comercial (al levantar una queja nueva) como Calidad (al capturar el dictamen),
// para no duplicar la subida/el límite/los íconos en cada pantalla.
import { supabase } from './supabase-client.js';

// Los adjuntos se guardan en Supabase Storage, no en la base de datos — en la tabla
// queja_adjuntos solo queda una referencia chiquita (nombre + ruta). Este límite por archivo
// cuida el 1 GB gratis del plan de Storage.
export const MAX_ADJUNTO_BYTES = 15 * 1024 * 1024; // 15 MB

export function formatoTamano(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ícono (emoji) según el tipo de archivo — mismo criterio visual que el resto de la app
 * (íconos de texto/emoji, sin librería de íconos externa). */
export function iconoParaArchivo(tipoMime, nombre) {
  const mime = tipoMime || '';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎞️';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';

  const extension = (nombre || '').split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(extension)) return '📄';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic'].includes(extension)) return '🖼️';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) return '🎞️';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) return '🎵';
  if (['doc', 'docx'].includes(extension)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(extension)) return '📊';
  if (['zip', 'rar', '7z'].includes(extension)) return '🗜️';
  return '📎';
}

/** true si el archivo es una imagen (por tipo MIME o, si no hay MIME, por extensión) — se usa en
 * el detalle de la queja (detalle.js) para decidir si se ve la imagen completa o solo un ícono. */
export function esImagenAdjunto(tipoMime, nombre) {
  const mime = tipoMime || '';
  if (mime.startsWith('image/')) return true;
  if (mime) return false; // ya sabemos el tipo y no es imagen — no hace falta adivinar por extensión
  const extension = (nombre || '').split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic'].includes(extension);
}

/** Sube cada archivo a Storage (bucket adjuntos-quejas) y registra su referencia en queja_adjuntos.
 * Devuelve la lista de nombres de archivo que no se pudieron subir (si alguno falla). */
export async function subirAdjuntos(quejaId, archivos) {
  const fallos = [];
  for (const archivo of archivos) {
    const nombreSaneado = archivo.name.replace(/[^\w.\-]+/g, '_');
    const ruta = `${quejaId}/${Date.now()}-${nombreSaneado}`;
    const { error: errorSubida } = await supabase.storage.from('adjuntos-quejas').upload(ruta, archivo);
    if (errorSubida) {
      console.error(errorSubida);
      fallos.push(archivo.name);
      continue;
    }
    const { error: errorFila } = await supabase.from('queja_adjuntos').insert({
      queja_id: quejaId,
      nombre_archivo: archivo.name,
      ruta_storage: ruta,
      tipo_mime: archivo.type || null,
      tamanio_bytes: archivo.size,
    });
    if (errorFila) {
      console.error(errorFila);
      fallos.push(archivo.name);
    }
  }
  return fallos;
}
