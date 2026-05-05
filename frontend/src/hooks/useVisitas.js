import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';

const POLL_INTERVAL = 30000;

export function useVisitas(filters = {}) {
  const { user } = useAuth();
  const [visitas, setVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVisitas = useCallback(async () => {
    try {
      const params = { ...filters };
      if (user?.role === 'installer') {
        params.installer_id = user.id;
      }
      const res = await api.listVisitas(params);
      setVisitas(res.data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erro ao carregar visitas');
    } finally {
      setLoading(false);
    }
  }, [user?.role, user?.id, JSON.stringify(filters)]);

  useEffect(() => {
    setLoading(true);
    fetchVisitas();
    const timer = setInterval(fetchVisitas, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchVisitas]);

  const counters = useMemo(() => ({
    total: visitas.length,
    aguardando: visitas.filter(v => v.status === 'AGUARDANDO').length,
    emVisita: visitas.filter(v => v.status === 'EM_VISITA').length,
    concluidas: visitas.filter(v => v.status === 'CONCLUIDA').length,
    canceladas: visitas.filter(v => v.status === 'CANCELADA').length,
  }), [visitas]);

  return { visitas, loading, error, counters, refetch: fetchVisitas };
}
