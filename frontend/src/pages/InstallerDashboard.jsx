import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MapPin, Calendar, Clock, PlayCircle, StopCircle, CheckCircle2, Coins, TrendingUp, Gift } from 'lucide-react';
import { toast } from 'sonner';
import NotificationPermissionModal from '../components/NotificationPermissionModal';
import GamificationWidget from '../components/GamificationWidget';
import WeeklyLeaderboard from '../components/WeeklyLeaderboard';

const InstallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [gamificationBalance, setGamificationBalance] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);

  useEffect(() => {
    loadData();
    loadGamificationData();
    registerDailyEngagement();
    // Show notification modal after a short delay
    const timer = setTimeout(() => {
      const hasAskedForNotifications = localStorage.getItem('notification_asked');
      if (!hasAskedForNotifications) {
        setShowNotificationModal(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleNotificationComplete = (accepted) => {
    localStorage.setItem('notification_asked', 'true');
    setShowNotificationModal(false);
  };

  const loadData = async () => {
    try {
      const [jobsRes, checkinsRes] = await Promise.all([
        api.getJobs(),
        api.getCheckins()
      ]);
      setJobs(jobsRes.data);
      setCheckins(checkinsRes.data);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const loadGamificationData = async () => {
    try {
      const [balanceRes, transactionsRes] = await Promise.all([
        api.getGamificationBalance(),
        api.getGamificationTransactions(5)
      ]);
      setGamificationBalance(balanceRes.data);
      setRecentTransactions(transactionsRes.data);
    } catch (error) {
      console.log('Gamification data not available yet');
    }
  };

  const registerDailyEngagement = async () => {
    try {
      const today = new Date().toDateString();
      const lastEngagement = localStorage.getItem('daily_engagement_date');
      
      if (lastEngagement !== today) {
        const response = await api.registerDailyEngagement();
        if (response.data.success && !response.data.already_claimed) {
          toast.success(`🎉 ${response.data.message}`, { duration: 5000 });
          localStorage.setItem('daily_engagement_date', today);
          loadGamificationData(); // Refresh balance
        }
      }
    } catch (error) {
      console.log('Daily engagement already claimed or error');
    }
  };


  const getJobCheckin = (jobId) => {
    return checkins.find(c => c.job_id === jobId && c.status === 'in_progress');
  };

  const handleOpenJob = (jobId) => {
    navigate(`/installer/job/${jobId}`);
  };

  const getJobStatus = (job) => {
    const checkin = getJobCheckin(job.id);
    if (checkin) {
      return 'in_progress';
    }
    return job.status;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-500 border border-green-500/20';
      case 'in_progress':
        return 'bg-blue-500/20 text-blue-500 border border-blue-500/20';
      case 'pending':
      case 'aguardando':
        return 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20';
      default:
        return 'bg-gray-500/20 text-gray-500 border border-gray-500/20';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Concluído';
      case 'in_progress':
        return 'Em Andamento';
      case 'pending':
      case 'aguardando':
        return 'Pendente';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  // Filtrar jobs - incluir 'aguardando' como pendente
  const pendingJobs = jobs.filter(j => {
    const status = getJobStatus(j);
    return status === 'pending' || status === 'aguardando';
  });
  const activeJobs = jobs.filter(j => getJobStatus(j) === 'in_progress');
  const completedJobs = jobs.filter(j => j.status === 'completed');

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-24 md:pb-8" data-testid="installer-dashboard">
      {/* Notification Permission Modal */}
      <NotificationPermissionModal 
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        onComplete={handleNotificationComplete}
      />
      
      {/* Header with Coin Balance */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-heading font-bold text-white tracking-tight">
            Olá, {user?.name}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Seus Jobs de Instalação
          </p>
        </div>
        {gamificationBalance && (
          <Button
            onClick={() => navigate('/loja-faixa-preta')}
            className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold"
          >
            <Coins className="h-4 w-4 mr-2" />
            {gamificationBalance.total_coins?.toLocaleString() || 0} moedas
            <span className="ml-2">{gamificationBalance.level_info?.icon || '🥉'}</span>
          </Button>
        )}
      </div>

      {/* Stats - Primeiro */}
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300">Pendentes</CardTitle>
            <Clock className="h-4 w-4 md:h-5 md:w-5 text-yellow-500" />
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            <div className="text-2xl md:text-3xl font-bold text-white">{pendingJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300">Em Andamento</CardTitle>
            <PlayCircle className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            <div className="text-2xl md:text-3xl font-bold text-white">{activeJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium text-gray-300">Concluídos</CardTitle>
            <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            <div className="text-2xl md:text-3xl font-bold text-white">{completedJobs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs - Segundo */}
      {activeJobs.length > 0 && (
        <div>
          <h2 className="text-lg md:text-2xl font-heading font-bold text-white mb-3 md:mb-4">Jobs em Andamento</h2>
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
            {activeJobs.map((job) => {
              const checkin = getJobCheckin(job.id);
              const startTime = checkin ? new Date(checkin.checkin_at) : null;
              const elapsedMinutes = startTime ? Math.floor((new Date() - startTime) / 60000) : 0;

              return (
                <Card
                  key={job.id}
                  className="bg-card border-blue-500/30 neon-glow"
                  data-testid={`active-job-${job.id}`}
                >
                  <CardHeader className="p-4 md:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg text-white line-clamp-2">{job.title}</CardTitle>
                        <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{job.client_name}</p>
                      </div>
                      <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ${getStatusColor('in_progress')}`}>
                        Em Andamento
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 md:p-6 md:pt-0 space-y-3 md:space-y-4">
                    {job.client_address && (
                      <div className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{job.client_address}</span>
                      </div>
                    )}

                    {startTime && (
                      <div className="flex items-center gap-2 text-xs md:text-sm">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <span className="text-white font-medium">
                          Tempo: {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}min
                        </span>
                      </div>
                    )}

                    <Button
                      onClick={() => handleOpenJob(job.id)}
                      className="w-full bg-green-500 hover:bg-green-600 text-white h-11 md:h-10"
                      data-testid={`finish-job-${job.id}`}
                    >
                      <StopCircle className="mr-2 h-5 w-5" />
                      Abrir Job
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Jobs - Terceiro */}
      <div>
        <h2 className="text-lg md:text-2xl font-heading font-bold text-white mb-3 md:mb-4">Jobs Pendentes</h2>
        {pendingJobs.length === 0 ? (
          <Card className="bg-card border-white/5">
            <CardContent className="py-8 md:py-12 text-center">
              <CheckCircle2 className="h-10 w-10 md:h-12 md:w-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
              <p className="text-sm md:text-base text-muted-foreground">Nenhum job pendente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
            {pendingJobs.map((job) => (
              <Card
                key={job.id}
                className="bg-card border-white/5 hover:border-primary/50 transition-colors"
                data-testid={`pending-job-${job.id}`}
              >
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base md:text-lg text-white line-clamp-2">{job.title}</CardTitle>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{job.client_name}</p>
                    </div>
                    <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ${getStatusColor('pending')}`}>
                      Pendente
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 md:p-6 md:pt-0 space-y-3 md:space-y-4">
                  {job.client_address && (
                    <div className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{job.client_address}</span>
                    </div>
                  )}

                  {job.scheduled_date && (
                    <div className="flex items-center gap-2 text-xs md:text-sm text-primary">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(job.scheduled_date).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}

                  <Button
                    onClick={() => handleOpenJob(job.id)}
                    className="w-full bg-primary hover:bg-primary/90 neon-glow h-11 md:h-10"
                    data-testid={`start-job-${job.id}`}
                  >
                    <PlayCircle className="mr-2 h-5 w-5" />
                    Abrir Job
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Jobs */}
      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-lg md:text-2xl font-heading font-bold text-white mb-3 md:mb-4">Jobs Concluídos Recentes</h2>
          <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {completedJobs.slice(0, 6).map((job) => (
              <Card
                key={job.id}
                className="bg-card border-white/5"
              >
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm md:text-base text-white line-clamp-1">{job.title}</CardTitle>
                      <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{job.client_name}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Gamification Widget - Movido para baixo */}
      {gamificationBalance && (
        <GamificationWidget 
          balance={gamificationBalance} 
          levelInfo={gamificationBalance.level_info} 
        />
      )}

      {/* Recent Earnings */}
      {recentTransactions.length > 0 && (
        <Card className="bg-card border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base md:text-lg text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Ganhos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentTransactions.slice(0, 3).map((transaction) => (
                <div 
                  key={transaction.id}
                  className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      transaction.amount > 0 ? 'bg-green-500/20' : 'bg-red-500/20'
                    }`}>
                      <Coins className={`h-4 w-4 ${transaction.amount > 0 ? 'text-green-400' : 'text-red-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm text-white">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(transaction.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <span className={`font-bold ${transaction.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Leaderboard - No final */}
      <WeeklyLeaderboard />
    </div>
  );
};

export default InstallerDashboard;