import React from 'react';
import { Images, X, MapPin, Clock, Camera } from 'lucide-react';
import { extractExif } from '../lib/extractExif';
import { reverseGeocode } from '../lib/reverseGeocode';
import { toast } from 'sonner';

/**
 * Seletor de fotos com suporte a câmera e galeria.
 * Props:
 *   photos      – Array<{file, exif, preview}>
 *   onPhotos    – (newPhotos: Array<{file, exif, preview}>) => void  – called with additional photos
 *   onRemove    – (index: number) => void
 *   disabled    – boolean
 *   maxPhotos   – number (default 10)
 *   label       – string
 */
const PhotoGalleryPicker = ({
  photos = [],
  onPhotos,
  onRemove,
  disabled = false,
  maxPhotos = 10,
  label = 'Fotos',
}) => {
  const atLimit = photos.length >= maxPhotos;

  const openPicker = (mode) => {
    if (disabled || atLimit) return;
    const available = maxPhotos - photos.length;
    const input = document.createElement('input');
    input.type = 'file';
    // Galeria: image/* abre a galeria nativa no Android e mostra todas as fotos recentes.
    // MIME types específicos causam filtragem no Android e escondem fotos recentes.
    // Validação de formato é feita depois da seleção (bloco "supported" abaixo).
    // Câmera: image/* — sempre gera JPEG/PNG compatível.
    input.accept = 'image/*';
    input.multiple = mode === 'gallery';
    const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mode === 'camera' && isMobile) input.setAttribute('capture', 'environment');

    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []).slice(0, available);
      if (!files.length) return;

      // Pre-fetch GPS once for all files — one permission prompt, shared result
      let liveGpsPromise = null;
      const getLiveGps = () => {
        if (!liveGpsPromise) {
          liveGpsPromise = new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, long: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
            );
          });
        }
        return liveGpsPromise;
      };

      try {
        const results = await Promise.allSettled(files.map(async (file) => {
          const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
            || (file.name && (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')));

          // Rejeitar apenas formatos que não são imagem de forma alguma
          const supported = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
          if (file.type && !supported.includes(file.type.toLowerCase())) {
            throw new Error(`Formato não suportado: ${file.type}. Use JPEG, PNG ou WebP.`);
          }

          const exif = await extractExif(file).catch(() => ({}));
          // HEIC não pode ser renderizado no browser — usar placeholder
          const preview = isHeic ? null : URL.createObjectURL(file);
          const processedFile = file;

          // Fallback: se a foto não tiver GPS no EXIF, usar posição atual do dispositivo
          if (exif.exif_lat == null) {
            const gps = await getLiveGps();
            if (gps) {
              exif.exif_lat = gps.lat;
              exif.exif_long = gps.long;
              exif.gps_fallback = true;
            }
          }

          // Fallback: se não tiver horário no EXIF, usar horário atual
          if (!exif.exif_datetime) {
            const now = new Date();
            exif.exif_datetime = now.toISOString().replace('T', ' ').slice(0, 19);
            exif.datetime_fallback = true;
          }

          return { file: processedFile, exif, preview, isHeic };
        }));

        const valid = results
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value);

        // Geocodificação reversa: uma chamada para o lote inteiro (mesmo local)
        const firstWithGps = valid.find(p => p.exif?.exif_lat != null);
        if (firstWithGps) {
          const address = await reverseGeocode(
            firstWithGps.exif.exif_lat,
            firstWithGps.exif.exif_long
          ).catch(() => null);
          if (address) {
            valid.forEach(p => { if (p.exif) p.exif.exif_address = address; });
          }
        }

        const rejected = results.filter(r => r.status === 'rejected');
        if (rejected.length > 0) {
          const msg = rejected[0].reason?.message || 'Formato de imagem não suportado';
          toast.error(msg, { duration: 5000 });
        }

        if (valid.length > 0) onPhotos(valid);
      } catch (err) {
        console.error('[PhotoGalleryPicker] erro ao processar fotos:', err);
        toast.error('Erro ao processar foto. Tente tirar uma nova com a câmera.', { duration: 5000 });
      }
    };
    input.click();
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    try { return new Date(isoStr.replace(' ', 'T')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return null; }
  };

  const exifTimes = photos.map(f => f.exif?.exif_datetime).filter(Boolean).sort();
  const earliest = exifTimes[0];
  const latest = exifTimes[exifTimes.length - 1];
  const withGps = photos.find(f => f.exif?.exif_lat != null);

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((f, pi) => (
            <div key={pi} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
              {f.preview
                ? <img src={f.preview} alt="" className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-white/5">
                    <Camera className="h-6 w-6 text-white/40" />
                    <span className="text-[9px] text-white/40">HEIC</span>
                  </div>
              }
              <button
                type="button"
                onClick={() => onRemove(pi)}
                disabled={disabled}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
              >
                <X className="h-3 w-3 text-white" />
              </button>
              {f.exif?.exif_datetime && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
                  <p className="text-[9px] text-white/90 text-center truncate">{formatTime(f.exif.exif_datetime)}</p>
                </div>
              )}
              {f.exif?.exif_lat != null && (
                <div className="absolute top-0.5 left-0.5">
                  <MapPin className={`h-3 w-3 drop-shadow ${f.exif.gps_fallback ? 'text-blue-400' : 'text-green-400'}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {earliest && (
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <Clock className="h-3 w-3" />
            {photos.some(f => f.exif?.datetime_fallback) ? 'Registro (horário atual)' : 'Registro EXIF'}
          </div>
          <div className="flex gap-4">
            <span><span className="text-muted-foreground">Início: </span><span className="text-white">{formatTime(earliest)}</span></span>
            {latest && latest !== earliest && (
              <span><span className="text-muted-foreground">Fim: </span><span className="text-green-400">{formatTime(latest)}</span></span>
            )}
          </div>
          {withGps && (
            <div className={`space-y-0.5 ${withGps.exif.gps_fallback ? 'text-blue-400/80' : 'text-green-400/80'}`}>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="font-mono text-[10px]">{withGps.exif.exif_lat.toFixed(4)}, {withGps.exif.exif_long.toFixed(4)}</span>
                {withGps.exif.gps_fallback && <span className="text-muted-foreground ml-1">(GPS atual)</span>}
              </div>
              {withGps.exif.exif_address && (
                <p className="text-[10px] text-white/60 pl-4 leading-tight">{withGps.exif.exif_address}</p>
              )}
              {withGps.exif.exif_lat && !withGps.exif.exif_address && (
                <p className="text-[10px] text-muted-foreground pl-4">Obtendo endereço...</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => openPicker('camera')}
          disabled={disabled || atLimit}
          className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-lg border border-dashed text-xs transition-colors active:scale-[0.97]
            ${atLimit || disabled
              ? 'border-white/10 text-muted-foreground cursor-not-allowed'
              : 'border-blue-500/40 text-blue-400 hover:border-blue-500/70 hover:bg-blue-500/5'}`}
        >
          <Camera className="h-3.5 w-3.5" />
          Câmera
        </button>
        <button
          type="button"
          onClick={() => openPicker('gallery')}
          disabled={disabled || atLimit}
          className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-lg border border-dashed text-xs transition-colors active:scale-[0.97]
            ${atLimit || disabled
              ? 'border-white/10 text-muted-foreground cursor-not-allowed'
              : 'border-green-500/40 text-green-400 hover:border-green-500/70 hover:bg-green-500/5'}`}
        >
          <Images className="h-3.5 w-3.5" />
          {photos.length === 0 ? 'Galeria' : atLimit ? `Limite (${maxPhotos})` : `Galeria (${photos.length}/${maxPhotos})`}
        </button>
      </div>
    </div>
  );
};

export default PhotoGalleryPicker;
