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
  Users,
  X,
  Star,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const InstallerCalendar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // month, list
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [currentInstallerId, setCurrentInstallerId] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null); // For mobile day detail

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [jobsRes, installersRes] = await Promise.all([
        api.getTeamCalendarJobs(),
        api.getInstallers()
      ]);
      setJobs(jobsRes.data);
      setInstallers(installersRes.data);
      
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

  const isMyJob = (job) => {
    return currentInstallerId && job.assigned_installers?.includes(currentInstallerId);
  };

  const scheduledJobs = useMemo(() => {
    return jobs.filter(job => {
      const hasSchedule = !!job.scheduled_date;
      const matchesBranch = selectedBranch === 'all' || job.branch === selectedBranch;
      return hasSchedule && matchesBranch;
    });
  }, [jobs, selectedBranch]);

  const getJobsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return scheduledJobs.filter(job => {
      const jobDate = new Date(job.scheduled_date).toISOString().split('T')[0];
      return jobDate === dateStr;
    });
  };

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const getInstallerName = (installerId) => {
    const installer = installers.find(i => i.id === installerId);
    return installer?.full_name || 'Não atribuído';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'finalizado':
        return 'bg-green-500';
      case 'in_progress':
      case 'instalando':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(new Date());
  };

  const handleDayClick = (date) => {
    if (date) {
      const dayJobs = getJobsForDate(date);
      if (dayJobs.length > 0) {
        setSelectedDay(date);
      }
    }
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const dayNamesFull = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Selected day jobs
  const selectedDayJobs = selectedDay ? getJobsForDate(selectedDay) : [];

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-white">Agenda da Equipe</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {scheduledJobs.length} job(s) agendado(s)
          </p>
        </div>
        <CalendarIcon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-24 bg-white/5 border-white/10 text-white h-8 text-xs">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="POA">POA</SelectItem>
                <SelectItem value="SP">SP</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-1 ml-auto">
              <Button
                variant={viewMode === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('month')}
                className="h-8 text-xs px-3"
              >
                Mês
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8 text-xs px-3"
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
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={previousMonth} className="h-8 w-8 p-0">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="text-center">
                  <h2 className="text-base font-semibold text-white">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                  <Button variant="link" size="sm" onClick={goToToday} className="text-primary p-0 h-auto text-xs">
                    Ir para hoje
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={nextMonth} className="h-8 w-8 p-0">
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Calendar Grid - Mobile Optimized */}
          <Card className="bg-card border-white/5">
            <CardContent className="p-2">
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map((day, i) => (
                  <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                    <span className="md:hidden">{day}</span>
                    <span className="hidden md:inline">{dayNamesFull[i]}</span>
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {generateCalendarDays().map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="h-12 md:h-20" />;
                  }

                  const dayJobs = getJobsForDate(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const hasJobs = dayJobs.length > 0;
                  const hasMyJob = dayJobs.some(j => isMyJob(j));
                  const isSelected = selectedDay && date.toDateString() === selectedDay.toDateString();

                  return (
                    <div
                      key={date.toISOString()}
                      onClick={() => handleDayClick(date)}
                      className={`h-12 md:h-20 p-1 rounded-lg border transition-all relative ${
                        isSelected
                          ? 'border-primary bg-primary/20 ring-2 ring-primary'
                          : isToday
                          ? 'border-primary/50 bg-primary/10'
                          : hasJobs
                          ? 'border-white/20 bg-white/5 cursor-pointer hover:bg-white/10'
                          : 'border-transparent'
                      }`}
                    >
                      {/* Day Number */}
                      <div className={`text-xs font-medium ${
                        isToday ? 'text-primary' : hasMyJob ? 'text-primary' : 'text-white'
                      }`}>
                        {date.getDate()}
                      </div>
                      
                      {/* Job Indicators for Mobile */}
                      {hasJobs && (
                        <div className="absolute bottom-1 left-1 right-1">
                          {/* Dot indicators */}
                          <div className="flex justify-center gap-0.5 md:hidden">
                            {dayJobs.slice(0, 3).map((job, i) => (
                              <div 
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isMyJob(job) ? 'bg-primary' : getStatusColor(job.status)
                                }`}
                              />
                            ))}
                            {dayJobs.length > 3 && (
                              <span className="text-[8px] text-muted-foreground">+{dayJobs.length - 3}</span>
                            )}
                          </div>

                          {/* Full job names for desktop */}
                          <div className="hidden md:block space-y-0.5">
                            {dayJobs.slice(0, 2).map(job => {
                              const isMine = isMyJob(job);
                              return (
                                <div
                                  key={job.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/installer/jobs/${job.id}`);
                                  }}
                                  className={`text-[9px] px-1 py-0.5 rounded cursor-pointer truncate ${
                                    isMine 
                                      ? 'bg-primary text-white font-bold' 
                                      : getStatusColor(job.status) + ' text-white opacity-80'
                                  }`}
                                  title={job.title}
                                >
                                  {isMine && '★ '}{job.title?.substring(0, 12)}
                                </div>
                              );
                            })}
                            {dayJobs.length > 2 && (
                              <div className="text-[8px] text-center text-muted-foreground">
                                +{dayJobs.length - 2}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Star indicator for my job on mobile */}
                      {hasMyJob && (
                        <div className="absolute top-0.5 right-0.5 md:hidden">
                          <Star className="h-2.5 w-2.5 text-primary fill-primary" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Detail Panel - Mobile */}
          {selectedDay && selectedDayJobs.length > 0 && (
            <Card className="bg-card border-primary/30 animate-in slide-in-from-bottom-4">
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    {selectedDay.toLocaleDateString('pt-BR', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long' 
                    })}
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedDay(null)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedDayJobs.length} job(s) agendado(s)
                </p>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2 max-h-60 overflow-y-auto">
                {selectedDayJobs.map(job => {
                  const isMine = isMyJob(job);
                  const scheduledTime = new Date(job.scheduled_date);
                  
                  return (
                    <div
                      key={job.id}
                      onClick={() => {
                        if (isMine) {
                          navigate(`/installer/jobs/${job.id}`);
                        } else {
                          toast.info('Este job está atribuído a outro instalador');
                        }
                      }}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        isMine 
                          ? 'bg-primary/20 border border-primary/30 hover:bg-primary/30' 
                          : 'bg-white/5 border border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            {isMine && <Star className="h-3 w-3 text-primary fill-primary" />}
                            <span className={`text-sm font-medium truncate ${isMine ? 'text-primary' : 'text-white'}`}>
                              {job.title}
                            </span>
                          </div>
                          
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{scheduledTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
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
                                <span className={`truncate ${isMine ? 'text-primary' : ''}`}>
                                  {job.assigned_installers.map(id => {
                                    const name = getInstallerName(id);
                                    const firstName = name.split(' ')[0];
                                    return firstName;
                                  }).join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            job.branch === 'POA' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                          }`}>
                            {job.branch}
                          </span>
                          {isMine && (
                            <span className="text-[10px] bg-primary/30 text-primary px-1.5 py-0.5 rounded font-bold">
                              MEU JOB
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end mt-2 pt-2 border-t border-white/10">
                        <span className="text-xs text-primary flex items-center gap-1">
                          Ver detalhes <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-2 justify-center text-[10px] md:text-xs">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-primary fill-primary" />
              <span className="text-white font-medium">Meu Job</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span className="text-muted-foreground">Agendado</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-muted-foreground">Em Andamento</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-muted-foreground">Concluído</span>
            </div>
          </div>

          {/* Tip for mobile */}
          <p className="text-center text-xs text-muted-foreground md:hidden">
            💡 Toque em um dia com jobs para ver detalhes
          </p>
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
                const isMine = isMyJob(job);

                return (
                  <Card 
                    key={job.id} 
                    className={`bg-card cursor-pointer hover:border-primary/50 transition-colors ${
                      isPast ? 'opacity-60' : ''
                    } ${isMine ? 'border-primary/50 ring-1 ring-primary/20' : 'border-white/5'}`}
                    onClick={() => navigate(`/installer/jobs/${job.id}`)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`w-2 h-2 rounded-full ${isMine ? 'bg-primary' : getStatusColor(job.status)}`}></span>
                            <span className="text-xs text-muted-foreground font-mono">
                              #{job.holdprint_data?.code || job.id?.slice(0, 6)}
                            </span>
                            {isMine && (
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                <Star className="h-2.5 w-2.5 fill-primary" /> MEU JOB
                              </span>
                            )}
                            {isToday && (
                              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                                HOJE
                              </span>
                            )}
                          </div>
                          
                          <h4 className={`text-sm font-medium truncate mb-2 ${isMine ? 'text-primary' : 'text-white'}`}>
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
                                <span className={isMine ? 'text-primary' : ''}>
                                  {job.assigned_installers.map(id => getInstallerName(id)).join(', ')}
                                </span>
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
