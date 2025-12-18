import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { FileText, Users, Briefcase, Clock, CheckCircle, AlertCircle, TrendingUp, Calendar, Download, Layers, User, Camera, Image, X, MapPin, Pause, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Constante para itens por página
const ITEMS_PER_PAGE = 10;

const Reports = () => {
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [itemCheckins, setItemCheckins] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('jobs');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoType, setPhotoType] = useState('');
  
  // Paginação
  const [jobsPage, setJobsPage] = useState(1);
  const [installersPage, setInstallersPage] = useState(1);
  const [photosPage, setPhotosPage] = useState(1);

  useEffect(() => {
    if (!isAdmin && !isManager) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [isAdmin, isManager, navigate]);

  // Carregar dados básicos (sem fotos pesadas)
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

  // Carregar fotos apenas quando a aba de fotos for acessada
  const loadPhotosData = useCallback(async () => {
    if (itemCheckins.length > 0) return; // Já carregado
    
    setLoadingPhotos(true);
    try {
      const itemCheckinsRes = await api.getAllItemCheckins();
      setItemCheckins(itemCheckinsRes.data);
    } catch (error) {
      toast.error('Erro ao carregar fotos');
    } finally {
      setLoadingPhotos(false);
    }
  }, [itemCheckins.length]);

  // Carregar fotos quando a aba de fotos for selecionada
  useEffect(() => {
    if (activeTab === 'photos') {
      loadPhotosData();
    }
  }, [activeTab, loadPhotosData]);

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

  const filterItemCheckinsByDate = useCallback((checkinsList) => {
    if (!startDate && !endDate) return checkinsList;
    
    return checkinsList.filter(checkin => {
      const checkinDate = new Date(checkin.checkin_at);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);
      
      return checkinDate >= start && checkinDate <= end;
    });
  }, [startDate, endDate]);

  // Dados filtrados com memoização para evitar recálculos
  const filteredJobs = useMemo(() => filterJobsByDate(jobs), [jobs, startDate, endDate]);
  const filteredItemCheckins = useMemo(() => filterItemCheckinsByDate(itemCheckins), [itemCheckins, filterItemCheckinsByDate]);
  
  // Paginação de Jobs
  const paginatedJobs = useMemo(() => {
    const start = (jobsPage - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredJobs, jobsPage]);
  
  const totalJobsPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);
  
  // Paginação de Instaladores
  const paginatedInstallers = useMemo(() => {
    const start = (installersPage - 1) * ITEMS_PER_PAGE;
    return installers.slice(start, start + ITEMS_PER_PAGE);
  }, [installers, installersPage]);
  
  const totalInstallersPages = Math.ceil(installers.length / ITEMS_PER_PAGE);
  
  // Paginação de Fotos
  const paginatedPhotos = useMemo(() => {
    const start = (photosPage - 1) * ITEMS_PER_PAGE;
    return filteredItemCheckins.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItemCheckins, photosPage]);
  
  const totalPhotosPages = Math.ceil(filteredItemCheckins.length / ITEMS_PER_PAGE);

  // Reset página quando filtros mudam
  useEffect(() => {
    setJobsPage(1);
    setPhotosPage(1);
  }, [startDate, endDate]);

  const formatDateTime = (dateString) => {
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

  const formatDuration = (minutes) => {
    if (!minutes) return '0min';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins}min`;
  };

  const getPhotoSrc = (photoData) => {
    if (!photoData) return null;
    if (photoData.startsWith('data:image')) return photoData;
    return `data:image/jpeg;base64,${photoData}`;
  };

  const openPhotoModal = (photo, type) => {
    setSelectedPhoto(photo);
    setPhotoType(type);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  const statusCounts = getJobsByStatus();
  const totalJobs = filteredJobs.length;
  const maxCount = Math.max(...Object.values(statusCounts));

  // Componente de Paginação
  const Pagination = ({ currentPage, totalPages, onPageChange, label }) => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
        <span className="text-sm text-muted-foreground">
          Página {currentPage} de {totalPages} ({label})
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="h-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {/* Números das páginas */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className="h-8 w-8 p-0"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="h-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

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
            Por Família
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/reports/installer')}
            className="gap-2"
          >
            <User className="h-4 w-4" />
            Por Instalador
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
        <TabsList className="bg-card border border-white/10 flex-wrap">
          <TabsTrigger value="jobs" className="data-[state=active]:bg-primary">
            <Briefcase className="h-4 w-4 mr-2" />
            Por Job ({filteredJobs.length})
          </TabsTrigger>
          <TabsTrigger value="installers" className="data-[state=active]:bg-primary">
            <Users className="h-4 w-4 mr-2" />
            Por Instalador ({installers.length})
          </TabsTrigger>
          <TabsTrigger value="photos" className="data-[state=active]:bg-primary">
            <Camera className="h-4 w-4 mr-2" />
            Fotos Check-in/out ({filterItemCheckinsByDate(itemCheckins).length})
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
              {paginatedJobs.map((job) => {
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
              
              {/* Paginação de Jobs */}
              <Pagination
                currentPage={jobsPage}
                totalPages={totalJobsPages}
                onPageChange={setJobsPage}
                label={`${filteredJobs.length} jobs`}
              />
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

        {/* Photos Report */}
        <TabsContent value="photos" className="space-y-6">
          <Card className="bg-card border-white/5">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary" />
                  Registro Fotográfico de Check-ins/Check-outs
                </div>
                <span className="text-sm font-normal text-muted-foreground">
                  {filteredItemCheckins.length} registro(s)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPhotos ? (
                <div className="text-center py-12">
                  <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
                  <p className="text-muted-foreground">Carregando registros fotográficos...</p>
                </div>
              ) : filteredItemCheckins.length === 0 ? (
                <div className="text-center py-12">
                  <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum registro fotográfico encontrado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedPhotos.map((checkin) => (
                    <div key={checkin.id} className="bg-white/5 rounded-lg border border-white/10 p-4">
                      <div className="flex flex-col md:flex-row gap-4">
                        {/* Info Section */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-white font-medium">{checkin.product_name || `Item ${checkin.item_index + 1}`}</h4>
                              <p className="text-sm text-muted-foreground">{checkin.job_title}</p>
                              <p className="text-xs text-muted-foreground">{checkin.client_name}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                              checkin.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                              checkin.status === 'paused' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {checkin.status === 'completed' ? 'Concluído' : 
                               checkin.status === 'paused' ? 'Pausado' : 'Em Andamento'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Instalador:</span>
                              <p className="text-white">{checkin.installer_name}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Check-in:</span>
                              <p className="text-white">{formatDateTime(checkin.checkin_at)}</p>
                            </div>
                            {checkin.checkout_at && (
                              <div>
                                <span className="text-muted-foreground">Check-out:</span>
                                <p className="text-white">{formatDateTime(checkin.checkout_at)}</p>
                              </div>
                            )}
                            {checkin.net_duration_minutes > 0 && (
                              <div>
                                <span className="text-muted-foreground">Tempo Líquido:</span>
                                <p className="text-white">{formatDuration(checkin.net_duration_minutes)}</p>
                                {checkin.total_pause_minutes > 0 && (
                                  <p className="text-xs text-orange-400 flex items-center gap-1">
                                    <Pause className="h-3 w-3" />
                                    Pausas: {formatDuration(checkin.total_pause_minutes)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* GPS Location */}
                          {checkin.gps_lat && checkin.gps_long && (
                            <a 
                              href={`https://www.google.com/maps?q=${checkin.gps_lat},${checkin.gps_long}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <MapPin className="h-3 w-3" />
                              Ver localização do check-in
                            </a>
                          )}

                          {checkin.notes && (
                            <div className="bg-black/20 rounded p-2">
                              <p className="text-xs text-muted-foreground">Observação:</p>
                              <p className="text-sm text-white">{checkin.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* Photos Section */}
                        <div className="flex gap-3 flex-wrap md:flex-nowrap">
                          {checkin.checkin_photo && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground text-center">Check-in</p>
                              <button
                                onClick={() => openPhotoModal(checkin.checkin_photo, 'Check-in')}
                                className="relative group"
                              >
                                <img 
                                  src={getPhotoSrc(checkin.checkin_photo)} 
                                  alt="Check-in" 
                                  className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-lg border border-white/20 hover:border-primary transition-colors"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                  <Image className="h-6 w-6 text-white" />
                                </div>
                              </button>
                            </div>
                          )}
                          {checkin.checkout_photo && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground text-center">Check-out</p>
                              <button
                                onClick={() => openPhotoModal(checkin.checkout_photo, 'Check-out')}
                                className="relative group"
                              >
                                <img 
                                  src={getPhotoSrc(checkin.checkout_photo)} 
                                  alt="Check-out" 
                                  className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-lg border border-white/20 hover:border-primary transition-colors"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                  <Image className="h-6 w-6 text-white" />
                                </div>
                              </button>
                            </div>
                          )}
                          {!checkin.checkin_photo && !checkin.checkout_photo && (
                            <div className="w-32 h-32 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center">
                              <p className="text-xs text-muted-foreground text-center">Sem fotos</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Paginação */}
                  <Pagination
                    currentPage={photosPage}
                    totalPages={totalPhotosPages}
                    onPageChange={setPhotosPage}
                    label={`${filteredItemCheckins.length} registros`}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Photo Modal */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="bg-card border-white/10 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                Foto de {photoType}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setSelectedPhoto(null)}
                className="text-muted-foreground hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="flex justify-center">
              <img 
                src={getPhotoSrc(selectedPhoto)} 
                alt={photoType} 
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;