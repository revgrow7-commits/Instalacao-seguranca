// Exibição de horário EXIF com fuso correto e determinístico.
//
// Após o backfill de 2026-06-11, exif_checkin_at/exif_checkout_at são instantes
// CORRETOS, retornados pela API em UTC (ex.: "...00:25:42+00:00" = 21:25 BRT).
// Para mostrar o relógio de parede real da foto, CONVERTEMOS para o fuso da
// operação (America/Sao_Paulo) de forma determinística — não dependendo do fuso
// do navegador de quem abre o relatório.
//
// O fallback cru (exif_datetime/checkout_exif_datetime, TEXT sem fuso) já é o
// relógio de parede: nesse caso mostramos os dígitos diretamente.

const TZ = 'America/Sao_Paulo';
const _norm = (v) => String(v || '').replace(' ', 'T');
// Tem fuso explícito? (Z, +00:00, -03:00, +0000...)
const _hasTz = (s) => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);

/** "HH:MM" no horário de São Paulo (relógio de parede da foto), ou null. */
export const exifTimeHM = (v) => {
  if (!v) return null;
  const s = _norm(v);
  if (_hasTz(s)) {
    const d = new Date(s);
    return isNaN(d) ? null : d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
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
    return isNaN(d) ? null : d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null;
};
