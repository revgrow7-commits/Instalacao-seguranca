import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { exifTimeHM } from '../lib/exifTime';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Users, Briefcase, Clock, CheckCircle, TrendingUp,
  Download, User, Camera, X, MapPin,
  ChevronLeft, ChevronRight, Loader2, BarChart3, Ruler, RefreshCw,
  ChevronDown, ChevronUp, Package, Navigation, DollarSign, FileSpreadsheet,
  AlertTriangle, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 10;

// ── Fonte de verdade dos relatórios: metadados EXIF das fotos da galeria ──
// Início, fim e duração SEMPRE vêm do EXIF (momento real da captura da foto no
// celular). Sem EXIF de data → null: o relatório NÃO usa o horário do clique de
// check-in/checkout. Registros sem EXIF aparecem como "—" e não entram nas
// somas de duração/produtividade.
const exifStart = (c) => c?.exif_checkin_at || c?.exif_datetime || null;
const exifEnd = (c) => c?.exif_checkout_at || c?.checkout_exif_datetime || null;
const exifDurationMin = (c) => {
  if (c?.exif_duration_minutes != null) return c.exif_duration_minutes;
  const s = exifStart(c), e = exifEnd(c);
  if (!s || !e) return null;
  const diff = (new Date(e).getTime() - new Date(s).getTime()) / 60000;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

// Exibe o horário EXIF de forma DETERMINÍSTICA e legacy-safe — independe do fuso do
// navegador de quem abre o relatório. O DateTimeOriginal do EXIF é sempre o relógio
// de parede LOCAL da câmera, então os dígitos HH:MM são a verdade que queremos
// mostrar, qualquer que seja o rótulo de fuso. Por isso extraímos verbatim e NÃO
// reconvertemos: cobre tanto o dado novo (-03:00) quanto o legado carimbado +00:00
// (cujos dígitos 14:26 também são o horário local real, não 11:26).
const exifTime = (v) => exifTimeHM(v) || '—';

// Dispositivo registrado no EXIF (Make + Model). Check-in tem prioridade sobre checkout.
const exifDevice = (c) => c?.exif_device || c?.checkout_exif_device || null;

// ── SessionStorage cache para checkins pesados (2 minutos) ──
const REPORTS_CACHE_KEY = 'reports_checkins_v1';
const REPORTS_CACHE_TTL = 2 * 60_000;

function readReportsCache() {
  try {
    const raw = sessionStorage.getItem(REPORTS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > REPORTS_CACHE_TTL) { sessionStorage.removeItem(REPORTS_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function writeReportsCache(data) {
  try { sessionStorage.setItem(REPORTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-white/10 ${className}`} />
);

const UnifiedReports = () => {
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();

  // Fase 1 — rápida (jobs + instaladores)
  const [loadingPrimary, setLoadingPrimary] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);

  // Fase 2 — deferred (item checkins — loop paginado lento)
  const [loadingCheckins, setLoadingCheckins] = useState(true);
  const [itemCheckins, setItemCheckins] = useState([]);

  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInstaller, setSelectedInstaller] = useState('all');
  const [selectedJob, setSelectedJob] = useState('all');
  const [selectedProductFamily, setSelectedProductFamily] = useState('all');

  // Paginação
  const [jobsPage, setJobsPage] = useState(1);
  const [photosPage, setPhotosPage] = useState(1);

  // Photo viewer
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoType, setPhotoType] = useState('');

  // Expanded rows
  const [expandedInstallers, setExpandedInstallers] = useState({});
  const [expandedJobs, setExpandedJobs] = useState({});

  // Visitas Técnicas
  const [visitas, setVisitas] = useState([]);
  const [visitasLoading, setVisitasLoading] = useState(false);
  const [visitasExporting, setVisitasExporting] = useState(false);
  const [visitasStartDate, setVisitasStartDate] = useState('');
  const [visitasEndDate, setVisitasEndDate] = useState('');
  const [visitasInstalador, setVisitasInstalador] = useState('all');
  const [visitasStatus, setVisitasStatus] = useState('all');

  // Seleção para exclusão dos KPIs
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Guards contra double-fire
  const primaryStartedRef = useRef(false);
  const checkinsStartedRef = useRef(false);

  const getProductFamily = (productName) => {
    if (!productName) return 'outros';
    const name = productName.toLowerCase();
    if (name.includes('adesivo')) return 'adesivos';
    if (name.includes('lona') || name.includes('banner')) return 'lonas';
    if (name.includes('chapa') || name.includes('acm') || name.includes('fachada')) return 'chapas';
    if (name.includes('serviço') || name.includes('serviços') || name.includes('instalação') || name.includes('entrega')) return 'servicos';
    if (name.includes('placa') || name.includes('legenda')) return 'placas';
    if (name.includes('display') || name.includes('expositor') || name.includes('totem')) return 'displays';
    return 'outros';
  };

  const productFamilies = [
    { value: 'all', label: 'Todas as Famílias' },
    { value: 'adesivos', label: 'Adesivos' },
    { value: 'lonas', label: 'Lonas e Banners' },
    { value: 'chapas', label: 'Chapas e Fachadas' },
    { value: 'placas', label: 'Placas e Legendas' },
    { value: 'displays', label: 'Displays e Totens' },
    { value: 'servicos', label: 'Serviços' },
    { value: 'outros', label: 'Outros' }
  ];

  // ── Fase 1: jobs + instaladores (rápido) ──
  const loadPrimary = useCallback(async () => {
    try {
      const [jobsR, installersR] = await Promise.allSettled([
        api.getJobs(),
        api.getInstallers(),
      ]);
      if (jobsR.status === 'fulfilled') setJobs(jobsR.value?.data || []);
      else console.error('[reports] getJobs falhou:', jobsR.reason);
      if (installersR.status === 'fulfilled') setInstallers(installersR.value?.data || []);
      else console.error('[reports] getInstallers falhou:', installersR.reason);
    } finally {
      setLoadingPrimary(false);
    }
  }, []);

  // ── Fase 2: getAllItemCheckins (deferred — loop paginado) ──
  const loadCheckins = useCallback(async () => {
    const cached = readReportsCache();
    if (cached) {
      setItemCheckins(cached);
      setLoadingCheckins(false);
      return;
    }
    try {
      const all = await api.getAllItemCheckins();
      writeReportsCache(all);
      setItemCheckins(all || []);
    } catch (e) {
      console.error('[reports] getAllItemCheckins falhou:', e);
      toast.error('Falha ao carregar check-ins. Dados parciais exibidos.');
    } finally {
      setLoadingCheckins(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin && !isManager) { navigate('/dashboard'); return; }
    if (!primaryStartedRef.current) { primaryStartedRef.current = true; loadPrimary(); }
    if (!checkinsStartedRef.current) { checkinsStartedRef.current = true; loadCheckins(); }
  }, [isAdmin, isManager, navigate, loadPrimary, loadCheckins]);

  const handleRefresh = () => {
    sessionStorage.removeItem(REPORTS_CACHE_KEY);
    primaryStartedRef.current = false;
    checkinsStartedRef.current = false;
    setLoadingPrimary(true);
    setLoadingCheckins(true);
    setItemCheckins([]);
    setSelectedIds(new Set());
    loadPrimary();
    loadCheckins();
  };

  const handleBulkArchive = async () => {
    setArchiving(true);
    try {
      const ids = Array.from(selectedIds);
      await api.bulkArchiveItemCheckins(ids);
      setItemCheckins(prev => prev.filter(c => !selectedIds.has(c.id)));
      sessionStorage.removeItem(REPORTS_CACHE_KEY);
      setSelectedIds(new Set());
      toast.success(`${ids.length} registro(s) excluído(s) dos KPIs.`);
    } catch {
      toast.error('Erro ao excluir registros dos KPIs.');
    } finally {
      setArchiving(false);
      setShowArchiveConfirm(false);
    }
  };

  const toggleRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = consolidatedCheckins.map(c => c.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const response = await api.exportReports();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Relatório exportado com sucesso!');
    } catch {
      toast.error('Erro ao exportar relatório');
    } finally {
      setExporting(false);
    }
  };

  // O(1) lookup maps
  const installersById = useMemo(() => {
    const m = new Map();
    installers.forEach(i => { m.set(i.id, i); if (i.user_id) m.set(i.user_id, i); });
    return m;
  }, [installers]);

  const jobsById = useMemo(() => {
    const m = new Map();
    jobs.forEach(j => m.set(j.id, j));
    return m;
  }, [jobs]);

  const checkinsByJobId = useMemo(() => {
    const m = new Map();
    itemCheckins.forEach(c => {
      if (!m.has(c.job_id)) m.set(c.job_id, []);
      m.get(c.job_id).push(c);
    });
    return m;
  }, [itemCheckins]);

  // Stats — calculados somente a partir de itemCheckins
  const stats = useMemo(() => {
    const completedCheckins = itemCheckins.filter(c => c.status === 'completed');
    const totalM2 = completedCheckins.reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
    // Duração total = soma das durações EXIF (fim - início pela foto). Itens sem
    // EXIF não somam tempo (apenas metadados das fotos contam).
    const totalMinutes = completedCheckins.reduce((sum, c) => sum + (exifDurationMin(c) || 0), 0);
    const avgProductivity = totalMinutes > 0 ? (totalM2 / (totalMinutes / 60)).toFixed(2) : 0;
    const jobsByStatus = {
      aguardando: jobs.filter(j => j.status === 'aguardando' || j.status === 'pending').length,
      instalando: jobs.filter(j => j.status === 'instalando' || j.status === 'in_progress').length,
      finalizado: jobs.filter(j => j.status === 'finalizado' || j.status === 'completed').length,
      pausado: jobs.filter(j => j.status === 'pausado').length,
    };
    return {
      totalJobs: jobs.length,
      totalCheckins: itemCheckins.length,
      completedCheckins: completedCheckins.length,
      totalM2,
      totalMinutes,
      avgProductivity,
      jobsByStatus,
      activeInstallers: new Set(itemCheckins.map(c => c.installer_id)).size
    };
  }, [jobs, itemCheckins]);

  const installerStats = useMemo(() => {
    return installers.map(installer => {
      const instCheckins = itemCheckins.filter(c => c.installer_id === installer.id);
      const completed = instCheckins.filter(c => c.status === 'completed');
      const totalM2 = completed.reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
      // Duração por instalador via EXIF (foto), não pelo clique
      const totalMins = completed.reduce((sum, c) => sum + (exifDurationMin(c) || 0), 0);
      const avgProd = totalMins > 0 ? (totalM2 / (totalMins / 60)).toFixed(2) : 0;
      return { ...installer, totalCheckins: instCheckins.length, completedCheckins: completed.length, totalM2, totalMinutes: totalMins, avgProductivity: avgProd };
    }).sort((a, b) => b.totalM2 - a.totalM2);
  }, [installers, itemCheckins]);

  // Relatório Consolidado — check-ins concluídos ordenados por data desc
  const consolidatedCheckins = useMemo(() => {
    return itemCheckins
      .filter(c => c.status === 'completed')
      // Ordena pelo início EXIF (foto); sem EXIF cai pro checkin_at só para ordenar
      .sort((a, b) => new Date(exifStart(b) || b.checkin_at || 0) - new Date(exifStart(a) || a.checkin_at || 0))
      .slice(0, 100);
  }, [itemCheckins]);

  const filteredPhotos = useMemo(() => {
    return itemCheckins.filter(c => {
      const matchesInstaller = selectedInstaller === 'all' || c.installer_id === selectedInstaller;
      const matchesJob = selectedJob === 'all' || c.job_id === selectedJob;
      let matchesFamily = true;
      if (selectedProductFamily !== 'all') {
        matchesFamily = getProductFamily(c.product_name || c.item_name || '') === selectedProductFamily;
      }
      let matchesDate = true;
      if (startDate || endDate) {
        // Filtra pela data de captura da foto (EXIF). Sem EXIF de data, o item
        // não tem timeline de relatório → fica fora de qualquer intervalo.
        const exifS = exifStart(c);
        if (!exifS) {
          matchesDate = false;
        } else {
          const checkinDate = new Date(exifS);
          if (startDate && checkinDate < new Date(startDate)) matchesDate = false;
          if (endDate && checkinDate > new Date(endDate + 'T23:59:59')) matchesDate = false;
        }
      }
      return matchesInstaller && matchesJob && matchesFamily && matchesDate && (c.checkin_photo || c.checkout_photo || c.checkin_photo_url);
    });
  }, [itemCheckins, selectedInstaller, selectedJob, selectedProductFamily, startDate, endDate]);

  const loadVisitas = useCallback(async () => {
    setVisitasLoading(true);
    try {
      const params = {};
      if (visitasStartDate) params.start_date = visitasStartDate;
      if (visitasEndDate) params.end_date = visitasEndDate;
      if (visitasInstalador !== 'all') params.installer_id = visitasInstalador;
      if (visitasStatus !== 'all') params.status = visitasStatus;
      const res = await api.listVisitas(params);
      setVisitas(res.data || []);
    } catch {
      toast.error('Erro ao carregar visitas técnicas');
    } finally {
      setVisitasLoading(false);
    }
  }, [visitasStartDate, visitasEndDate, visitasInstalador, visitasStatus]);

  const handleExportVisitas = async () => {
    setVisitasExporting(true);
    try {
      const params = {};
      if (visitasStartDate) params.start_date = visitasStartDate;
      if (visitasEndDate) params.end_date = visitasEndDate;
      if (visitasInstalador !== 'all') params.installer_id = visitasInstalador;
      if (visitasStatus !== 'all') params.status = visitasStatus;
      const response = await api.exportVisitasTecnicas(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `visitas_tecnicas_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Exportação concluída!');
    } catch {
      toast.error('Erro ao exportar visitas técnicas');
    } finally {
      setVisitasExporting(false);
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0min';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getStatusStyle = (status) => {
    const styles = {
      aguardando: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      instalando: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      finalizado: 'bg-green-500/20 text-green-400 border-green-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      pausado: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      atrasado: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status?.toLowerCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const visitasStatusStyle = (status) => {
    const map = {
      AGUARDANDO: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      EM_VISITA: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      CONCLUIDA: 'bg-green-500/20 text-green-400 border-green-500/30',
      CANCELADA: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return map[status?.toUpperCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Fase 1 ainda carregando — skeleton da estrutura principal
  if (loadingPrimary) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            Relatórios & Produtividade
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Métricas consolidadas de jobs, instaladores e produtividade
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" className="border-white/20 text-white hover:bg-white/5">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={handleExportExcel} disabled={exporting} className="bg-green-600 hover:bg-green-700">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* ── Relatório Consolidado — primeira seção ── */}
      <Card className="bg-card/50 backdrop-blur border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Relatório Consolidado
              <span className="text-xs font-normal text-muted-foreground ml-1">— check-ins concluídos</span>
            </CardTitle>
            <div className="flex items-center gap-3">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-400 font-medium">{selectedIds.size} selecionado(s)</span>
                  <button
                    onClick={() => setShowArchiveConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir dos KPIs
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {loadingCheckins
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /><span>Carregando...</span></>
                  : <><Camera className="h-3.5 w-3.5" /><span>{consolidatedCheckins.length} registros</span></>
                }
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingCheckins ? (
            <div className="px-4 pb-4 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : consolidatedCheckins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Nenhum check-in concluído encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-3 py-2 font-medium w-8">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                        checked={consolidatedCheckins.length > 0 && consolidatedCheckins.every(c => selectedIds.has(c.id))}
                        onChange={toggleAllVisible}
                        title="Selecionar todos"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium w-12">Foto</th>
                    <th className="text-left px-4 py-2 font-medium">Instalador</th>
                    <th className="text-left px-4 py-2 font-medium">Item / Produto</th>
                    <th className="text-left px-4 py-2 font-medium">Job</th>
                    <th className="text-left px-4 py-2 font-medium">H. Início</th>
                    <th className="text-left px-4 py-2 font-medium">H. Fim</th>
                    <th className="text-left px-4 py-2 font-medium">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-400" />Latitude</span>
                    </th>
                    <th className="text-left px-4 py-2 font-medium">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-400" />Longitude</span>
                    </th>
                    <th className="text-left px-4 py-2 font-medium">Origem GPS</th>
                    <th className="text-left px-4 py-2 font-medium">
                      <span className="flex items-center gap-1"><Camera className="h-3 w-3 text-muted-foreground" />Dispositivo</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {consolidatedCheckins.map((c, idx) => {
                    const installer = installersById.get(c.installer_id);
                    const job = jobsById.get(c.job_id);
                    const lat = c.exif_lat ?? c.gps_lat;
                    const lng = c.exif_long ?? c.gps_long;
                    const fromExif = c.exif_lat != null;
                    // Horários vêm do EXIF da foto (momento real da captura), NÃO do clique
                    // de check-in/checkout. Foto sem EXIF de data → "—" (não inventa horário).
                    const inicioFromExif = exifStart(c);
                    const fimFromExif = exifEnd(c);
                    const inicio = exifTime(inicioFromExif);
                    const fim = exifTime(fimFromExif);
                    const device = exifDevice(c);
                    const jobCode = job?.holdprint_data?.code || job?.code || c.job_id?.slice(0, 6);
                    const isSelected = selectedIds.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${isSelected ? 'bg-red-500/10' : idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                        onClick={() => navigate(`/checkin-viewer/${c.id}`)}
                      >
                        <td className="px-3 py-2" onClick={e => { e.stopPropagation(); toggleRow(c.id); }}>
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleRow(c.id)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {c.checkin_photo_url ? (
                            <img
                              src={c.checkin_photo_url}
                              alt="foto"
                              className="w-9 h-9 rounded-md object-cover border border-white/10"
                              loading="lazy"
                              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                            />
                          ) : null}
                          <div
                            className="w-9 h-9 rounded-md bg-white/5 border border-white/10 items-center justify-center"
                            style={{ display: c.checkin_photo_url ? 'none' : 'flex' }}
                          >
                            <Camera className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-white">{installer?.full_name || c.installer_id?.slice(0, 8) || '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">{c.product_name || job?.title || '—'}</td>
                        <td className="px-4 py-2.5">
                          {jobCode ? <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">#{jobCode}</span> : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-green-400" title={inicioFromExif ? 'Horário extraído do EXIF da foto' : 'Foto sem horário no EXIF'}>{inicio}</td>
                        <td className="px-4 py-2.5 font-mono text-red-400" title={fimFromExif ? 'Horário extraído do EXIF da foto' : 'Foto sem horário no EXIF'}>{fim}</td>
                        <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">
                          {lat != null ? lat.toFixed(6) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">
                          {lng != null ? lng.toFixed(6) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {fromExif
                            ? <span className="flex items-center gap-1 text-xs text-yellow-400"><Camera className="h-3 w-3" />EXIF</span>
                            : lat != null
                              ? <span className="flex items-center gap-1 text-xs text-blue-400"><Navigation className="h-3 w-3" />GPS</span>
                              : <span className="text-xs text-muted-foreground/50">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate" title={device || 'Sem dispositivo no EXIF'}>
                          {device || <span className="text-muted-foreground/50">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20"><Briefcase className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.totalJobs}</p>
                <p className="text-xs text-muted-foreground">Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20"><CheckCircle className="h-5 w-5 text-blue-400" /></div>
              <div>
                {loadingCheckins ? <Skeleton className="h-8 w-12 mb-1" /> : <p className="text-2xl font-bold text-white">{stats.completedCheckins}</p>}
                <p className="text-xs text-muted-foreground">Check-ins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20"><Ruler className="h-5 w-5 text-green-400" /></div>
              <div>
                {loadingCheckins ? <Skeleton className="h-8 w-16 mb-1" /> : <p className="text-2xl font-bold text-white">{stats.totalM2.toFixed(1)}</p>}
                <p className="text-xs text-muted-foreground">m² Instalados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20"><Clock className="h-5 w-5 text-orange-400" /></div>
              <div>
                {loadingCheckins ? <Skeleton className="h-8 w-14 mb-1" /> : <p className="text-2xl font-bold text-white">{formatDuration(stats.totalMinutes)}</p>}
                <p className="text-xs text-muted-foreground">Tempo Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20"><TrendingUp className="h-5 w-5 text-purple-400" /></div>
              <div>
                {loadingCheckins ? <Skeleton className="h-8 w-12 mb-1" /> : <p className="text-2xl font-bold text-white">{stats.avgProductivity}</p>}
                <p className="text-xs text-muted-foreground">m²/hora</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20"><Users className="h-5 w-5 text-cyan-400" /></div>
              <div>
                <p className="text-2xl font-bold text-white">{installers.length}</p>
                <p className="text-xs text-muted-foreground">Instaladores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-white/5 h-auto p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary text-xs md:text-sm py-2">
            <TrendingUp className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Visão Geral</span>
            <span className="md:hidden">Geral</span>
          </TabsTrigger>
          <TabsTrigger value="installers" className="data-[state=active]:bg-primary text-xs md:text-sm py-2">
            <Users className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Instaladores</span>
            <span className="md:hidden">Equipe</span>
          </TabsTrigger>
          <TabsTrigger value="jobs" className="data-[state=active]:bg-primary text-xs md:text-sm py-2">
            <Briefcase className="h-4 w-4 mr-1 md:mr-2" />
            Jobs
          </TabsTrigger>
          <TabsTrigger value="photos" className="data-[state=active]:bg-primary text-xs md:text-sm py-2">
            <Camera className="h-4 w-4 mr-1 md:mr-2" />
            Fotos
          </TabsTrigger>
          <TabsTrigger
            value="visitas"
            className="data-[state=active]:bg-primary text-xs md:text-sm py-2"
            onClick={() => { if (visitas.length === 0 && !visitasLoading) loadVisitas(); }}
          >
            <Navigation className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden md:inline">Visitas Técnicas</span>
            <span className="md:hidden">Visitas</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-yellow-500/10 border-yellow-500/30"><CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-400">{stats.jobsByStatus.aguardando}</p>
              <p className="text-xs text-yellow-300">Aguardando</p>
            </CardContent></Card>
            <Card className="bg-blue-500/10 border-blue-500/30"><CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{stats.jobsByStatus.instalando}</p>
              <p className="text-xs text-blue-300">Instalando</p>
            </CardContent></Card>
            <Card className="bg-green-500/10 border-green-500/30"><CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{stats.jobsByStatus.finalizado}</p>
              <p className="text-xs text-green-300">Finalizados</p>
            </CardContent></Card>
            <Card className="bg-orange-500/10 border-orange-500/30"><CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-orange-400">{stats.jobsByStatus.pausado}</p>
              <p className="text-xs text-orange-300">Pausados</p>
            </CardContent></Card>
          </div>

          <Card className="bg-card border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Top Instaladores por Produtividade
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCheckins ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : (
                <div className="space-y-3">
                  {installerStats.slice(0, 5).map((inst, idx) => (
                    <div key={inst.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-400 text-black' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-white/10 text-white'
                        }`}>{idx + 1}</span>
                        <div>
                          <p className="text-white font-medium">{inst.full_name}</p>
                          <p className="text-xs text-muted-foreground">{inst.completedCheckins} check-ins</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">{inst.totalM2.toFixed(1)} m²</p>
                        <p className="text-xs text-primary">{inst.avgProductivity} m²/h</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Installers Tab */}
        <TabsContent value="installers" className="mt-6">
          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              {loadingCheckins ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : (
                <div className="space-y-2">
                  {installerStats.map(inst => (
                    <div key={inst.id} className="border border-white/5 rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5"
                        onClick={() => setExpandedInstallers(prev => ({ ...prev, [inst.id]: !prev[inst.id] }))}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{inst.full_name}</p>
                            <p className="text-xs text-muted-foreground">{inst.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden md:block">
                            <p className="text-white font-bold">{inst.totalM2.toFixed(1)} m²</p>
                            <p className="text-xs text-muted-foreground">{inst.completedCheckins} check-ins</p>
                          </div>
                          <div className="text-right">
                            <p className="text-primary font-bold">{inst.avgProductivity} m²/h</p>
                            <p className="text-xs text-muted-foreground">{formatDuration(inst.totalMinutes)}</p>
                          </div>
                          {expandedInstallers[inst.id] ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                        </div>
                      </div>
                      {expandedInstallers[inst.id] && (
                        <div className="p-4 pt-0 border-t border-white/5 bg-white/5">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                            <div><p className="text-lg font-bold text-white">{inst.totalCheckins}</p><p className="text-xs text-muted-foreground">Total Check-ins</p></div>
                            <div><p className="text-lg font-bold text-green-400">{inst.completedCheckins}</p><p className="text-xs text-muted-foreground">Completos</p></div>
                            <div><p className="text-lg font-bold text-blue-400">{inst.totalM2.toFixed(2)} m²</p><p className="text-xs text-muted-foreground">Área Total</p></div>
                            <div><p className="text-lg font-bold text-purple-400">{formatDuration(inst.totalMinutes)}</p><p className="text-xs text-muted-foreground">Tempo Total</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="mt-6">
          <Card className="bg-card border-white/5 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm text-muted-foreground">Filtrar por Família:</Label>
                </div>
                <Select value={selectedProductFamily} onValueChange={v => { setSelectedProductFamily(v); setJobsPage(1); }}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white w-48 h-9">
                    <SelectValue placeholder="Todas as Famílias" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10">
                    {productFamilies.map(fam => (
                      <SelectItem key={fam.value} value={fam.value}>{fam.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProductFamily !== 'all' && (
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedProductFamily('all'); setJobsPage(1); }} className="text-muted-foreground hover:text-white h-9">
                    <X className="h-4 w-4 mr-1" />Limpar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              <div className="space-y-2">
                {jobs
                  .filter(job => {
                    if (selectedProductFamily === 'all') return true;
                    const products = job.products_with_area || job.holdprint_data?.products || [];
                    return products.some(p => getProductFamily(p.name) === selectedProductFamily);
                  })
                  .slice((jobsPage - 1) * ITEMS_PER_PAGE, jobsPage * ITEMS_PER_PAGE)
                  .map(job => {
                    const jobCheckins = checkinsByJobId.get(job.id) || [];
                    const completedItems = jobCheckins.filter(c => c.status === 'completed').length;
                    const totalM2 = jobCheckins.reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
                    // Tempo do job via EXIF das fotos (não pelo clique)
                    const totalMinutes = jobCheckins.reduce((sum, c) => sum + (exifDurationMin(c) || 0), 0);
                    return (
                      <div key={job.id} className="border border-white/5 rounded-lg overflow-hidden">
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5"
                          onClick={() => setExpandedJobs(prev => ({ ...prev, [job.id]: !prev[job.id] }))}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                                #{job.holdprint_data?.code || job.code || job.id?.slice(0, 6)}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusStyle(job.status)}`}>
                                {job.status?.toUpperCase() || 'N/A'}
                              </span>
                            </div>
                            <p className="text-white font-medium truncate">{job.title}</p>
                            <p className="text-xs text-muted-foreground">{job.client_name}</p>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right hidden md:block">
                              <p className="text-white font-bold">{totalM2.toFixed(1)} m²</p>
                              <p className="text-xs text-muted-foreground">{completedItems} itens</p>
                            </div>
                            <div className="text-right">
                              <p className="text-orange-400 font-bold">{formatDuration(totalMinutes)}</p>
                              <p className="text-xs text-muted-foreground">Tempo total</p>
                            </div>
                            {expandedJobs[job.id] ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                          </div>
                        </div>
                        {expandedJobs[job.id] && (
                          <div className="p-4 pt-0 border-t border-white/5 bg-white/5">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                              <div><p className="text-lg font-bold text-white">{job.items?.length || 0}</p><p className="text-xs text-muted-foreground">Total Itens</p></div>
                              <div><p className="text-lg font-bold text-green-400">{completedItems}</p><p className="text-xs text-muted-foreground">Instalados</p></div>
                              <div><p className="text-lg font-bold text-blue-400">{totalM2.toFixed(2)} m²</p><p className="text-xs text-muted-foreground">Área Instalada</p></div>
                              <div><p className="text-lg font-bold text-orange-400">{formatDuration(totalMinutes)}</p><p className="text-xs text-muted-foreground">Tempo Total</p></div>
                              <div><p className="text-lg font-bold text-purple-400">{formatDate(job.created_at)}</p><p className="text-xs text-muted-foreground">Data Criação</p></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              {jobs.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setJobsPage(p => Math.max(1, p - 1))} disabled={jobsPage === 1} className="border-white/20">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-4 py-2">{jobsPage} / {Math.ceil(jobs.length / ITEMS_PER_PAGE)}</span>
                  <Button variant="outline" size="sm" onClick={() => setJobsPage(p => Math.min(Math.ceil(jobs.length / ITEMS_PER_PAGE), p + 1))} disabled={jobsPage >= Math.ceil(jobs.length / ITEMS_PER_PAGE)} className="border-white/20">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-6 space-y-4">
          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Job</Label>
                  <Select value={selectedJob} onValueChange={setSelectedJob}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10 max-h-60">
                      <SelectItem value="all">Todos os Jobs</SelectItem>
                      {jobs.slice(0, 50).map(job => (
                        <SelectItem key={job.id} value={job.id}>#{job.holdprint_data?.code || job.code || job.id?.slice(0,6)} - {job.title?.substring(0, 25)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Instalador</Label>
                  <Select value={selectedInstaller} onValueChange={setSelectedInstaller}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      <SelectItem value="all">Todos</SelectItem>
                      {installers.map(inst => <SelectItem key={inst.id} value={inst.id}>{inst.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Família de Produto</Label>
                  <Select value={selectedProductFamily} onValueChange={setSelectedProductFamily}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      {productFamilies.map(fam => <SelectItem key={fam.value} value={fam.value}>{fam.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white/5 border-white/10 text-white h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white/5 border-white/10 text-white h-9" />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => { setSelectedInstaller('all'); setSelectedJob('all'); setSelectedProductFamily('all'); setStartDate(''); setEndDate(''); }} className="w-full border-white/20 text-white h-9">
                    Limpar
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {loadingCheckins ? 'Carregando fotos...' : `${filteredPhotos.length} foto(s) encontrada(s)`}
              </p>
            </CardContent>
          </Card>

          {loadingCheckins ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="aspect-square w-full" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredPhotos.slice((photosPage - 1) * 24, photosPage * 24).map(checkin => {
                  const job = jobsById.get(checkin.job_id);
                  const jobCode = job?.holdprint_data?.code || job?.code || checkin.job_id?.slice(0, 6);
                  const jobTitle = checkin.job_title || job?.title || 'Job';
                  const photo = checkin.checkin_photo_url || checkin.checkin_photo || checkin.checkout_photo;
                  const pType = checkin.checkout_photo ? 'checkout' : 'checkin';
                  // Data exibida = registro EXIF da foto (saída→fim, entrada→início); "—" se sem EXIF
                  const photoExif = pType === 'checkout' ? exifEnd(checkin) : exifStart(checkin);
                  const photoWhen = photoExif ? formatDate(String(photoExif).replace(' ', 'T')) : '—';
                  return (
                    <Card key={checkin.id} className="bg-card border-white/5 overflow-hidden group">
                      <div className="px-3 py-2 bg-primary/10 border-b border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-primary bg-primary/20 px-2 py-0.5 rounded">#{jobCode}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded ${pType === 'checkout' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {pType === 'checkout' ? 'SAÍDA' : 'ENTRADA'}
                          </span>
                        </div>
                        <p className="text-xs text-white truncate mt-1">{jobTitle.length > 30 ? jobTitle.substring(0, 30) + '...' : jobTitle}</p>
                      </div>
                      <div
                        className="aspect-square relative cursor-pointer"
                        onClick={() => {
                          setSelectedPhoto(photo);
                          setPhotoType(`${pType === 'checkout' ? 'Check-out' : 'Check-in'} - Job #${jobCode}: ${jobTitle}`);
                        }}
                      >
                        {photo && (
                          <img
                            src={photo.startsWith('data:') || photo.startsWith('http') ? photo : `data:image/jpeg;base64,${photo}`}
                            alt={`${pType}_job_${jobCode}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                          <div className="w-full">
                            <p className="text-white font-medium text-sm truncate">{checkin.installer_name}</p>
                            <p className="text-muted-foreground text-xs">{photoWhen}</p>
                          </div>
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-white/5 border-t border-white/5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">{checkin.installer_name}</span>
                          <span className="text-muted-foreground ml-2">{photoWhen}</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
              {filteredPhotos.length > 24 && (
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPhotosPage(p => Math.max(1, p - 1))} disabled={photosPage === 1} className="border-white/20">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-4 py-2">{photosPage} / {Math.ceil(filteredPhotos.length / 24)}</span>
                  <Button variant="outline" size="sm" onClick={() => setPhotosPage(p => Math.min(Math.ceil(filteredPhotos.length / 24), p + 1))} disabled={photosPage >= Math.ceil(filteredPhotos.length / 24)} className="border-white/20">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Visitas Técnicas Tab */}
        <TabsContent value="visitas" className="mt-6 space-y-4">
          {(() => {
            const concluidas = visitas.filter(v => v.status?.toUpperCase() === 'CONCLUIDA');
            const totalKm = concluidas.reduce((s, v) => s + (v.km_ida || 0) + (v.km_volta || 0), 0);
            const totalValor = concluidas.reduce((s, v) => s + (v.valor_total || 0), 0);
            const totalInstaladores = new Set(visitas.map(v => v.installer_id || v.instalador_id)).size;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-card border-white/5"><CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20"><Navigation className="h-5 w-5 text-purple-400" /></div>
                    <div><p className="text-2xl font-bold text-white">{visitas.length}</p><p className="text-xs text-muted-foreground">Total de Visitas</p></div>
                  </div>
                </CardContent></Card>
                <Card className="bg-card border-white/5"><CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20"><MapPin className="h-5 w-5 text-blue-400" /></div>
                    <div><p className="text-2xl font-bold text-white">{totalKm.toFixed(0)}</p><p className="text-xs text-muted-foreground">KM Rodados</p></div>
                  </div>
                </CardContent></Card>
                <Card className="bg-card border-white/5"><CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/20"><DollarSign className="h-5 w-5 text-green-400" /></div>
                    <div><p className="text-lg font-bold text-white">{formatCurrency(totalValor)}</p><p className="text-xs text-muted-foreground">Valor Total a Pagar</p></div>
                  </div>
                </CardContent></Card>
                <Card className="bg-card border-white/5"><CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/20"><Users className="h-5 w-5 text-cyan-400" /></div>
                    <div><p className="text-2xl font-bold text-white">{totalInstaladores}</p><p className="text-xs text-muted-foreground">Instaladores</p></div>
                  </div>
                </CardContent></Card>
              </div>
            );
          })()}

          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input type="date" value={visitasStartDate} onChange={e => setVisitasStartDate(e.target.value)} className="bg-white/5 border-white/10 text-white h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input type="date" value={visitasEndDate} onChange={e => setVisitasEndDate(e.target.value)} className="bg-white/5 border-white/10 text-white h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Instalador</Label>
                  <Select value={visitasInstalador} onValueChange={setVisitasInstalador}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      <SelectItem value="all">Todos</SelectItem>
                      {installers.map(inst => <SelectItem key={inst.id} value={inst.id}>{inst.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={visitasStatus} onValueChange={setVisitasStatus}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="AGUARDANDO">Aguardando</SelectItem>
                      <SelectItem value="EM_VISITA">Em Visita</SelectItem>
                      <SelectItem value="CONCLUIDA">Concluída</SelectItem>
                      <SelectItem value="CANCELADA">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadVisitas} disabled={visitasLoading} className="flex-1 bg-primary hover:bg-primary/90 h-9">
                    {visitasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button onClick={handleExportVisitas} disabled={visitasExporting} className="flex-1 bg-green-600 hover:bg-green-700 h-9">
                    {visitasExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              {visitasLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
                  <span className="text-muted-foreground">Carregando visitas...</span>
                </div>
              ) : visitas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Navigation className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma visita técnica encontrada.</p>
                  <p className="text-xs mt-1">Ajuste os filtros ou clique em atualizar.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['Nº VT','Cliente','Filial','Instalador','Data','KM','R$/KM','Total (R$)','Status','Vendedor','Tipo Serviço','KM Ida','KM Volta','Rem. Prev.','Rem. Real.','Altura','Ferramentas','Dificuldade','Aprovação'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-medium py-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visitas.map(v => (
                        <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2 pr-4"><span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{v.numero || v.codigo || v.id?.slice(0, 8)}</span></td>
                          <td className="py-2 pr-4 text-white text-xs max-w-[160px] truncate">{v.cliente_nome || v.client_name || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">{v.filial || v.branch || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-white">{v.instalador_nome || v.installer_name || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">{formatDate(v.data_visita || v.scheduled_date || v.created_at)}</td>
                          <td className="py-2 pr-4 text-xs text-white text-right">{v.km_rodados != null ? Number(v.km_rodados).toFixed(1) : '—'}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground text-right">{v.valor_km != null ? formatCurrency(v.valor_km) : '—'}</td>
                          <td className="py-2 pr-4 text-xs text-white text-right font-medium">{v.valor_total != null ? formatCurrency(v.valor_total) : '—'}</td>
                          <td className="py-2 pr-4 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${visitasStatusStyle(v.status)}`}>{v.status || 'N/A'}</span></td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">{v.vendedor_nome || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-white max-w-[120px] truncate">{(v.tipos_servico || []).join(', ') || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-white text-right">{v.km_ida != null ? Number(v.km_ida).toFixed(1) : '—'}</td>
                          <td className="py-2 pr-4 text-xs text-white text-right">{v.km_volta != null ? Number(v.km_volta).toFixed(1) : '—'}</td>
                          <td className="py-2 pr-4 text-xs text-center">{v.remocao_prevista_os ? 'Sim' : 'Não'}</td>
                          <td className="py-2 pr-4 text-xs text-center">{v.remocao_a_realizar ? 'Sim' : 'Não'}</td>
                          <td className="py-2 pr-4 text-xs text-white text-right">{v.altura_estimada_m != null ? `${v.altura_estimada_m}m` : '—'}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground max-w-[120px] truncate">{(v.ferramentas || []).join(', ') || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-white">{['','🟢 N1','🟡 N2','🟠 N3','🔴 N4'][v.nivel_dificuldade] || '—'}</td>
                          <td className="py-2 pr-4 text-xs">
                            {v.aprovacao_status === 'APROVADO' && <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">APROVADO</span>}
                            {v.aprovacao_status === 'NAO_APROVADO' && <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">REPROVADO</span>}
                            {(!v.aprovacao_status || v.aprovacao_status === 'PENDENTE') && <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">PENDENTE</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Archive Dialog */}
      <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Excluir dos KPIs
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-muted-foreground text-sm">
              <strong className="text-white">{selectedIds.size} registro(s)</strong> serão marcados como excluídos.
              Eles não serão mais computados em relatórios e KPIs, mas os dados permanecem no sistema.
            </p>
            <p className="text-xs text-muted-foreground bg-white/5 rounded-md p-3">
              Esta ação é indicada para check-ins de teste que não devem influenciar as métricas de produtividade.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowArchiveConfirm(false)}
                className="border-white/20 text-white hover:bg-white/5"
                disabled={archiving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleBulkArchive}
                disabled={archiving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {archiving
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</>
                  : <><Trash2 className="h-4 w-4 mr-2" />Confirmar exclusão</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="bg-card border-white/10 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">{photoType}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <img
              src={selectedPhoto?.startsWith('data:') || selectedPhoto?.startsWith('http') ? selectedPhoto : `data:image/jpeg;base64,${selectedPhoto}`}
              alt={photoType}
              className="w-full h-auto rounded-lg"
            />
            <Button variant="ghost" size="icon" onClick={() => setSelectedPhoto(null)} className="absolute top-2 right-2 bg-black/50 hover:bg-black/70">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnifiedReports;
