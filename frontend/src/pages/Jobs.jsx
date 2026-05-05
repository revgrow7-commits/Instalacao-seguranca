import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import {
  Briefcase, Plus, Search, RefreshCw, MapPin, Calendar, Users,
  Download, Hash, Ban, CalendarPlus, CalendarCheck, ChevronDown,
  Clock, CheckCircle, MessageSquareWarning, AlertTriangle, ChevronRight,
  Archive, ArchiveRestore, CheckSquare, Square, X
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { format } from 'date-fns';

// Skeleton loader for cards
const JobCardSkeleton = ({ delay = 0 }) => (
  <Card
    className="bg-card border-white/5 animate-pulse"
    style={{ animationDelay: `${delay}ms` }}
  >
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 bg-white/10 rounded w-14"></div>
          <div className="h-5 bg-white/10 rounded w-9"></div>
        </div>
        <div className="h-5 bg-white/10 rounded w-20"></div>
      </div>
      <div className="h-5 bg-white/10 rounded w-4/5 mb-2"></div>
      <div className="h-4 bg-white/10 rounded w-3/5 mb-3"></div>
      <div className="h-4 bg-white/10 rounded w-2/5 mb-4"></div>
      <div className="flex gap-2 pt-2 border-t border-white/5">
        <div className="h-8 bg-white/10 rounded flex-1"></div>
        <div className="h-8 bg-white/10 rounded flex-1"></div>
        <div className="h-8 bg-white/10 rounded w-8"></div>
      </div>
    </CardContent>
  </Card>
);

// Mockup estático — aparece instantaneamente, sem async, sem animations.
// Representa a estrutura real da página com as cores corretas para que o
// cérebro reconheça "esta é a página de Jobs" antes dos dados chegarem.
const MOCKUP_JOBS = [
  { code: '2006', branch: 'POA', status: 'AGUARDANDO', title: 'BANNER', client: 'INSTITUTO DO CANCER INFANTIL RS', late: true },
  { code: '2003', branch: 'POA', status: 'AGUARDANDO', title: 'CORTE', client: 'GABRIELLI MACIEL NUNES', late: true },
  { code: '1707', branch: 'SP',  status: 'AGUARDANDO', title: 'Remendo Lacta', client: 'SET INTEGRATIVE', late: false },
  { code: '1788', branch: 'SP',  status: 'AGUARDANDO', title: 'PLACAS LACOSTE', client: 'E-INFINITE COMÉRCIO', late: false },
  { code: '1789', branch: 'SP',  status: 'AGENDADO',   title: 'FACHADA LOJA', client: 'GRUPO SOMA', late: false },
  { code: '2391', branch: 'POA', status: 'AGUARDANDO', title: 'ADESIVO FROTA', client: 'TRANSPORTES REGIO', late: false },
  { code: '2392', branch: 'POA', status: 'AGENDADO',   title: 'LETREIRO LED', client: 'FARMÁCIAS NISSEI', late: false },
  { code: '2393', branch: 'POA', status: 'AGUARDANDO', title: 'BANNER EVENTO', client: 'SICREDI PIONEIRA', late: false },
];

const JobsMockupCard = ({ job }) => (
  <Card className={`bg-card border-white/5 ${job.late ? 'border-l-4 border-l-red-500' : ''}`}>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
            #{job.code}
          </span>
          <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
            {job.branch}
          </span>
          {job.late && <AlertTriangle className="h-4 w-4 text-red-400" />}
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
          job.status === 'AGENDADO'
            ? 'bg-green-500/20 text-green-400 border-green-500/30'
            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        }`}>
          {job.status}
        </span>
      </div>
      <div className="h-5 w-4/5 bg-white/10 rounded mb-2" />
      <div className="h-4 w-3/5 bg-white/5 rounded mb-3" />
      <div className="h-4 w-2/5 bg-white/5 rounded mb-4" />
      <div className="flex gap-2 pt-2 border-t border-white/5">
        <div className={`h-8 flex-1 rounded border text-xs flex items-center justify-center gap-1 ${
          job.status === 'AGENDADO'
            ? 'border-green-500/30 text-green-400/60'
            : 'border-blue-500/30 text-blue-400/60'
        }`}>
          <CalendarCheck className="h-3 w-3" />
          {job.status === 'AGENDADO' ? 'Agendado' : 'Agendar'}
        </div>
        <div className="h-8 flex-1 rounded border border-orange-500/20 text-orange-400/50 text-xs flex items-center justify-center gap-1">
          <Ban className="h-3 w-3" />
          S/ Instalação
        </div>
        <div className="h-8 w-8 rounded border border-gray-500/20 flex items-center justify-center">
          <Archive className="h-3 w-3 text-gray-500/50" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const JobsPageSkeleton = () => (
  <div className="p-4 md:p-8 space-y-6">
    {/* Header — texto real para reconhecimento imediato */}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-white/30 tracking-tight">Jobs</h1>
        <p className="text-muted-foreground/40 text-sm mt-1">Carregando jobs…</p>
      </div>
      <div className="flex gap-2">
        <div className="h-9 bg-white/5 rounded w-24 animate-pulse" />
        <div className="h-9 bg-white/5 rounded w-28 animate-pulse" />
        <div className="h-9 bg-primary/10 rounded w-36 animate-pulse" />
      </div>
    </div>

    {/* Stats Cards — cores reais + labels visíveis */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { color: 'bg-primary/20', label: 'Total',      num: '—' },
        { color: 'bg-yellow-500/20', label: 'Aguardando', num: '—' },
        { color: 'bg-blue-500/20',  label: 'Instalando', num: '—' },
        { color: 'bg-green-500/20', label: 'Agendados',  num: '—' },
      ].map(({ color, label, num }, i) => (
        <Card key={i} className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${color}`}>
              <div className="h-4 w-4 bg-white/10 rounded animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-white/20">{num}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Filter bar */}
    <Card className="bg-card border-white/5">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 h-9 bg-white/5 rounded animate-pulse" />
          <div className="h-9 bg-white/5 rounded animate-pulse" />
          <div className="h-9 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 bg-white/5 rounded w-48 animate-pulse" />
          <div className="h-9 bg-white/5 rounded w-36 animate-pulse" />
          <div className="h-9 bg-white/5 rounded w-36 animate-pulse" />
          <div className="h-9 bg-white/5 rounded w-40 animate-pulse" />
        </div>
      </CardContent>
    </Card>

    {/* Mockup de cards com estrutura real (cores, badges, botões) — sem pulse */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-40">
      {MOCKUP_JOBS.map((job) => (
        <JobsMockupCard key={job.code} job={job} />
      ))}
    </div>
  </div>
);

// Mini Job Card Component for better performance
const JobCard = React.memo(({ job, onNavigate, onFinalize, onSchedule, onJustify, onArchive, isAdmin, isManager, isLoading, selectionMode, isSelected, onToggleSelect }) => {
  const jobNumber = job.holdprint_data?.code || job.code || job.id?.slice(0, 8);
  const isScheduled = !!job.scheduled_date;
  const isArchived = job.archived || job.status === 'arquivado';
  
  // Holdprint delivery date is always the primary date shown on the card
  const deliveryDate = job.holdprint_data?.deliveryNeeded || job.holdprint_data?.deliveryExpected || job.holdprint_data?.creationTime || null;
  const deliveryLabel = job.holdprint_data?.deliveryNeeded ? 'Entrega Prevista' : job.holdprint_data?.deliveryExpected ? 'Entrega Esperada' : job.holdprint_data?.creationTime ? 'Criado em' : null;
  const formattedDeliveryDate = deliveryDate ? new Date(deliveryDate).toLocaleDateString('pt-BR') : null;
  const formattedScheduledDate = job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('pt-BR') : null;

  // Legacy: kept for isLate calculation only
  const getDateInfo = () => {
    if (job.holdprint_data?.deliveryNeeded) return { date: job.holdprint_data.deliveryNeeded, isScheduledDate: false };
    if (job.holdprint_data?.creationTime) return { date: job.holdprint_data.creationTime, isScheduledDate: false };
    if (job.scheduled_date) return { date: job.scheduled_date, isScheduledDate: true };
    return { date: null, isScheduledDate: false };
  };
  const dateInfo = getDateInfo();
  const formattedStartDate = formattedDeliveryDate || formattedScheduledDate;
  const isLate = job.scheduled_date && new Date(job.scheduled_date) < new Date() && job.status !== 'completed' && job.status !== 'finalizado';
  
  // Calculate time since job started (for "instalando" status)
  const getElapsedTime = () => {
    // Check if there's a checkin time for this job
    const checkinTime = job.last_checkin_at || job.started_at;
    if (!checkinTime) return null;
    
    const start = new Date(checkinTime);
    const now = new Date();
    const diffMs = now - start;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}min`;
    }
    return `${diffMinutes}min`;
  };
  
  // Check if job is stalled (more than 3 hours without activity)
  const isStalled = () => {
    const checkinTime = job.last_checkin_at || job.started_at;
    if (!checkinTime) return false;
    
    const start = new Date(checkinTime);
    const now = new Date();
    const diffHours = (now - start) / (1000 * 60 * 60);
    return diffHours >= 3;
  };
  
  const isInProgress = job.status === 'instalando' || job.status === 'in_progress';
  const elapsedTime = isInProgress ? getElapsedTime() : null;
  const jobIsStalled = isInProgress && isStalled();
  
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
      case 'arquivado':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  const getStatusLabel = () => {
    // Check if job is archived
    if (job.archived) return 'ARQUIVADO';
    
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
      case 'arquivado':
        return 'ARQUIVADO';
      default:
        return 'AGUARDANDO';
    }
  };

  return (
    <Card
      className={`bg-card border-white/5 hover:border-primary/30 transition-all duration-200 group
        ${isLate ? 'border-l-4 border-l-red-500' : ''}
        ${jobIsStalled ? 'border-l-4 border-l-orange-500' : ''}
        ${selectionMode ? 'cursor-pointer' : ''}
        ${isSelected ? 'ring-2 ring-primary border-primary/50 bg-primary/5' : ''}
      `}
      onClick={selectionMode ? () => onToggleSelect(job.id) : undefined}
    >
      <CardContent className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {/* Checkbox in selection mode */}
            {selectionMode && (
              <span className="flex-shrink-0 text-primary">
                {isSelected
                  ? <CheckSquare className="h-4 w-4" />
                  : <Square className="h-4 w-4 text-muted-foreground" />
                }
              </span>
            )}
            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {jobNumber}
            </span>
            <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
              {job.branch || 'N/A'}
            </span>
            {isLate && (
              <span className="flex items-center text-red-400" title="Job atrasado">
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusStyle()}`}>
            {getStatusLabel()}
          </span>
        </div>

        {/* Title - Clickable only when NOT in selection mode */}
        <h3
          onClick={selectionMode ? undefined : () => onNavigate(job.id)}
          className={`text-sm font-medium text-white line-clamp-2 mb-2 transition-colors
            ${selectionMode ? '' : 'cursor-pointer hover:text-primary'}`}
        >
          {job.title}
        </h3>

        {/* Client */}
        <div className="flex items-center text-xs text-muted-foreground mb-2">
          <Users className="h-3 w-3 mr-1.5 flex-shrink-0" />
          <span className="truncate">{job.holdprint_data?.customerName || job.client_name}</span>
        </div>

        {/* Date Row */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between">
            {formattedDeliveryDate ? (
              <div className={`flex items-center gap-1.5 text-sm font-medium ${isLate ? 'text-red-400' : 'text-slate-200'}`}>
                <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{formattedDeliveryDate}</span>
                {isLate && <span className="text-[10px] font-normal">(atrasado)</span>}
              </div>
            ) : formattedScheduledDate ? (
              <div className="flex items-center gap-1.5 text-sm font-medium text-green-400">
                <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{formattedScheduledDate}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground/50 italic">Sem data</span>
            )}
            {deliveryLabel && (
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{deliveryLabel}</span>
            )}
          </div>
          {formattedDeliveryDate && formattedScheduledDate && (
            <div className="flex items-center gap-1 text-[11px] text-green-400">
              <CalendarCheck className="h-3 w-3 flex-shrink-0" />
              <span>Agendado: {formattedScheduledDate}</span>
            </div>
          )}
        </div>

        {/* Elapsed time indicator for jobs in progress */}
        {isInProgress && elapsedTime && (
          <div className={`flex items-center gap-2 text-xs mb-3 p-2 rounded ${jobIsStalled ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
            <Clock className={`h-3 w-3 ${jobIsStalled ? 'text-orange-400' : 'text-blue-400'}`} />
            <span className={jobIsStalled ? 'text-orange-400' : 'text-blue-400'}>
              Em execução há <strong>{elapsedTime}</strong>
            </span>
            {jobIsStalled && (
              <span className="text-orange-400 flex items-center gap-1 ml-auto">
                <AlertTriangle className="h-3 w-3" />
                Parado
              </span>
            )}
          </div>
        )}

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
            {!isLate && !isArchived && (
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

            {/* Archive/Unarchive Button */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onArchive(job, !isArchived);
              }}
              variant="outline"
              size="sm"
              className={`h-8 text-xs ${
                isArchived 
                  ? 'border-green-500/50 text-green-400 hover:bg-green-500/10' 
                  : 'border-gray-500/50 text-gray-400 hover:bg-gray-500/10'
              }`}
              title={isArchived ? 'Restaurar job' : 'Arquivar job'}
            >
              {isArchived ? (
                <ArchiveRestore className="h-3 w-3" />
              ) : (
                <Archive className="h-3 w-3" />
              )}
            </Button>
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
  const [installerFilter, setInstallerFilter] = useState('all');
  const [installers, setInstallers] = useState([]);
  const [monthFilter, setMonthFilter] = useState('week');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('SP');
  const [loadingHoldprint, setLoadingHoldprint] = useState(false);
  const [loadingCurrentMonth, setLoadingCurrentMonth] = useState(false);
  const [importMonth, setImportMonth] = useState('');
  const [processingJobId, setProcessingJobId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const archivedLoadedRef = useRef(false);

  // Wave reveal: cards aparecem em grupos de 4
  const WAVE_SIZE = 4;
  const [revealedCount, setRevealedCount] = useState(0);
  const prevFilteredRef = useRef(null);

  // IntersectionObserver: scroll infinito automático
  const sentinelRef = useRef(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());
  const [batchArchiving, setBatchArchiving] = useState(false);
  const [showBatchScheduleDialog, setShowBatchScheduleDialog] = useState(false);
  const [batchScheduleDate, setBatchScheduleDate] = useState('');
  const [batchScheduleInstallerIds, setBatchScheduleInstallerIds] = useState(new Set());
  const [batchScheduling, setBatchScheduling] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleInstallerIds, setScheduleInstallerIds] = useState(new Set());
  
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

  // ── Callbacks estáveis (deps vazias — declarados antes de qualquer useEffect) ──

  const loadInstallers = useCallback(async () => {
    try {
      const response = await api.getInstallers();
      setInstallers(response.data || []);
    } catch (error) {
      console.error('Error loading installers:', error);
    }
  }, []);

  const loadJobs = useCallback(async (includeArchived = false) => {
    setLoading(true);
    setVisibleCount(12);
    try {
      const response = await api.getJobs(includeArchived);
      setJobs(response.data);
      archivedLoadedRef.current = includeArchived;
      // Stale-while-revalidate: atualiza o estado quando o fetch fresco chegar
      if (response._stale && response._fresh) {
        response._fresh.then(fresh => setJobs(fresh.data)).catch(() => {});
      }
    } catch (error) {
      toast.error('Erro ao carregar jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleJobSelection = useCallback((jobId) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedJobIds(new Set()), []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedJobIds(new Set());
  }, []);

  // ── Handlers regulares (funções normais, sem arrays de deps) ──

  const loadHoldprintJobs = async () => {
    setLoadingHoldprint(true);
    try {
      let month = null;
      let year = null;
      if (importMonth) {
        const [y, m] = importMonth.split('-').map(Number);
        month = m;
        year = y;
      }
      const response = await api.importAllJobs(selectedBranch, month, year);
      const { imported, skipped, holdprint_total_received } = response.data;
      const totalReceived = holdprint_total_received ?? (imported + skipped);

      if (imported > 0) {
        toast.success(`${imported} job(s) importado(s) com sucesso!`);
        loadJobs();
      }

      if (totalReceived === 0) {
        toast.info(`Holdprint não retornou jobs para ${selectedBranch}. Verifique as configurações da API.`);
      } else if (skipped > 0 && imported === 0) {
        toast.info(`Todos os ${skipped} jobs já estavam importados (sincronizado pelo cron diário).`);
      } else if (skipped > 0) {
        toast.info(`${skipped} job(s) já existiam`);
      }

      setShowImportDialog(false);
    } catch (error) {
      console.error('Error importing jobs:', error);
      const errorMsg = error.response?.data?.detail || 'Erro ao importar jobs';
      toast.error(errorMsg);
    } finally {
      setLoadingHoldprint(false);
    }
  };

  const loadCurrentMonthJobs = async () => {
    setLoadingCurrentMonth(true);
    try {
      const response = await api.importCurrentMonthJobs();
      const { total_imported, total_skipped, period, branches, errors, partial } = response.data;

      if (total_imported > 0) {
        toast.success(`${total_imported} job(s) importado(s) das últimas 2 semanas!`);
        loadJobs();
      }

      if (total_skipped > 0 && total_imported === 0) {
        toast.info(`Todos os ${total_skipped} jobs das últimas 2 semanas já estavam importados`);
      }

      if (total_imported === 0 && total_skipped === 0 && (!errors || errors.length === 0)) {
        toast.info(`Nenhum job encontrado nas últimas 2 semanas`);
      }

      if (partial) {
        toast.warning('Importação parcial: limite de tempo atingido. Rode novamente para importar o restante.');
      }

      if (errors && errors.length > 0) {
        errors.forEach(err => toast.error(err));
      }

      setShowImportDialog(false);
    } catch (error) {
      console.error('Error importing last 2 weeks jobs:', error);
      const errorMsg = error.response?.data?.detail || 'Erro ao importar jobs das últimas 2 semanas';
      toast.error(errorMsg);
    } finally {
      setLoadingCurrentMonth(false);
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
      const errorMsg = error.response?.data?.detail || error.message || 'Erro ao enviar justificativa';
      toast.error(errorMsg);
    } finally {
      setSendingJustification(false);
    }
  };

  const handleOpenScheduleDialog = (job) => {
    setSelectedJob(job);
    setScheduleDate(job.scheduled_date ? job.scheduled_date.split('T')[0] : '');
    setScheduleInstallerIds(new Set(Array.isArray(job.assigned_installers) ? job.assigned_installers : []));
    setShowScheduleDialog(true);
  };

  const handleScheduleJob = async () => {
    if (!selectedJob) return;

    const installerIds = [...scheduleInstallerIds];
    const isoDate = scheduleDate ? new Date(`${scheduleDate}T${scheduleTime || '08:00'}:00`).toISOString() : null;

    try {
      setProcessingJobId(selectedJob.id);
      await api.updateJob(selectedJob.id, {
        scheduled_date: isoDate,
        assigned_installers: installerIds,
        status: isoDate ? 'agendado' : selectedJob.status === 'agendado' ? 'aguardando' : selectedJob.status,
      });

      toast.success(isoDate ? 'Job agendado com sucesso!' : 'Agendamento removido');

      setJobs(prev => prev.map(j =>
        j.id === selectedJob.id
          ? {
              ...j,
              scheduled_date: isoDate,
              assigned_installers: installerIds,
              status: isoDate ? 'agendado' : (j.status === 'agendado' ? 'aguardando' : j.status),
            }
          : j
      ));

      setShowScheduleDialog(false);
      setSelectedJob(null);
      setScheduleDate('');
      setScheduleInstallerIds(new Set());
    } catch (error) {
      console.error('Error scheduling job:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Erro ao agendar job';
      toast.error(errorMsg);
    } finally {
      setProcessingJobId(null);
    }
  };

  // Arquivar/Desarquivar job
  const handleArchiveJob = async (job, shouldArchive) => {
    const action = shouldArchive ? 'arquivar' : 'restaurar';
    if (!window.confirm(`Deseja ${action} o job "${job.title}"?\n\n${shouldArchive ? 'O job será removido da lista principal e não será contabilizado nos relatórios.' : 'O job voltará para a lista principal.'}`)) {
      return;
    }
    
    try {
      setProcessingJobId(job.id);
      if (shouldArchive) {
        await api.archiveJob(job.id, true); // exclude_from_metrics = true
      } else {
        await api.unarchiveJob(job.id);
      }
      
      toast.success(shouldArchive ? 'Job arquivado com sucesso!' : 'Job restaurado com sucesso!');
      
      // Update local state
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, archived: shouldArchive, status: shouldArchive ? 'arquivado' : 'aguardando' }
          : j
      ));
    } catch (error) {
      console.error('Error archiving job:', error);
      const errorMsg = error.response?.data?.detail || error.message || `Erro ao ${action} job`;
      toast.error(errorMsg);
    } finally {
      setProcessingJobId(null);
    }
  };

  const toggleBatchInstaller = (id) => {
    setBatchScheduleInstallerIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBatchSchedule = async () => {
    if (selectedJobIds.size === 0 || !batchScheduleDate) return;
    setBatchScheduling(true);
    try {
      const ids = [...selectedJobIds];
      const installerIds = [...batchScheduleInstallerIds];
      const isoDate = new Date(`${batchScheduleDate}T12:00:00`).toISOString();
      await api.batchScheduleJobs(ids, isoDate, installerIds);
      toast.success(`${ids.length} job(s) agendados com sucesso!`);
      setJobs(prev => prev.map(j =>
        selectedJobIds.has(j.id)
          ? { ...j, scheduled_date: isoDate, assigned_installers: installerIds, status: 'agendado' }
          : j
      ));
      setShowBatchScheduleDialog(false);
      setBatchScheduleDate('');
      setBatchScheduleInstallerIds(new Set());
      exitSelectionMode();
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erro ao agendar jobs';
      toast.error(msg);
    } finally {
      setBatchScheduling(false);
    }
  };

  const selectAllVisible = () => {
    setSelectedJobIds(new Set(filteredJobs.slice(0, visibleCount).map(j => j.id)));
  };

  const handleBatchArchive = async () => {
    if (selectedJobIds.size === 0) return;
    if (!window.confirm(
      `Arquivar ${selectedJobIds.size} job(s) selecionado(s)?\n\n` +
      `Os jobs arquivados serão removidos da lista principal e das métricas.\n\n` +
      `Confirmar?`
    )) return;

    const ids = [...selectedJobIds];
    setBatchArchiving(true);
    try {
      await api.batchArchiveJobs(ids);
      toast.success(`${ids.length} job(s) arquivados com sucesso!`);
      setJobs(prev => prev.map(j =>
        selectedJobIds.has(j.id)
          ? { ...j, archived: true, status: 'arquivado' }
          : j
      ));
      exitSelectionMode();
    } catch (error) {
      console.error('Error batch archiving jobs:', error);
      const msg = error.response?.data?.detail || 'Erro ao arquivar jobs selecionados';
      toast.error(msg);
    } finally {
      setBatchArchiving(false);
    }
  };

  const handleBulkArchivePre2026 = async () => {
    if (!window.confirm(
      'Arquivar TODOS os jobs anteriores a 2026?\n\n' +
      '⚠️ Esta ação irá:\n' +
      '• Arquivar todos os jobs criados antes de 01/01/2026\n' +
      '• Excluí-los das métricas\n' +
      '• Tornar a página muito mais rápida\n\n' +
      'Os jobs arquivados ainda podem ser visualizados pelo filtro "Arquivado".\n\n' +
      'Confirmar?'
    )) return;

    setBulkArchiving(true);
    try {
      const response = await api.bulkArchivePre2026();
      const { archived_count, message } = response.data;
      toast.success(message);
      if (archived_count > 0) {
        loadJobs(false);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Erro ao arquivar jobs';
      toast.error(errorMsg);
    } finally {
      setBulkArchiving(false);
    }
  };

  // ── useMemo — declarado após todos os handlers ──

  // Memoized filtered jobs - sorted by most recent
  const filteredJobs = useMemo(() => {
    const filtered = jobs.filter(job => {
      // Search filter - includes job code (e.g., #1959 or 1959)
      const searchLower = searchTerm.toLowerCase().replace('#', '');
      const jobCode = job.holdprint_data?.code || job.code || '';
      const matchesSearch = !searchTerm ||
        (job.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.holdprint_data?.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        jobCode.toString().includes(searchLower);
      
      // If user is searching by job code, bypass ALL other filters
      const isCodeSearch = searchTerm && jobCode.toString().includes(searchLower);
      if (isCodeSearch) {
        return true; // Return the job regardless of status, date, etc.
      }
      
      // Status filter logic - "agendado", "concluido" and "arquivado" are special cases
      let matchesStatus = true;
      if (statusFilter === 'all') {
        // By default, hide archived jobs unless explicitly filtered
        matchesStatus = !job.archived && job.status !== 'arquivado';
      } else if (statusFilter === 'agendado') {
        // Filter jobs that have scheduled_date and are not completed/cancelled
        matchesStatus = !!job.scheduled_date && 
          !['completed', 'finalizado', 'cancelado', 'arquivado'].includes(job.status) &&
          !job.archived;
      } else if (statusFilter === 'concluido') {
        // Filter completed jobs (includes both 'completed' and 'finalizado')
        matchesStatus = ['completed', 'finalizado'].includes(job.status);
      } else if (statusFilter === 'arquivado') {
        // Filter archived jobs
        matchesStatus = job.archived || job.status === 'arquivado';
      } else {
        matchesStatus = job.status === statusFilter && !job.archived;
      }
      
      const matchesBranch = branchFilter === 'all' || job.branch === branchFilter;
      
      // Installer filter - checks if the selected installer is assigned to this job.
      // assigned_installers historicamente teve mistura de installer.id e user.id, então
      // cobrimos ambos buscando o user_id do instalador selecionado.
      const selectedInstaller = installers.find(i => i.id === installerFilter);
      const installerUserId = selectedInstaller?.user_id;
      const matchesInstaller = installerFilter === 'all' ||
        (Array.isArray(job.assigned_installers) && (
          job.assigned_installers.includes(installerFilter) ||
          (installerUserId && job.assigned_installers.includes(installerUserId))
        ));
      
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
      
      // Month/Week filter - default to last week
      // IMPORTANT: When a specific status filter is active, bypass month filter
      // to ensure users can find jobs regardless of their date
      let matchesMonth = true;
      const hasActiveStatusFilter = statusFilter !== 'all';
      if (!startDateFilter && !endDateFilter && monthFilter !== 'all' && !hasActiveStatusFilter) {
        if (jobDate && !isNaN(jobDate.getTime())) {
          if (monthFilter === 'week') {
            // Show jobs from last 7 days
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            matchesMonth = jobDate >= weekAgo;
          } else if (monthFilter === 'current') {
            // Show jobs from current month (same month/year as today)
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
      
      // Hide finalized/cancelled/archived jobs by default (unless specifically filtered)
      const isHidden = statusFilter === 'all' && (
        ['completed', 'finalizado', 'cancelado'].includes(job.status) || 
        job.archived || 
        job.status === 'arquivado'
      );
      
      return matchesSearch && matchesStatus && matchesBranch && matchesInstaller && matchesDateRange && matchesMonth && !isHidden;
    });
    
    // Sort by oldest delivery date first (deliveryNeeded from Hold is priority)
    return filtered.sort((a, b) => {
      const getDate = (job) => {
        // Priority: deliveryNeeded > deliveryExpected > scheduled_date > creationTime
        const dateStr = job.holdprint_data?.deliveryNeeded || job.holdprint_data?.deliveryExpected || job.scheduled_date || job.holdprint_data?.creationTime || job.created_at;
        return dateStr ? new Date(dateStr) : new Date('2099-12-31'); // Jobs without date go to the end
      };
      return getDate(a) - getDate(b); // Ascending (oldest first)
    });
  }, [jobs, searchTerm, statusFilter, branchFilter, installerFilter, installers, startDateFilter, endDateFilter, monthFilter]);

  const loadMore = () => setVisibleCount(prev => prev + 12);

  // ── useEffect — sempre declarados POR ÚLTIMO, após todos os hooks e funções ──
  // Regra: arrays de dependência só referenciam variáveis declaradas acima.

  useEffect(() => {
    loadJobs(false);
    loadInstallers();
  }, []);

  // Quando o filtro muda para "arquivado", recarrega incluindo arquivados.
  // Quando sai de "arquivado", recarrega só os ativos (mais rápido).
  useEffect(() => {
    if (statusFilter === 'arquivado' && !archivedLoadedRef.current) {
      loadJobs(true);
    } else if (statusFilter !== 'arquivado' && archivedLoadedRef.current) {
      loadJobs(false);
    }
  }, [statusFilter, loadJobs]);

  // Wave reveal — libera cards em grupos de 4 usando idle time do browser.
  // Detecta mudança de filtro (nova referência de filteredJobs) e reseta do zero.
  // Detecta "Carregar mais" (visibleCount sobe) e continua de onde parou.
  useEffect(() => {
    if (loading) { setRevealedCount(0); return; }

    const isNewFilter = prevFilteredRef.current !== filteredJobs;
    prevFilteredRef.current = filteredJobs;

    const target = Math.min(visibleCount, filteredJobs.length);

    if (isNewFilter) setRevealedCount(0);
    if (filteredJobs.length === 0) return;

    let cancelled = false;

    const scheduleNext = (fn) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(fn, { timeout: 150 });
      } else {
        setTimeout(fn, 80);
      }
    };

    const reveal = () => {
      if (cancelled) return;
      setRevealedCount(prev => {
        if (prev >= target) return prev;
        const next = Math.min(prev + WAVE_SIZE, target);
        if (next < target) scheduleNext(reveal);
        return next;
      });
    };

    requestAnimationFrame(reveal);
    return () => { cancelled = true; };
  }, [loading, filteredJobs, visibleCount]);

  // IntersectionObserver — carrega mais ao chegar no fim do grid.
  // Só ativa quando a onda atual terminou (revealedCount atingiu visibleCount)
  // e ainda há jobs para mostrar. rootMargin de 200px faz pré-fetch antes
  // do sentinel entrar na viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const waveComplete = revealedCount >= Math.min(visibleCount, filteredJobs.length);
    const hasMore = visibleCount < filteredJobs.length;
    if (!waveComplete || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => prev + 12);
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [revealedCount, visibleCount, filteredJobs.length]);

  if (loading) {
    return <JobsPageSkeleton />;
  }

  return (
    <div className={`p-4 md:p-8 space-y-6 animate-page-reveal ${selectionMode ? 'pb-24' : ''}`}>
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
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => loadJobs(archivedLoadedRef.current)}
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/5"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button
              onClick={() => { setSelectionMode(v => !v); setSelectedJobIds(new Set()); }}
              variant={selectionMode ? 'default' : 'outline'}
              size="sm"
              className={selectionMode ? 'bg-primary hover:bg-primary/90' : 'border-white/20 text-white hover:bg-white/5'}
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {selectionMode ? 'Cancelar seleção' : 'Selecionar'}
            </Button>
            {isAdmin && (
              <Button
                onClick={handleBulkArchivePre2026}
                variant="outline"
                size="sm"
                disabled={bulkArchiving}
                className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                title="Arquivar todos os jobs anteriores a 2026"
              >
                {bulkArchiving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-orange-400 border-t-transparent rounded-full mr-2" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Arquivar Pré-2026
              </Button>
            )}
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

      {/* Stats Row - Clicáveis com Drill-down */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total */}
        <Card 
          className={`bg-card border-white/5 hover:border-primary/50 transition-all cursor-pointer group hover:scale-[1.02] ${
            statusFilter === 'all' && !startDateFilter && !endDateFilter ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => {
            setStatusFilter('all');
            setStartDateFilter('');
            setEndDateFilter('');
          }}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-white">{filteredJobs.length}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
        
        {/* Aguardando */}
        <Card 
          className={`bg-card border-white/5 hover:border-yellow-500/50 transition-all cursor-pointer group hover:scale-[1.02] ${
            statusFilter === 'aguardando' ? 'ring-2 ring-yellow-500' : ''
          }`}
          onClick={() => setStatusFilter(statusFilter === 'aguardando' ? 'all' : 'aguardando')}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="h-4 w-4 text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-white">
                {filteredJobs.filter(j => j.status === 'aguardando' || j.status === 'pending').length}
              </p>
              <p className="text-[10px] text-muted-foreground">Aguardando</p>
            </div>
            <ChevronRight className={`h-4 w-4 text-yellow-400 transition-opacity ${
              statusFilter === 'aguardando' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`} />
          </CardContent>
        </Card>
        
        {/* Instalando */}
        <Card 
          className={`bg-card border-white/5 hover:border-blue-500/50 transition-all cursor-pointer group hover:scale-[1.02] ${
            statusFilter === 'instalando' ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => setStatusFilter(statusFilter === 'instalando' ? 'all' : 'instalando')}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-white">
                {filteredJobs.filter(j => j.status === 'instalando' || j.status === 'in_progress').length}
              </p>
              <p className="text-[10px] text-muted-foreground">Instalando</p>
            </div>
            <ChevronRight className={`h-4 w-4 text-blue-400 transition-opacity ${
              statusFilter === 'instalando' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`} />
          </CardContent>
        </Card>
        
        {/* Agendados */}
        <Card 
          className={`bg-card border-white/5 hover:border-green-500/50 transition-all cursor-pointer group hover:scale-[1.02] ${
            statusFilter === 'agendado' ? 'ring-2 ring-green-500' : ''
          }`}
          onClick={() => setStatusFilter(statusFilter === 'agendado' ? 'all' : 'agendado')}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CalendarCheck className="h-4 w-4 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-white">
                {filteredJobs.filter(j => j.scheduled_date).length}
              </p>
              <p className="text-[10px] text-muted-foreground">Agendados</p>
            </div>
            <ChevronRight className={`h-4 w-4 text-green-400 transition-opacity ${
              statusFilter === 'agendado' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`} />
          </CardContent>
        </Card>
      </div>
      
      {/* Active Filter Badge */}
      {(statusFilter !== 'all' || installerFilter !== 'all') && (
        <div className="flex flex-wrap items-center gap-2">
          {statusFilter !== 'all' && (
            <>
              <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                statusFilter === 'aguardando' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                statusFilter === 'instalando' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                statusFilter === 'agendado' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                statusFilter === 'concluido' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                statusFilter === 'arquivado' ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' :
                'bg-primary/20 text-primary border border-primary/30'
              }`}>
                {statusFilter === 'aguardando' && <Clock className="h-4 w-4" />}
                {statusFilter === 'instalando' && <Users className="h-4 w-4" />}
                {statusFilter === 'agendado' && <CalendarCheck className="h-4 w-4" />}
                {statusFilter === 'concluido' && <CheckCircle className="h-4 w-4" />}
                Status: {statusFilter === 'aguardando' ? 'Aguardando' : 
                        statusFilter === 'instalando' ? 'Instalando' : 
                        statusFilter === 'agendado' ? 'Agendados' :
                        statusFilter === 'concluido' ? 'Concluídos' :
                        statusFilter === 'arquivado' ? 'Arquivados' : statusFilter}
              </span>
              <button 
                onClick={() => setStatusFilter('all')}
                className="text-xs text-muted-foreground hover:text-white transition-colors"
              >
                ×
              </button>
            </>
          )}
          {installerFilter !== 'all' && (
            <>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Users className="h-4 w-4" />
                Instalador: {installers.find(i => i.id === installerFilter)?.full_name || installerFilter}
              </span>
              <button 
                onClick={() => setInstallerFilter('all')}
                className="text-xs text-muted-foreground hover:text-white transition-colors"
              >
                ×
              </button>
            </>
          )}
          {(statusFilter !== 'all' || installerFilter !== 'all') && (
            <button 
              onClick={() => {
                setStatusFilter('all');
                setInstallerFilter('all');
              }}
              className="text-xs text-muted-foreground hover:text-white transition-colors ml-2"
            >
              Limpar todos
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4 space-y-4">
          {/* First row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, cliente ou #código..."
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
                <SelectItem value="agendado">🟢 Agendado</SelectItem>
                <SelectItem value="instalando">🔵 Instalando</SelectItem>
                <SelectItem value="pausado">🟠 Pausado</SelectItem>
                <SelectItem value="atrasado">🔴 Atrasado</SelectItem>
                <SelectItem value="concluido">✅ Concluído</SelectItem>
                <SelectItem value="arquivado">📦 Arquivado</SelectItem>
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

          {/* Second row - Installer filter and Date filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Instalador</label>
              <Select value={installerFilter} onValueChange={setInstallerFilter}>
                <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white h-9">
                  <Users className="h-3 w-3 mr-2" />
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="all">Todos os Instaladores</SelectItem>
                  {installers.map((installer) => (
                    <SelectItem key={installer.id} value={installer.id}>
                      {installer.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Data Início</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-36 justify-start text-left font-normal bg-white/5 border-white/10 text-white h-9 hover:bg-white/10"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {startDateFilter ? format(new Date(startDateFilter), "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-white/10" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDateFilter ? new Date(startDateFilter) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setStartDateFilter(format(date, "yyyy-MM-dd"));
                        setMonthFilter('all');
                      } else {
                        setStartDateFilter('');
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Data Fim</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-36 justify-start text-left font-normal bg-white/5 border-white/10 text-white h-9 hover:bg-white/10"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {endDateFilter ? format(new Date(endDateFilter), "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-white/10" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDateFilter ? new Date(endDateFilter) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setEndDateFilter(format(date, "yyyy-MM-dd"));
                        setMonthFilter('all');
                      } else {
                        setEndDateFilter('');
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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
                <SelectItem value="week">📅 Última Semana</SelectItem>
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
                  setMonthFilter('week');
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
              {searchTerm || statusFilter !== 'all' || branchFilter !== 'all' || installerFilter !== 'all' || monthFilter !== 'all'
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
            {/* Cards já revelados — cada um entra com fade-in escalonado dentro da sua onda */}
            {filteredJobs.slice(0, revealedCount).map((job, idx) => (
              <div
                key={job.id}
                className="animate-card-in"
                style={{ animationDelay: `${(idx % WAVE_SIZE) * 55}ms` }}
              >
                <JobCard
                  job={job}
                  onNavigate={(id) => navigate(`/jobs/${id}`)}
                  onFinalize={handleFinalizeNoInstallation}
                  onSchedule={handleOpenScheduleDialog}
                  onJustify={handleOpenJustifyDialog}
                  onArchive={handleArchiveJob}
                  isAdmin={isAdmin}
                  isManager={isManager}
                  isLoading={processingJobId}
                  selectionMode={selectionMode}
                  isSelected={selectedJobIds.has(job.id)}
                  onToggleSelect={toggleJobSelection}
                />
              </div>
            ))}

            {/* Skeletons para a próxima onda ainda em carregamento */}
            {revealedCount < Math.min(visibleCount, filteredJobs.length) &&
              [...Array(Math.min(WAVE_SIZE, Math.min(visibleCount, filteredJobs.length) - revealedCount))].map((_, i) => (
                <JobCardSkeleton key={`wsk-${i}`} delay={i * 55} />
              ))
            }
          </div>

          {/* Sentinel invisível — IntersectionObserver dispara loadMore ao entrar na viewport */}
          {visibleCount < filteredJobs.length && (
            <div ref={sentinelRef} className="w-full h-1" aria-hidden />
          )}

          {/* Indicador de carregamento da próxima onda */}
          {revealedCount < Math.min(visibleCount, filteredJobs.length) && visibleCount > 12 && (
            <div className="flex justify-center items-center gap-2 py-4 text-muted-foreground text-sm">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Carregando mais jobs…
            </div>
          )}

          {/* Fim da lista — mostra total quando tudo foi revelado */}
          {revealedCount >= filteredJobs.length && filteredJobs.length > 0 && visibleCount >= filteredJobs.length && (
            <p className="text-center text-xs text-muted-foreground/50 py-2">
              {filteredJobs.length} job(s) exibido(s)
            </p>
          )}
        </>
      )}

      {/* Batch Selection Action Bar */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-t border-white/10 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium text-sm">
                {selectedJobIds.size > 0
                  ? `${selectedJobIds.size} job(s) selecionado(s)`
                  : 'Clique nos cards para selecionar'}
              </span>
              <button
                onClick={selectAllVisible}
                className="text-xs text-primary hover:underline"
              >
                Selecionar todos visíveis ({Math.min(visibleCount, filteredJobs.length)})
              </button>
              {selectedJobIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-white"
                >
                  Limpar seleção
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exitSelectionMode}
                className="border-white/20 text-white hover:bg-white/5"
              >
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => { setBatchScheduleDate(''); setBatchScheduleInstallerIds(new Set()); setShowBatchScheduleDialog(true); }}
                disabled={selectedJobIds.size === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Agendar {selectedJobIds.size > 0 ? `${selectedJobIds.size}` : ''}
              </Button>
              <Button
                size="sm"
                onClick={handleBatchArchive}
                disabled={selectedJobIds.size === 0 || batchArchiving}
                className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
                {batchArchiving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Arquivar {selectedJobIds.size > 0 ? `${selectedJobIds.size}` : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Schedule Dialog */}
      <Dialog open={showBatchScheduleDialog} onOpenChange={setShowBatchScheduleDialog}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" />
              Agendar {selectedJobIds.size} job(s)
            </DialogTitle>
            <DialogDescription>
              Data e instaladores serão aplicados a todos os jobs selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Preview dos jobs selecionados */}
            {(() => {
              const selectedJobs = jobs.filter(j => selectedJobIds.has(j.id));
              const preview = selectedJobs.slice(0, 4);
              const remaining = selectedJobs.length - preview.length;
              return (
                <div className="rounded border border-white/10 bg-white/5 p-2 space-y-1">
                  {preview.map(j => (
                    <div key={j.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono text-primary">#{j.holdprint_data?.code || j.id?.slice(0, 6)}</span>
                      <span className="truncate text-white/70">{j.title}</span>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <p className="text-xs text-muted-foreground/60 pt-0.5">
                      + {remaining} job(s) a mais
                    </p>
                  )}
                </div>
              );
            })()}

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Data de Agendamento *</label>
              <Input
                type="date"
                value={batchScheduleDate}
                onChange={(e) => setBatchScheduleDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">
                  Instaladores ({batchScheduleInstallerIds.size} selecionado(s))
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchScheduleInstallerIds(new Set(installers.map(i => i.id)))}
                    className="text-xs text-primary hover:underline"
                  >
                    Todos
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => setBatchScheduleInstallerIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-white"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1 rounded border border-white/10 p-2">
                {installers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum instalador cadastrado</p>
                )}
                {installers.map(inst => (
                  <label
                    key={inst.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors select-none
                      ${batchScheduleInstallerIds.has(inst.id) ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-white/5 text-white'}`}
                  >
                    <input
                      type="checkbox"
                      checked={batchScheduleInstallerIds.has(inst.id)}
                      onChange={() => toggleBatchInstaller(inst.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm">{inst.full_name || inst.name}</span>
                    {inst.branch && <span className="text-xs text-muted-foreground ml-auto">{inst.branch}</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowBatchScheduleDialog(false)}
                className="flex-1 border-white/20 text-white hover:bg-white/5"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleBatchSchedule}
                disabled={!batchScheduleDate || batchScheduling}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {batchScheduling ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                ) : (
                  <CalendarCheck className="h-4 w-4 mr-2" />
                )}
                Confirmar Agendamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Importar Jobs da Holdprint</DialogTitle>
            <DialogDescription>
              Importe jobs das últimas 2 semanas ou selecione uma filial específica
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Importar Últimas 2 Semanas - Opção Principal */}
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
              <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Importação Rápida
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                Importa automaticamente todos os jobs das últimas 2 semanas de SP e POA
              </p>
              <Button
                onClick={loadCurrentMonthJobs}
                disabled={loadingCurrentMonth || loadingHoldprint}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {loadingCurrentMonth ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Importando últimas 2 semanas...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Importar Últimas 2 Semanas (SP + POA)
                  </>
                )}
              </Button>
            </div>
            
            {/* Divisor */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou importe por filial</span>
              </div>
            </div>
            
            {/* Importar por Filial */}
            <div className="space-y-3">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Selecione a filial" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="SP">São Paulo</SelectItem>
                  <SelectItem value="POA">Porto Alegre</SelectItem>
                </SelectContent>
              </Select>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Filtrar por mês (opcional)</label>
                <Input
                  type="month"
                  value={importMonth}
                  onChange={(e) => setImportMonth(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <Button
                onClick={loadHoldprintJobs}
                disabled={loadingHoldprint || loadingCurrentMonth}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/5"
              >
                {loadingHoldprint ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Importando {selectedBranch}...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Importar {selectedBranch}{importMonth ? ` — ${importMonth}` : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={(open) => {
        setShowScheduleDialog(open);
        if (!open) { setSelectedJob(null); setScheduleDate(''); setScheduleTime('08:00'); setScheduleInstallerIds(new Set()); }
      }}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Agendar Job
            </DialogTitle>
            <DialogDescription className="font-mono text-primary/80 text-xs">
              #{selectedJob?.holdprint_data?.code || selectedJob?.id?.slice(0, 8)} — {selectedJob?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Data</label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Horário</label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            {/* Instaladores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">
                  Instaladores ({scheduleInstallerIds.size} selecionado(s))
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleInstallerIds(new Set(installers.map(i => i.id)))}
                    className="text-xs text-primary hover:underline"
                  >
                    Todos
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => setScheduleInstallerIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-white"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1 rounded border border-white/10 p-2">
                {installers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum instalador cadastrado</p>
                )}
                {installers.map(inst => (
                  <label
                    key={inst.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors select-none
                      ${scheduleInstallerIds.has(inst.id) ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-white'}`}
                  >
                    <input
                      type="checkbox"
                      checked={scheduleInstallerIds.has(inst.id)}
                      onChange={() => setScheduleInstallerIds(prev => {
                        const next = new Set(prev);
                        next.has(inst.id) ? next.delete(inst.id) : next.add(inst.id);
                        return next;
                      })}
                      className="accent-pink-500"
                    />
                    <span className="text-sm">{inst.full_name || inst.name}</span>
                    {inst.branch && <span className="text-xs text-muted-foreground ml-auto">{inst.branch}</span>}
                  </label>
                ))}
              </div>
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
