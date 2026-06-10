import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Briefcase, CheckCircle, Clock, Users, MapPin,
  Bell, PauseCircle, Navigation, Timer, AlertCircle, MessageCircle,
  ChevronRight, ExternalLink, Camera, FileSpreadsheet, Loader2,
  Archive, Trash2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';

// ── SessionStorage cache (60s) para dados primários do dashboard ──
const DASH_CACHE_KEY = 'dash_primary_v2';
const DASH_CACHE_TTL = 60_000;

function readDashCache() {
  try {
    const raw = sessionStorage.getItem(DASH_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > DASH_CACHE_TTL) { sessionStorage.removeItem(DASH_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function writeDashCache(data) {
  try { sessionStorage.setItem(DASH_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ── Skeleton placeholder ──
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-white/10 ${className}`} />
);

const Dashboard = () => {
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const navigate = useNavigate();

  // Primary data (loaded first — fast path)
  const [metrics, setMetrics] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [pendingCheckins, setPendingCheckins] = useState([]);
  const [locationAlerts, setLocationAlerts] = useState([]);
  const [loadingPrimary, setLoadingPrimary] = useState(true);

  // Secondary data (getAllItemCheckins — deferred)
  const [lateCheckins, setLateCheckins] = useState([]);
  const [pausedCheckins, setPausedCheckins] = useState([]);
  const [completedCheckins, setCompletedCheckins] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [sendingAlerts, setSendingAlerts] = useState(false);

  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);

  // Ação de arquivar/excluir job a partir do Relatório Consolidado
  // jobAction: { type: 'archive' | 'delete', jobId, label }
  const [jobAction, setJobAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const confirmJobAction = useCallback(async () => {
    if (!jobAction) return;
    const { type, jobId } = jobAction;
    setActionBusy(true);
    try {
      if (type === 'archive') {
        await api.archiveJob(jobId, true); // exclude_from_metrics = true
      } else {
        await api.deleteJob(jobId); // soft-delete reversível
      }
      // Remove do relatório todas as linhas (check-ins) pertencentes a esse job
      setCompletedCheckins(prev => prev.filter(c => c.job_id !== jobId));
      toast.success(
        type === 'archive'
          ? 'Job arquivado — não conta mais em relatórios e KPIs'
          : 'Job excluído — não conta mais em relatórios e KPIs'
      );
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao processar a ação do job');
    } finally {
      setActionBusy(false);
      setJobAction(null);
    }
  }, [jobAction]);

  // Guards contra double-fire do useEffect (user + isAdmin/isManager chegam em renders separados)
  const primaryStartedRef = useRef(false);
  const alertsStartedRef = useRef(false);
  const [modalData, setModalData] = useState({ title: '', items: [] });

  // ── O(1) lookup maps — avita .find() em loops de render ──
  const installersById = useMemo(() => {
    const m = new Map();
    installers.forEach(i => {
      m.set(i.id, i);
      if (i.user_id) m.set(i.user_id, i);
    });
    return m;
  }, [installers]);

  const jobsById = useMemo(() => {
    const m = new Map();
    jobs.forEach(j => m.set(j.id, j));
    return m;
  }, [jobs]);

  const getInstallerById = useCallback((id) => installersById.get(id) || null, [installersById]);

  const installersByName = useMemo(() => {
    const m = new Map();
    installers.forEach(i => { if (i.full_name) m.set(i.full_name, i); });
    return m;
  }, [installers]);

  const formatPhoneForWhatsApp = (phone) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55')) return digits;
    if (digits.length === 11 || digits.length === 10) return `55${digits}`;
    return digits;
  };

  const openWhatsApp = (phone, messageType, jobTitle, installerName) => {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    if (!formattedPhone) { toast.error('Telefone não cadastrado para este instalador'); return; }
    const appUrl = window.location.origin;
    const messages = {
      paused: `Olá ${installerName}! 👋\n\nVerificamos que seu check-in no job "${jobTitle}" está pausado.\n\nPor favor, atualize o status ou retome a instalação.\n\nAcesse: ${appUrl}`,
      late: `Olá ${installerName}! 👋\n\nSeu checkout no job "${jobTitle}" está em atraso (mais de 4 horas).\n\nPor favor, finalize o checkout ou entre em contato conosco.\n\nAcesse: ${appUrl}`,
      pending: `Olá ${installerName}! 👋\n\nO job "${jobTitle}" está agendado mas ainda não foi iniciado.\n\nPor favor, inicie o check-in assim que possível.\n\nAcesse: ${appUrl}`,
      location: `Olá ${installerName}! 👋\n\nVerificamos uma divergência de localização no job "${jobTitle}".\n\nPor favor, verifique se está no local correto da instalação.\n\nAcesse: ${appUrl}`,
    };
    const msg = messages[messageType] || `Olá ${installerName}! 👋\n\nPrecisamos falar sobre o job "${jobTitle}".\n\nAcesse: ${appUrl}`;
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Fase 1: dados rápidos (métricas, jobs, instaladores, pending, location) ──
  const loadPrimary = useCallback(async () => {
    const cached = readDashCache();
    if (cached) {
      setJobs(cached.jobs || []);
      setMetrics(cached.metrics || null);
      setInstallers(cached.installers || []);
      setPendingCheckins(cached.pendingCheckins || []);
      setLocationAlerts(cached.locationAlerts || []);
      setLoadingPrimary(false);
      return;
    }

    try {
      const [jobsRes, metricsRes, installersRes, pendingRes, locationRes] = await Promise.all([
        api.getJobs(),
        api.getMetrics(),
        api.getInstallers().catch((e) => { console.warn('[Dashboard] installers:', e); return { data: [] }; }),
        api.getPendingCheckins().catch((e) => { console.warn('[Dashboard] pending:', e); return { data: { pending_checkins: [] } }; }),
        api.getLocationAlerts().catch((e) => { console.warn('[Dashboard] location:', e); return { data: [] }; }),
      ]);

      const primaryData = {
        jobs: Array.isArray(jobsRes.data) ? jobsRes.data : [],
        metrics: metricsRes.data && typeof metricsRes.data === 'object' && !Array.isArray(metricsRes.data) ? metricsRes.data : null,
        installers: Array.isArray(installersRes.data) ? installersRes.data : [],
        pendingCheckins: Array.isArray(pendingRes.data?.pending_checkins) ? pendingRes.data.pending_checkins : [],
        locationAlerts: Array.isArray(locationRes.data) ? locationRes.data : [],
      };

      setJobs(primaryData.jobs);
      setMetrics(primaryData.metrics);
      setInstallers(primaryData.installers);
      setPendingCheckins(primaryData.pendingCheckins);
      setLocationAlerts(primaryData.locationAlerts);
      writeDashCache(primaryData);
    } catch (error) {
      console.error('[Dashboard] loadPrimary:', error);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoadingPrimary(false);
    }
  }, []);

  // ── Fase 2: getAllItemCheckins (pesada — deferred) ──
  const loadAlerts = useCallback(async () => {
    try {
      const checkins = await api.getAllItemCheckins();
      const list = checkins || [];

      const completed = list
        .filter(c => c.status === 'completed' && c.checkout_at)
        .sort((a, b) => new Date(b.checkout_at) - new Date(a.checkout_at))
        .slice(0, 20);
      setCompletedCheckins(completed);

      const paused = list.filter(c => c.status === 'paused');
      setPausedCheckins(paused);

      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const late = list.filter(c => c.status === 'in_progress' && new Date(c.checkin_at) < fourHoursAgo);
      setLateCheckins(late);
    } catch (error) {
      console.error('[Dashboard] loadAlerts:', error);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    if (isInstaller) { navigate('/installer/dashboard'); return; }
    if (!user) return;

    if (!primaryStartedRef.current) {
      primaryStartedRef.current = true;
      loadPrimary();
    }

    if (isAdmin || isManager) {
      if (!alertsStartedRef.current) {
        alertsStartedRef.current = true;
        loadAlerts();
      }
    } else {
      if (!alertsStartedRef.current) {
        alertsStartedRef.current = true;
        setLoadingAlerts(false);
      }
    }
  }, [isInstaller, navigate, user, isAdmin, isManager, loadPrimary, loadAlerts]);

  const handleSendLateAlerts = async () => {
    setSendingAlerts(true);
    try {
      const response = await api.sendLateAlerts();
      toast.success(response.data.message);
    } catch (error) {
      console.error('[Dashboard] sendLateAlerts:', error);
      toast.error('Erro ao enviar alertas');
    } finally {
      setSendingAlerts(false);
    }
  };

  const handleDrillDownCompleted = () => {
    const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'finalizado');
    setModalData({ title: 'Jobs Concluídos', type: 'completed', items: completedJobs.slice(0, 20) });
    setShowCompletedModal(true);
  };

  const handleDrillDownTime = () => {
    const jobsWithTime = jobs
      .filter(j => j.total_duration_minutes > 0)
      .sort((a, b) => (b.total_duration_minutes || 0) - (a.total_duration_minutes || 0));
    setModalData({ title: 'Tempo por Job', type: 'time', items: jobsWithTime.slice(0, 20) });
    setShowTimeModal(true);
  };

  // ── Skeleton para métricas ──
  const MetricsSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map(i => (
        <Card key={i} className="bg-card border-white/5">
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // ── Skeleton para alertas ──
  const AlertsSkeleton = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <Skeleton className="w-14 h-14 rounded-2xl mb-3" />
          <Skeleton className="h-9 w-10 mb-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );

  // ── Skeleton para jobs ──
  const JobsSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3].map(i => (
        <Card key={i} className="bg-card border-white/5">
          <CardHeader>
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

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

      {/* ── Relatório Consolidado (fase 2) ── */}
      {(isAdmin || isManager) && (
        loadingAlerts ? null : completedCheckins.length > 0 ? (
          <Card className="bg-card/50 backdrop-blur border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  Relatório Consolidado
                  <span className="text-xs font-normal text-muted-foreground ml-1">— check-ins concluídos</span>
                </CardTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Camera className="h-3.5 w-3.5" />
                  <span>Lat/Long via imagem</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-2 font-medium w-12">Foto</th>
                      <th className="text-left px-4 py-2 font-medium">Instalador</th>
                      <th className="text-left px-4 py-2 font-medium">Item / Produto</th>
                      <th className="text-left px-4 py-2 font-medium">H. Início</th>
                      <th className="text-left px-4 py-2 font-medium">H. Fim</th>
                      <th className="text-left px-4 py-2 font-medium">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-400" />Latitude</span>
                      </th>
                      <th className="text-left px-4 py-2 font-medium">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-blue-400" />Longitude</span>
                      </th>
                      <th className="text-left px-4 py-2 font-medium">Origem</th>
                      <th className="text-right px-4 py-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedCheckins.map((c, idx) => {
                      const installer = getInstallerById(c.installer_id);
                      const job = jobsById.get(c.job_id);
                      const lat = c.exif_lat ?? c.gps_lat;
                      const lng = c.exif_long ?? c.gps_long;
                      const fromExif = c.exif_lat != null;
                      const inicio = c.checkin_at ? new Date(c.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
                      const fim = c.checkout_at ? new Date(c.checkout_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                          onClick={() => navigate(`/checkin-viewer/${c.id}`)}
                        >
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
                          <td className="px-4 py-2.5 font-mono text-green-400">{inicio}</td>
                          <td className="px-4 py-2.5 font-mono text-red-400">{fim}</td>
                          <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">
                            {lat != null ? lat.toFixed(6) : <span className="text-muted-foreground/50">—</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">
                            {lng != null ? lng.toFixed(6) : <span className="text-muted-foreground/50">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {fromExif ? (
                              <span className="flex items-center gap-1 text-xs text-yellow-400"><Camera className="h-3 w-3" />EXIF</span>
                            ) : lat != null ? (
                              <span className="flex items-center gap-1 text-xs text-blue-400"><Navigation className="h-3 w-3" />GPS</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                title={c.job_id ? 'Arquivar job (sai dos relatórios e KPIs)' : 'Job não identificado'}
                                disabled={!c.job_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobAction({ type: 'archive', jobId: c.job_id, label: c.product_name || job?.title || c.job_id });
                                }}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title={c.job_id ? 'Excluir job (soft-delete, reversível)' : 'Job não identificado'}
                                disabled={!c.job_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobAction({ type: 'delete', jobId: c.job_id, label: c.product_name || job?.title || c.job_id });
                                }}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null
      )}

      {/* ── Confirmação de arquivar/excluir job ── */}
      <Dialog open={!!jobAction} onOpenChange={(open) => { if (!open && !actionBusy) setJobAction(null); }}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              {jobAction?.type === 'archive'
                ? <><Archive className="h-5 w-5 text-amber-400" /> Arquivar job</>
                : <><Trash2 className="h-5 w-5 text-red-400" /> Excluir job</>}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {jobAction?.type === 'archive' ? (
                <>O job <span className="text-white">{jobAction?.label}</span> será arquivado e
                  <strong className="text-white"> deixará de contar em relatórios e KPIs</strong>.
                  Você pode restaurá-lo depois.</>
              ) : (
                <>O job <span className="text-white">{jobAction?.label}</span> será excluído
                  (<span className="text-white">soft-delete reversível</span>) e
                  <strong className="text-white"> deixará de contar em relatórios e KPIs</strong>.
                  Os dados continuam no banco para auditoria.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={actionBusy} onClick={() => setJobAction(null)}>
              Cancelar
            </Button>
            <Button
              disabled={actionBusy}
              onClick={confirmJobAction}
              className={jobAction?.type === 'delete' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}
            >
              {actionBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {jobAction?.type === 'archive' ? 'Arquivar' : 'Excluir'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Métricas (fase 1) ── */}
      {(isAdmin || isManager) && (
        loadingPrimary ? <MetricsSkeleton /> : metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card
              className="bg-card border-white/5 hover:border-blue-500/50 transition-all cursor-pointer group hover:scale-[1.02]"
              data-testid="metric-total-jobs"
              onClick={() => navigate('/jobs')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Total de Jobs</CardTitle>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-blue-500" />
                  <ChevronRight className="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{metrics.total_jobs}</div>
                <p className="text-xs text-muted-foreground mt-1">{metrics.pending_jobs} pendentes</p>
                <p className="text-xs text-blue-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Clique para ver todos →</p>
              </CardContent>
            </Card>

            <Card
              className="bg-card border-white/5 hover:border-green-500/50 transition-all cursor-pointer group hover:scale-[1.02]"
              data-testid="metric-completed-jobs"
              onClick={handleDrillDownCompleted}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Concluídos</CardTitle>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <ChevronRight className="h-4 w-4 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{metrics.completed_jobs}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.total_jobs > 0 ? ((metrics.completed_jobs / metrics.total_jobs) * 100).toFixed(0) : 0}% do total
                </p>
                <p className="text-xs text-green-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Clique para detalhes →</p>
              </CardContent>
            </Card>

            <Card
              className="bg-card border-white/5 hover:border-yellow-500/50 transition-all cursor-pointer group hover:scale-[1.02]"
              data-testid="metric-avg-duration"
              onClick={handleDrillDownTime}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Tempo Médio</CardTitle>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  <ChevronRight className="h-4 w-4 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{metrics.avg_duration_minutes}min</div>
                <p className="text-xs text-muted-foreground mt-1">por job</p>
                <p className="text-xs text-yellow-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Clique para ranking →</p>
              </CardContent>
            </Card>

            <Card
              className="bg-card border-white/5 hover:border-primary/50 transition-all cursor-pointer group hover:scale-[1.02]"
              data-testid="metric-installers"
              onClick={() => navigate('/users')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Instaladores</CardTitle>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <ChevronRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{metrics.total_installers}</div>
                <p className="text-xs text-muted-foreground mt-1">ativos</p>
                <p className="text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Clique para gerenciar →</p>
              </CardContent>
            </Card>
          </div>
        )
      )}

      {/* ── Centro de Alertas ── */}
      {(isAdmin || isManager) && (
        <div className="space-y-6">
          {/* Contadores infográficos */}
          {loadingPrimary || loadingAlerts ? (
            <AlertsSkeleton />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Não Iniciados */}
              <div
                className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                  pendingCheckins.length > 0
                    ? 'bg-gradient-to-br from-red-500/20 to-red-600/10 border-2 border-red-500/50'
                    : 'bg-white/5 border border-white/10 opacity-50'
                }`}
                onClick={() => pendingCheckins.length > 0 && document.getElementById('pending-alerts')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <div className="absolute -right-4 -top-4 opacity-10"><Timer className="h-24 w-24 text-red-500" /></div>
                <div className="relative z-10">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${pendingCheckins.length > 0 ? 'bg-red-500/30' : 'bg-white/10'}`}>
                    <Timer className={`h-7 w-7 ${pendingCheckins.length > 0 ? 'text-red-400' : 'text-gray-500'}`} />
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${pendingCheckins.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>{pendingCheckins.length}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Não Iniciados</p>
                </div>
                {pendingCheckins.length > 0 && <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-red-500 animate-pulse" />}
              </div>

              {/* Prolongados */}
              <div
                className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                  lateCheckins.length > 0
                    ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-2 border-yellow-500/50'
                    : 'bg-white/5 border border-white/10 opacity-50'
                }`}
                onClick={() => lateCheckins.length > 0 && document.getElementById('late-alerts')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <div className="absolute -right-4 -top-4 opacity-10"><Clock className="h-24 w-24 text-yellow-500" /></div>
                <div className="relative z-10">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${lateCheckins.length > 0 ? 'bg-yellow-500/30' : 'bg-white/10'}`}>
                    {loadingAlerts
                      ? <Loader2 className="h-7 w-7 text-yellow-500/50 animate-spin" />
                      : <Clock className={`h-7 w-7 ${lateCheckins.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`} />}
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${lateCheckins.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {loadingAlerts ? '…' : lateCheckins.length}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Prolongados</p>
                </div>
                {lateCheckins.length > 0 && <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />}
              </div>

              {/* Pausados */}
              <div
                className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                  pausedCheckins.length > 0
                    ? 'bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-2 border-orange-500/50'
                    : 'bg-white/5 border border-white/10 opacity-50'
                }`}
                onClick={() => pausedCheckins.length > 0 && document.getElementById('paused-alerts')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <div className="absolute -right-4 -top-4 opacity-10"><PauseCircle className="h-24 w-24 text-orange-500" /></div>
                <div className="relative z-10">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${pausedCheckins.length > 0 ? 'bg-orange-500/30' : 'bg-white/10'}`}>
                    {loadingAlerts
                      ? <Loader2 className="h-7 w-7 text-orange-500/50 animate-spin" />
                      : <PauseCircle className={`h-7 w-7 ${pausedCheckins.length > 0 ? 'text-orange-400' : 'text-gray-500'}`} />}
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${pausedCheckins.length > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                    {loadingAlerts ? '…' : pausedCheckins.length}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pausados</p>
                </div>
                {pausedCheckins.length > 0 && <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-orange-500 animate-pulse" />}
              </div>

              {/* Localização */}
              <div
                className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                  locationAlerts.length > 0
                    ? 'bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-2 border-purple-500/50'
                    : 'bg-white/5 border border-white/10 opacity-50'
                }`}
                onClick={() => locationAlerts.length > 0 && document.getElementById('location-alerts')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <div className="absolute -right-4 -top-4 opacity-10"><Navigation className="h-24 w-24 text-purple-500" /></div>
                <div className="relative z-10">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${locationAlerts.length > 0 ? 'bg-purple-500/30' : 'bg-white/10'}`}>
                    <Navigation className={`h-7 w-7 ${locationAlerts.length > 0 ? 'text-purple-400' : 'text-gray-500'}`} />
                  </div>
                  <p className={`text-3xl font-bold mb-1 ${locationAlerts.length > 0 ? 'text-purple-400' : 'text-gray-500'}`}>{locationAlerts.length}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Localização</p>
                </div>
                {locationAlerts.length > 0 && <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-purple-500 animate-pulse" />}
              </div>
            </div>
          )}

          {/* Detalhe dos alertas */}
          {!loadingPrimary && (pendingCheckins.length > 0 || lateCheckins.length > 0 || pausedCheckins.length > 0 || locationAlerts.length > 0) && (
            <Card className="bg-card/50 backdrop-blur border-white/10">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    Detalhes dos Alertas
                    {loadingAlerts && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin ml-1" />}
                  </CardTitle>
                  {pendingCheckins.length > 0 && (
                    <Button size="sm" onClick={handleSendLateAlerts} disabled={sendingAlerts} className="bg-red-500 hover:bg-red-600 text-white">
                      <Bell className="h-4 w-4 mr-2" />
                      {sendingAlerts ? 'Enviando...' : 'Notificar'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Não Iniciados */}
                {pendingCheckins.length > 0 && (
                  <div id="pending-alerts" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                        <Timer className="h-4 w-4 text-red-400" />
                      </div>
                      <span className="text-sm font-semibold text-red-400">Não Iniciados</span>
                    </div>
                    <div className="grid gap-2 pl-10">
                      {pendingCheckins.slice(0, 5).map((job) => {
                        const installer = job.assigned_installers?.length > 0 ? installersById.get(job.assigned_installers[0]) : null;
                        return (
                          <div key={job.id} className="flex items-center justify-between p-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <div className="flex-1 cursor-pointer hover:text-red-300" onClick={() => navigate(`/jobs/${job.id}`)}>
                              <span className="text-sm text-white truncate">{job.title}</span>
                              {installer && <span className="text-xs text-muted-foreground ml-2">({installer.full_name})</span>}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-bold">{job.minutes_late}min</span>
                              {installer?.phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => { e.stopPropagation(); openWhatsApp(installer.phone, 'pending', job.title, installer.full_name); }}>
                                  <MessageCircle className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Prolongados */}
                {!loadingAlerts && lateCheckins.length > 0 && (
                  <div id="late-alerts" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-yellow-400" />
                      </div>
                      <span className="text-sm font-semibold text-yellow-400">Prolongados (+4h)</span>
                    </div>
                    <div className="grid gap-2 pl-10">
                      {lateCheckins.slice(0, 5).map((checkin) => {
                        const job = jobsById.get(checkin.job_id);
                        const installer = getInstallerById(checkin.installer_id);
                        const hours = Math.floor((Date.now() - new Date(checkin.checkin_at)) / (1000 * 60 * 60));
                        return (
                          <div key={checkin.id} className="flex items-center justify-between p-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                            <div className="flex-1 cursor-pointer hover:text-yellow-300" onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}>
                              <span className="text-sm text-white truncate">{job?.title || 'Job'}</span>
                              {installer && <span className="text-xs text-muted-foreground ml-2">({installer.full_name})</span>}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">{hours}h+</span>
                              {installer?.phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => { e.stopPropagation(); openWhatsApp(installer.phone, 'late', job?.title || 'Job', installer.full_name); }}>
                                  <MessageCircle className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pausados */}
                {!loadingAlerts && pausedCheckins.length > 0 && (
                  <div id="paused-alerts" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <PauseCircle className="h-4 w-4 text-orange-400" />
                      </div>
                      <span className="text-sm font-semibold text-orange-400">Pausados</span>
                    </div>
                    <div className="grid gap-2 pl-10">
                      {pausedCheckins.slice(0, 5).map((checkin) => {
                        const job = jobsById.get(checkin.job_id);
                        const installer = getInstallerById(checkin.installer_id);
                        return (
                          <div key={checkin.id} className="flex items-center justify-between p-2 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                            <div className="flex-1 cursor-pointer hover:text-orange-300" onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}>
                              <span className="text-sm text-white truncate">{job?.title || 'Job'}</span>
                              {installer && <span className="text-xs text-muted-foreground ml-2">({installer.full_name})</span>}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs font-bold">⏸ Pausa</span>
                              {installer?.phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => { e.stopPropagation(); openWhatsApp(installer.phone, 'paused', job?.title || 'Job', installer.full_name); }}>
                                  <MessageCircle className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Localização */}
                {locationAlerts.length > 0 && (
                  <div id="location-alerts" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <Navigation className="h-4 w-4 text-purple-400" />
                      </div>
                      <span className="text-sm font-semibold text-purple-400">Localização</span>
                    </div>
                    <div className="grid gap-2 pl-10">
                      {locationAlerts.slice(0, 5).map((alert) => {
                        const installer = installersByName.get(alert.installer_name);
                        return (
                          <div key={alert.id} className="flex items-center justify-between p-2 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                            <div className="truncate flex-1">
                              <span className="text-sm text-white">{alert.job_title}</span>
                              <span className="text-xs text-muted-foreground ml-2">({alert.installer_name})</span>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-bold">{alert.distance_meters?.toFixed(0)}m</span>
                              {installer?.phone && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => { e.stopPropagation(); openWhatsApp(installer.phone, 'location', alert.job_title, installer.full_name); }}>
                                  <MessageCircle className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          )}

          {/* Tudo em ordem */}
          {!loadingPrimary && !loadingAlerts &&
            pendingCheckins.length === 0 && lateCheckins.length === 0 &&
            pausedCheckins.length === 0 && locationAlerts.length === 0 && (
            <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-500">Tudo em ordem!</h3>
                    <p className="text-sm text-muted-foreground">Nenhum alerta ativo no momento.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Jobs Recentes ── */}
      <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-heading font-bold text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Jobs Recentes
            </h2>
            <button
              onClick={() => navigate('/jobs')}
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
              data-testid="view-all-jobs-button"
            >
              Ver todos →
            </button>
          </div>

          {loadingPrimary ? (
            <JobsSkeleton />
          ) : jobs.length === 0 ? (
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
                        <CardTitle className="text-lg text-white line-clamp-1">{job.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{job.client_name}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                        job.status === 'completed' || job.status === 'finalizado'
                          ? 'bg-green-500/20 text-green-500 border-green-500/20'
                          : job.status === 'in_progress' || job.status === 'instalando'
                          ? 'bg-blue-500/20 text-blue-500 border-blue-500/20'
                          : job.status === 'pausado'
                          ? 'bg-orange-500/20 text-orange-500 border-orange-500/20'
                          : job.status === 'atrasado'
                          ? 'bg-red-500/20 text-red-500 border-red-500/20'
                          : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20'
                      }`}>
                        {job.status === 'completed' || job.status === 'finalizado' ? 'FINALIZADO'
                          : job.status === 'in_progress' || job.status === 'instalando' ? 'INSTALANDO'
                          : job.status === 'pausado' ? 'PAUSADO'
                          : job.status === 'atrasado' ? 'ATRASADO'
                          : 'AGUARDANDO'}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Filial: {job.branch}</span>
                      {job.assigned_installers?.length > 0 && (
                        <span className="text-primary font-medium">{job.assigned_installers.length} instalador(es)</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>

      {/* ── Modais drill-down ── */}
      <Dialog open={showCompletedModal} onOpenChange={setShowCompletedModal}>
        <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Jobs Concluídos ({modalData.items?.length || 0})
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">Lista de jobs finalizados recentemente</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {modalData.items?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum job concluído encontrado</p>
            ) : (
              modalData.items?.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/20 rounded-lg hover:bg-green-500/10 cursor-pointer transition-colors"
                  onClick={() => { setShowCompletedModal(false); navigate(`/jobs/${job.id}`); }}
                >
                  <div className="flex-1">
                    <p className="text-white font-medium truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.client_name} • {job.branch}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {job.total_duration_minutes > 0 && (
                      <span className="text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded">
                        {Math.floor(job.total_duration_minutes / 60)}h {job.total_duration_minutes % 60}min
                      </span>
                    )}
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <Button variant="outline" className="w-full" onClick={() => { setShowCompletedModal(false); navigate('/jobs'); }}>
              Ver Todos os Jobs <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTimeModal} onOpenChange={setShowTimeModal}>
        <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Ranking de Tempo por Job
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">Jobs ordenados por duração total de instalação</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {modalData.items?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum job com dados de tempo encontrado</p>
            ) : (
              modalData.items?.map((job, index) => {
                const hours = Math.floor((job.total_duration_minutes || 0) / 60);
                const minutes = (job.total_duration_minutes || 0) % 60;
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg hover:bg-yellow-500/10 cursor-pointer transition-colors"
                    onClick={() => { setShowTimeModal(false); navigate(`/jobs/${job.id}`); }}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-500/30 text-yellow-400' :
                        index === 1 ? 'bg-gray-400/30 text-gray-300' :
                        index === 2 ? 'bg-orange-500/30 text-orange-400' :
                        'bg-white/10 text-muted-foreground'
                      }`}>{index + 1}</span>
                      <div className="flex-1">
                        <p className="text-white font-medium truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground">{job.client_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-yellow-400 bg-yellow-500/20 px-3 py-1 rounded font-mono">
                        {hours > 0 ? `${hours}h ` : ''}{minutes}min
                      </span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <Button variant="outline" className="w-full" onClick={() => { setShowTimeModal(false); navigate('/reports'); }}>
              Ver Relatórios Completos <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
