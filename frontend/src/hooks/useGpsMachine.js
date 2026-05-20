/**
 * useGpsMachine — máquina de estados para aquisição de GPS no fluxo de check-in.
 *
 * Por que existe (auditoria de estado, 2026-05-18):
 *   InstallerJobDetail.jsx mantinha 7 useStates correlatos (gpsLocation,
 *   gpsError, gpsConfirmOpen, gpsConfirmMessage, gpsConfirmResolve,
 *   locationPermissionGuideOpen, pendingGpsRetry) para representar UMA única
 *   máquina de estados. Cada transição mexia em 2-4 desses estados, com risco
 *   de inconsistência se um setX falhasse no meio.
 *
 *   Este hook concentra a máquina em um useReducer e expõe uma API pequena:
 *
 *     const {
 *       phase,        // 'idle' | 'requesting' | 'success' | 'denied' | 'failed'
 *       location,     // { lat, long, accuracy } | null
 *       error,        // string | null  — mensagem amigável
 *       errorCode,    // 1|2|3|null      — código nativo do navigator
 *       requestGPS,   // () => Promise<{lat,long,accuracy}>  — chama o navegador
 *       reset,        // () => void                          — volta a 'idle'
 *     } = useGpsMachine({
 *       accuracyLimit: 200,
 *       timeoutMs: 30000,
 *       fallbackTimeoutMs: 15000,
 *       fallbackMaxAge: 60000,
 *       confirmLowAccuracy: (msg) => Promise<boolean>,  // injeta useConfirmDialog
 *     });
 *
 * Estratégia de retry: alta precisão (timeout grande), depois fallback baixa
 * precisão (timeout menor, cache 60s). Permissão negada (código 1) não retenta.
 *
 * Se a precisão exceder `accuracyLimit`, chama `confirmLowAccuracy(msg)` e
 * só prossegue se o usuário confirmar. Esse hook NÃO renderiza UI — deixa o
 * dialog a cargo de `useConfirmDialog` (separação de responsabilidades).
 */
import { useCallback, useReducer, useRef } from 'react';

const initialState = {
  phase: 'idle',     // idle | requesting | success | denied | failed
  location: null,
  error: null,
  errorCode: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'REQUEST':
      return { ...state, phase: 'requesting', error: null, errorCode: null };
    case 'SUCCESS':
      return { phase: 'success', location: action.location, error: null, errorCode: null };
    case 'DENIED':
      return { phase: 'denied', location: null, error: action.error, errorCode: 1 };
    case 'FAILED':
      return { phase: 'failed', location: null, error: action.error, errorCode: action.code ?? null };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const ERROR_MESSAGES = {
  1: 'Permissão de localização negada. Ative o GPS nas configurações do navegador.',
  2: 'Posição não disponível. Verifique se o GPS está ativado.',
  3: 'Tempo esgotado ao obter GPS. Vá para um local aberto e tente novamente.',
};

function tryGetPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function useGpsMachine(options = {}) {
  const {
    accuracyLimit = 200,
    timeoutMs = 30000,
    fallbackTimeoutMs = 15000,
    fallbackMaxAge = 60000,
    confirmLowAccuracy = null,
    // Hook para toast de "tentando sinal alternativo" — opcional.
    onFallbackAttempt = null,
  } = options;

  const [state, dispatch] = useReducer(reducer, initialState);

  // Mantém o controle de chamada em andamento para evitar requests concorrentes.
  const inflightRef = useRef(null);

  const requestGPS = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;

    if (!navigator.geolocation) {
      const error = 'Este dispositivo não suporta GPS. Use um smartphone com localização ativada.';
      dispatch({ type: 'FAILED', error });
      throw Object.assign(new Error(error), { gpsCode: null });
    }

    dispatch({ type: 'REQUEST' });

    const promise = (async () => {
      let position;
      try {
        position = await tryGetPosition({
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        });
      } catch (firstErr) {
        if (firstErr.code === 1) {
          const error = ERROR_MESSAGES[1];
          dispatch({ type: 'DENIED', error });
          throw Object.assign(new Error(error), { gpsCode: 1 });
        }
        if (onFallbackAttempt) onFallbackAttempt(firstErr);
        try {
          position = await tryGetPosition({
            enableHighAccuracy: false,
            timeout: fallbackTimeoutMs,
            maximumAge: fallbackMaxAge,
          });
        } catch (secondErr) {
          const error = ERROR_MESSAGES[secondErr.code] || 'Não foi possível obter localização GPS.';
          dispatch({ type: 'FAILED', error, code: secondErr.code });
          throw Object.assign(new Error(error), { gpsCode: secondErr.code });
        }
      }

      // Verifica precisão. Se ruim, pede confirmação ao usuário.
      if (position.coords.accuracy > accuracyLimit) {
        const accuracyM = Math.round(position.coords.accuracy);
        const msg = `Sinal GPS impreciso (${accuracyM}m). O ideal é abaixo de ${accuracyLimit}m, mas podemos registrar mesmo assim.\n\nDeseja continuar?`;
        const proceed = confirmLowAccuracy ? await confirmLowAccuracy(msg) : true;
        if (!proceed) {
          const error = `Check-in cancelado — GPS impreciso (${accuracyM}m).`;
          dispatch({ type: 'FAILED', error, code: null });
          throw new Error(error);
        }
      }

      const location = {
        lat: position.coords.latitude,
        long: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      dispatch({ type: 'SUCCESS', location });
      return location;
    })();

    inflightRef.current = promise;
    try {
      return await promise;
    } finally {
      inflightRef.current = null;
    }
  }, [accuracyLimit, timeoutMs, fallbackTimeoutMs, fallbackMaxAge, confirmLowAccuracy, onFallbackAttempt]);

  const reset = useCallback(() => {
    inflightRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    phase: state.phase,
    location: state.location,
    error: state.error,
    errorCode: state.errorCode,
    requestGPS,
    reset,
  };
}

export default useGpsMachine;
