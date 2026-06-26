/**
 * Helpers de data/hora no fuso da operação (America/Sao_Paulo, BRT, UTC-3 fixo
 * desde 2019 — Brasil sem horário de verão).
 *
 * Motivo: o agendamento gravava/lia data e hora usando o fuso do DISPOSITIVO
 * (new Date("YYYY-MM-DDTHH:mm").toISOString()) e, no prefill do reagendamento,
 * misturava DATA em UTC (toISOString) com HORA local (getHours) — o que jogava o
 * job para o dia seguinte em horários noturnos. Estes helpers fixam BRT em todos
 * os pontos, independente do fuso do navegador.
 *
 * REGRA: nenhuma função pode lançar (RangeError de timeZone trava WebView Android
 * antigo). Em falha, caem para o comportamento local.
 */

const TZ = 'America/Sao_Paulo';

/** 'YYYY-MM-DD' no fuso BRT a partir de um Date/instante. */
export function brtDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    // en-CA formata como YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** 'HH:mm' (24h) no fuso BRT a partir de um Date/instante. */
export function brtTimeStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Converte uma data/hora de PAREDE em BRT (ex.: '2026-06-25' + '14:30') para o
 * instante UTC em ISO. Sempre trata a entrada como BRT (-03:00), nunca como fuso
 * do dispositivo. Retorna null se a entrada for inválida.
 */
export function brtWallToUtcIso(ymd, hm) {
  if (!ymd) return null;
  const time = hm && /^\d{2}:\d{2}/.test(hm) ? hm : '08:00';
  const iso = new Date(`${ymd}T${time}:00-03:00`);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}
