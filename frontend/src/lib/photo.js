/**
 * Resolve a URL de exibição de uma foto de check-in.
 *
 * Prioridade:
 *  1. photoUrl (URL pública do Supabase Storage) — preferida por não inflar a resposta JSON
 *  2. photo (string base64 ou data-URI) — fallback para registros legados sem upload no Storage
 *  3. null — sem foto disponível
 *
 * @param {string|null|undefined} photo    - Campo base64 / data-URI vindo do banco
 * @param {string|null|undefined} photoUrl - URL pública do Storage (campo *_photo_url)
 * @returns {string|null}
 */
export function getPhotoSrc(photo, photoUrl) {
  if (photoUrl) return photoUrl;
  if (!photo) return null;
  return photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
}
