import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
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
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [selectedInstaller, setSelectedInstaller] = useState('');
  const [sendEmailNotification, setSendEmailNotification] = useState(true);
  const [scheduling, setScheduling] = useState(false);

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
      const [jobsRes, installersRes] = await Promise.all([
        api.getJobs(),
        isAdmin || isManager ? api.getInstallers() : Promise.resolve({ data: [] })
      ]);
      
      // For installers, filter only their assigned jobs or all scheduled jobs
      let filteredJobs = jobsRes.data;
      if (isInstaller) {
        filteredJobs = jobsRes.data.filter(job => 
          job.scheduled_date && 
          (job.assigned_installers?.includes(user?.id) || !job.assigned_installers?.length)
        );
      }
      
      setJobs(filteredJobs.filter(job => job.scheduled_date));
      setAllJobs(jobsRes.data.filter(job => !job.scheduled_date && job.status !== 'finalizado' && job.status !== 'completed'));
      setInstallers(installersRes.data);
    } catch (error) {
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
    try {
      await api.disconnectGoogle();
      setGoogleConnected(false);
      setGoogleEmail(null);
      toast.success('Google Calendar desconectado');
    } catch (error) {
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
      const endDate = new Date(scheduledDate.getTime() + 4 * 60 * 60 * 1000);

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
    
    setDragOverDate(null);
    
    // Open schedule dialog with pre-filled date
    setSelectedJob(draggedJob);
    setScheduleDate(date.toISOString().split('T')[0]);
    setScheduleTime('08:00');
    setShowScheduleDialog(true);
    setDraggedJob(null);
  };

  const handleScheduleJob = async () => {
    if (!selectedJob || !scheduleDate) return;
    
    setScheduling(true);
    try {
      const dateTime = new Date(`${scheduleDate}T${scheduleTime}`);
      
      const updateData = {
        scheduled_date: dateTime.toISOString(),
        assigned_installers: selectedInstaller ? [selectedInstaller] : []
      };
      
      await api.updateJob(selectedJob.id, updateData);
      
      // Sync to Google Calendar if connected and email notification is enabled
      if (googleConnected && sendEmailNotification) {
        await syncJobToGoogleCalendar({
          ...selectedJob,
          scheduled_date: dateTime.toISOString(),
          assigned_installers: updateData.assigned_installers
        }, true);
      }
      
      toast.success('Job agendado com sucesso!');
      setShowScheduleDialog(false);
      setSelectedJob(null);
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

  const getStatusColor = (status) => {
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
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'bg-primary text-white' : 'text-muted-foreground'}
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
            <CardContent className="p-2 max-h-[400px] overflow-y-auto">
              <div className="space-y-2">
                {allJobs.slice(0, 10).map(job => (
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
                {allJobs.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    +{allJobs.length - 10} jobs
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar Grid */}
        <div className={`${(isAdmin || isManager) && allJobs.length > 0 ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
          {viewMode === 'month' ? (
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
                    
                    return (
                      <div
                        key={index}
                        onDragOver={(e) => handleDragOver(e, date)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, date)}
                        className={`
                          min-h-[100px] p-1 rounded-lg border transition-all
                          ${date ? 'bg-white/5 border-white/5' : 'bg-transparent border-transparent'}
                          ${isToday(date) ? 'ring-2 ring-primary' : ''}
                          ${isDragOver ? 'bg-primary/20 border-primary border-dashed' : ''}
                          ${(isAdmin || isManager) && date ? 'cursor-pointer hover:border-primary/50' : ''}
                        `}
                      >
                        {date && (
                          <>
                            <div className={`text-xs font-medium mb-1 ${isToday(date) ? 'text-primary' : 'text-muted-foreground'}`}>
                              {date.getDate()}
                            </div>
                            <div className="space-y-1">
                              {dayJobs.slice(0, 3).map(job => (
                                <div
                                  key={job.id}
                                  onClick={() => navigate(`/jobs/${job.id}`)}
                                  className={`
                                    text-[10px] p-1 rounded truncate cursor-pointer
                                    ${getStatusColor(job.status)} text-white
                                    hover:opacity-80 transition-opacity
                                  `}
                                  title={`${job.title} - ${job.client_name}`}
                                >
                                  #{job.holdprint_data?.code || job.id?.slice(0,4)}
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
            {(isAdmin || isManager) && (
              <span className="text-muted-foreground ml-auto">
                💡 Arraste jobs da lista para agendar
              </span>
            )}
          </div>
        </CardContent>
      </Card>

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
              <Select value={selectedInstaller} onValueChange={setSelectedInstaller}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Selecione um instalador" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="">Nenhum (definir depois)</SelectItem>
                  {installers.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
                disabled={scheduling || !scheduleDate}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {scheduling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    Agendar
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
    </div>
  );
};

export default Calendar;
