import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Briefcase, CheckCircle, Clock, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const Dashboard = () => {
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [jobs, setJobs] = useState([]);
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
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
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
                        `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          job.status === 'completed'
                            ? 'bg-green-500/20 text-green-500 border border-green-500/20'
                            : job.status === 'in_progress'
                            ? 'bg-blue-500/20 text-blue-500 border border-blue-500/20'
                            : 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20'
                        }`
                      }
                    >
                      {job.status === 'completed' ? 'Concluído' : job.status === 'in_progress' ? 'Em andamento' : 'Pendente'}
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