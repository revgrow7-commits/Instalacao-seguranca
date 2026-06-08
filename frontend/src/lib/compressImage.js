/**
 * Comprime uma File/Blob para base64 JPEG.
 * Alvo: ≤ 1MB de base64 (~750KB binário) — evita estourar o limite de 4.5MB do Vercel.
 * Usa compressão iterativa: reduz qualidade até caber; se persistir, encolhe dimensão.
 * Para HEIC/HEIF: tenta converter via createImageBitmap+Canvas. Se não suportado,
 * envia bytes crus (o backend com pillow-heif faz a conversão).
 */
export function compressImage(file) {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
    || (file.name && (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')));

  if (isHeic) {
    return new Promise((resolve, reject) => {
      if (typeof createImageBitmap !== 'undefined') {
        createImageBitmap(file).then((bitmap) => {
          const maxDim = 1024;
          let w = bitmap.width;
          let h = bitmap.height;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        }).catch(() => {
          // createImageBitmap não suporta HEIC neste dispositivo — enviar bytes crus
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
          reader.readAsDataURL(file);
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
        reader.readAsDataURL(file);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let MAX_WIDTH = 1024;
        let MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width = Math.round((width * MAX_HEIGHT) / height); height = MAX_HEIGHT; }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const MAX_BASE64_BYTES = 1024 * 1024;
        let quality = 0.7;
        let base64 = canvas.toDataURL('image/jpeg', quality);

        while (base64.length > MAX_BASE64_BYTES && quality > 0.2) {
          quality -= 0.1;
          base64 = canvas.toDataURL('image/jpeg', quality);
        }

        let resizeAttempts = 0;
        while (base64.length > MAX_BASE64_BYTES && resizeAttempts < 4) {
          canvas.width = Math.round(canvas.width * 0.7);
          canvas.height = Math.round(canvas.height * 0.7);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const q = Math.max(0.3, 0.5 - resizeAttempts * 0.05);
          base64 = canvas.toDataURL('image/jpeg', q);
          resizeAttempts++;
        }

        resolve(base64);
      };
      img.onerror = () => {
        const type = file?.type || 'desconhecido';
        reject(new Error(`Formato de imagem não suportado (${type}). Use JPEG, PNG ou WebP.`));
      };
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}
