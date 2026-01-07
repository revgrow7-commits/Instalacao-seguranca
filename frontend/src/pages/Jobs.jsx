import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Briefcase, Plus, Search, RefreshCw, MapPin, Calendar, Users, Download, Trash2, Ban, Hash } from 'lucide-react';
import { toast } from 'sonner';

const Jobs = () => {
  const { user, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [holdprintJobs, setHoldprintJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('current'); // 'all', 'current', 'YYYY-MM'
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('SP');
  const [loadingHoldprint, setLoadingHoldprint] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [markingNoInstall, setMarkingNoInstall] = useState(null);

  // Generate month options for the last 6 months
  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  };

  const monthOptions = getMonthOptions();

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const response = await api.getJobs();
      setJobs(response.data);
    } catch (error) {
      toast.error('Erro ao carregar jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId, jobTitle) => {
    if (!window.confirm(`Tem certeza que deseja excluir o job "${jobTitle}"?\n\nIsso também excluirá todos os check-ins relacionados. Esta ação não pode ser desfeita.`)) {
      return;
    }
    
    try {
      setDeletingJobId(jobId);
      await api.deleteJob(jobId);
      toast.success('Job excluído com sucesso');
      loadJobs();
    } catch (error) {
      toast.error('Erro ao excluir job');
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleMarkNoInstallation = async (jobId, jobTitle) => {
    if (!window.confirm(`Marcar o job "${jobTitle}" como SEM INSTALAÇÃO?\n\nO status será alterado para "finalizado" e não aparecerá mais na lista.`)) {
      return;
    }
    
    try {
      setMarkingNoInstall(jobId);
      await api.updateJob(jobId, { 
        status: 'finalizado',
        no_installation: true,
        notes: 'Job marcado como sem instalação'
      });
      toast.success('Job marcado como sem instalação');
      loadJobs();
    } catch (error) {
      toast.error('Erro ao marcar job');
    } finally {
      setMarkingNoInstall(null);
    }
  };

  const loadHoldprintJobs = async () => {
    setLoadingHoldprint(true);
    try {
      // Usar o endpoint de importação em lote
      const response = await api.importAllJobs(selectedBranch);
      
      const { imported, skipped, total } = response.data;
      
      if (imported > 0) {
        toast.success(`${imported} job(s) importado(s) com sucesso!`);
        loadJobs(); // Recarregar lista de jobs
      }
      
      if (skipped > 0 && imported === 0) {
        toast.info(`Todos os ${skipped} jobs já estavam importados`);
      } else if (skipped > 0) {
        toast.info(`${skipped} job(s) já existiam`);
      }
      
      if (imported === 0 && skipped === 0) {
        toast.info('Nenhum job encontrado para importar');
      }
      
      setShowImportDialog(false);
    } catch (error) {
      toast.error('Erro ao importar jobs da Holdprint');
      console.error(error);
    } finally {
      setLoadingHoldprint(false);
    }
  };

  const importJob = async (holdprintJob) => {
    try {
      await api.createJob({
        holdprint_job_id: holdprintJob.id.toString(),
        branch: selectedBranch
      });
      toast.success('Job importado com sucesso!');
      loadJobs();
      setShowImportDialog(false);
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error('Job já foi importado');
      } else {
        toast.error('Erro ao importar job');
      }
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesBranch = branchFilter === 'all' || job.branch === branchFilter;
    
    // Obter a data do job para filtros
    const getJobDate = () => {
      let dateString = job.scheduled_date;
      if (!dateString && job.holdprint_data?.deliveryNeeded) {
        dateString = job.holdprint_data.deliveryNeeded;
      }
      if (!dateString && job.holdprint_data?.creationTime) {
        dateString = job.holdprint_data.creationTime;
      }
      if (!dateString) {
        dateString = job.created_at;
      }
      return dateString ? new Date(dateString) : null;
    };
    
    const jobDate = getJobDate();
    
    // Filtro de intervalo de datas (tem prioridade sobre filtro de mês)
    let matchesDateRange = true;
    if (startDateFilter || endDateFilter) {
      if (jobDate && !isNaN(jobDate.getTime())) {
        if (startDateFilter) {
          const startDate = new Date(startDateFilter);
          startDate.setHours(0, 0, 0, 0);
          if (jobDate < startDate) matchesDateRange = false;
        }
        if (endDateFilter) {
          const endDate = new Date(endDateFilter);
          endDate.setHours(23, 59, 59, 999);
          if (jobDate > endDate) matchesDateRange = false;
        }
      } else {
        matchesDateRange = false; // Se não tem data válida, não mostra no filtro de datas
      }
    }
    
    // Filtro de mês (só aplica se não houver filtro de datas)
    let matchesMonth = true;
    if (!startDateFilter && !endDateFilter && monthFilter !== 'all') {
      if (jobDate && !isNaN(jobDate.getTime())) {
        if (monthFilter === 'current') {
          const now = new Date();
          matchesMonth = jobDate.getMonth() === now.getMonth() && 
                        jobDate.getFullYear() === now.getFullYear();
        } else {
          const [year, month] = monthFilter.split('-').map(Number);
          matchesMonth = jobDate.getMonth() === month - 1 && 
                        jobDate.getFullYear() === year;
        }
      } else {
        matchesMonth = false;
      }
    }
    
    // Não exibir jobs finalizados
    const isFinalized = job.status === 'completed' || job.status === 'finalizado';
    
    return matchesSearch && matchesStatus && matchesBranch && matchesDateRange && matchesMonth && !isFinalized;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="jobs-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold text-white tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-2">
            {filteredJobs.length} job(s) encontrado(s)
          </p>
        </div>

        {(isAdmin || isManager) && (
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90 neon-glow"
                data-testid="import-jobs-button"
              >
                <Download className="mr-2 h-5 w-5" />
                Importar da Holdprint
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Importar Jobs da Holdprint</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Selecione a filial e busque os jobs disponíveis
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="flex gap-4">
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      <SelectItem value="SP">São Paulo</SelectItem>
                      <SelectItem value="POA">Porto Alegre</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={loadHoldprintJobs}
                    disabled={loadingHoldprint}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {loadingHoldprint ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Importando Jobs...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Buscar e Importar Jobs
                      </>
                    )}
                  </Button>
                </div>

                {holdprintJobs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {holdprintJobs.length} jobs encontrados em {selectedBranch}
                    </p>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {holdprintJobs.map((job) => (
                        <Card
                          key={job.id}
                          className="bg-card/50 border-white/5 hover:border-primary/50 transition-colors"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <h3 className="text-white font-semibold">{job.title}</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Cliente: {job.customerName || 'N/A'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Código: {job.code}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => importJob(job)}
                                className="bg-primary hover:bg-primary/90"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Importar
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4 space-y-4">
          {/* First row - Search and main filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título ou cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white"
                  data-testid="search-input"
                />
              </div>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="aguardando">🟡 AGUARDANDO</SelectItem>
                <SelectItem value="instalando">🔵 INSTALANDO</SelectItem>
                <SelectItem value="pausado">🟠 PAUSADO</SelectItem>
                <SelectItem value="atrasado">🔴 ATRASADO</SelectItem>
              </SelectContent>
            </Select>

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-full md:w-40 bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todas as Filiais</SelectItem>
                <SelectItem value="SP">São Paulo</SelectItem>
                <SelectItem value="POA">Porto Alegre</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={loadJobs}
              className="border-primary/50 text-primary hover:bg-primary/10"
              data-testid="refresh-button"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>

          {/* Second row - Date filters */}
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 md:flex-none">
              <label className="text-xs text-muted-foreground mb-1 block">Data Início</label>
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => {
                  setStartDateFilter(e.target.value);
                  if (e.target.value) setMonthFilter('all');
                }}
                className="w-full md:w-40 bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="flex-1 md:flex-none">
              <label className="text-xs text-muted-foreground mb-1 block">Data Fim</label>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => {
                  setEndDateFilter(e.target.value);
                  if (e.target.value) setMonthFilter('all');
                }}
                className="w-full md:w-40 bg-white/5 border-white/10 text-white"
              />
            </div>
            
            <Select value={monthFilter} onValueChange={(value) => {
              setMonthFilter(value);
              if (value !== 'all') {
                setStartDateFilter('');
                setEndDateFilter('');
              }
            }}>
              <SelectTrigger className="w-full md:w-44 bg-white/5 border-white/10 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="current">📅 Mês Atual</SelectItem>
                <SelectItem value="all">📋 Todos</SelectItem>
                {monthOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(startDateFilter || endDateFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDateFilter('');
                  setEndDateFilter('');
                  setMonthFilter('current');
                }}
                className="text-muted-foreground hover:text-white"
              >
                Limpar datas
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <Card className="bg-card border-white/5">
          <CardContent className="py-12 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all' || branchFilter !== 'all' || monthFilter !== 'all'
                ? 'Nenhum job encontrado com os filtros aplicados'
                : 'Nenhum job importado ainda. Importe jobs da Holdprint para começar.'}
            </p>
            {monthFilter === 'current' && jobs.length > 0 && (
              <Button 
                variant="link" 
                className="mt-2 text-primary"
                onClick={() => setMonthFilter('all')}
              >
                Ver todos os meses
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredJobs.map((job) => {
            // Get job number from holdprint_data or code
            const jobNumber = job.holdprint_data?.code || job.code || job.id?.slice(0, 8);
            // Get start date
            const startDate = job.scheduled_date || job.holdprint_data?.deliveryNeeded || job.holdprint_data?.creationTime;
            const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('pt-BR') : null;
            
            return (
            <Card
              key={job.id}
              className="bg-card border-white/5 hover:border-primary/50 transition-colors"
              data-testid={`job-card-${job.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Job Number */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {jobNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">{job.branch || 'N/A'}</span>
                    </div>
                    <CardTitle 
                      className="text-lg text-white line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      {job.title}
                    </CardTitle>
                  </div>
                  <span
                    className={
                      `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap border ${
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
                     job.status === 'atrasado' ? 'ATRASADO' :
                     job.status === 'pending' || job.status === 'aguardando' ? 'AGUARDANDO' : job.status?.toUpperCase()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Users className="h-4 w-4 mr-2" />
                  {job.holdprint_data?.customerName || job.client_name}
                </div>

                {/* Start Date */}
                {formattedStartDate && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>Início: <span className="text-white font-medium">{formattedStartDate}</span></span>
                  </div>
                )}

                {job.client_address && (
                  <div className="flex items-start text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{job.client_address}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-xs text-muted-foreground">Filial: {job.branch}</span>
                  {job.assigned_installers?.length > 0 && (
                    <span className="text-xs text-primary font-medium">
                      {job.assigned_installers.length} instalador(es)
                    </span>
                  )}
                </div>

                {job.scheduled_date && (
                  <div className="flex items-center text-xs text-primary">
                    <Calendar className="h-3 w-3 mr-1" />
                    Agendado: {new Date(job.scheduled_date).toLocaleDateString('pt-BR')}
                  </div>
                )}

                {/* Action Buttons - Only for Admin/Manager */}
                {(isAdmin || isManager) && (
                  <div className="flex gap-2 mt-2">
                    {/* No Installation Button */}
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkNoInstallation(job.id, job.title);
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                      disabled={markingNoInstall === job.id}
                    >
                      {markingNoInstall === job.id ? (
                        <div className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full mr-2" />
                      ) : (
                        <Ban className="h-4 w-4 mr-2" />
                      )}
                      Sem Instalação
                    </Button>

                    {/* Delete Button */}
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteJob(job.id, job.title);
                      }}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10"
                      disabled={deletingJobId === job.id}
                    >
                      {deletingJobId === job.id ? (
                        <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Excluir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}
    </div>
  );
};

export default Jobs;