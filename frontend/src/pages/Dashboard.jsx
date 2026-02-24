import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { 
  Briefcase, CheckCircle, Clock, Users, TrendingUp, MapPin, Image, Eye, Trash2, 
  Bell, AlertTriangle, PauseCircle, PlayCircle, Navigation, Timer, AlertCircle, MessageCircle,
  ChevronRight, ExternalLink, X
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';
import GamificationHighlight from '../components/GamificationHighlight';

const Dashboard = () => {
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [lateCheckins, setLateCheckins] = useState([]);
  const [pausedCheckins, setPausedCheckins] = useState([]);
  const [pendingCheckins, setPendingCheckins] = useState([]);
  const [locationAlerts, setLocationAlerts] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  
  // Drill-down modal states
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showInstallersModal, setShowInstallersModal] = useState(false);
  const [modalData, setModalData] = useState({ title: '', items: [] });

  // Format phone number for WhatsApp (remove non-digits and add country code)
  const formatPhoneForWhatsApp = (phone) => {
    if (!phone) return null;
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Add Brazil country code if not present
    if (digits.startsWith('55')) return digits;
    if (digits.length === 11 || digits.length === 10) return `55${digits}`;
    return digits;
  };

  // Get installer info by installer_id (from checkins) or user_id
  const getInstallerById = (installerId) => {
    // First try to find by installer id
    let installer = installers.find(i => i.id === installerId);
    // If not found, try by user_id
    if (!installer) {
      installer = installers.find(i => i.user_id === installerId);
    }
    return installer;
  };

  // Open WhatsApp with pre-filled message
  const openWhatsApp = (phone, messageType, jobTitle, installerName) => {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    if (!formattedPhone) {
      toast.error('Telefone não cadastrado para este instalador');
      return;
    }

    let message = '';
    const appUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    
    switch (messageType) {
      case 'paused':
        message = `Olá ${installerName}! 👋\n\nVerificamos que seu check-in no job "${jobTitle}" está pausado.\n\nPor favor, atualize o status ou retome a instalação.\n\nAcesse: ${appUrl}`;
        break;
      case 'late':
        message = `Olá ${installerName}! 👋\n\nSeu checkout no job "${jobTitle}" está em atraso (mais de 4 horas).\n\nPor favor, finalize o checkout ou entre em contato conosco.\n\nAcesse: ${appUrl}`;
        break;
      case 'pending':
        message = `Olá ${installerName}! 👋\n\nO job "${jobTitle}" está agendado mas ainda não foi iniciado.\n\nPor favor, inicie o check-in assim que possível.\n\nAcesse: ${appUrl}`;
        break;
      case 'location':
        message = `Olá ${installerName}! 👋\n\nVerificamos uma divergência de localização no job "${jobTitle}".\n\nPor favor, verifique se está no local correto da instalação.\n\nAcesse: ${appUrl}`;
        break;
      default:
        message = `Olá ${installerName}! 👋\n\nPrecisamos falar sobre o job "${jobTitle}".\n\nAcesse: ${appUrl}`;
    }

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  useEffect(() => {
    // Redirect installers to their specific dashboard
    if (isInstaller) {
      navigate('/installer/dashboard');
      return;
    }
    loadDashboardData();
  }, [isInstaller, navigate]);

  const loadDashboardData = async () => {
    try {
      // Load jobs
      const jobsRes = await api.getJobs();
      setJobs(jobsRes.data);

      // Load metrics if admin or manager
      if (isAdmin || isManager) {
        const metricsRes = await api.getMetrics();
        setMetrics(metricsRes.data);
        
        // Load installers for WhatsApp contacts
        try {
          const installersRes = await api.getInstallers();
          setInstallers(installersRes.data);
        } catch (e) {
          console.log('Could not load installers:', e);
        }
        
        // Load all item checkins and filter for late/paused
        const checkinsRes = await api.getAllItemCheckins();
        const now = new Date();
        
        // Filter paused check-ins (status = 'paused')
        const paused = checkinsRes.data.filter(c => c.status === 'paused');
        setPausedCheckins(paused);
        
        // Filter late check-ins (in_progress for more than 4 hours)
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const late = checkinsRes.data.filter(c => {
          if (c.status !== 'in_progress') return false;
          const checkinTime = new Date(c.checkin_at);
          return checkinTime < fourHoursAgo;
        });
        setLateCheckins(late);
        
        // Load pending check-ins (scheduled but not started)
        try {
          const pendingRes = await api.getPendingCheckins();
          setPendingCheckins(pendingRes.data.pending_checkins || []);
        } catch (e) {
          console.log('Could not load pending checkins:', e);
        }
        
        // Load location alerts
        try {
          const locationRes = await api.getLocationAlerts();
          setLocationAlerts(locationRes.data || []);
        } catch (e) {
          console.log('Could not load location alerts:', e);
        }
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSendLateAlerts = async () => {
    setSendingAlerts(true);
    try {
      const response = await api.sendLateAlerts();
      toast.success(response.data.message);
    } catch (error) {
      toast.error('Erro ao enviar alertas');
    } finally {
      setSendingAlerts(false);
    }
  };

  const handleDeleteCheckin = async (checkinId) => {
    if (!window.confirm('Tem certeza que deseja excluir este check-in? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      setDeletingId(checkinId);
      await api.deleteCheckin(checkinId);
      toast.success('Check-in excluído com sucesso');
      // Reload data
      loadDashboardData();
    } catch (error) {
      toast.error('Erro ao excluir check-in');
    } finally {
      setDeletingId(null);
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

  // Drill-down handlers
  const handleDrillDownJobs = () => {
    // Navigate to jobs page
    navigate('/jobs');
  };

  const handleDrillDownCompleted = () => {
    // Get completed jobs
    const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'finalizado');
    setModalData({
      title: 'Jobs Concluídos',
      type: 'completed',
      items: completedJobs.slice(0, 20)
    });
    setShowCompletedModal(true);
  };

  const handleDrillDownTime = () => {
    // Get jobs with time data sorted by duration
    const jobsWithTime = jobs
      .filter(j => j.total_duration_minutes && j.total_duration_minutes > 0)
      .sort((a, b) => (b.total_duration_minutes || 0) - (a.total_duration_minutes || 0));
    setModalData({
      title: 'Tempo por Job',
      type: 'time',
      items: jobsWithTime.slice(0, 20)
    });
    setShowTimeModal(true);
  };

  const handleDrillDownInstallers = () => {
    // Navigate to users page with installer filter
    navigate('/users');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

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

      {/* Metrics Cards - Admin & Manager only */}
      {(isAdmin || isManager) && metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-total-jobs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Total de Jobs</CardTitle>
              <Briefcase className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.total_jobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.pending_jobs} pendentes
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-completed-jobs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Concluídos</CardTitle>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.completed_jobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {((metrics.completed_jobs / metrics.total_jobs) * 100).toFixed(0)}% do total
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-avg-duration">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Tempo Médio</CardTitle>
              <Clock className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.avg_duration_minutes}min</div>
              <p className="text-xs text-muted-foreground mt-1">por job</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5 hover:border-primary/50 transition-colors" data-testid="metric-installers">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Instaladores</CardTitle>
              <Users className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{metrics.total_installers}</div>
              <p className="text-xs text-muted-foreground mt-1">ativos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =============== INFOGRAPHIC ALERTS CENTER =============== */}
      {(isAdmin || isManager) && (
        <div className="space-y-6">
          {/* Alert Summary Cards - Infographic Style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Check-ins Não Iniciados */}
            <div 
              className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                pendingCheckins.length > 0 
                  ? 'bg-gradient-to-br from-red-500/20 to-red-600/10 border-2 border-red-500/50' 
                  : 'bg-white/5 border border-white/10 opacity-50'
              }`}
              onClick={() => pendingCheckins.length > 0 && document.getElementById('pending-alerts')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="absolute -right-4 -top-4 opacity-10">
                <Timer className="h-24 w-24 text-red-500" />
              </div>
              <div className="relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                  pendingCheckins.length > 0 ? 'bg-red-500/30' : 'bg-white/10'
                }`}>
                  <Timer className={`h-7 w-7 ${pendingCheckins.length > 0 ? 'text-red-400' : 'text-gray-500'}`} />
                </div>
                <p className={`text-3xl font-bold mb-1 ${pendingCheckins.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {pendingCheckins.length}
                </p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Não Iniciados
                </p>
              </div>
              {pendingCheckins.length > 0 && (
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>

            {/* Check-ins Prolongados */}
            <div 
              className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                lateCheckins.length > 0 
                  ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-2 border-yellow-500/50' 
                  : 'bg-white/5 border border-white/10 opacity-50'
              }`}
              onClick={() => lateCheckins.length > 0 && document.getElementById('late-alerts')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="absolute -right-4 -top-4 opacity-10">
                <Clock className="h-24 w-24 text-yellow-500" />
              </div>
              <div className="relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                  lateCheckins.length > 0 ? 'bg-yellow-500/30' : 'bg-white/10'
                }`}>
                  <Clock className={`h-7 w-7 ${lateCheckins.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`} />
                </div>
                <p className={`text-3xl font-bold mb-1 ${lateCheckins.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {lateCheckins.length}
                </p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Prolongados
                </p>
              </div>
              {lateCheckins.length > 0 && (
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
              )}
            </div>

            {/* Check-ins Pausados */}
            <div 
              className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                pausedCheckins.length > 0 
                  ? 'bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-2 border-orange-500/50' 
                  : 'bg-white/5 border border-white/10 opacity-50'
              }`}
              onClick={() => pausedCheckins.length > 0 && document.getElementById('paused-alerts')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="absolute -right-4 -top-4 opacity-10">
                <PauseCircle className="h-24 w-24 text-orange-500" />
              </div>
              <div className="relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                  pausedCheckins.length > 0 ? 'bg-orange-500/30' : 'bg-white/10'
                }`}>
                  <PauseCircle className={`h-7 w-7 ${pausedCheckins.length > 0 ? 'text-orange-400' : 'text-gray-500'}`} />
                </div>
                <p className={`text-3xl font-bold mb-1 ${pausedCheckins.length > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                  {pausedCheckins.length}
                </p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Pausados
                </p>
              </div>
              {pausedCheckins.length > 0 && (
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
              )}
            </div>

            {/* Alertas de Localização */}
            <div 
              className={`relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all hover:scale-105 ${
                locationAlerts.length > 0 
                  ? 'bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-2 border-purple-500/50' 
                  : 'bg-white/5 border border-white/10 opacity-50'
              }`}
              onClick={() => locationAlerts.length > 0 && document.getElementById('location-alerts')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <div className="absolute -right-4 -top-4 opacity-10">
                <Navigation className="h-24 w-24 text-purple-500" />
              </div>
              <div className="relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                  locationAlerts.length > 0 ? 'bg-purple-500/30' : 'bg-white/10'
                }`}>
                  <Navigation className={`h-7 w-7 ${locationAlerts.length > 0 ? 'text-purple-400' : 'text-gray-500'}`} />
                </div>
                <p className={`text-3xl font-bold mb-1 ${locationAlerts.length > 0 ? 'text-purple-400' : 'text-gray-500'}`}>
                  {locationAlerts.length}
                </p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Localização
                </p>
              </div>
              {locationAlerts.length > 0 && (
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
              )}
            </div>
          </div>

          {/* Detailed Alerts Section */}
          {(pendingCheckins.length > 0 || lateCheckins.length > 0 || pausedCheckins.length > 0 || locationAlerts.length > 0) && (
            <Card className="bg-card/50 backdrop-blur border-white/10">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    Detalhes dos Alertas
                  </CardTitle>
                  {pendingCheckins.length > 0 && (
                    <Button
                      size="sm"
                      onClick={handleSendLateAlerts}
                      disabled={sendingAlerts}
                      className="bg-red-500 hover:bg-red-600 text-white"
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      {sendingAlerts ? 'Enviando...' : 'Notificar'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Check-ins Não Iniciados */}
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
                        const installer = job.assigned_installers?.length > 0 
                          ? installers.find(i => i.id === job.assigned_installers[0])
                          : null;
                        return (
                          <div 
                            key={job.id}
                            className="flex items-center justify-between p-2 bg-red-500/5 border border-red-500/20 rounded-lg"
                          >
                            <div 
                              className="flex-1 cursor-pointer hover:text-red-300"
                              onClick={() => navigate(`/jobs/${job.id}`)}
                            >
                              <span className="text-sm text-white truncate">{job.title}</span>
                              {installer && (
                                <span className="text-xs text-muted-foreground ml-2">({installer.full_name})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-bold">
                                {job.minutes_late}min
                              </span>
                              {installer?.phone && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWhatsApp(installer.phone, 'pending', job.title, installer.full_name);
                                  }}
                                  title="Enviar WhatsApp"
                                >
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

                {/* Check-ins Prolongados */}
                {lateCheckins.length > 0 && (
                  <div id="late-alerts" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-yellow-400" />
                      </div>
                      <span className="text-sm font-semibold text-yellow-400">Prolongados (+4h)</span>
                    </div>
                    <div className="grid gap-2 pl-10">
                      {lateCheckins.slice(0, 5).map((checkin) => {
                        const job = jobs.find(j => j.id === checkin.job_id);
                        const installer = getInstallerById(checkin.installer_id);
                        const hours = Math.floor((new Date() - new Date(checkin.checkin_at)) / (1000 * 60 * 60));
                        return (
                          <div 
                            key={checkin.id}
                            className="flex items-center justify-between p-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg"
                          >
                            <div 
                              className="flex-1 cursor-pointer hover:text-yellow-300"
                              onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                            >
                              <span className="text-sm text-white truncate">{job?.title || 'Job'}</span>
                              {installer && (
                                <span className="text-xs text-muted-foreground ml-2">({installer.full_name})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">
                                {hours}h+
                              </span>
                              {installer?.phone && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWhatsApp(installer.phone, 'late', job?.title || 'Job', installer.full_name);
                                  }}
                                  title="Enviar WhatsApp"
                                >
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

                {/* Check-ins Pausados */}
                {pausedCheckins.length > 0 && (
                  <div id="paused-alerts" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <PauseCircle className="h-4 w-4 text-orange-400" />
                      </div>
                      <span className="text-sm font-semibold text-orange-400">Pausados</span>
                    </div>
                    <div className="grid gap-2 pl-10">
                      {pausedCheckins.slice(0, 5).map((checkin) => {
                        const job = jobs.find(j => j.id === checkin.job_id);
                        const installer = getInstallerById(checkin.installer_id);
                        return (
                          <div 
                            key={checkin.id}
                            className="flex items-center justify-between p-2 bg-orange-500/5 border border-orange-500/20 rounded-lg"
                          >
                            <div 
                              className="flex-1 cursor-pointer hover:text-orange-300"
                              onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                            >
                              <span className="text-sm text-white truncate">{job?.title || 'Job'}</span>
                              {installer && (
                                <span className="text-xs text-muted-foreground ml-2">({installer.full_name})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs font-bold">
                                ⏸ Pausa
                              </span>
                              {installer?.phone && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWhatsApp(installer.phone, 'paused', job?.title || 'Job', installer.full_name);
                                  }}
                                  title="Enviar WhatsApp"
                                >
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

                {/* Alertas de Localização */}
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
                        const installer = installers.find(i => i.full_name === alert.installer_name);
                        return (
                          <div 
                            key={alert.id}
                            className="flex items-center justify-between p-2 bg-purple-500/5 border border-purple-500/20 rounded-lg"
                          >
                            <div className="truncate flex-1">
                              <span className="text-sm text-white">{alert.job_title}</span>
                              <span className="text-xs text-muted-foreground ml-2">({alert.installer_name})</span>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-bold">
                                {alert.distance_meters?.toFixed(0)}m
                              </span>
                              {installer?.phone && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 hover:bg-green-500/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWhatsApp(installer.phone, 'location', alert.job_title, installer.full_name);
                                  }}
                                  title="Enviar WhatsApp"
                                >
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

          {/* All Clear Message */}
          {pendingCheckins.length === 0 && lateCheckins.length === 0 && pausedCheckins.length === 0 && locationAlerts.length === 0 && (
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

      {/* =============== JOBS RECENTES E GAMIFICAÇÃO =============== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jobs Recentes - 2 colunas */}
        <div className="lg:col-span-2 space-y-4">
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

        {jobs.length === 0 ? (
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
                      <CardTitle className="text-lg text-white line-clamp-1">
                        {job.title}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{job.client_name}</p>
                    </div>
                    <span
                      className={
                        `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
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
                       job.status === 'atrasado' ? 'ATRASADO' : 'AGUARDANDO'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Filial: {job.branch}</span>
                    {job.assigned_installers?.length > 0 && (
                      <span className="text-primary font-medium">
                        {job.assigned_installers.length} instalador(es)
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>

        {/* Gamification Highlight - 1 coluna */}
        {(isAdmin || isManager) && (
          <div className="lg:col-span-1">
            <GamificationHighlight />
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;