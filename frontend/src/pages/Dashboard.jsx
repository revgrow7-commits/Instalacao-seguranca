import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Briefcase, CheckCircle, Clock, Users, TrendingUp, MapPin, Image, Eye, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const Dashboard = () => {
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);

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
        
        // Load recent checkins
        const checkinsRes = await api.getCheckins();
        // Sort by most recent and take last 6
        const sortedCheckins = checkinsRes.data.sort((a, b) => 
          new Date(b.checkin_at) - new Date(a.checkin_at)
        );
        setCheckins(sortedCheckins.slice(0, 6));
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
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

      {/* Recent Check-ins - Admin & Manager only */}
      {(isAdmin || isManager) && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-heading font-bold text-white">Check-ins Recentes</h2>
          </div>

          {checkins.length === 0 ? (
            <Card className="bg-card border-white/5">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum check-in registrado ainda</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {checkins.map((checkin) => {
                const job = jobs.find(j => j.id === checkin.job_id);
                return (
                  <Card
                    key={checkin.id}
                    className="bg-card border-white/5 hover:border-primary/50 transition-colors"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg text-white line-clamp-1">
                            {job?.title || 'Job não encontrado'}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatDate(checkin.checkin_at)}
                          </p>
                        </div>
                        <span
                          className={
                            `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              checkin.status === 'completed'
                                ? 'bg-green-500/20 text-green-500 border border-green-500/20'
                                : 'bg-blue-500/20 text-blue-500 border border-blue-500/20'
                            }`
                          }
                        >
                          {checkin.status === 'completed' ? 'Completo' : 'Em andamento'}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Photo thumbnail */}
                      {checkin.checkin_photo && (
                        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                          <img
                            src={checkin.checkin_photo.startsWith('data:') ? checkin.checkin_photo : `data:image/jpeg;base64,${checkin.checkin_photo}`}
                            alt="Check-in"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                            <Image className="h-3 w-3" />
                            Check-in
                          </div>
                        </div>
                      )}

                      {/* GPS Info */}
                      {checkin.gps_lat && checkin.gps_long && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 text-blue-400" />
                          <span className="text-xs">
                            {checkin.gps_lat.toFixed(4)}, {checkin.gps_long.toFixed(4)}
                          </span>
                        </div>
                      )}

                      {/* Duration if completed */}
                      {checkin.status === 'completed' && checkin.duration_minutes && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4 text-green-400" />
                          <span className="text-xs">{checkin.duration_minutes} minutos</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                          className="flex-1 bg-primary hover:bg-primary/90"
                          size="sm"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalhes
                        </Button>
                        <Button
                          onClick={() => handleDeleteCheckin(checkin.id)}
                          variant="outline"
                          size="sm"
                          className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                          disabled={deletingId === checkin.id}
                        >
                          {deletingId === checkin.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
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