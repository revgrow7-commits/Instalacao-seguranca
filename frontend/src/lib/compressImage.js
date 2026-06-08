/**
 * Comprime uma File/Blob para base64 JPEG.
 * Alvo: ≤ 1MB de base64 (~750KB binário) — evita estourar o limite de 4.5MB do Vercel.
 * Usa compressão iterativa: reduz qualidade até caber; se persistir, encolhe dimensão.
 */
export function compressImage(file) {
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
