import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Calendar as CalendarIcon,
  ArrowLeft,
  Check,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const InstallerCalendar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [syncedJobs, setSyncedJobs] = useState(new Set());
  const [syncing, setSyncing] = useState(null);

  // Check if we just came back from Google auth
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      toast.success('Google Calendar conectado com sucesso!', { duration: 4000 });
    }
  }, [searchParams]);

  // Load calendar status and jobs
  useEffect(() => {
    loadCalendarData();
  }, []);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const [statusRes, jobsRes] = await Promise.all([
        api.getInstallerCalendarStatus(),
        api.getJobs(),
      ]);

      setIsGoogleConnected(statusRes.data.is_connected);
      setJobs(jobsRes.data || []);
    } catch (error) {
      console.error('Error loading calendar data:', error);
      toast.error('Erro ao carregar dados do calendário');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleConnect = () => {
    const authUrl = api.getInstallerAuthUrl();
    window.location.href = authUrl;
  };

  const handleSyncJob = async (jobId) => {
    try {
      setSyncing(jobId);
      await api.syncJobToInstallerCalendar(jobId);
      setSyncedJobs(prev => new Set(prev).add(jobId));
      toast.success('Job adicionado ao Google Calendar!', { duration: 3000 });
    } catch (error) {
      console.error('Error syncing job:', error);
      toast.error('Erro ao sincronizar com Google Calendar');
    } finally {
      setSyncing(null);
    }
  };

  // Filter jobs for current month and that have scheduled_date
  const monthJobs = jobs.filter(job => {
    if (!job.scheduled_date) return false;
    const jobDate = new Date(job.scheduled_date);
    return (
      jobDate.getFullYear() === currentMonth.getFullYear() &&
      jobDate.getMonth() === currentMonth.getMonth()
    );
  }).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6 pb-24 md:pb-8 animate-page-reveal">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-8 w-32 rounded bg-white/10 animate-pulse" />
        </div>
        <div className="h-32 rounded-xl bg-card border border-white/5 animate-pulse" />
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 rounded-xl bg-card border border-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24 md:pb-8 animate-page-reveal">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/installer/dashboard')}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">
            Minha Agenda
          </h1>
        </div>
        <CalendarIcon className="h-6 w-6 md:h-8 md:w-8 text-primary flex-shrink-0" />
      </div>

      {/* Google Calendar Connection Card */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" fill="#4285F4" />
            </svg>
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isGoogleConnected ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span className="text-sm text-muted-foreground">Conectado com sucesso</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoogleConnect}
                className="text-xs"
              >
                Reconectar
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleGoogleConnect}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" fill="white" />
              </svg>
              Conectar Google Calendar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={prevMonth}
          className="text-primary"
        >
          ← Anterior
        </Button>
        <h2 className="text-lg md:text-xl font-heading font-bold text-white capitalize">
          {monthName}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={nextMonth}
          className="text-primary"
        >
          Próximo →
        </Button>
      </div>

      {/* Jobs List */}
      <div>
        <h3 className="text-lg font-heading font-semibold text-white mb-4">
          Jobs agendados este mês
        </h3>
        {monthJobs.length === 0 ? (
          <Card className="bg-card border-white/5">
            <CardContent className="py-8 md:py-12 text-center">
              <CalendarIcon className="h-10 w-10 md:h-12 md:w-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
              <p className="text-sm md:text-base text-muted-foreground">
                Nenhum job agendado para {monthName.toLowerCase()}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {monthJobs.map(job => {
              const jobDate = new Date(job.scheduled_date);
              const formattedDate = jobDate.toLocaleDateString('pt-BR');
              const formattedTime = jobDate.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const isSynced = syncedJobs.has(job.id);

              return (
                <Card
                  key={job.id}
                  className="bg-card border-white/5 hover:border-primary/30 transition-colors"
                >
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-base md:text-lg font-medium text-white truncate">
                            Job #{job.code || job.id}
                          </h4>
                          {isSynced && (
                            <Check className="h-4 w-4 md:h-5 md:w-5 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground truncate mb-2">
                          {job.client_name}
                        </p>
                        <div className="flex items-center gap-4 text-xs md:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            📅 {formattedDate} às {formattedTime}
                          </span>
                          {job.branch && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {job.branch}
                            </span>
                          )}
                        </div>
                      </div>
                      {isGoogleConnected && !isSynced && (
                        <Button
                          size="sm"
                          onClick={() => handleSyncJob(job.id)}
                          disabled={syncing === job.id}
                          className="flex-shrink-0 gap-1 whitespace-nowrap bg-primary hover:bg-primary/90"
                        >
                          {syncing === job.id ? (
                            <>
                              <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                              <span className="hidden sm:inline text-xs md:text-sm">Sincronizando</span>
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-3 w-3 md:h-4 md:w-4" />
                              <span className="text-xs md:text-sm">Google</span>
                            </>
                          )}
                        </Button>
                      )}
                      {isSynced && (
                        <div className="flex-shrink-0 text-xs text-green-500 font-medium">
                          ✓ Salvo
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InstallerCalendar;
