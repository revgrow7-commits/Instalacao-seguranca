import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Clock, 
  Play, 
  Pause, 
  RefreshCw, 
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings,
  Database,
  ArrowRight
} from 'lucide-react';
import api from '../utils/api';

const SchedulerAdmin = () => {
  const [schedulerData, setSchedulerData] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const [schedulerRes, syncRes] = await Promise.all([
        api.getSchedulerJobs(),
        api.getSyncStatus()
      ]);
      setSchedulerData(schedulerRes.data);
      setSyncStatus(syncRes.data);
    } catch (error) {
      toast.error('Erro ao carregar dados do scheduler');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = async (jobId) => {
    setActionLoading(prev => ({ ...prev, [jobId]: 'pause' }));
    try {
      await api.pauseSchedulerJob(jobId);
      toast.success('Tarefa pausada com sucesso');
      fetchData();
    } catch (error) {
      toast.error('Erro ao pausar tarefa');
    } finally {
      setActionLoading(prev => ({ ...prev, [jobId]: null }));
    }
  };

  const handleResume = async (jobId) => {
    setActionLoading(prev => ({ ...prev, [jobId]: 'resume' }));
    try {
      await api.resumeSchedulerJob(jobId);
      toast.success('Tarefa retomada com sucesso');
      fetchData();
    } catch (error) {
      toast.error('Erro ao retomar tarefa');
    } finally {
      setActionLoading(prev => ({ ...prev, [jobId]: null }));
    }
  };

  const handleRunNow = async (jobId) => {
    setActionLoading(prev => ({ ...prev, [jobId]: 'run' }));
    try {
      await api.runSchedulerJobNow(jobId);
      toast.success('Tarefa iniciada! Aguarde alguns segundos...');
      // Wait a bit and refresh
      setTimeout(fetchData, 5000);
    } catch (error) {
      toast.error('Erro ao executar tarefa');
    } finally {
      setActionLoading(prev => ({ ...prev, [jobId]: null }));
    }
  };

  const handleManualSync = async () => {
    setActionLoading(prev => ({ ...prev, 'manual': true }));
    try {
      const response = await api.syncHoldprintJobs(2);
      const summary = response.data.summary;
      toast.success(
        `Sincronização concluída! ${summary.total_imported} importados, ${summary.total_skipped} existentes`
      );
      fetchData();
    } catch (error) {
      toast.error('Erro na sincronização manual');
    } finally {
      setActionLoading(prev => ({ ...prev, 'manual': false }));
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

  if (loading && !schedulerData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="scheduler-admin">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Agendamento Automático
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as tarefas automáticas do sistema
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={schedulerData?.scheduler_running ? "default" : "destructive"} className="px-3 py-1">
            {schedulerData?.scheduler_running ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Scheduler Ativo
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Scheduler Inativo
              </>
            )}
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Sync Status Card */}
      <Card className="bg-card border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-400" />
            Última Sincronização com Holdprint
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Data/Hora</p>
              <p className="text-lg font-semibold text-white">
                {formatDate(syncStatus?.last_sync)}
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Importados</p>
              <p className="text-lg font-semibold text-green-400">
                {syncStatus?.total_imported || 0}
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Já Existentes</p>
              <p className="text-lg font-semibold text-yellow-400">
                {syncStatus?.total_skipped || 0}
              </p>
            </div>
            <div className="flex items-center justify-center">
              <Button 
                onClick={handleManualSync}
                disabled={actionLoading['manual']}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {actionLoading['manual'] ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sincronizar Agora
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Jobs */}
      <Card className="bg-card border-white/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Tarefas Agendadas
          </CardTitle>
          <CardDescription>
            Tarefas que são executadas automaticamente pelo sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schedulerData?.jobs?.map((job) => (
              <div 
                key={job.id}
                className="bg-white/5 rounded-lg p-4 border border-white/10"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-white">{job.name}</h3>
                      <Badge variant={job.is_paused ? "secondary" : "default"}>
                        {job.is_paused ? 'Pausado' : 'Ativo'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {job.description}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{job.schedule}</span>
                      </div>
                      {job.next_run && (
                        <div className="flex items-center gap-1 text-blue-400">
                          <ArrowRight className="h-4 w-4" />
                          <span>Próxima: {formatDate(job.next_run)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {job.is_paused ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResume(job.id)}
                        disabled={actionLoading[job.id]}
                        className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                      >
                        {actionLoading[job.id] === 'resume' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Retomar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePause(job.id)}
                        disabled={actionLoading[job.id]}
                        className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                      >
                        {actionLoading[job.id] === 'pause' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Pause className="h-4 w-4 mr-2" />
                        )}
                        Pausar
                      </Button>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleRunNow(job.id)}
                      disabled={actionLoading[job.id]}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {actionLoading[job.id] === 'run' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Executar Agora
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {(!schedulerData?.jobs || schedulerData.jobs.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma tarefa agendada encontrada
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Clock className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">Como funciona?</h4>
              <p className="text-sm text-muted-foreground">
                O sistema executa automaticamente a sincronização com a Holdprint todos os dias às 06:00 (horário de Brasília). 
                Isso garante que todas as novas OS sejam importadas para o sistema sem necessidade de intervenção manual.
                Você pode executar a sincronização manualmente a qualquer momento clicando em "Sincronizar Agora" ou "Executar Agora".
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SchedulerAdmin;
