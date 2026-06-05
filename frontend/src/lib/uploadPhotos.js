import api from '../utils/api';
import { compressImage } from './compressImage';

/**
 * Envia fotos extras (índices 1..N de um array de {file, exif}) para /jobs/{jobId}/photos.
 * Fire-and-forget: usa Promise.allSettled — não lança mesmo se alguns uploads falharem.
 * Retorna array de resultados de allSettled para debug.
 */
export async function uploadExtraPhotos(jobId, photos, captionPrefix = '') {
  if (!photos || photos.length === 0) return [];

  return Promise.allSettled(
    photos.map(async (f, i) => {
      const base64 = await compressImage(f.file);
      return api.uploadJobPhoto(jobId, {
        photo_base64: base64,
        caption: captionPrefix ? `${captionPrefix}-${i + 1}` : null,
        exif_lat: f.exif?.exif_lat ?? null,
        exif_long: f.exif?.exif_long ?? null,
        exif_datetime: f.exif?.exif_datetime ?? null,
        exif_device: f.exif?.exif_device ?? null,
        file_name: f.file?.name ?? null,
        file_size_bytes: f.file?.size ?? null,
      });
    })
  );
}
