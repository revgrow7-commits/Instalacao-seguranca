import React from 'react';
import { Images, X, MapPin, Clock, Camera } from 'lucide-react';
import { extractExif } from '../lib/extractExif';

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
    input.accept = 'image/*';
    input.multiple = mode === 'gallery';
    const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mode === 'camera' && isMobile) input.setAttribute('capture', 'environment');

    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []).slice(0, available);
      if (!files.length) return;
      const processed = await Promise.all(files.map(async (file) => {
        const exif = await extractExif(file).catch(() => ({}));
        const preview = URL.createObjectURL(file);
        return { file, exif, preview };
      }));
      onPhotos(processed);
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
              <img src={f.preview} alt="" className="w-full h-full object-cover" loading="lazy" />
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
                  <MapPin className="h-3 w-3 text-green-400 drop-shadow" />
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
            Registro EXIF
          </div>
          <div className="flex gap-4">
            <span><span className="text-muted-foreground">Início: </span><span className="text-white">{formatTime(earliest)}</span></span>
            {latest && latest !== earliest && (
              <span><span className="text-muted-foreground">Fim: </span><span className="text-green-400">{formatTime(latest)}</span></span>
            )}
          </div>
          {withGps && (
            <div className="flex items-center gap-1 text-green-400/80">
              <MapPin className="h-3 w-3" />
              <span className="font-mono">{withGps.exif.exif_lat.toFixed(4)}, {withGps.exif.exif_long.toFixed(4)}</span>
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
