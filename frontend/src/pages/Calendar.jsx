import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, MapPin, List, Grid3X3 } from 'lucide-react';
import { toast } from 'sonner';

const Calendar = () => {
  const { isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // month, list
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Detect mobile screen
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isAdmin || isManager) {
      loadJobs();
    }
  }, [isAdmin, isManager]);

  const loadJobs = async () => {
    try {
      const response = await api.getJobs();
      setJobs(response.data.filter(job => job.scheduled_date));
    } catch (error) {
      toast.error('Erro ao carregar jobs');
    } finally {
      setLoading(false);
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
    
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days in the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  if (!isAdmin && !isManager) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">Acesso negado.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Get jobs for current week (mobile list view)
  const getWeekJobs = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return jobs.filter(job => {
      const jobDate = new Date(job.scheduled_date);
      return jobDate >= startOfWeek && jobDate <= endOfWeek &&
        (selectedBranch === 'all' || job.branch === selectedBranch);
    }).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
  };

  return (
    <div className="p-3 sm:p-4 md:p-8 space-y-4 md:space-y-6" data-testid="calendar-page">
      {/* Header */}
      <div className="flex flex-col gap-3 md:gap-4">
        {/* Title and Counter */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-4xl font-heading font-bold text-white tracking-tight capitalize">
              {monthName}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {jobs.filter(j => selectedBranch === 'all' || j.branch === selectedBranch).length} job(s) agendado(s)
            </p>
          </div>

          {/* View Mode Toggle (Mobile) */}
          <div className="flex md:hidden gap-1">
            <Button
              variant={viewMode === 'month' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('month')}
              className={viewMode === 'month' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-primary' : 'border-white/20 text-white hover:bg-white/10'}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-full sm:w-48 bg-white/5 border-white/10 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              <SelectItem value="all">Todas as Filiais</SelectItem>
              <SelectItem value="SP">São Paulo</SelectItem>
              <SelectItem value="POA">Porto Alegre</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2 justify-center sm:justify-end">
            <Button
              variant="outline"
              size="icon"
              onClick={previousMonth}
              className="border-white/20 text-white hover:bg-white/10 h-9 w-9"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentDate(new Date())}
              className="border-white/20 text-white hover:bg-white/10 text-sm px-3"
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={nextMonth}
              className="border-white/20 text-white hover:bg-white/10 h-9 w-9"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-4">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
              <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-2">
            {days.map((date, index) => {
              const dayJobs = date ? getJobsForDate(date) : [];
              const isCurrentDay = isToday(date);

              return (
                <div
                  key={index}
                  className={`
                    min-h-[100px] p-2 rounded-lg border transition-colors
                    ${date ? 'bg-white/5 border-white/5 hover:border-primary/50' : 'bg-transparent border-transparent'}
                    ${isCurrentDay ? 'border-primary bg-primary/10' : ''}
                  `}
                >
                  {date && (
                    <>
                      <div className={`text-sm font-semibold mb-2 ${isCurrentDay ? 'text-primary' : 'text-white'}`}>
                        {date.getDate()}
                      </div>
                      
                      <div className="space-y-1">
                        {dayJobs.map((job) => (
                          <div
                            key={job.id}
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            className={`
                              text-xs p-1 rounded cursor-pointer
                              ${getStatusColor(job.status)} bg-opacity-20 border border-current
                              hover:bg-opacity-30 transition-colors
                              truncate
                            `}
                            title={job.title}
                          >
                            <div className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{job.title}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Jobs List */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Próximos Jobs Agendados</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs
            .filter(job => {
              const jobDate = new Date(job.scheduled_date);
              return jobDate >= new Date() && (selectedBranch === 'all' || job.branch === selectedBranch);
            })
            .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
            .slice(0, 10)
            .map((job) => (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer mb-2"
              >
                <div className="flex-1">
                  <h3 className="text-white font-semibold">{job.title}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {new Date(job.scheduled_date).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(job.scheduled_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.branch}
                    </span>
                    {job.assigned_installers?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {job.assigned_installers.length} instalador(es)
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`
                    px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                    ${getStatusColor(job.status)} bg-opacity-20 border border-current
                  `}
                >
                  {job.status === 'completed' ? 'Concluído' : job.status === 'in_progress' ? 'Em andamento' : 'Pendente'}
                </span>
              </div>
            ))}

          {jobs.filter(job => {
            const jobDate = new Date(job.scheduled_date);
            return jobDate >= new Date() && (selectedBranch === 'all' || job.branch === selectedBranch);
          }).length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Nenhum job agendado para os próximos dias
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Calendar;
