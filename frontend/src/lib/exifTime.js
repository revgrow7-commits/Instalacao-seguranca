// Exibição de horário EXIF com fuso correto e determinístico.
//
// Após o backfill de 2026-06-11, exif_checkin_at/exif_checkout_at são instantes
// CORRETOS, retornados pela API em UTC (ex.: "...00:25:42+00:00" = 21:25 BRT).
// Para mostrar o relógio de parede real da foto, CONVERTEMOS para o fuso da
// operação (America/Sao_Paulo) de forma determinística.
//
// O fallback cru (exif_datetime/checkout_exif_datetime, TEXT sem fuso) já é o
// relógio de parede: nesse caso mostramos os dígitos diretamente.
//
// ⚠️ NUNCA deixar este helper lançar exceção: WebViews Android antigos podem não
// ter dados de fuso ICU e fazem `toLocaleString({timeZone})` lançar RangeError —
// o que crashava o app inteiro (ErrorBoundary "Erro no app"). Por isso o
// try/catch com fallback manual BRT (= UTC-3 fixo; Brasil sem horário de verão
// desde 2019, e os dados são recentes).

const TZ = 'America/Sao_Paulo';
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3
const _norm = (v) => String(v || '').replace(' ', 'T');
// Tem fuso explícito? (Z, +00:00, -03:00, +0000...)
const _hasTz = (s) => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
const _p2 = (n) => String(n).padStart(2, '0');
// Instante (UTC) → componentes do relógio de parede BRT, sem usar Intl.
const _brtParts = (d) => {
  const b = new Date(d.getTime() - BRT_OFFSET_MS);
  return { d: _p2(b.getUTCDate()), mo: _p2(b.getUTCMonth() + 1), y: b.getUTCFullYear(), h: _p2(b.getUTCHours()), mi: _p2(b.getUTCMinutes()) };
};

/** "HH:MM" no horário de São Paulo (relógio de parede da foto), ou null. */
export const exifTimeHM = (v) => {
  if (!v) return null;
  const s = _norm(v);
  if (_hasTz(s)) {
    const d = new Date(s);
    if (isNaN(d)) return null;
    try {
      return d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    } catch {
      const p = _brtParts(d);
      return `${p.h}:${p.mi}`;
    }
  }
  const m = s.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
};

/** "DD/MM/AAAA HH:MM" no horário de São Paulo, ou null. */
export const exifDateTimeBR = (v) => {
  if (!v) return null;
  const s = _norm(v);
  if (_hasTz(s)) {
    const d = new Date(s);
    if (isNaN(d)) return null;
    try {
      return d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      const p = _brtParts(d);
      return `${p.d}/${p.mo}/${p.y} ${p.h}:${p.mi}`;
    }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null;
};
