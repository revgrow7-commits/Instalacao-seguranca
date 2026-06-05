import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Package, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_ORDER = { instalando: 0, in_progress: 0, agendado: 1, scheduled: 1, aguardando: 2, pending: 2 };

const statusBadge = (status, isLate) => {
  if (isLate) return { label: 'ATRASADO', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' };
  switch (status) {
    case 'instalando':
    case 'in_progress': return { label: 'EM ANDAMENTO', cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' };
    case 'agendado':
    case 'scheduled':  return { label: 'AGENDADO', cls: 'bg-green-500/20 text-green-400 border border-green-500/30' };
    default:           return { label: 'AGUARDANDO', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' };
  }
};

const InstallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.getJobs();
      setJobs(res.data ?? []);
      if (res._stale && res._fresh) {
        res._fresh
          .then(fresh => setJobs(fresh.data ?? []))
          .catch(e => console.warn('[InstallerDashboard] revalidação falhou:', e));
      }
    } catch (e) {
      console.error('[InstallerDashboard] loadJobs:', e);
      toast.error('Erro ao carregar jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const activeJobs = jobs
    .filter(j => !['completed', 'finalizado', 'cancelado', 'arquivado'].includes(j.status) && !j.archived)
    .sort((a, b) => {
      const isLateA = a.scheduled_date && new Date(a.scheduled_date) < new Date() ? -1 : 0;
      const isLateB = b.scheduled_date && new Date(b.scheduled_date) < new Date() ? -1 : 0;
      if (isLateA !== isLateB) return isLateA - isLateB;
      const orderA = STATUS_ORDER[a.status] ?? 9;
      const orderB = STATUS_ORDER[b.status] ?? 9;
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.scheduled_date || a.holdprint_data?.deliveryNeeded || a.created_at || '';
      const dateB = b.scheduled_date || b.holdprint_data?.deliveryNeeded || b.created_at || '';
      return dateA.localeCompare(dateB);
    });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">Olá,</p>
        <h1 className="text-lg font-bold text-white leading-tight">
          {user?.name?.split(' ')[0] || 'Instalador'}
        </h1>
      </div>

      <div className="px-4 pt-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card border border-white/5 h-24 animate-pulse" />
          ))
        ) : activeJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-base font-semibold text-white">Tudo em dia!</p>
            <p className="text-sm text-muted-foreground mt-1">Nenhum job pendente no momento.</p>
          </div>
        ) : (
          activeJobs.map(job => {
            const isLate = !!(job.scheduled_date && new Date(job.scheduled_date) < new Date());
            const badge = statusBadge(job.status, isLate);
            const client = job.holdprint_data?.customerName || job.client_name || '';
            const itemCount = (job.products_with_area || job.items || []).length;
            const code = job.holdprint_data?.code || job.code || '';

            return (
              <button
                key={job.id}
                onClick={() => navigate(`/installer/job/${job.id}`)}
                className={`w-full text-left rounded-xl bg-card border transition-colors active:scale-[0.98] active:bg-white/5 flex items-stretch gap-0
                  ${isLate ? 'border-red-500/40' : 'border-white/5 hover:border-white/15'}
                `}
              >
                {/* Barra lateral de urgência */}
                <div className={`w-1 rounded-l-xl shrink-0 ${isLate ? 'bg-red-500' : job.status === 'instalando' || job.status === 'in_progress' ? 'bg-blue-500' : 'bg-white/10'}`} />

                <div className="flex-1 p-4 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isLate && <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {code && (
                        <span className="text-[10px] text-muted-foreground font-mono">#{code}</span>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>

                  <p className="text-sm font-semibold text-white line-clamp-1">{job.title}</p>
                  {client && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{client}</p>}

                  <div className="flex items-center gap-3 mt-2">
                    {itemCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" />
                        {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      </span>
                    )}
                    {job.scheduled_date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.scheduled_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InstallerDashboard;
