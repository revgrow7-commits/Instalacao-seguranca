import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  Briefcase, Plus, Search, RefreshCw, MapPin, Calendar, Users, 
  Download, Hash, Ban, CalendarPlus, CalendarCheck, ChevronDown,
  Clock, CheckCircle, MessageSquareWarning, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

// Skeleton loader for cards
const JobCardSkeleton = () => (
  <Card className="bg-card border-white/5 animate-pulse">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 bg-white/10 rounded w-16"></div>
        <div className="h-4 bg-white/10 rounded w-10"></div>
      </div>
      <div className="h-6 bg-white/10 rounded w-3/4"></div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="h-4 bg-white/10 rounded w-full"></div>
      <div className="h-4 bg-white/10 rounded w-2/3"></div>
      <div className="flex gap-2 mt-2">
        <div className="h-8 bg-white/10 rounded flex-1"></div>
        <div className="h-8 bg-white/10 rounded flex-1"></div>
      </div>
    </CardContent>
  </Card>
);

// Mini Job Card Component for better performance
const JobCard = React.memo(({ job, onNavigate, onFinalize, onSchedule, onJustify, isAdmin, isManager, isLoading }) => {
  const jobNumber = job.holdprint_data?.code || job.code || job.id?.slice(0, 8);
  const startDate = job.scheduled_date || job.holdprint_data?.deliveryNeeded || job.holdprint_data?.creationTime;
  const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('pt-BR') : null;
  const isScheduled = !!job.scheduled_date;
  const isLate = job.scheduled_date && new Date(job.scheduled_date) < new Date() && job.status !== 'completed' && job.status !== 'finalizado';
  
  const getStatusStyle = () => {
    switch (job.status) {
      case 'completed':
      case 'finalizado':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in_progress':
      case 'instalando':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'pausado':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'atrasado':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  const getStatusLabel = () => {
    switch (job.status) {
      case 'completed':
      case 'finalizado':
        return 'FINALIZADO';
      case 'in_progress':
      case 'instalando':
        return 'INSTALANDO';
      case 'pausado':
        return 'PAUSADO';
      case 'atrasado':
        return 'ATRASADO';
      default:
        return 'AGUARDANDO';
    }
  };

  return (
    <Card className="bg-card border-white/5 hover:border-primary/30 transition-all duration-200 group">
      <CardContent className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {jobNumber}
            </span>
            <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
              {job.branch || 'N/A'}
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusStyle()}`}>
            {getStatusLabel()}
          </span>
        </div>

        {/* Title - Clickable */}
        <h3 
          onClick={() => onNavigate(job.id)}
          className="text-sm font-medium text-white line-clamp-2 mb-2 cursor-pointer hover:text-primary transition-colors"
        >
          {job.title}
        </h3>

        {/* Client */}
        <div className="flex items-center text-xs text-muted-foreground mb-2">
          <Users className="h-3 w-3 mr-1.5 flex-shrink-0" />
          <span className="truncate">{job.holdprint_data?.customerName || job.client_name}</span>
        </div>

        {/* Date Row */}
        <div className="flex items-center gap-3 text-xs mb-3">
          {formattedStartDate && (
            <div className="flex items-center text-muted-foreground">
              <Clock className="h-3 w-3 mr-1" />
              {formattedStartDate}
            </div>
          )}
          {isScheduled && (
            <div className="flex items-center text-green-400">
              <CalendarCheck className="h-3 w-3 mr-1" />
              Agendado
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {(isAdmin || isManager) && (
          <div className="flex gap-2 pt-2 border-t border-white/5">
            {/* Schedule Button */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onSchedule(job);
              }}
              variant="outline"
              size="sm"
              className={`flex-1 h-8 text-xs ${
                isScheduled 
                  ? 'border-green-500/50 text-green-400 hover:bg-green-500/10' 
                  : 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10'
              }`}
            >
              {isScheduled ? (
                <>
                  <CalendarCheck className="h-3 w-3 mr-1" />
                  Agendado
                </>
              ) : (
                <>
                  <CalendarPlus className="h-3 w-3 mr-1" />
                  Agendar
                </>
              )}
            </Button>

            {/* Justify Button - Show when scheduled and late */}
            {isScheduled && isLate && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onJustify(job);
                }}
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                <MessageSquareWarning className="h-3 w-3 mr-1" />
                Justificar
              </Button>
            )}

            {/* Finalize Without Installation Button */}
            {!isLate && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onFinalize(job);
                }}
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                disabled={isLoading === job.id}
              >
                {isLoading === job.id ? (
                  <div className="animate-spin h-3 w-3 border-2 border-orange-400 border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Ban className="h-3 w-3 mr-1" />
                    S/ Instalação
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

JobCard.displayName = 'JobCard';

const Jobs = () => {
  const { user, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('current');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('SP');
  const [loadingHoldprint, setLoadingHoldprint] = useState(false);
  const [processingJobId, setProcessingJobId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  
  // Justification dialog states
  const [showJustifyDialog, setShowJustifyDialog] = useState(false);
  const [justifyJob, setJustifyJob] = useState(null);
  const [justifyReason, setJustifyReason] = useState('');
  const [justifyType, setJustifyType] = useState('no_checkin'); // no_checkin, no_checkout, cancelled
  const [sendingJustification, setSendingJustification] = useState(false);

  // Generate month options
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getJobs();
      setJobs(response.data);
    } catch (error) {
      toast.error('Erro ao carregar jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHoldprintJobs = async () => {
    setLoadingHoldprint(true);
    try {
      const response = await api.importAllJobs(selectedBranch);
      const { imported, skipped } = response.data;
      
      if (imported > 0) {
        toast.success(`${imported} job(s) importado(s) com sucesso!`);
        loadJobs();
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
      console.error('Error importing jobs:', error);
      toast.error('Erro ao importar jobs');
    } finally {
      setLoadingHoldprint(false);
    }
  };

  const handleFinalizeNoInstallation = async (job) => {
    const confirmed = window.confirm(
      `Finalizar "${job.title}" como SEM INSTALAÇÃO?\n\n` +
      `⚠️ Este job será:\n` +
      `• Marcado como "cancelado"\n` +
      `• Removido das métricas\n` +
      `• Não aparecerá mais na lista\n\n` +
      `Esta ação não pode ser desfeita.`
    );
    
    if (!confirmed) return;
    
    try {
      setProcessingJobId(job.id);
      await api.updateJob(job.id, { 
        status: 'cancelado',
        no_installation: true,
        cancelled_at: new Date().toISOString(),
        exclude_from_metrics: true,
        notes: 'Job finalizado sem instalação - dados excluídos das métricas'
      });
      toast.success('Job finalizado sem instalação');
      setJobs(prev => prev.filter(j => j.id !== job.id));
    } catch (error) {
      console.error('Error finalizing job:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Erro desconhecido';
      toast.error(`Erro: ${errorMsg}`);
    } finally {
      setProcessingJobId(null);
    }
  };

  // Open justification dialog
  const handleOpenJustifyDialog = (job) => {
    setJustifyJob(job);
    setJustifyReason('');
    setJustifyType('no_checkin');
    setShowJustifyDialog(true);
  };

  // Submit justification
  const handleSubmitJustification = async () => {
    if (!justifyJob || !justifyReason.trim()) {
      toast.error('Por favor, informe o motivo da justificativa');
      return;
    }

    setSendingJustification(true);
    try {
      await api.submitJobJustification(justifyJob.id, {
        reason: justifyReason,
        type: justifyType,
        job_title: justifyJob.title,
        job_code: justifyJob.holdprint_data?.code || justifyJob.code || justifyJob.id?.slice(0, 8)
      });
      
      toast.success('Justificativa enviada e job finalizado!');
      setShowJustifyDialog(false);
      setJustifyJob(null);
      setJustifyReason('');
      loadJobs();
    } catch (error) {
      console.error('Error submitting justification:', error);
      toast.error('Erro ao enviar justificativa');
    } finally {
      setSendingJustification(false);
    }
  };

  const handleOpenScheduleDialog = (job) => {
    setSelectedJob(job);
    setScheduleDate(job.scheduled_date ? job.scheduled_date.split('T')[0] : '');
    setShowScheduleDialog(true);
  };

  const handleScheduleJob = async () => {
    if (!selectedJob) return;
    
    try {
      setProcessingJobId(selectedJob.id);
      await api.updateJob(selectedJob.id, { 
        scheduled_date: scheduleDate ? new Date(scheduleDate).toISOString() : null
      });
      
      toast.success(scheduleDate ? 'Job agendado com sucesso!' : 'Agendamento removido');
      
      setJobs(prev => prev.map(j => 
        j.id === selectedJob.id 
          ? { ...j, scheduled_date: scheduleDate ? new Date(scheduleDate).toISOString() : null }
          : j
      ));
      
      setShowScheduleDialog(false);
      setSelectedJob(null);
      setScheduleDate('');
    } catch (error) {
      console.error('Error scheduling job:', error);
      toast.error('Erro ao agendar job');
    } finally {
      setProcessingJobId(null);
    }
  };

  // Memoized filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = !searchTerm || 
        job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.holdprint_data?.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesBranch = branchFilter === 'all' || job.branch === branchFilter;
      
      // Get job date
      const getJobDate = () => {
        const dateString = job.scheduled_date || 
          job.holdprint_data?.deliveryNeeded || 
          job.holdprint_data?.creationTime || 
          job.created_at;
        return dateString ? new Date(dateString) : null;
      };
      
      const jobDate = getJobDate();
      
      // Date range filter
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
          matchesDateRange = false;
        }
      }
      
      // Month filter
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
      
      // Hide finalized/cancelled jobs
      const isHidden = ['completed', 'finalizado', 'cancelado'].includes(job.status);
      
      return matchesSearch && matchesStatus && matchesBranch && matchesDateRange && matchesMonth && !isHidden;
    });
  }, [jobs, searchTerm, statusFilter, branchFilter, startDateFilter, endDateFilter, monthFilter]);

  const loadMore = () => setVisibleCount(prev => prev + 12);

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <div className="h-10 bg-white/10 rounded w-48 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <JobCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight">
            Jobs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filteredJobs.length} job(s) encontrado(s)
          </p>
        </div>

        {(isAdmin || isManager) && (
          <div className="flex gap-2">
            <Button
              onClick={loadJobs}
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/5"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button
              onClick={() => setShowImportDialog(true)}
              className="bg-primary hover:bg-primary/90"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Importar Holdprint
            </Button>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{filteredJobs.length}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="h-4 w-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {filteredJobs.filter(j => j.status === 'aguardando' || j.status === 'pending').length}
              </p>
              <p className="text-[10px] text-muted-foreground">Aguardando</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {filteredJobs.filter(j => j.status === 'instalando' || j.status === 'in_progress').length}
              </p>
              <p className="text-[10px] text-muted-foreground">Instalando</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CalendarCheck className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {filteredJobs.filter(j => j.scheduled_date).length}
              </p>
              <p className="text-[10px] text-muted-foreground">Agendados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4 space-y-4">
          {/* First row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="aguardando">🟡 Aguardando</SelectItem>
                <SelectItem value="instalando">🔵 Instalando</SelectItem>
                <SelectItem value="pausado">🟠 Pausado</SelectItem>
                <SelectItem value="atrasado">🔴 Atrasado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todas as Filiais</SelectItem>
                <SelectItem value="SP">São Paulo</SelectItem>
                <SelectItem value="POA">Porto Alegre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Second row - Date filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Data Início</label>
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => {
                  setStartDateFilter(e.target.value);
                  if (e.target.value) setMonthFilter('all');
                }}
                className="w-36 bg-white/5 border-white/10 text-white h-9"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Data Fim</label>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => {
                  setEndDateFilter(e.target.value);
                  if (e.target.value) setMonthFilter('all');
                }}
                className="w-36 bg-white/5 border-white/10 text-white h-9"
              />
            </div>
            <Select value={monthFilter} onValueChange={(value) => {
              setMonthFilter(value);
              if (value !== 'all') {
                setStartDateFilter('');
                setEndDateFilter('');
              }
            }}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white h-9">
                <Calendar className="h-3 w-3 mr-2" />
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
                className="text-muted-foreground hover:text-white h-9"
              >
                Limpar datas
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Jobs Grid */}
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredJobs.slice(0, visibleCount).map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onNavigate={(id) => navigate(`/jobs/${id}`)}
                onFinalize={handleFinalizeNoInstallation}
                onSchedule={handleOpenScheduleDialog}
                onJustify={handleOpenJustifyDialog}
                isAdmin={isAdmin}
                isManager={isManager}
                isLoading={processingJobId}
              />
            ))}
          </div>
          
          {/* Load More */}
          {visibleCount < filteredJobs.length && (
            <div className="flex justify-center mt-6">
              <Button
                onClick={loadMore}
                variant="outline"
                className="border-white/20 text-white hover:bg-white/5"
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Carregar mais ({filteredJobs.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Importar Jobs da Holdprint</DialogTitle>
            <DialogDescription>
              Selecione a filial para buscar e importar os jobs automaticamente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Selecione a filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="SP">São Paulo</SelectItem>
                <SelectItem value="POA">Porto Alegre</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={loadHoldprintJobs}
              disabled={loadingHoldprint}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {loadingHoldprint ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Importando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Buscar e Importar Jobs
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Agendar Job</DialogTitle>
            <DialogDescription>
              {selectedJob?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Data de Agendamento</label>
              <Input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleScheduleJob}
                disabled={processingJobId === selectedJob?.id}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {processingJobId === selectedJob?.id ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : scheduleDate ? (
                  <>
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    Confirmar Agendamento
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-2" />
                    Remover Agendamento
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowScheduleDialog(false)}
                className="border-white/20 text-white hover:bg-white/5"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Justification Dialog */}
      <Dialog open={showJustifyDialog} onOpenChange={setShowJustifyDialog}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <DialogTitle className="text-xl text-white">Justificar Job Não Realizado</DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground">
              {justifyJob && (
                <>
                  <span className="font-mono text-primary">#{justifyJob.holdprint_data?.code || justifyJob.id?.slice(0, 8)}</span>
                  {' - '}
                  {justifyJob.title}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Justification Type */}
            <div className="space-y-2">
              <Label className="text-white">Tipo de Justificativa *</Label>
              <Select value={justifyType} onValueChange={setJustifyType}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="no_checkin">Check-in não realizado</SelectItem>
                  <SelectItem value="no_checkout">Check-out não realizado</SelectItem>
                  <SelectItem value="cancelled">Job cancelado pelo cliente</SelectItem>
                  <SelectItem value="rescheduled">Job reagendado</SelectItem>
                  <SelectItem value="other">Outro motivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label className="text-white">Motivo / Justificativa *</Label>
              <Textarea
                value={justifyReason}
                onChange={(e) => setJustifyReason(e.target.value)}
                placeholder="Descreva o motivo pelo qual o job não foi realizado..."
                className="bg-white/5 border-white/10 text-white min-h-[100px]"
              />
            </div>

            {/* Info about notification */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-400">
                📧 Uma notificação será enviada para Bruno e Marcelo com os detalhes da justificativa.
              </p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowJustifyDialog(false);
                setJustifyJob(null);
                setJustifyReason('');
              }}
              className="border-white/20 text-white hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitJustification}
              disabled={sendingJustification || !justifyReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {sendingJustification ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Enviando...
                </>
              ) : (
                'Enviar e Finalizar Job'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Jobs;
