import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MapPin, Calendar, Clock, PlayCircle, StopCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const InstallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [jobsRes, checkinsRes] = await Promise.all([
        api.getJobs(),
        api.getCheckins()
      ]);
      setJobs(jobsRes.data);
      setCheckins(checkinsRes.data);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const getJobCheckin = (jobId) => {
    return checkins.find(c => c.job_id === jobId && c.status === 'in_progress');
  };

  const handleStartJob = (jobId) => {
    navigate(`/checkin/${jobId}`);
  };

  const handleFinishJob = (jobId) => {
    const checkin = getJobCheckin(jobId);
    if (checkin) {
      navigate(`/checkout/${checkin.id}`);
    }
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
        return 'bg-green-500/20 text-green-500 border border-green-500/20';
      case 'in_progress':
        return 'bg-blue-500/20 text-blue-500 border border-blue-500/20';
      case 'pending':
      case 'aguardando':
        return 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20';
      default:
        return 'bg-gray-500/20 text-gray-500 border border-gray-500/20';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Concluído';
      case 'in_progress':
        return 'Em Andamento';
      case 'pending':
      case 'aguardando':
        return 'Pendente';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  // Filtrar jobs - incluir 'aguardando' como pendente
  const pendingJobs = jobs.filter(j => {
    const status = getJobStatus(j);
    return status === 'pending' || status === 'aguardando';
  });
  const activeJobs = jobs.filter(j => getJobStatus(j) === 'in_progress');
  const completedJobs = jobs.filter(j => j.status === 'completed');

  return (
    <div className="p-4 md:p-8 space-y-8" data-testid="installer-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
          Olá, {user?.name}
        </h1>
        <p className="text-muted-foreground mt-2">
          Seus Jobs de Instalação
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Pendentes</CardTitle>
            <Clock className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{pendingJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Em Andamento</CardTitle>
            <PlayCircle className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{activeJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Concluídos</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{completedJobs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div>
          <h2 className="text-2xl font-heading font-bold text-white mb-4">Jobs em Andamento</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeJobs.map((job) => {
              const checkin = getJobCheckin(job.id);
              const startTime = checkin ? new Date(checkin.checkin_at) : null;
              const elapsedMinutes = startTime ? Math.floor((new Date() - startTime) / 60000) : 0;

              return (
                <Card
                  key={job.id}
                  className="bg-card border-blue-500/30 neon-glow"
                  data-testid={`active-job-${job.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg text-white">{job.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{job.client_name}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor('in_progress')}`}>
                        Em Andamento
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {job.client_address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{job.client_address}</span>
                      </div>
                    )}

                    {startTime && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <span className="text-white font-medium">
                          Tempo decorrido: {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}min
                        </span>
                      </div>
                    )}

                    <Button
                      onClick={() => handleFinishJob(job.id)}
                      className="w-full bg-green-500 hover:bg-green-600 text-white"
                      data-testid={`finish-job-${job.id}`}
                    >
                      <StopCircle className="mr-2 h-5 w-5" />
                      Finalizar Job
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Jobs */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-white mb-4">Jobs Pendentes</h2>
        {pendingJobs.length === 0 ? (
          <Card className="bg-card border-white/5">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum job pendente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingJobs.map((job) => (
              <Card
                key={job.id}
                className="bg-card border-white/5 hover:border-primary/50 transition-colors"
                data-testid={`pending-job-${job.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg text-white">{job.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{job.client_name}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor('pending')}`}>
                      Pendente
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {job.client_address && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{job.client_address}</span>
                    </div>
                  )}

                  {job.scheduled_date && (
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(job.scheduled_date).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  <Button
                    onClick={() => handleStartJob(job.id)}
                    className="w-full bg-primary hover:bg-primary/90 neon-glow"
                    data-testid={`start-job-${job.id}`}
                  >
                    <PlayCircle className="mr-2 h-5 w-5" />
                    Iniciar Job
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
          <h2 className="text-2xl font-heading font-bold text-white mb-4">Jobs Concluídos Recentes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedJobs.slice(0, 6).map((job) => (
              <Card
                key={job.id}
                className="bg-card border-white/5"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base text-white line-clamp-1">{job.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{job.client_name}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InstallerDashboard;