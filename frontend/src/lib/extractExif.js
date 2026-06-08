/**
 * Extrai metadados EXIF de um arquivo de imagem usando `exifr`.
 * Suporta JPEG, WebP, PNG e HEIC.
 * Lê o arquivo ORIGINAL (File object) antes de qualquer compressão/resize.
 * Retorna campos padronizados; se ausentes, retorna null sem lançar exceção.
 */
import * as exifr from 'exifr';

const pad = (n) => String(n).padStart(2, '0');

function formatDate(dt) {
  if (!dt) return null;
  if (dt instanceof Date && !isNaN(dt)) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }
  if (typeof dt === 'string') {
    // Formato EXIF: "YYYY:MM:DD HH:MM:SS" → normalizar separador de data
    return dt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  }
  return null;
}

export async function extractExif(file) {
  const result = {
    exif_lat: null,
    exif_long: null,
    exif_datetime: null,
    exif_device: null,
  };

  if (!file) return result;

  try {
    // GPS em chamada separada: exifr.gps() já retorna decimal com sinal (S/W negativos)
    const gps = await exifr.gps(file).catch(() => null);
    if (gps && gps.latitude != null && gps.longitude != null && !isNaN(gps.latitude)) {
      result.exif_lat = parseFloat(gps.latitude.toFixed(7));
      result.exif_long = parseFloat(gps.longitude.toFixed(7));
    }

    // Demais tags: Make, Model, DateTimeOriginal
    const data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: false,
      ifd1: false,
      pick: ['Make', 'Model', 'DateTimeOriginal', 'DateTime', 'CreateDate'],
    }).catch(() => null);

    if (data) {
      const make = (data.Make || '').trim();
      const model = (data.Model || '').trim();
      if (make || model) {
        result.exif_device = [make, model].filter(Boolean).join(' ').trim() || null;
      }

      // DateTimeOriginal > CreateDate > DateTime (do mais ao menos preciso)
      result.exif_datetime = formatDate(data.DateTimeOriginal || data.CreateDate || data.DateTime);
    }
  } catch (_) {
    // Arquivo sem EXIF ou formato não suportado — retorna campos nulos
  }

  return result;
}
