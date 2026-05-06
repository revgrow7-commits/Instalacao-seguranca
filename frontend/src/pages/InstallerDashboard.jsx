import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MapPin, Calendar, Clock, PlayCircle, StopCircle, CheckCircle2, Coins, TrendingUp, ChevronRight, Settings } from 'lucide-react';
import { toast } from 'sonner';
import NotificationPermissionModal from '../components/NotificationPermissionModal';

// Gamificação e leaderboard carregam de forma lazy — não bloqueiam os jobs
const GamificationWidget = lazy(() => import('../components/GamificationWidget'));
const WeeklyLeaderboard = lazy(() => import('../components/WeeklyLeaderboard'));

/* ── Skeleton de um card de job ── */
const JobCardSkeleton = ({ delay = 0 }) => (
  <div
    className="rounded-xl bg-card border border-white/5 p-4 space-y-3 animate-card-in"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-white/10 loading-pulse" />
        <div className="h-3 w-1/2 rounded bg-white/7 loading-pulse" />
      </div>
      <div className="h-5 w-16 rounded-full bg-yellow-500/20 loading-pulse shrink-0" />
    </div>
    <div className="h-3 w-5/6 rounded bg-white/7 loading-pulse" />
    <div className="h-11 w-full rounded-lg bg-primary/20 loading-pulse" />
  </div>
);

/* ── Skeleton completo do dashboard ── */
const DashboardSkeleton = ({ userName }) => (
  <div className="p-4 md:p-8 space-y-6 pb-24 animate-page-reveal">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="text-2xl font-heading font-bold text-white">
          Olá, {userName || '…'}
        </div>
        <div className="h-3 w-36 rounded bg-white/10 loading-pulse" />
      </div>
      <div className="h-10 w-36 rounded-lg bg-yellow-500/20 loading-pulse" />
    </div>
    {/* Stats */}
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-xl bg-card border border-white/5 p-4 space-y-2 animate-card-in" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="h-3 w-16 rounded bg-white/10 loading-pulse" />
          <div className="h-7 w-8 rounded bg-white/15 loading-pulse" />
        </div>
      ))}
    </div>
    {/* Job cards */}
    <div>
      <div className="h-5 w-36 rounded bg-white/10 loading-pulse mb-4" />
      <div className="space-y-3">
        <JobCardSkeleton delay={80} />
        <JobCardSkeleton delay={160} />
      </div>
    </div>
  </div>
);

const InstallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [upcomingVisitas, setUpcomingVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkinsLoading, setCheckinsLoading] = useState(true);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [gamificationBalance, setGamificationBalance] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);

  useEffect(() => {
    loadJobs();
    loadCheckins();
    loadVisitas();
    loadGamificationData();
    registerDailyEngagement();
    // Show notification modal after a short delay
    const timer = setTimeout(() => {
      const hasAskedForNotifications = localStorage.getItem('notification_asked');
      if (!hasAskedForNotifications) {
        setShowNotificationModal(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleNotificationComplete = (accepted) => {
    localStorage.setItem('notification_asked', 'true');
    setShowNotificationModal(false);
  };

  const loadJobs = async () => {
    try {
      const res = await api.getJobs();
      if (Array.isArray(res.data) && res.data.length === 0)
        console.warn('[InstallerDashboard] API retornou 0 jobs — verificar atribuição no painel admin');
      setJobs(res.data ?? []);
      setLoading(false);

      // se veio do cache, aguarda fresh em background e atualiza silenciosamente
      if (res._stale && res._fresh) {
        res._fresh.then(fresh => {
          setJobs(fresh.data ?? []);
        }).catch(() => { /* falha silenciosa — cache já está exibido */ });
      }
    } catch {
      toast.error('Erro ao carregar jobs');
      setJobs([]);
      setLoading(false);
    }
  };

  const loadCheckins = async () => {
    try {
      const res = await api.getCheckins();
      setCheckins(res.data ?? []);
    } catch {
      // silencioso — checkin ausente apenas remove badge "Em Andamento"
    } finally {
      setCheckinsLoading(false);
    }
  };

  const loadVisitas = async () => {
    try {
      const res = await api.listVisitas({ status: 'AGUARDANDO' });
      const upcoming = (res.data || [])
        .filter(v => v.scheduled_date && new Date(v.scheduled_date) >= new Date() &&
          v.status !== 'CONCLUIDA' && v.status !== 'CANCELADA')
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
        .slice(0, 5);
      setUpcomingVisitas(upcoming);
    } catch {
      // silencioso — visitas não bloqueiam dashboard
    }
  };

  const loadGamificationData = async () => {
    try {
      const [balanceRes, transactionsRes] = await Promise.all([
        api.getGamificationBalance(),
        api.getGamificationTransactions(5)
      ]);
      setGamificationBalance(balanceRes.data);
      setRecentTransactions(transactionsRes.data);
    } catch (error) {
      console.log('Gamification data not available yet');
    }
  };

  const registerDailyEngagement = async () => {
    try {
      const today = new Date().toDateString();
      const lastEngagement = localStorage.getItem('daily_engagement_date');
      
      if (lastEngagement !== today) {
        const response = await api.registerDailyEngagement();
        if (response.data.success && !response.data.already_claimed) {
          toast.success(`🎉 ${response.data.message}`, { duration: 5000 });
          localStorage.setItem('daily_engagement_date', today);
          loadGamificationData(); // Refresh balance
        }
      }
    } catch (error) {
      console.log('Daily engagement already claimed or error');
    }
  };


  const getJobCheckin = (jobId) => {
    return checkins.find(c => c.job_id === jobId && c.status === 'in_progress');
  };

  const handleOpenJob = (jobId) => {
    navigate(`/installer/job/${jobId}`);
  };

  const getJobStatus = (job) => {
    const checkin = getJobCheckin(job.id);
    if (checkin) {
      return 'in_progress';
    }
    return job.status;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'finalizado':
        return 'bg-green-500/20 text-green-500 border border-green-500/20';
      case 'in_progress':
      case 'instalando':
        return 'bg-blue-500/20 text-blue-500 border border-blue-500/20';
      case 'pending':
      case 'aguardando':
      case 'scheduled':
      case 'agendado':
        return 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20';
      default:
        return 'bg-gray-500/20 text-gray-500 border border-gray-500/20';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
      case 'finalizado':
        return 'Concluído';
      case 'in_progress':
      case 'instalando':
        return 'Em Andamento';
      case 'pending':
      case 'aguardando':
      case 'scheduled':
      case 'agendado':
        return 'Pendente';
      default:
        return status;
    }
  };

  if (loading) {
    return <DashboardSkeleton userName={user?.name} />;
  }

  // Filtrar jobs - incluir 'aguardando' como pendente
  const pendingJobs = jobs.filter(j => {
    const status = getJobStatus(j);
    return (status === 'pending' || status === 'aguardando' || status === 'scheduled' || status === 'agendado') && 
           j.status !== 'completed' && j.status !== 'finalizado';
  });
  const activeJobs = jobs.filter(j => getJobStatus(j) === 'in_progress');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'finalizado');

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-24 md:pb-8 animate-page-reveal" data-testid="installer-dashboard">
      {/* Notification Permission Modal */}
      <NotificationPermissionModal 
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        onComplete={handleNotificationComplete}
      />
      
      {/* Header with Coin Balance */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-heading font-bold text-white tracking-tight truncate">
            Olá, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-xs text-muted-foreground">Seus jobs de instalação</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => navigate('/installer/calendar')}
            variant="outline"
            size="icon"
            className="h-10 w-10 border-white/10 hover:bg-white/5"
            title="Minha Agenda"
          >
            <Calendar className="h-5 w-5" />
          </Button>
          {gamificationBalance && (
            <Button
              onClick={() => navigate('/loja-faixa-preta')}
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold h-10 px-3 text-sm"
            >
              <Coins className="h-4 w-4 mr-1" />
              {gamificationBalance.total_coins?.toLocaleString() || 0}
            </Button>
          )}
        </div>
      </div>

      {/* Stats - Primeiro */}
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 px-2 md:px-6 pt-2 md:pt-6">
            <CardTitle className="text-[10px] md:text-sm font-medium text-gray-300 leading-tight">Pendentes</CardTitle>
            <Clock className="h-4 w-4 md:h-5 md:w-5 text-yellow-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-2 md:px-6 pb-2 md:pb-6">
            <div className="text-xl md:text-3xl font-bold text-white">{pendingJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 px-2 md:px-6 pt-2 md:pt-6">
            <CardTitle className="text-[10px] md:text-sm font-medium text-gray-300 leading-tight">Em Andamento</CardTitle>
            <PlayCircle className="h-4 w-4 md:h-5 md:w-5 text-blue-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-2 md:px-6 pb-2 md:pb-6">
            <div className="text-xl md:text-3xl font-bold text-white">{activeJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 px-2 md:px-6 pt-2 md:pt-6">
            <CardTitle className="text-[10px] md:text-sm font-medium text-gray-300 leading-tight">Concluídos</CardTitle>
            <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 text-green-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-2 md:px-6 pb-2 md:pb-6">
            <div className="text-xl md:text-3xl font-bold text-white">{completedJobs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs - Segundo */}
      {activeJobs.length > 0 && (
        <div>
          <h2 className="text-lg md:text-2xl font-heading font-bold text-white mb-3 md:mb-4">Jobs em Andamento</h2>
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
            {activeJobs.map((job, idx) => {
              const checkin = getJobCheckin(job.id);
              const startTime = checkin ? new Date(checkin.checkin_at) : null;
              const elapsedMinutes = startTime ? Math.floor((new Date() - startTime) / 60000) : 0;

              return (
                <Card
                  key={job.id}
                  className="bg-card border-blue-500/30 neon-glow animate-card-in"
                  style={{ animationDelay: `${idx * 60}ms` }}
                  data-testid={`active-job-${job.id}`}
                >
                  <CardHeader className="p-4 md:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg text-white line-clamp-2">{job.title}</CardTitle>
                        <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{job.client_name}</p>
                      </div>
                      <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ${getStatusColor('in_progress')}`}>
                        Em Andamento
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 md:p-6 md:pt-0 space-y-3 md:space-y-4">
                    {job.client_address && (
                      <div className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{job.client_address}</span>
                      </div>
                    )}

                    {startTime && (
                      <div className="flex items-center gap-2 text-xs md:text-sm">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <span className="text-white font-medium">
                          Tempo: {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}min
                        </span>
                      </div>
                    )}

                    <Button
                      onClick={() => handleOpenJob(job.id)}
                      className="w-full bg-green-500 hover:bg-green-600 text-white h-11 md:h-10 active:scale-[0.98] transition-transform"
                      data-testid={`finish-job-${job.id}`}
                    >
                      <StopCircle className="mr-2 h-5 w-5" />
                      Abrir Job
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Jobs - Terceiro */}
      <div>
        <h2 className="text-lg md:text-2xl font-heading font-bold text-white mb-3 md:mb-4">Jobs Pendentes</h2>
        {pendingJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-base font-medium text-white mb-1">Tudo em dia!</p>
            <p className="text-sm text-muted-foreground">Nenhum job pendente no momento.</p>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
            {pendingJobs.map((job, idx) => (
              <Card
                key={job.id}
                className="bg-card border-white/5 hover:border-primary/50 transition-colors animate-card-in"
                style={{ animationDelay: `${idx * 60}ms` }}
                data-testid={`pending-job-${job.id}`}
              >
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base md:text-lg text-white line-clamp-2">{job.title}</CardTitle>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{job.client_name}</p>
                    </div>
                    <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ${getStatusColor('pending')}`}>
                      Pendente
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 md:p-6 md:pt-0 space-y-3 md:space-y-4">
                  {job.client_address && (
                    <div className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{job.client_address}</span>
                    </div>
                  )}

                  {job.scheduled_date && (
                    <div className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1 w-fit">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {new Date(job.scheduled_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        {' às '}
                        {new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {(job.status === 'agendado' || job.status === 'scheduled') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate('/installer/calendar'); }}
                          className="ml-1 text-primary/70 hover:text-primary transition-colors"
                          title="Ver agenda"
                        >
                          📅
                        </button>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={() => handleOpenJob(job.id)}
                    className="w-full bg-primary hover:bg-primary/90 neon-glow h-11 md:h-10 active:scale-[0.98] transition-transform"
                    data-testid={`start-job-${job.id}`}
                  >
                    <PlayCircle className="mr-2 h-5 w-5" />
                    Abrir Job
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Jobs */}
      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-lg md:text-2xl font-heading font-bold text-white mb-3 md:mb-4">Jobs Concluídos Recentes</h2>
          <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {completedJobs.slice(0, 6).map((job) => (
              <Card
                key={job.id}
                className="bg-card border-white/5"
              >
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm md:text-base text-white line-clamp-1">{job.title}</CardTitle>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{job.client_name}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Próximos agendamentos (filtrado dos jobs já carregados + visitas técnicas — sem novo fetch) */}
      {(() => {
        const upcoming = jobs
          .filter(j => j.scheduled_date && new Date(j.scheduled_date) >= new Date() &&
            j.status !== 'completed' && j.status !== 'finalizado')
          .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
          .slice(0, 5);
        if (upcoming.length === 0 && upcomingVisitas.length === 0) return null;
        return (
          <div>
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h2 className="text-lg md:text-2xl font-heading font-bold text-white">Próximos Agendamentos</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/installer/calendar')}
                className="text-primary text-xs gap-1"
              >
                Ver agenda <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {/* Visitas Técnicas agendadas */}
              {upcomingVisitas.map(visita => (
                <Card
                  key={visita.id}
                  className="bg-card border-purple-500/20 hover:border-purple-500/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/visitas-tecnicas/${visita.id}`)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                      <MapPin className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full leading-none">VT</span>
                        <p className="text-sm font-medium text-white truncate">{visita.titulo || 'Visita Técnica'} — {visita.client_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(visita.scheduled_date).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(visita.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
              {/* Jobs agendados */}
              {upcoming.map(job => (
                <Card
                  key={job.id}
                  className="bg-card border-white/5 hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => handleOpenJob(job.id)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(job.scheduled_date).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Gamification Widget - carrega em background sem bloquear jobs */}
      {gamificationBalance && (
        <Suspense fallback={null}>
          <GamificationWidget
            balance={gamificationBalance}
            levelInfo={gamificationBalance.level_info}
          />
        </Suspense>
      )}

      {/* Prêmios - Em Breve */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-white/5">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Coins className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Prêmios</p>
          <p className="text-xs text-muted-foreground">Em breve — resgate com suas moedas</p>
        </div>
        <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {/* Weekly Leaderboard - carrega em background */}
      <Suspense fallback={null}>
        <WeeklyLeaderboard />
      </Suspense>
    </div>
  );
};

export default InstallerDashboard;