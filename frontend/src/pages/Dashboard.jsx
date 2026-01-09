import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
  Briefcase, CheckCircle, Clock, Users, TrendingUp, MapPin, Image, Eye, Trash2, 
  Bell, AlertTriangle, PauseCircle, PlayCircle, Navigation, Timer, AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const Dashboard = () => {
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [lateCheckins, setLateCheckins] = useState([]);
  const [pausedCheckins, setPausedCheckins] = useState([]);
  const [pendingCheckins, setPendingCheckins] = useState([]);
  const [locationAlerts, setLocationAlerts] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingAlerts, setSendingAlerts] = useState(false);

  useEffect(() => {
    // Redirect installers to their specific dashboard
    if (isInstaller) {
      navigate('/installer/dashboard');
      return;
    }
    loadDashboardData();
  }, [isInstaller, navigate]);

  const loadDashboardData = async () => {
    try {
      // Load jobs
      const jobsRes = await api.getJobs();
      setJobs(jobsRes.data);

      // Load metrics if admin or manager
      if (isAdmin || isManager) {
        const metricsRes = await api.getMetrics();
        setMetrics(metricsRes.data);
        
        // Load all checkins and filter for late/paused
        const checkinsRes = await api.getCheckins();
        const now = new Date();
        
        // Filter paused check-ins (status = 'paused')
        const paused = checkinsRes.data.filter(c => c.status === 'paused');
        setPausedCheckins(paused);
        
        // Filter late check-ins (in_progress for more than 4 hours)
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const late = checkinsRes.data.filter(c => {
          if (c.status !== 'in_progress') return false;
          const checkinTime = new Date(c.checkin_at);
          return checkinTime < fourHoursAgo;
        });
        setLateCheckins(late);
        
        // Load pending check-ins (scheduled but not started)
        try {
          const pendingRes = await api.getPendingCheckins();
          setPendingCheckins(pendingRes.data.pending_checkins || []);
        } catch (e) {
          console.log('Could not load pending checkins:', e);
        }
        
        // Load location alerts
        try {
          const locationRes = await api.getLocationAlerts();
          setLocationAlerts(locationRes.data || []);
        } catch (e) {
          console.log('Could not load location alerts:', e);
        }
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSendLateAlerts = async () => {
    setSendingAlerts(true);
    try {
      const response = await api.sendLateAlerts();
      toast.success(response.data.message);
    } catch (error) {
      toast.error('Erro ao enviar alertas');
    } finally {
      setSendingAlerts(false);
    }
  };

  const handleDeleteCheckin = async (checkinId) => {
    if (!window.confirm('Tem certeza que deseja excluir este check-in? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      setDeletingId(checkinId);
      await api.deleteCheckin(checkinId);
      toast.success('Check-in excluído com sucesso');
      // Reload data
      loadDashboardData();
    } catch (error) {
      toast.error('Erro ao excluir check-in');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8" data-testid="dashboard-page">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
          Bem-vindo, {user?.name}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isAdmin ? 'Painel de Administração' : isManager ? 'Painel Gerencial' : 'Seus Jobs'}
        </p>
      </div>

      {/* Metrics Cards - Admin & Manager only */}
      {(isAdmin || isManager) && metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-total-jobs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Total de Jobs</CardTitle>
              <Briefcase className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.total_jobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.pending_jobs} pendentes
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-completed-jobs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Concluídos</CardTitle>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.completed_jobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {((metrics.completed_jobs / metrics.total_jobs) * 100).toFixed(0)}% do total
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-avg-duration">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Tempo Médio</CardTitle>
              <Clock className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.avg_duration_minutes}min</div>
              <p className="text-xs text-muted-foreground mt-1">por job</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-installers">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Instaladores</CardTitle>
              <Users className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.total_installers}</div>
              <p className="text-xs text-muted-foreground mt-1">ativos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =============== UNIFIED ALERTS CENTER =============== */}
      {(isAdmin || isManager) && (
        pendingCheckins.length > 0 || 
        locationAlerts.length > 0 || 
        lateCheckins.length > 0 || 
        pausedCheckins.length > 0
      ) && (
        <Card className="bg-card border-white/10">
          <CardHeader className="border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">Central de Alertas</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {pendingCheckins.length + locationAlerts.length + lateCheckins.length + pausedCheckins.length} alerta(s) ativos
                  </p>
                </div>
              </div>
              {pendingCheckins.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleSendLateAlerts}
                  disabled={sendingAlerts}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  {sendingAlerts ? 'Enviando...' : 'Notificar Atrasados'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5">
              
              {/* Check-ins Não Iniciados (Scheduled but not started) */}
              {pendingCheckins.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-md bg-red-500/20">
                      <Timer className="h-4 w-4 text-red-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide">
                      Check-ins Não Iniciados ({pendingCheckins.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {pendingCheckins.slice(0, 5).map((job) => (
                      <div 
                        key={job.id}
                        className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-lg cursor-pointer hover:bg-red-500/10 transition-colors"
                        onClick={() => navigate(`/jobs/${job.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Timer className="h-5 w-5 text-red-400" />
                          <div>
                            <p className="text-white font-medium">{job.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.installers_info?.map(i => i.full_name).join(', ') || 'Sem instalador'}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold">
                          {job.minutes_late} min atrasado
                        </span>
                      </div>
                    ))}
                    {pendingCheckins.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{pendingCheckins.length - 5} outros alertas
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Check-ins em Atraso (Running too long) */}
              {lateCheckins.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-md bg-yellow-500/20">
                      <Clock className="h-4 w-4 text-yellow-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">
                      Check-ins Prolongados ({lateCheckins.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {lateCheckins.slice(0, 5).map((checkin) => {
                      const job = jobs.find(j => j.id === checkin.job_id);
                      const checkinTime = new Date(checkin.checkin_at);
                      const hoursElapsed = Math.floor((new Date() - checkinTime) / (1000 * 60 * 60));
                      return (
                        <div 
                          key={checkin.id}
                          className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg cursor-pointer hover:bg-yellow-500/10 transition-colors"
                          onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                        >
                          <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-yellow-400" />
                            <div>
                              <p className="text-white font-medium">{job?.title || 'Job não encontrado'}</p>
                              <p className="text-xs text-muted-foreground">
                                Iniciado em {formatDate(checkin.checkin_at)}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">
                            {hoursElapsed}h+ em andamento
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Check-ins Pausados */}
              {pausedCheckins.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-md bg-orange-500/20">
                      <PauseCircle className="h-4 w-4 text-orange-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide">
                      Check-ins Pausados ({pausedCheckins.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {pausedCheckins.slice(0, 5).map((checkin) => {
                      const job = jobs.find(j => j.id === checkin.job_id);
                      return (
                        <div 
                          key={checkin.id}
                          className="flex items-center justify-between p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg cursor-pointer hover:bg-orange-500/10 transition-colors"
                          onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                        >
                          <div className="flex items-center gap-3">
                            <PauseCircle className="h-5 w-5 text-orange-400" />
                            <div>
                              <p className="text-white font-medium">{job?.title || 'Job não encontrado'}</p>
                              <p className="text-xs text-muted-foreground">
                                Pausado desde {formatDate(checkin.updated_at || checkin.checkin_at)}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs font-bold uppercase">
                            Pausado
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alertas de Localização */}
              {locationAlerts.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-md bg-purple-500/20">
                      <Navigation className="h-4 w-4 text-purple-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide">
                      Alertas de Localização ({locationAlerts.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {locationAlerts.slice(0, 5).map((alert) => (
                      <div 
                        key={alert.id}
                        className="flex items-center justify-between p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Navigation className="h-5 w-5 text-purple-400" />
                          <div>
                            <p className="text-white font-medium">{alert.job_title}</p>
                            <p className="text-xs text-muted-foreground">
                              {alert.installer_name} • {new Date(alert.created_at).toLocaleString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-bold">
                          {alert.distance_meters?.toFixed(0)}m do local
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      )}

      {/* No Alerts Message */}
      {(isAdmin || isManager) && 
        pendingCheckins.length === 0 && 
        locationAlerts.length === 0 && 
        lateCheckins.length === 0 && 
        pausedCheckins.length === 0 && (
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/20">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-500">Tudo em ordem!</h3>
                <p className="text-sm text-muted-foreground">Nenhum alerta ativo no momento.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-heading font-bold text-white">Jobs Recentes</h2>
          <button
            onClick={() => navigate('/jobs')}
            className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            data-testid="view-all-jobs-button"
          >
            Ver todos →
          </button>
        </div>

        {jobs.length === 0 ? (
          <Card className="bg-card border-white/5">
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {isInstaller ? 'Nenhum job atribuído ainda' : 'Nenhum job cadastrado'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.slice(0, 6).map((job) => (
              <Card
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="bg-card border-white/5 hover:border-primary/50 transition-colors cursor-pointer"
                data-testid={`job-card-${job.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg text-white line-clamp-1">
                        {job.title}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{job.client_name}</p>
                    </div>
                    <span
                      className={
                        `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                          job.status === 'completed' || job.status === 'finalizado'
                            ? 'bg-green-500/20 text-green-500 border-green-500/20'
                            : job.status === 'in_progress' || job.status === 'instalando'
                            ? 'bg-blue-500/20 text-blue-500 border-blue-500/20'
                            : job.status === 'pausado'
                            ? 'bg-orange-500/20 text-orange-500 border-orange-500/20'
                            : job.status === 'atrasado'
                            ? 'bg-red-500/20 text-red-500 border-red-500/20'
                            : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20'
                        }`
                      }
                    >
                      {job.status === 'completed' || job.status === 'finalizado' ? 'FINALIZADO' : 
                       job.status === 'in_progress' || job.status === 'instalando' ? 'INSTALANDO' :
                       job.status === 'pausado' ? 'PAUSADO' :
                       job.status === 'atrasado' ? 'ATRASADO' : 'AGUARDANDO'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Filial: {job.branch}</span>
                    {job.assigned_installers?.length > 0 && (
                      <span className="text-primary font-medium">
                        {job.assigned_installers.length} instalador(es)
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;