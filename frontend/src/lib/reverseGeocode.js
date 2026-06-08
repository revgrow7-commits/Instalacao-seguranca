/**
 * Converte coordenadas GPS em endereço legível via Nominatim (OpenStreetMap).
 * Gratuito, sem API key. Retorna null em caso de falha ou ausência de sinal.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json` +
      `&lat=${lat}&lon=${lng}&accept-language=pt-BR&zoom=17&addressdetails=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'instal-visual/1.0' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;
    const addr = data.address || {};
    const parts = [
      addr.road || addr.pedestrian || addr.footway || addr.street,
      addr.house_number,
      addr.suburb || addr.neighbourhood || addr.quarter,
      addr.city || addr.town || addr.village || addr.municipality,
      addr.state,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : (data.display_name || null);
  } catch {
    return null;
  }
}
