/**
 * useApiCall - generic hook for "fetch data, show loading, handle error" flows.
 *
 * Why this exists (hooks audit, 2026-05-14):
 *   18 pages had nearly-identical loadX functions repeating the same
 *   try/setLoading/toast/finally boilerplate, with subtle inconsistencies:
 *   some reset state to [] on catch, some don't; some have cancellation,
 *   some don't; some swallow errors, some toast. This hook captures the
 *   correct version once.
 *
 * Features:
 *   - Loading / error / data state
 *   - Cancellation guard (no setState after unmount)
 *   - Toast on error (configurable, off by default to avoid surprise toasts)
 *   - Re-fetches when `deps` change (semantically: useEffect with deps)
 *   - Manual refresh / mutate exposed
 *
 * Examples:
 *
 *   // Auto-fetch on mount; reload when filters change.
 *   const { data: jobs, loading, error, refresh } = useApiCall(
 *     () => api.getJobs({ branch }),
 *     {
 *       deps: [branch],
 *       defaultData: [],
 *       errorMessage: 'Erro ao carregar jobs',
 *     },
 *   );
 *
 *   // Skip first auto-fetch (waiting for some condition).
 *   const { data: users, refresh } = useApiCall(api.getUsers, {
 *     immediate: isAdmin,
 *     defaultData: [],
 *   });
 *
 *   // Don't auto-fetch at all; trigger via refresh(args).
 *   const { refresh: archiveJob, loading: archiving } = useApiCall(
 *     api.archiveJob,
 *     { immediate: false, errorMessage: 'Erro ao arquivar' },
 *   );
 *   // ...later: await archiveJob(jobId);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useApiCall(apiFn, options = {}) {
  const {
    deps = [],
    defaultData = null,
    errorMessage = null,
    onSuccess,
    onError,
    immediate = true,
    extractData = (response) => (response?.data ?? defaultData),
  } = options;

  const [data, setData] = useState(defaultData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);

  // Keep the latest apiFn / callbacks in refs so refresh's identity stays
  // stable across renders even when callers pass arrow functions inline.
  // Without this, `useApiCall(() => api.getX(filter))` would re-trigger the
  // effect on every render because the arrow's identity changes.
  const apiFnRef = useRef(apiFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const extractDataRef = useRef(extractData);
  const errorMessageRef = useRef(errorMessage);
  apiFnRef.current = apiFn;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  extractDataRef.current = extractData;
  errorMessageRef.current = errorMessage;

  const refresh = useCallback(async (...args) => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFnRef.current(...args);
      if (cancelledRef.current) return undefined;
      const extracted = extractDataRef.current(response);
      setData(extracted);
      onSuccessRef.current?.(extracted, response);
      return extracted;
    } catch (err) {
      if (cancelledRef.current) return undefined;
      setError(err);
      const fnName = apiFn?.name || 'apiFn';
      console.error(`[useApiCall] ${fnName} failed:`, err);
      if (errorMessageRef.current) {
        toast.error(
          typeof errorMessageRef.current === 'function'
            ? errorMessageRef.current(err)
            : errorMessageRef.current,
        );
      }
      onErrorRef.current?.(err);
      throw err;
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
    // eslint-disable-next-line
  }, deps);

  useEffect(() => {
    if (immediate) {
      // Fire-and-forget: refresh() throws, but for the auto-fetch case the
      // error is already toasted/logged inside refresh — re-throwing here
      // would just trigger an unhandled rejection in the console.
      refresh().catch(() => {});
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh, immediate]);

  return {
    data,
    loading,
    error,
    refresh,
    setData, // escape hatch for optimistic updates
  };
}

export default useApiCall;
