import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function InstallerCalendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [syncedJobs, setSyncedJobs] = useState(new Set());

  useEffect(() => {
    if (searchParams.get('google_connected') === 'true' || searchParams.get('connected') === 'true') {
      toast.success('Google Calendar conectado com sucesso!');
    }
    if (searchParams.get('google_error')) {
      toast.error('Erro ao conectar Google Calendar. Tente novamente.');
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusRes, jobsRes, visitasRes] = await Promise.all([
        api.getInstallerCalendarStatus(),
        api.getJobs(),
        api.listVisitas().catch(() => ({ data: [] })),
      ]);
      setIsConnected(statusRes.data?.connected || false);
      // Filter jobs with scheduled_date
      const scheduledJobs = (jobsRes.data || []).filter(j => j.scheduled_date);
      setJobs(scheduledJobs);
      // Filter visitas with scheduled_date
      setVisitas((visitasRes.data || []).filter(v => v.scheduled_date && v.status !== 'CANCELADA'));
    } catch (e) {
      console.error('Error loading data:', e);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleConnect = () => {
    window.location.href = api.getInstallerAuthUrl();
  };

  const handleSync = async (jobId) => {
    try {
      await api.syncJobToInstallerCalendar(jobId);
      setSyncedJobs(prev => new Set([...prev, jobId]));
      toast.success('Job salvo no Google Calendar!');
    } catch (e) {
      console.error('Error syncing:', e);
      toast.error('Erro ao sincronizar com Google Calendar');
    }
  };

  const monthJobs = jobs.filter(j => {
    if (!j.scheduled_date) return false;
    const d = new Date(j.scheduled_date);
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
  });

  const monthVisitas = visitas.filter(v => {
    if (!v.scheduled_date) return false;
    const d = new Date(v.scheduled_date);
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
  });

  const prevMonth = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/installer/dashboard')}
            className="text-muted-foreground hover:text-white transition-colors text-sm">
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-white">Minha Agenda</h1>
        </div>
      </div>

      {/* Google Calendar card */}
      <div className="rounded-xl bg-card border border-white/5 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">Google Calendar</p>
            <p className="text-muted-foreground text-sm mt-0.5">
              {isConnected ? 'Seus jobs agendados serão sincronizados automaticamente' : 'Conecte para salvar seus agendamentos'}
            </p>
          </div>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-sm font-medium">✓ Conectado</span>
            </div>
          ) : (
            <button
              onClick={handleGoogleConnect}
              className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
              Conectar Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-muted-foreground hover:text-white p-2">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-white font-semibold capitalize">
          {currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={nextMonth} className="text-muted-foreground hover:text-white p-2">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Jobs list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="rounded-xl bg-card border border-white/5 p-4 h-24 animate-pulse" />)}
        </div>
      ) : monthJobs.length === 0 && monthVisitas.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          Nenhum item agendado para este mês
        </div>
      ) : (
        <div className="space-y-3">
          {/* Jobs section */}
          {monthJobs.length > 0 && (
            <p className="text-xs text-muted-foreground uppercase tracking-wide px-1">Jobs</p>
          )}
          {monthJobs.map(job => (
            <div key={job.id} className="rounded-xl bg-card border border-white/5 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-semibold">#{job.holdprint_data?.code || job.code || job.id?.slice(0, 6)} — {job.title}</p>
                  <p className="text-muted-foreground text-sm mt-1">📅 {formatDate(job.scheduled_date)}</p>
                  {job.branch && <p className="text-muted-foreground text-sm">📍 {job.branch}</p>}
                </div>
                {isConnected && (
                  syncedJobs.has(job.id) ? (
                    <span className="text-emerald-400 text-sm font-medium">✓ Salvo</span>
                  ) : (
                    <button
                      onClick={() => handleSync(job.id)}
                      className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
                    >
                      Salvar no Google ↗
                    </button>
                  )
                )}
              </div>
            </div>
          ))}

          {/* Visitas Técnicas section */}
          {monthVisitas.length > 0 && (
            <p className="text-xs text-muted-foreground uppercase tracking-wide px-1 mt-4">Visitas Técnicas</p>
          )}
          {monthVisitas.map(visita => (
            <div
              key={visita.id}
              className="rounded-xl bg-card border border-purple-500/30 p-4 cursor-pointer hover:border-purple-500/60 transition-colors"
              onClick={() => navigate(`/visitas-tecnicas/${visita.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                      VT
                    </span>
                    <span className="text-xs text-muted-foreground">{visita.numero_vt}</span>
                  </div>
                  <p className="text-white font-semibold truncate">{visita.titulo || 'VISITA TÉCNICA'}</p>
                  {visita.client_name && (
                    <p className="text-muted-foreground text-sm mt-0.5 truncate">📍 {visita.client_name}</p>
                  )}
                  <p className="text-muted-foreground text-sm mt-1">📅 {formatDate(visita.scheduled_date)}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 shrink-0">
                  {visita.status === 'AGUARDANDO' ? 'Aguardando' :
                   visita.status === 'EM_VISITA' ? 'Em Visita' :
                   visita.status === 'CONCLUIDA' ? 'Concluída' : visita.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
