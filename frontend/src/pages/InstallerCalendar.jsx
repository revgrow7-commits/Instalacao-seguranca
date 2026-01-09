import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  MapPin,
  Clock,
  User,
  Briefcase,
  Users
} from 'lucide-react';
import { toast } from 'sonner';

const InstallerCalendar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // month, week, list
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [currentInstallerId, setCurrentInstallerId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [jobsRes, installersRes] = await Promise.all([
        api.getTeamCalendarJobs(),  // Use the new endpoint that shows all scheduled jobs
        api.getInstallers()
      ]);
      setJobs(jobsRes.data);
      setInstallers(installersRes.data);
      
      // Find current user's installer ID
      const currentInstaller = installersRes.data.find(i => i.user_id === user?.id);
      if (currentInstaller) {
        setCurrentInstallerId(currentInstaller.id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // Check if job is assigned to current user
  const isMyJob = (job) => {
    return currentInstallerId && job.assigned_installers?.includes(currentInstallerId);
  };

  // Get scheduled jobs
  const scheduledJobs = useMemo(() => {
    return jobs.filter(job => {
      const hasSchedule = !!job.scheduled_date;
      const matchesBranch = selectedBranch === 'all' || job.branch === selectedBranch;
      return hasSchedule && matchesBranch;
    });
  }, [jobs, selectedBranch]);

  // Get jobs for a specific date
  const getJobsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return scheduledJobs.filter(job => {
      const jobDate = new Date(job.scheduled_date).toISOString().split('T')[0];
      return jobDate === dateStr;
    });
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  // Get installer name by ID
  const getInstallerName = (installerId) => {
    const installer = installers.find(i => i.id === installerId);
    return installer?.full_name || 'Não atribuído';
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'finalizado':
        return 'bg-green-500';
      case 'in_progress':
      case 'instalando':
        return 'bg-blue-500';
      case 'scheduled':
      case 'agendado':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Get jobs for the week (list view)
  const getWeekJobs = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    return scheduledJobs
      .filter(job => {
        const jobDate = new Date(job.scheduled_date);
        return jobDate >= weekStart && jobDate <= weekEnd;
      })
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white">Calendário da Equipe</h1>
          <p className="text-sm text-muted-foreground">
            {scheduledJobs.length} job(s) agendado(s)
          </p>
        </div>
        <CalendarIcon className="h-8 w-8 text-primary" />
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white h-9">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="POA">POA</SelectItem>
                <SelectItem value="SP">SP</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <Button
                variant={viewMode === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('month')}
                className="h-9"
              >
                Mês
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-9"
              >
                Lista
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {viewMode === 'month' ? (
        <>
          {/* Month Navigation */}
          <Card className="bg-card border-white/5">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={previousMonth}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-white">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                  <Button variant="link" size="sm" onClick={goToToday} className="text-primary p-0 h-auto">
                    Hoje
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={nextMonth}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Calendar Grid */}
          <Card className="bg-card border-white/5">
            <CardContent className="p-2">
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {generateCalendarDays().map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="h-16 md:h-20" />;
                  }

                  const dayJobs = getJobsForDate(date);
                  const isToday = date.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={date.toISOString()}
                      className={`h-16 md:h-20 p-1 rounded-lg border transition-colors ${
                        isToday
                          ? 'border-primary bg-primary/10'
                          : dayJobs.length > 0
                          ? 'border-white/20 bg-white/5'
                          : 'border-white/5'
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-white'}`}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        {dayJobs.slice(0, 2).map(job => {
                          const assignedNames = job.assigned_installers?.map(id => {
                            const installer = installers.find(i => i.id === id);
                            return installer?.full_name?.split(' ')[0] || 'N/A';
                          }).join(', ') || '';
                          
                          const isMine = isMyJob(job);
                          
                          return (
                            <div
                              key={job.id}
                              onClick={() => navigate(`/installer/jobs/${job.id}`)}
                              className={`text-white text-[10px] px-1 rounded cursor-pointer hover:opacity-80 ${
                                isMine 
                                  ? 'bg-primary ring-1 ring-primary/50' 
                                  : getStatusColor(job.status) + ' opacity-70'
                              }`}
                              title={`${job.title} - ${assignedNames}${isMine ? ' (Seu job)' : ''}`}
                            >
                              <div className="truncate font-medium">
                                {isMine && <span className="mr-1">★</span>}
                                {job.title?.substring(0, isMine ? 10 : 12)}...
                              </div>
                              {assignedNames && (
                                <div className="truncate opacity-80 text-[8px]">{assignedNames}</div>
                              )}
                            </div>
                          );
                        })}
                        {dayJobs.length > 2 && (
                          <div className="text-[10px] text-muted-foreground text-center">
                            +{dayJobs.length - 2} mais
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-500"></div>
              <span className="text-muted-foreground">Agendado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500"></div>
              <span className="text-muted-foreground">Em Andamento</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span className="text-muted-foreground">Concluído</span>
            </div>
          </div>
        </>
      ) : (
        /* List View */
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Próximos Jobs da Equipe
          </h3>
          
          {scheduledJobs.length === 0 ? (
            <Card className="bg-card border-white/5">
              <CardContent className="p-6 text-center">
                <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum job agendado</p>
              </CardContent>
            </Card>
          ) : (
            scheduledJobs
              .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
              .slice(0, 20)
              .map(job => {
                const scheduledDate = new Date(job.scheduled_date);
                const isToday = scheduledDate.toDateString() === new Date().toDateString();
                const isPast = scheduledDate < new Date() && !isToday;

                return (
                  <Card 
                    key={job.id} 
                    className={`bg-card border-white/5 cursor-pointer hover:border-primary/50 transition-colors ${
                      isPast ? 'opacity-60' : ''
                    }`}
                    onClick={() => navigate(`/installer/jobs/${job.id}`)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${getStatusColor(job.status)}`}></span>
                            <span className="text-xs text-muted-foreground font-mono">
                              #{job.holdprint_data?.code || job.id?.slice(0, 6)}
                            </span>
                            {isToday && (
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                HOJE
                              </span>
                            )}
                          </div>
                          
                          <h4 className="text-sm font-medium text-white truncate mb-2">
                            {job.title}
                          </h4>
                          
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {scheduledDate.toLocaleDateString('pt-BR')} às {scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            
                            {job.holdprint_data?.customerName && (
                              <div className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                <span className="truncate">{job.holdprint_data.customerName}</span>
                              </div>
                            )}
                            
                            {job.assigned_installers?.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>
                                  {job.assigned_installers.map(id => getInstallerName(id)).join(', ')}
                                </span>
                              </div>
                            )}
                            
                            {job.holdprint_data?.city && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>{job.holdprint_data.city}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded ${
                            job.branch === 'POA' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                          }`}>
                            {job.branch || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </div>
      )}
    </div>
  );
};

export default InstallerCalendar;
