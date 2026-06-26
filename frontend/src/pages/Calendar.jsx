import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { brtDateStr, brtTimeStr, brtWallToUtcIso } from '../lib/brtDate';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, MapPin, 
  List, Grid3X3, ExternalLink, Check, X, Loader2, Mail, Clock,
  GripVertical, Plus, RefreshCw, Send, CalendarCheck
} from 'lucide-react';
import { toast } from 'sonner';

const Calendar = () => {
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [allJobs, setAllJobs] = useState([]); // All jobs for scheduling
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Google Calendar state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState(null);
  const [syncingJob, setSyncingJob] = useState(null);
  const [checkingGoogleStatus, setCheckingGoogleStatus] = useState(true);
  
  // Drag and drop state
  const [draggedJob, setDraggedJob] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  
  // Schedule dialog
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [pickedJob, setPickedJob] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [selectedInstaller, setSelectedInstaller] = useState('');
  const [sendEmailNotification, setSendEmailNotification] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [showJobDetail, setShowJobDetail] = useState(false);
  const [selectedJobDetail, setSelectedJobDetail] = useState(null);
  const [visibleJobsCount, setVisibleJobsCount] = useState(10);

  // Week/Day view date tracking
  const [weekStartDate, setWeekStartDate] = useState(new Date());
  const [dayViewDate, setDayViewDate] = useState(new Date());

  // Day detail modal
  const [showDayModal, setShowDayModal] = useState(false);
  const [dayModalDate, setDayModalDate] = useState(null);

  // Detect mobile screen
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check for Google OAuth callback params
  useEffect(() => {
    const googleConnectedParam = searchParams.get('google_connected');
    const googleError = searchParams.get('google_error');
    
    if (googleConnectedParam === 'true') {
      toast.success('Google Calendar conectado com sucesso!');
      setSearchParams({});
      checkGoogleStatus();
    } else if (googleError) {
      toast.error('Erro ao conectar com o Google Calendar');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    checkGoogleStatus();
    loadData();
  }, []);

  const checkGoogleStatus = async () => {
    try {
      setCheckingGoogleStatus(true);
      const response = await api.getGoogleAuthStatus();
      setGoogleConnected(response.data.connected);
      setGoogleEmail(response.data.google_email);
    } catch (error) {
      console.error('Error checking Google status:', error);
    } finally {
      setCheckingGoogleStatus(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, installersRes, visitasRes] = await Promise.all([
        api.getJobs(),
        isAdmin || isManager ? api.getInstallers() : Promise.resolve({ data: [] }),
        api.listVisitas().catch(err => {
          console.warn('[Calendar] listVisitas falhou:', err?.message);
          toast.warning('Não foi possível carregar visitas técnicas');
          return { data: [] };
        }),
      ]);

      const visitasAsEvents = (visitasRes.data || [])
        .filter(v => v.scheduled_date && v.status !== 'CANCELADA')
        .map(v => ({
          id: v.id,
          title: v.titulo || `VT ${v.numero_vt || ''}`,
          client_name: v.client_name,
          client_address: v.client_address,
          branch: v.branch,
          scheduled_date: v.scheduled_date,
          scheduled_time_end: v.scheduled_time_end,
          assigned_installers: v.installer_id ? [v.installer_id] : [],
          status: v.status,
          code: v.numero_vt,
          kind: 'visita_tecnica',
        }));

      let scheduledJobs = (jobsRes.data || []).filter(j => j.scheduled_date);
      if (isInstaller) {
        scheduledJobs = scheduledJobs.filter(job =>
          job.assigned_installers?.includes(user?.id) || !job.assigned_installers?.length
        );
      }

      const visibleVisitas = isInstaller
        ? visitasAsEvents.filter(v => v.assigned_installers.includes(user?.id))
        : visitasAsEvents;

      setJobs([...scheduledJobs, ...visibleVisitas]);
      setAllJobs((jobsRes.data || []).filter(j =>
        !j.scheduled_date && j.status !== 'finalizado' && j.status !== 'completed'
      ));
      // FIX B4 (auditoria 2026-05-14): fallback obrigatório — se a resposta
      // vier sem `data` (instalador, erro de rede), `undefined.map/find` quebra
      // o componente inteiro com tela em branco.
      setInstallers(installersRes.data || []);
    } catch (error) {
      console.error('[Calendar] loadData:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const connectGoogleCalendar = async () => {
    try {
      const response = await api.getGoogleAuthUrl();
      window.location.href = response.data.authorization_url;
    } catch (error) {
      toast.error('Erro ao iniciar conexão com Google');
    }
  };

  const disconnectGoogleCalendar = async () => {
    // FIX M4 (auditoria 2026-05-14): exige confirmação — o botão "X"
    // tinha clique fácil em mobile e desconectar força reautorização OAuth completa.
    if (!window.confirm('Desconectar o Google Calendar?\n\nVocê precisará autorizar a integração novamente para sincronizar jobs.')) {
      return;
    }
    try {
      await api.disconnectGoogle();
      setGoogleConnected(false);
      setGoogleEmail(null);
      toast.success('Google Calendar desconectado');
    } catch (error) {
      console.error('[Calendar] disconnectGoogleCalendar:', error);
      toast.error('Erro ao desconectar Google Calendar');
    }
  };

  const syncJobToGoogleCalendar = async (job, sendEmail = true) => {
    if (!googleConnected) {
      toast.error('Conecte seu Google Calendar primeiro');
      return;
    }

    setSyncingJob(job.id);
    try {
      const scheduledDate = new Date(job.scheduled_date);
      // FIX M5 (auditoria 2026-05-14): respeita scheduled_time_end quando o gerente
      // o definiu. O fallback de 4h só vale para jobs sem horário de término.
      const endDate = job.scheduled_time_end
        ? new Date(job.scheduled_time_end)
        : new Date(scheduledDate.getTime() + 4 * 60 * 60 * 1000);

      // Get assigned installer emails for notifications
      const assignedInstallerEmails = [];
      if (sendEmail && job.assigned_installers?.length > 0) {
        for (const instId of job.assigned_installers) {
          const inst = installers.find(i => i.id === instId);
          if (inst?.email) {
            assignedInstallerEmails.push(inst.email);
          }
        }
      }

      const eventData = {
        title: `[Instalação] ${job.title}`,
        description: `Job #${job.holdprint_data?.code || job.code || job.id?.slice(0,6)}\n\nCliente: ${job.client_name || 'N/A'}\nFilial: ${job.branch}\nStatus: ${job.status}\n\n${job.client_address || ''}`,
        start_datetime: scheduledDate.toISOString(),
        end_datetime: endDate.toISOString(),
        location: job.client_address || '',
        attendees: assignedInstallerEmails,
        send_notifications: sendEmail
      };

      const response = await api.createGoogleCalendarEvent(eventData);
      
      if (sendEmail && assignedInstallerEmails.length > 0) {
        toast.success(`Job sincronizado! Convite enviado para ${assignedInstallerEmails.length} instalador(es)`);
      } else {
        toast.success('Job adicionado ao Google Calendar!');
      }
      
      if (response.data.html_link) {
        window.open(response.data.html_link, '_blank');
      }
    } catch (error) {
      console.error('Error syncing to Google:', error);
      if (error.response?.status === 401) {
        toast.error('Sessão do Google expirada. Reconecte sua conta.');
        setGoogleConnected(false);
      } else {
        toast.error('Erro ao adicionar ao Google Calendar');
      }
    } finally {
      setSyncingJob(null);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, job) => {
    if (!isAdmin && !isManager) return;
    setDraggedJob(job);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, date) => {
    if (!isAdmin && !isManager) return;
    e.preventDefault();
    setDragOverDate(date?.toISOString());
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (e, date) => {
    e.preventDefault();
    if (!draggedJob || !date || (!isAdmin && !isManager)) return;
    if (draggedJob.kind === 'visita_tecnica') return;

    setDragOverDate(null);

    const existingTime = draggedJob.scheduled_date
      ? (() => {
          const d = new Date(draggedJob.scheduled_date);
          return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        })()
      : '08:00';

    setSelectedJob(draggedJob);
    setScheduleDate(date.toISOString().split('T')[0]);
    setScheduleTime(existingTime);
    setSelectedInstaller(draggedJob.assigned_installers?.[0] || '');
    setIsRescheduling(!!draggedJob.scheduled_date);
    setShowScheduleDialog(true);
    setDraggedJob(null);
  };

  const checkConflicts = async (installerId, date) => {
    if (!installerId || installerId === 'none') return null;
    try {
      const response = await api.checkScheduleConflicts(installerId, date, scheduleTime);
      return response.data;
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return null;
    }
  };

  const handleScheduleJob = async () => {
    const jobToSchedule = selectedJob || pickedJob;
    if (!jobToSchedule || !scheduleDate) return;
    
    // Check for conflicts if installer is selected
    if (selectedInstaller && selectedInstaller !== 'none') {
      const conflicts = await checkConflicts(selectedInstaller, scheduleDate);
      if (conflicts && conflicts.has_conflict) {
        const confirmSchedule = window.confirm(
          `⚠️ Conflito de Horário!\n\n${conflicts.message}\n\nJobs conflitantes:\n${conflicts.conflicting_jobs.map(j => `- ${j.title}`).join('\n')}\n\nDeseja agendar mesmo assim?`
        );
        if (!confirmSchedule) return;
      }
    }
    
    setScheduling(true);
    try {
      // Hora de parede BRT → instante UTC (fixa -03:00, não depende do fuso do navegador).
      const scheduledIso = brtWallToUtcIso(scheduleDate, scheduleTime);
      const installerIds = selectedInstaller && selectedInstaller !== 'none' ? [selectedInstaller] : [];

      await api.scheduleJob(jobToSchedule.id, {
        scheduledDate: scheduledIso,
        installerIds,
        status: 'agendado',
      });

      if (googleConnected && sendEmailNotification && installerIds.length > 0) {
        await syncJobToGoogleCalendar({
          ...jobToSchedule,
          scheduled_date: scheduledIso,
          assigned_installers: installerIds
        }, true);
      }

      toast.success(isRescheduling ? 'Job reagendado! Email enviado ao instalador.' : 'Job agendado com sucesso!');
      setShowScheduleDialog(false);
      setSelectedJob(null);
      setPickedJob(null);
      setIsRescheduling(false);
      loadData();
    } catch (error) {
      console.error('Error scheduling job:', error);
      toast.error('Erro ao agendar job');
    } finally {
      setScheduling(false);
    }
  };

  const getJobsForDate = (date) => {
    return jobs.filter(job => {
      const jobDate = new Date(job.scheduled_date);
      return (
        jobDate.getDate() === date.getDate() &&
        jobDate.getMonth() === date.getMonth() &&
        jobDate.getFullYear() === date.getFullYear() &&
        (selectedBranch === 'all' || job.branch === selectedBranch)
      );
    });
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    return days;
  };

  const formatMonthYear = (date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const getStatusColor = (status, kind) => {
    if (kind === 'visita_tecnica') return 'bg-purple-500';
    const colors = {
      'aguardando': 'bg-yellow-500',
      'pending': 'bg-yellow-500',
      'instalando': 'bg-blue-500',
      'in_progress': 'bg-blue-500',
      'finalizado': 'bg-green-500',
      'completed': 'bg-green-500',
      'pausado': 'bg-orange-500',
      'atrasado': 'bg-red-500',
    };
    return colors[status?.toLowerCase()] || 'bg-gray-500';
  };

  const openDayModal = (date) => {
    if (!date) return;
    setDayModalDate(date);
    setShowDayModal(true);
  };

  const openJobDetail = (job) => {
    setSelectedJobDetail(job);
    setShowJobDetail(true);
  };

  const DayDetailModal = () => {
    if (!dayModalDate) return null;
    const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07..20
    const dayJobs = getJobsForDate(dayModalDate);

    // Sort jobs by scheduled_date time
    const sortedJobs = [...dayJobs].sort((a, b) =>
      new Date(a.scheduled_date) - new Date(b.scheduled_date)
    );

    const getJobTop = (job) => {
      const d = new Date(job.scheduled_date);
      const hour = d.getHours();
      const min = d.getMinutes();
      return ((hour - 7) + min / 60) * 56; // 56px per hour
    };

    const getJobHeight = (job) => {
      if (job.scheduled_time_end) {
        const start = new Date(job.scheduled_date);
        const end = new Date(job.scheduled_time_end);
        const diffH = (end - start) / 3600000;
        return Math.max(32, diffH * 56);
      }
      return 48; // default ~1h visual
    };

    const getInstaller = (job) => {
      const id = (job.assigned_installers || [])[0];
      if (!id) return null;
      return installers.find(i => i.id === id || i.user_id === id);
    };

    const COLORS = [
      'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
      'bg-purple-500', 'bg-cyan-500', 'bg-rose-500',
      'bg-orange-500', 'bg-teal-500',
    ];
    const getColor = (job) => {
      if (job.kind === 'visita_tecnica') return 'bg-purple-500';
      const id = (job.assigned_installers || [])[0];
      if (!id) return 'bg-primary';
      const idx = installers.findIndex(i => i.id === id || i.user_id === id);
      return COLORS[(idx < 0 ? 0 : idx) % COLORS.length];
    };

    const handleScheduleForDay = () => {
      setShowDayModal(false);
      const y = dayModalDate.getFullYear();
      const m = String(dayModalDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayModalDate.getDate()).padStart(2, '0');
      setScheduleDate(`${y}-${m}-${d}`);
      setScheduleTime('08:00');
      setSelectedJob(null);
      setShowScheduleDialog(true);
    };

    const dateLabel = dayModalDate.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    return (
      <Dialog open={showDayModal} onOpenChange={setShowDayModal}>
        <DialogContent className="max-w-lg bg-card border-white/10 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-white capitalize text-base font-semibold">
                  {dateLabel}
                </DialogTitle>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {dayJobs.length === 0 ? 'Nenhum job agendado' : `${dayJobs.length} job${dayJobs.length > 1 ? 's' : ''} agendado${dayJobs.length > 1 ? 's' : ''}`}
                </p>
              </div>
              {(isAdmin || isManager) && (
                <Button size="sm" onClick={handleScheduleForDay}
                        className="bg-primary hover:bg-primary/90 text-white text-xs h-8 gap-1">
                  <Plus className="h-3 w-3" /> Agendar
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Hourly timeline */}
          <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
            <div className="relative flex" style={{ minHeight: `${HOURS.length * 56}px` }}>
              {/* Hour labels */}
              <div className="w-12 flex-shrink-0 relative">
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full flex items-start justify-end pr-2"
                       style={{ top: `${(h - 7) * 56}px`, height: '56px' }}>
                    <span className="text-[10px] text-muted-foreground pt-1">
                      {String(h).padStart(2, '0')}h
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid lines + job area */}
              <div className="flex-1 relative border-l border-white/10">
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-b border-white/5"
                       style={{ top: `${(h - 7) * 56}px`, height: '56px' }} />
                ))}

                {/* Jobs without a time (only date) */}
                {sortedJobs.filter(j => {
                  const d = new Date(j.scheduled_date);
                  return d.getHours() === 0 && d.getMinutes() === 0;
                }).map((job, i) => {
                  const inst = getInstaller(job);
                  return (
                    <div key={job.id}
                         className={`absolute left-1 right-1 rounded px-2 py-1 cursor-pointer hover:brightness-110 ${getColor(job)}`}
                         style={{ top: `${i * 38}px`, minHeight: '32px' }}
                         onClick={() => { setShowDayModal(false); openJobDetail(job); }}>
                      <p className="text-white text-xs font-semibold truncate">#{job.holdprint_data?.code || job.code} {job.title || job.client_name}</p>
                      {inst && <p className="text-white/80 text-[10px] truncate">{inst.full_name || inst.name}</p>}
                    </div>
                  );
                })}

                {/* Jobs with a real time */}
                {sortedJobs.filter(j => {
                  const d = new Date(j.scheduled_date);
                  return d.getHours() !== 0 || d.getMinutes() !== 0;
                }).map(job => {
                  const top = getJobTop(job);
                  const height = getJobHeight(job);
                  const inst = getInstaller(job);
                  const startTime = new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  const endTime = job.scheduled_time_end
                    ? new Date(job.scheduled_time_end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : null;
                  return (
                    <div key={job.id}
                         className={`absolute left-1 right-1 rounded px-2 py-1 cursor-pointer hover:brightness-110 ${getColor(job)}`}
                         style={{ top: `${top}px`, height: `${height}px`, overflow: 'hidden' }}
                         onClick={() => { setShowDayModal(false); openJobDetail(job); }}>
                      <p className="text-white text-[10px] font-bold">
                        {startTime}{endTime ? ` – ${endTime}` : ''}
                      </p>
                      <p className="text-white text-xs font-semibold truncate">
                        #{job.holdprint_data?.code || job.code} {job.title || job.client_name}
                      </p>
                      {inst && height >= 40 && (
                        <p className="text-white/80 text-[10px] truncate">{inst.full_name || inst.name}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const days = getDaysInMonth(currentDate);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-primary" />
            Calendário de Instalações
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {jobs.length} job(s) agendado(s) {isInstaller ? '(seus jobs)' : ''}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* Google Calendar Connection */}
          {(isAdmin || isManager) && (
            <>
              {checkingGoogleStatus ? (
                <Button variant="outline" disabled className="border-white/20">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verificando...
                </Button>
              ) : googleConnected ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <Check className="h-3 w-3" />
                    {googleEmail || 'Google Conectado'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnectGoogleCalendar}
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={connectGoogleCalendar}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Conectar Google
                </Button>
              )}
            </>
          )}
          
          <Button
            onClick={loadData}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filters and Navigation */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Month Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                className="border-white/20 text-white hover:bg-white/5"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-white font-medium min-w-[150px] text-center capitalize">
                {formatMonthYear(currentDate)}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                className="border-white/20 text-white hover:bg-white/5"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
                className="border-white/20 text-white hover:bg-white/5 ml-2"
              >
                Hoje
              </Button>
            </div>
            
            {/* Filters */}
            <div className="flex items-center gap-2">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="SP">São Paulo</SelectItem>
                  <SelectItem value="POA">Porto Alegre</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex bg-white/5 rounded-lg p-0.5">
                <Button
                  variant={viewMode === 'month' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('month')}
                  className={viewMode === 'month' ? 'bg-primary text-white' : 'text-muted-foreground'}
                  title="Mês"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'week' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('week')}
                  className={viewMode === 'week' ? 'bg-primary text-white' : 'text-muted-foreground'}
                  title="Semana"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'installer' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('installer')}
                  className={viewMode === 'installer' ? 'bg-primary text-white' : 'text-muted-foreground'}
                  title="Dia por Instalador"
                >
                  <Users className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'bg-primary text-white' : 'text-muted-foreground'}
                  title="Lista"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Unscheduled Jobs - Drag Source (Admin/Manager only) */}
        {(isAdmin || isManager) && allJobs.length > 0 && (
          <Card className="bg-card border-white/5 lg:col-span-1 h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-400" />
                Jobs Não Agendados ({allJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 max-h-[600px] overflow-y-auto">
              <div className="space-y-2">
                {allJobs.slice(0, visibleJobsCount).map(job => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, job)}
                    className="p-2 bg-white/5 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/10 transition-colors border border-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-primary">
                          #{job.holdprint_data?.code || job.id?.slice(0,6)}
                        </p>
                        <p className="text-xs text-white truncate">{job.title}</p>
                        <p className="text-[10px] text-muted-foreground">{job.branch}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {visibleJobsCount < allJobs.length && (
                  <button
                    onClick={() => setVisibleJobsCount(c => c + 10)}
                    className="w-full text-xs text-primary hover:text-primary/80 text-center py-2 border border-dashed border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    + {allJobs.length - visibleJobsCount} jobs — Carregar mais
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar Grid */}
        <div className={`${(isAdmin || isManager) && allJobs.length > 0 ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          {viewMode === 'week' ? (
            <WeekView
              jobs={jobs}
              currentDate={weekStartDate}
              setCurrentDate={setWeekStartDate}
              installers={installers}
              selectedBranch={selectedBranch}
              onJobClick={(job) => openJobDetail(job)}
              onScheduleSlot={(date, time, installerName) => {
                setSelectedJob(null);
                setScheduleDate(date.toISOString().split('T')[0]);
                setScheduleTime(time);
                const installer = installers.find(i => i.full_name === installerName);
                setSelectedInstaller(installer?.id || '');
                setShowScheduleDialog(true);
              }}
            />
          ) : viewMode === 'installer' ? (
            <InstallerDayView
              jobs={jobs}
              currentDate={dayViewDate}
              setCurrentDate={setDayViewDate}
              installers={installers}
              selectedBranch={selectedBranch}
              onJobClick={(job) => openJobDetail(job)}
              onScheduleSlot={(date, time, installerId) => {
                setSelectedJob(null);
                setScheduleDate(date.toISOString().split('T')[0]);
                setScheduleTime(time);
                setSelectedInstaller(installerId);
                setShowScheduleDialog(true);
              }}
            />
          ) : viewMode === 'month' ? (
            <Card className="bg-card border-white/5">
              <CardContent className="p-4">
                {/* Week days header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekDays.map(day => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map((date, index) => {
                    const dayJobs = date ? getJobsForDate(date) : [];
                    const isDragOver = dragOverDate === date?.toISOString();
                    const dateKey = date ? `day-${date.toISOString()}` : `empty-${index}`;

                    return (
                      <div
                        key={dateKey}
                        onDragOver={(e) => handleDragOver(e, date)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, date)}
                        onClick={() => date && openDayModal(date)}
                        className={`
                          min-h-[100px] p-1 rounded-lg border transition-all
                          ${date ? 'bg-white/5 border-white/5' : 'bg-transparent border-transparent'}
                          ${isToday(date) ? 'ring-2 ring-primary' : ''}
                          ${isDragOver ? 'bg-primary/20 border-primary border-dashed' : ''}
                          ${date ? 'cursor-pointer hover:border-primary/50 hover:bg-white/10' : ''}
                        `}
                      >
                        {date && (
                          <>
                            <div className={`text-xs font-medium mb-1 ${isToday(date) ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                              {date.getDate()}
                            </div>
                            <div className="space-y-1">
                              {dayJobs.slice(0, 3).map(job => (
                                <div
                                  key={job.id}
                                  draggable={!!(isAdmin || isManager) && job.kind !== 'visita_tecnica'}
                                  onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, job); }}
                                  onClick={(e) => { e.stopPropagation(); openJobDetail(job); }}
                                  className={`
                                    text-[10px] p-1 rounded truncate flex items-center gap-1
                                    ${getStatusColor(job.status, job.kind)} text-white
                                    ${job.kind === 'visita_tecnica' ? 'border-l-2 border-l-purple-300' : ''}
                                    hover:opacity-80 transition-opacity
                                    ${(isAdmin || isManager) && job.kind !== 'visita_tecnica' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                  `}
                                  title={`${job.kind === 'visita_tecnica' ? '[VT]' : ''} #${job.holdprint_data?.code || job.id?.slice(0,4)} - ${job.title} - ${job.client_name || ''}`}
                                >
                                  {job.kind === 'visita_tecnica' && (
                                    <span className="inline-block bg-purple-300/30 text-purple-100 text-[9px] font-bold px-1 rounded shrink-0">VT</span>
                                  )}
                                  <span className="truncate">
                                    {job.title?.substring(0, 12) || `#${job.holdprint_data?.code || job.id?.slice(0,4)}`}
                                  </span>
                                </div>
                              ))}
                              {dayJobs.length > 3 && (
                                <div className="text-[10px] text-muted-foreground text-center">
                                  +{dayJobs.length - 3}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            /* List View */
            <Card className="bg-card border-white/5">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {jobs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum job agendado para este período
                    </div>
                  ) : (
                    jobs
                      .filter(job => selectedBranch === 'all' || job.branch === selectedBranch)
                      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
                      .map(job => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-2 h-10 rounded ${getStatusColor(job.status)}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-primary">
                                  #{job.holdprint_data?.code || job.id?.slice(0,6)}
                                </span>
                                <span className="text-xs text-muted-foreground">{job.branch}</span>
                              </div>
                              <p className="text-white font-medium truncate">{job.title}</p>
                              <p className="text-xs text-muted-foreground">{job.client_name}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-white font-medium">
                                {new Date(job.scheduled_date).toLocaleDateString('pt-BR')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            
                            {(isAdmin || isManager) && googleConnected && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => syncJobToGoogleCalendar(job, true)}
                                disabled={syncingJob === job.id}
                                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                              >
                                {syncingJob === job.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    Sync
                                  </>
                                )}
                              </Button>
                            )}
                            
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/jobs/${job.id}`)}
                              className="border-white/20 text-white hover:bg-white/5"
                            >
                              Ver
                            </Button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Legend */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-muted-foreground">Legenda:</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-500" />
              <span className="text-muted-foreground">Aguardando</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span className="text-muted-foreground">Instalando</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-muted-foreground">Finalizado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-500" />
              <span className="text-muted-foreground">Pausado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <span className="text-muted-foreground">Visita Técnica</span>
            </div>
            {(isAdmin || isManager) && (
              <span className="text-muted-foreground ml-auto">
                💡 Arraste jobs da lista para agendar
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={(open) => { setShowScheduleDialog(open); if (!open) { setPickedJob(null); setIsRescheduling(false); } }}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">{isRescheduling ? 'Reagendar Job' : 'Agendar Job'}</DialogTitle>
            <DialogDescription>
              {(selectedJob || pickedJob)?.title || 'Selecione um job abaixo'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Job picker — mostrado quando não há job pré-selecionado (ex: botão Agendar do modal de dia) */}
            {!selectedJob && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Job</label>
                <Select
                  value={pickedJob?.id || 'none'}
                  onValueChange={(val) => setPickedJob(allJobs.find(j => j.id === val) || null)}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Selecione um job não agendado" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10 max-h-60">
                    {allJobs.length === 0 ? (
                      <SelectItem value="none" disabled>Nenhum job disponível</SelectItem>
                    ) : (
                      allJobs.map(j => (
                        <SelectItem key={j.id} value={j.id}>
                          #{j.holdprint_data?.code || j.id?.slice(0, 6)} — {j.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Data</label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Horário</label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Instalador</label>
              <Select value={selectedInstaller || 'none'} onValueChange={(val) => setSelectedInstaller(val === 'none' ? '' : val)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Selecione um instalador" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="none">Nenhum (definir depois)</SelectItem>
                  {installers.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {isRescheduling && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <Mail className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">Email de reagendamento será enviado automaticamente ao instalador</p>
              </div>
            )}
            {googleConnected && (
              <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={sendEmailNotification}
                  onChange={(e) => setSendEmailNotification(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="sendEmail" className="text-sm text-blue-300 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Enviar convite via Google Calendar
                </label>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                onClick={handleScheduleJob}
                disabled={scheduling || !scheduleDate || (!selectedJob && !pickedJob)}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {scheduling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    {isRescheduling ? 'Reagendar' : 'Agendar'}
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

      {/* Day Detail Modal */}
      <DayDetailModal />

      {/* Job Detail Modal */}
      {selectedJobDetail && (() => {
        const job = selectedJobDetail;
        const installerObj = installers.find(i =>
          job.assigned_installers?.includes(i.id) ||
          job.assigned_installers?.includes(i.user_id)
        );
        const scheduledDateStr = job.scheduled_date
          ? new Date(job.scheduled_date).toLocaleDateString('pt-BR', {
              weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
            })
          : 'Não agendado';
        const scheduledTimeStr = job.scheduled_date
          ? new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '';
        const statusLabels = {
          aguardando: 'Aguardando', pending: 'Aguardando',
          agendado: 'Agendado',
          instalando: 'Instalando', in_progress: 'Instalando',
          finalizado: 'Finalizado', completed: 'Finalizado',
          pausado: 'Pausado', atrasado: 'Atrasado',
        };
        const handleOpenReschedule = () => {
          setShowJobDetail(false);
          const d = job.scheduled_date ? new Date(job.scheduled_date) : null;
          setSelectedJob(job);
          // Data e hora ambas em BRT (antes: data UTC + hora local → pulava de dia à noite).
          setScheduleDate(d ? brtDateStr(d) : '');
          setScheduleTime(d ? brtTimeStr(d) : '08:00');
          setSelectedInstaller(job.assigned_installers?.[0] || '');
          setIsRescheduling(!!job.scheduled_date);
          setShowScheduleDialog(true);
        };
        return (
          <Dialog open={showJobDetail} onOpenChange={setShowJobDetail}>
            <DialogContent className="max-w-md bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2 flex-wrap">
                  <span className="text-primary font-mono text-sm shrink-0">
                    #{job.holdprint_data?.code || job.code || job.id?.slice(0,6)}
                  </span>
                  <span className="truncate">{job.title}</span>
                </DialogTitle>
                <DialogDescription>{job.client_name || ''}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Data</p>
                    <p className="text-white capitalize text-xs">{scheduledDateStr}</p>
                    {scheduledTimeStr && <p className="text-primary text-xs mt-0.5">{scheduledTimeStr}</p>}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Status</p>
                    <p className="text-white text-xs">{statusLabels[job.status?.toLowerCase()] || job.status}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{job.branch}</p>
                  </div>
                </div>

                {installerObj && (
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">Instalador</p>
                    <p className="text-white text-sm">{installerObj.full_name}</p>
                  </div>
                )}

                {job.client_address && (
                  <div className="bg-white/5 rounded-lg p-3 flex items-start gap-2">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-muted-foreground text-xs">{job.client_address}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                {(isAdmin || isManager) && job.kind !== 'visita_tecnica' && (
                  <Button
                    onClick={handleOpenReschedule}
                    className="flex-1 bg-primary hover:bg-primary/90 text-white"
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {job.scheduled_date ? 'Reagendar' : 'Agendar'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowJobDetail(false);
                    navigate(job.kind === 'visita_tecnica' ? `/visitas/${job.id}` : `/jobs/${job.id}`);
                  }}
                  className="flex-1 border-white/20 text-white hover:bg-white/5"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Completo
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
};

// Week View Component
const WeekView = ({ jobs, currentDate, setCurrentDate, installers, selectedBranch, onJobClick, onScheduleSlot }) => {
  // Get Monday of current week
  const getWeekMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const monday = getWeekMonday(currentDate);
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    weekDays.push(d);
  }

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Get jobs for a specific day
  const getJobsForDay = (date) => {
    return jobs.filter(job => {
      if (!job.scheduled_date) return false;
      const jobDate = new Date(job.scheduled_date);
      return jobDate.getDate() === date.getDate() &&
             jobDate.getMonth() === date.getMonth() &&
             jobDate.getFullYear() === date.getFullYear() &&
             (selectedBranch === 'all' || job.branch === selectedBranch);
    });
  };

  // Get installer color from ID hash
  const getInstallerColor = (installerId) => {
    if (!installerId) return 'bg-gray-500';
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-lime-500'];
    const hash = installerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getInstallerName = (installerId) => {
    if (!installerId) return 'Sin asignar';
    const installer = installers.find(i => i.id === installerId);
    return installer?.full_name || 'Unknown';
  };

  // Parse time from ISO string
  const getTimeFromDate = (isoString) => {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Calculate pixel position based on time
  const getTimePosition = (isoString) => {
    const d = new Date(isoString);
    const hours = d.getHours();
    const minutes = d.getMinutes();
    return (hours - 7) * 60 + minutes; // 7:00 is start
  };

  // Calculate duration in minutes
  const getDuration = (job) => {
    if (!job.scheduled_time_end) return 120; // default 2h
    const start = new Date(job.scheduled_date);
    const end = new Date(job.scheduled_time_end);
    return (end.getTime() - start.getTime()) / (1000 * 60);
  };

  return (
    <Card className="bg-card border-white/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000))}
              className="border-white/20 text-white hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-white font-medium min-w-[180px] text-center">
              {`${monday.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000))}
              className="border-white/20 text-white hover:bg-white/5"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="border-white/20 text-white hover:bg-white/5 ml-2"
            >
              Hoje
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 overflow-x-auto">
        <div className="min-w-full">
          {/* Days Header */}
          <div className="grid gap-1 mb-4" style={{ gridTemplateColumns: '70px repeat(7, 1fr)' }}>
            <div className="text-xs font-medium text-muted-foreground"></div>
            {weekDays.map((day, idx) => (
              <div
                key={idx}
                className={`text-center p-2 rounded-lg border ${
                  isToday(day)
                    ? 'border-primary bg-primary/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="text-xs font-medium text-white">
                  {day.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0, 3)}
                </div>
                <div className={`text-sm font-bold ${isToday(day) ? 'text-primary' : 'text-muted-foreground'}`}>
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="grid gap-1 relative" style={{ gridTemplateColumns: '70px repeat(7, 1fr)' }}>
            {/* Time labels */}
            <div className="space-y-0">
              {Array.from({ length: 14 }).map((_, idx) => (
                <div key={idx} className="h-[60px] text-xs text-muted-foreground text-center pr-1 font-medium flex items-center justify-end">
                  {String(7 + idx).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => (
              <div
                key={dayIdx}
                className="border-l border-white/10 relative bg-white/[0.02]"
                style={{ minHeight: '840px' }}
              >
                {/* Hour rows for background */}
                {Array.from({ length: 14 }).map((_, hourIdx) => (
                  <div
                    key={hourIdx}
                    className="h-[60px] border-b border-white/5 hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => {
                      onScheduleSlot(day, `${String(7 + hourIdx).padStart(2, '0')}:00`, '');
                    }}
                  />
                ))}

                {/* Job cards */}
                {getJobsForDay(day).map((job) => {
                  const mainInstallerIndex = job.assigned_installers?.length > 0 ? 0 : -1;
                  const mainInstallerId = mainInstallerIndex >= 0 ? job.assigned_installers[mainInstallerIndex] : null;
                  const topPosition = getTimePosition(job.scheduled_date);
                  const duration = getDuration(job);

                  return (
                    <div
                      key={job.id}
                      className={`
                        absolute left-1 right-1 rounded-lg p-1 text-xs cursor-pointer
                        border border-white/20 transition-all hover:z-10 hover:shadow-lg hover:scale-105
                        ${getInstallerColor(mainInstallerId)} bg-opacity-80 text-white
                      `}
                      style={{
                        top: `${topPosition}px`,
                        height: `${Math.max(duration, 40)}px`,
                        overflow: 'hidden'
                      }}
                      onClick={() => onJobClick(job)}
                      title={`${job.title} - ${getTimeFromDate(job.scheduled_date)}`}
                    >
                      <div className="font-bold truncate">
                        #{job.holdprint_data?.code || job.id?.slice(0, 4)}
                      </div>
                      <div className="truncate text-[10px] opacity-90">
                        {job.client_name}
                      </div>
                      {mainInstallerId && (
                        <div className="truncate text-[10px] opacity-75">
                          {getInstallerName(mainInstallerId)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Installer Day View Component
const InstallerDayView = ({ jobs, currentDate, setCurrentDate, installers, selectedBranch, onJobClick, onScheduleSlot }) => {
  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Get jobs for a specific day and installer
  const getJobsForDayAndInstaller = (date, installerId) => {
    return jobs.filter(job => {
      if (!job.scheduled_date) return false;
      const jobDate = new Date(job.scheduled_date);
      const isOnDate = jobDate.getDate() === date.getDate() &&
                      jobDate.getMonth() === date.getMonth() &&
                      jobDate.getFullYear() === date.getFullYear();
      const isBranch = selectedBranch === 'all' || job.branch === selectedBranch;
      const isAssigned = job.assigned_installers?.includes(installerId);

      return isOnDate && isBranch && isAssigned;
    });
  };

  // Get installer color from ID hash
  const getInstallerColor = (installerId) => {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-lime-500'];
    const hash = installerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Parse time from ISO string
  const getTimeFromDate = (isoString) => {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Calculate pixel position based on time
  const getTimePosition = (isoString) => {
    const d = new Date(isoString);
    const hours = d.getHours();
    const minutes = d.getMinutes();
    return (hours - 7) * 60 + minutes;
  };

  // Calculate duration in minutes
  const getDuration = (job) => {
    if (!job.scheduled_time_end) return 120; // default 2h
    const start = new Date(job.scheduled_date);
    const end = new Date(job.scheduled_time_end);
    return (end.getTime() - start.getTime()) / (1000 * 60);
  };

  // Check for conflicts
  const hasConflict = (installerId, job) => {
    const jobStart = new Date(job.scheduled_date).getTime();
    const jobEnd = job.scheduled_time_end
      ? new Date(job.scheduled_time_end).getTime()
      : jobStart + 2 * 60 * 60 * 1000;

    return getJobsForDayAndInstaller(currentDate, installerId).some(j => {
      if (j.id === job.id) return false;
      const otherStart = new Date(j.scheduled_date).getTime();
      const otherEnd = j.scheduled_time_end
        ? new Date(j.scheduled_time_end).getTime()
        : otherStart + 2 * 60 * 60 * 1000;

      return !(jobEnd <= otherStart || jobStart >= otherEnd);
    });
  };

  return (
    <Card className="bg-card border-white/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(new Date(currentDate.getTime() - 24 * 60 * 60 * 1000))}
              className="border-white/20 text-white hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-white font-medium min-w-[150px] text-center">
              {currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(new Date(currentDate.getTime() + 24 * 60 * 60 * 1000))}
              className="border-white/20 text-white hover:bg-white/5"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="border-white/20 text-white hover:bg-white/5 ml-2"
            >
              Hoje
            </Button>
          </div>
          {isToday(currentDate) && (
            <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded">
              Hoje
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 overflow-x-auto">
        <div className="min-w-full">
          {/* Installers Header */}
          <div className="grid gap-1 mb-4" style={{ gridTemplateColumns: '70px repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="text-xs font-medium text-muted-foreground"></div>
            {installers.map((installer) => (
              <div
                key={installer.id}
                className="text-center p-3 rounded-lg border border-white/10 bg-white/5"
              >
                <div className={`w-8 h-8 rounded-full mx-auto mb-1 ${getInstallerColor(installer.id)} flex items-center justify-center text-white text-xs font-bold`}>
                  {installer.full_name?.[0]}
                </div>
                <div className="text-xs font-medium text-white truncate">
                  {installer.full_name}
                </div>
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="grid gap-1 relative" style={{ gridTemplateColumns: '70px repeat(auto-fit, minmax(150px, 1fr))' }}>
            {/* Time labels */}
            <div className="space-y-0">
              {Array.from({ length: 14 }).map((_, idx) => (
                <div key={idx} className="h-[60px] text-xs text-muted-foreground text-center pr-1 font-medium flex items-center justify-end">
                  {String(7 + idx).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Installer columns */}
            {installers.map((installer) => (
              <div
                key={installer.id}
                className="border-l border-white/10 relative bg-white/[0.02]"
                style={{ minHeight: '840px' }}
              >
                {/* Hour rows for background */}
                {Array.from({ length: 14 }).map((_, hourIdx) => (
                  <div
                    key={hourIdx}
                    className="h-[60px] border-b border-white/5 hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => {
                      onScheduleSlot(currentDate, `${String(7 + hourIdx).padStart(2, '0')}:00`, installer.id);
                    }}
                  />
                ))}

                {/* Job cards */}
                {getJobsForDayAndInstaller(currentDate, installer.id).map((job) => {
                  const topPosition = getTimePosition(job.scheduled_date);
                  const duration = getDuration(job);
                  const conflict = hasConflict(installer.id, job);

                  return (
                    <div
                      key={job.id}
                      className={`
                        absolute left-1 right-1 rounded-lg p-1 text-xs cursor-pointer
                        transition-all hover:z-10 hover:shadow-lg hover:scale-105
                        ${getInstallerColor(installer.id)} bg-opacity-80 text-white
                        ${conflict ? 'ring-2 ring-red-500' : 'border border-white/20'}
                      `}
                      style={{
                        top: `${topPosition}px`,
                        height: `${Math.max(duration, 40)}px`,
                        overflow: 'hidden'
                      }}
                      onClick={() => onJobClick(job)}
                      title={`${job.title} - ${getTimeFromDate(job.scheduled_date)}${conflict ? ' (Conflito!)' : ''}`}
                    >
                      <div className="font-bold truncate">
                        #{job.holdprint_data?.code || job.id?.slice(0, 4)}
                      </div>
                      <div className="truncate text-[10px] opacity-90">
                        {job.client_name}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Calendar;
