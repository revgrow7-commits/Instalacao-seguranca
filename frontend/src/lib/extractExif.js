/**
 * Extrai metadados EXIF de um arquivo de imagem JPEG.
 * Retorna coordenadas GPS, data/hora de captura e modelo do dispositivo.
 * Se não encontrar EXIF, retorna campos nulos sem lançar exceção.
 */

function readUInt16(view, offset, littleEndian) {
  return view.getUint16(offset, littleEndian);
}

function readUInt32(view, offset, littleEndian) {
  return view.getUint32(offset, littleEndian);
}

function readRational(view, offset, littleEndian) {
  const num = readUInt32(view, offset, littleEndian);
  const den = readUInt32(view, offset + 4, littleEndian);
  return den === 0 ? 0 : num / den;
}

function readAscii(view, offset, length) {
  let str = '';
  for (let i = 0; i < length - 1; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function parseIFD(view, ifdOffset, littleEndian, tiffStart) {
  const tags = {};
  try {
    const count = readUInt16(view, ifdOffset, littleEndian);
    for (let i = 0; i < count; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;
      const tag = readUInt16(view, entryOffset, littleEndian);
      const type = readUInt16(view, entryOffset + 2, littleEndian);
      const count2 = readUInt32(view, entryOffset + 4, littleEndian);
      const valueOffset = readUInt32(view, entryOffset + 8, littleEndian);

      // type 2 = ASCII, type 5 = RATIONAL, type 7 = UNDEFINED
      if (type === 2) {
        // ASCII string
        const absOffset = count2 <= 4 ? entryOffset + 8 : tiffStart + valueOffset;
        tags[tag] = readAscii(view, absOffset, count2);
      } else if (type === 5) {
        // RATIONAL (numerator/denominator pairs)
        const absOffset = tiffStart + valueOffset;
        if (count2 === 1) {
          tags[tag] = readRational(view, absOffset, littleEndian);
        } else if (count2 === 3) {
          tags[tag] = [
            readRational(view, absOffset, littleEndian),
            readRational(view, absOffset + 8, littleEndian),
            readRational(view, absOffset + 16, littleEndian),
          ];
        }
      } else if (type === 4) {
        // LONG
        const absOffset = count2 <= 1 ? entryOffset + 8 : tiffStart + valueOffset;
        tags[tag] = readUInt32(view, absOffset, littleEndian);
      } else if (type === 3) {
        // SHORT
        tags[tag] = readUInt16(view, entryOffset + 8, littleEndian);
      }
    }
  } catch (_) {
    // silently ignore parse errors
  }
  return tags;
}

// GPS coordinate from DMS array to decimal degrees
function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [degrees, minutes, seconds] = dms;
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return decimal;
}

export async function extractExif(file) {
  const result = {
    exif_lat: null,
    exif_long: null,
    exif_datetime: null,
    exif_device: null,
  };

  if (!file || !file.type?.startsWith('image/')) return result;

  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer(); // primeiros 128KB
    const view = new DataView(buffer);

    // Verificar assinatura JPEG
    if (view.getUint16(0) !== 0xFFD8) return result;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xFFE1) {
        // APP1 — pode conter EXIF
        const segmentLength = view.getUint16(offset);
        offset += 2;
        // Verificar "Exif\0\0"
        if (
          view.getUint8(offset) === 0x45 &&
          view.getUint8(offset + 1) === 0x78 &&
          view.getUint8(offset + 2) === 0x69 &&
          view.getUint8(offset + 3) === 0x66
        ) {
          const tiffStart = offset + 6;
          const byteOrder = view.getUint16(tiffStart);
          const littleEndian = byteOrder === 0x4949; // 'II'

          // IFD0 offset
          const ifd0Offset = tiffStart + readUInt32(view, tiffStart + 4, littleEndian);
          const ifd0 = parseIFD(view, ifd0Offset, littleEndian, tiffStart);

          // Tag 0x010F = Make, 0x0110 = Model, 0x0132 = DateTime
          // Tag 0x8825 = GPS IFD offset
          const make = ifd0[0x010F] || '';
          const model = ifd0[0x0110] || '';
          const datetime = ifd0[0x0132] || null;
          const gpsIFDOffset = ifd0[0x8825];

          if (make || model) {
            result.exif_device = [make, model].filter(Boolean).join(' ').trim() || null;
          }
          if (datetime) {
            // Formato EXIF: "YYYY:MM:DD HH:MM:SS" → ISO 8601
            result.exif_datetime = datetime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          }

          if (gpsIFDOffset != null) {
            const gpsAbsOffset = tiffStart + gpsIFDOffset;
            const gps = parseIFD(view, gpsAbsOffset, littleEndian, tiffStart);

            // 0x0001=LatRef, 0x0002=Lat, 0x0003=LongRef, 0x0004=Long
            const latRef = gps[0x0001];
            const latDMS = gps[0x0002];
            const lngRef = gps[0x0003];
            const lngDMS = gps[0x0004];

            const lat = dmsToDecimal(latDMS, latRef);
            const lng = dmsToDecimal(lngDMS, lngRef);

            if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
              result.exif_lat = parseFloat(lat.toFixed(7));
              result.exif_long = parseFloat(lng.toFixed(7));
            }
          }
        }
        break; // APP1 encontrado, parar
      } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFDA) {
        // Avançar para o próximo segmento
        offset += view.getUint16(offset);
      } else {
        break;
      }
    }
  } catch (_) {
    // Retorna objeto vazio em caso de erro
  }

  return result;
}
