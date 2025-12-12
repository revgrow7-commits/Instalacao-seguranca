import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FileText, Users, Briefcase, Clock, CheckCircle, AlertCircle, TrendingUp, Calendar, Download, Layers } from 'lucide-react';
import { toast } from 'sonner';

const Reports = () => {
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('jobs');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!isAdmin && !isManager) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [isAdmin, isManager, navigate]);

  const loadData = async () => {
    try {
      const [jobsRes, checkinsRes, installersRes] = await Promise.all([
        api.getJobs(),
        api.getCheckins(),
        api.getInstallers()
      ]);
      
      setJobs(jobsRes.data);
      setCheckins(checkinsRes.data);
      setInstallers(installersRes.data);
    } catch (error) {
      toast.error('Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const response = await api.exportReports();
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_trabalhos_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setExporting(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'aguardando': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
      'instalando': 'bg-blue-500/20 text-blue-500 border-blue-500/20',
      'pausado': 'bg-orange-500/20 text-orange-500 border-orange-500/20',
      'finalizado': 'bg-green-500/20 text-green-500 border-green-500/20',
      'atrasado': 'bg-red-500/20 text-red-500 border-red-500/20',
      'pending': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
      'in_progress': 'bg-blue-500/20 text-blue-500 border-blue-500/20',
      'completed': 'bg-green-500/20 text-green-500 border-green-500/20'
    };
    return colors[status?.toLowerCase()] || 'bg-gray-500/20 text-gray-500 border-gray-500/20';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'aguardando': 'AGUARDANDO',
      'instalando': 'INSTALANDO',
      'pausado': 'PAUSADO',
      'finalizado': 'FINALIZADO',
      'atrasado': 'ATRASADO',
      'pending': 'AGUARDANDO',
      'in_progress': 'INSTALANDO',
      'completed': 'FINALIZADO'
    };
    return labels[status?.toLowerCase()] || status?.toUpperCase();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric'
    });
  };

  const getInstallerName = (installerId) => {
    const installer = installers.find(i => i.id === installerId);
    return installer?.full_name || 'N/A';
  };

  const getJobCheckins = (jobId) => {
    return checkins.filter(c => c.job_id === jobId);
  };

  const getInstallerCheckins = (installerId) => {
    return checkins.filter(c => c.installer_id === installerId);
  };

  const calculateInstallerStats = (installerId) => {
    const installerCheckins = getInstallerCheckins(installerId);
    const completedCheckins = installerCheckins.filter(c => c.status === 'completed');
    const totalMinutes = completedCheckins.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
    const avgMinutes = completedCheckins.length > 0 ? Math.round(totalMinutes / completedCheckins.length) : 0;
    
    return {
      totalCheckins: installerCheckins.length,
      completedCheckins: completedCheckins.length,
      totalMinutes,
      avgMinutes
    };
  };

  const getJobsByStatus = () => {
    const statusCounts = {
      aguardando: 0,
      instalando: 0,
      pausado: 0,
      finalizado: 0,
      atrasado: 0
    };

    jobs.forEach(job => {
      const status = job.status?.toLowerCase();
      if (status === 'pending') statusCounts.aguardando++;
      else if (status === 'in_progress') statusCounts.instalando++;
      else if (status === 'completed') statusCounts.finalizado++;
      else if (statusCounts.hasOwnProperty(status)) statusCounts[status]++;
    });

    return statusCounts;
  };

  const filterJobsByDate = (jobsList) => {
    if (!startDate && !endDate) return jobsList;
    
    return jobsList.filter(job => {
      const jobDate = new Date(job.created_at);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);
      
      return jobDate >= start && jobDate <= end;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  const statusCounts = getJobsByStatus();
  const filteredJobs = filterJobsByDate(jobs);
  const totalJobs = filteredJobs.length;
  const maxCount = Math.max(...Object.values(statusCounts));

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
            Relatórios
          </h1>
          <p className="text-muted-foreground mt-2">
            Visualize relatórios detalhados por job e instalador
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/reports/family')}
            className="gap-2"
          >
            <Layers className="h-4 w-4" />
            Relatório por Família
          </Button>
          <Button
            onClick={handleExportExcel}
            disabled={exporting || checkins.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {exporting ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filter by Date */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Filtro por Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Data Inicial</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Data Final</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          {(startDate || endDate) && (
            <Button
              variant="outline"
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="mt-4 border-white/20 text-white hover:bg-white/10"
              size="sm"
            >
              Limpar Filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Visual Chart - Jobs by Status */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Jobs por Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(statusCounts).map(([status, count]) => {
              const percentage = totalJobs > 0 ? (count / totalJobs) * 100 : 0;
              const colors = {
                aguardando: 'bg-yellow-500',
                instalando: 'bg-blue-500',
                pausado: 'bg-orange-500',
                finalizado: 'bg-green-500',
                atrasado: 'bg-red-500'
              };
              
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white font-medium uppercase">{getStatusLabel(status)}</span>
                    <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[status]} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card border border-white/10">
          <TabsTrigger value="jobs" className="data-[state=active]:bg-primary">
            <Briefcase className="h-4 w-4 mr-2" />
            Relatório por Job ({filteredJobs.length})
          </TabsTrigger>
          <TabsTrigger value="installers" className="data-[state=active]:bg-primary">
            <Users className="h-4 w-4 mr-2" />
            Relatório por Instalador ({installers.length})
          </TabsTrigger>
        </TabsList>

        {/* Jobs Report */}
        <TabsContent value="jobs" className="space-y-6">
          {filteredJobs.length === 0 ? (
            <Card className="bg-card border-white/5">
              <CardContent className="py-12 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum job encontrado com os filtros selecionados</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredJobs.map((job) => {
                const jobCheckins = getJobCheckins(job.id);
                const completedCheckins = jobCheckins.filter(c => c.status === 'completed');
                const totalDuration = completedCheckins.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
                const isDelayed = job.scheduled_date && new Date(job.scheduled_date) < new Date() && job.status !== 'finalizado' && job.status !== 'completed';
                
                return (
                  <Card key={job.id} className="bg-card border-white/5 hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl text-white flex items-center gap-3 flex-wrap">
                            {job.title}
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                              {getStatusLabel(job.status)}
                            </span>
                            {isDelayed && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30">
                                <AlertCircle className="h-3 w-3 text-red-500" />
                                <span className="text-xs font-semibold text-red-500 uppercase">ATRASADO</span>
                              </div>
                            )}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-2">{job.client_name}</p>
                        </div>
                        <Button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          variant="outline"
                          size="sm"
                          className="border-white/20 text-white hover:bg-white/10"
                        >
                          Ver Detalhes
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Info Geral */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            Informações Gerais
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Filial:</span>
                              <span className="text-white font-medium">{job.branch}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Criado em:</span>
                              <span className="text-white">{formatDate(job.created_at)}</span>
                            </div>
                            {job.scheduled_date && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Agendado:</span>
                                <span className="text-white">{formatDate(job.scheduled_date)}</span>
                              </div>
                            )}
                            {job.area_m2 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Área:</span>
                                <span className="text-white">{job.area_m2}m²</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Instaladores */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            Instaladores
                          </h4>
                          <div className="space-y-2">
                            {job.assigned_installers?.length > 0 ? (
                              job.assigned_installers.map((installerId, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                  <div className="h-2 w-2 rounded-full bg-primary" />
                                  <span className="text-white">{getInstallerName(installerId)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">Nenhum instalador atribuído</p>
                            )}
                          </div>
                        </div>

                        {/* Check-ins */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-primary" />
                            Check-ins
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total:</span>
                              <span className="text-white font-medium">{jobCheckins.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Completos:</span>
                              <span className="text-green-400 font-medium">{completedCheckins.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tempo total:</span>
                              <span className="text-white font-medium">{totalDuration}min</span>
                            </div>
                            {completedCheckins.length > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Tempo médio:</span>
                                <span className="text-white font-medium">{Math.round(totalDuration / completedCheckins.length)}min</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Installers Report */}
        <TabsContent value="installers" className="space-y-6">
          {installers.length === 0 ? (
            <Card className="bg-card border-white/5">
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum instalador encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {installers.map((installer) => {
                const stats = calculateInstallerStats(installer.id);
                const installerJobs = jobs.filter(j => j.assigned_installers?.includes(installer.id));
                
                return (
                  <Card key={installer.id} className="bg-card border-white/5 hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl text-white flex items-center gap-3">
                            <Users className="h-6 w-6 text-primary" />
                            {installer.full_name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-2">
                            {installer.branch} • {installer.phone || 'Sem telefone'}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {/* Stats Cards */}
                        <Card className="bg-white/5 border-white/10">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Briefcase className="h-8 w-8 text-blue-400" />
                              <div>
                                <p className="text-2xl font-bold text-white">{installerJobs.length}</p>
                                <p className="text-xs text-muted-foreground">Jobs Atribuídos</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-white/5 border-white/10">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <CheckCircle className="h-8 w-8 text-green-400" />
                              <div>
                                <p className="text-2xl font-bold text-white">{stats.completedCheckins}</p>
                                <p className="text-xs text-muted-foreground">Check-ins Completos</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-white/5 border-white/10">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Clock className="h-8 w-8 text-yellow-400" />
                              <div>
                                <p className="text-2xl font-bold text-white">{stats.totalMinutes}min</p>
                                <p className="text-xs text-muted-foreground">Tempo Total</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-white/5 border-white/10">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <AlertCircle className="h-8 w-8 text-orange-400" />
                              <div>
                                <p className="text-2xl font-bold text-white">{stats.avgMinutes}min</p>
                                <p className="text-xs text-muted-foreground">Tempo Médio</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Jobs List */}
                      {installerJobs.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-white mb-3">Jobs Atribuídos</h4>
                          <div className="space-y-2">
                            {installerJobs.map(job => (
                              <div key={job.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                  <span className="text-white font-medium">{job.title}</span>
                                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${getStatusColor(job.status)}`}>
                                    {getStatusLabel(job.status)}
                                  </span>
                                </div>
                                <Button
                                  onClick={() => navigate(`/jobs/${job.id}`)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary hover:text-primary/80"
                                >
                                  Ver →
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;