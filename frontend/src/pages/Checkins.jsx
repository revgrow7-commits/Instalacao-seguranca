import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { CheckCircle, MapPin, Clock, Image, Eye, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

const Checkins = () => {
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const [checkins, setCheckins] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [installerFilter, setInstallerFilter] = useState('all');

  useEffect(() => {
    if (!isAdmin && !isManager) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [isAdmin, isManager, navigate]);

  const loadData = async () => {
    try {
      const [checkinsRes, jobsRes, installersRes] = await Promise.all([
        api.getCheckins(),
        api.getJobs(),
        api.getInstallers()
      ]);
      
      // Sort by most recent
      const sortedCheckins = checkinsRes.data.sort((a, b) => 
        new Date(b.checkin_at) - new Date(a.checkin_at)
      );
      
      setCheckins(sortedCheckins);
      setJobs(jobsRes.data);
      setInstallers(installersRes.data);
    } catch (error) {
      toast.error('Erro ao carregar check-ins');
    } finally {
      setLoading(false);
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

  const getJobTitle = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    return job?.title || 'Job não encontrado';
  };

  const getInstallerName = (installerId) => {
    const installer = installers.find(i => i.id === installerId);
    return installer?.full_name || 'N/A';
  };

  // Filter checkins
  const filteredCheckins = checkins.filter(checkin => {
    const jobTitle = getJobTitle(checkin.job_id).toLowerCase();
    const installerName = getInstallerName(checkin.installer_id).toLowerCase();
    const matchesSearch = jobTitle.includes(searchTerm.toLowerCase()) || 
                         installerName.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || checkin.status === statusFilter;
    const matchesInstaller = installerFilter === 'all' || checkin.installer_id === installerFilter;
    
    return matchesSearch && matchesStatus && matchesInstaller;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
          Check-ins
        </h1>
        <p className="text-muted-foreground mt-2">
          Visualize todos os check-ins realizados
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por job ou instalador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="completed">Completo</SelectItem>
              </SelectContent>
            </Select>

            {/* Installer Filter */}
            <Select value={installerFilter} onValueChange={setInstallerFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Todos os instaladores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os instaladores</SelectItem>
                {installers.map(installer => (
                  <SelectItem key={installer.id} value={installer.id}>
                    {installer.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="text-muted-foreground text-sm">
        {filteredCheckins.length} check-in(s) encontrado(s)
      </div>

      {/* Checkins List */}
      {filteredCheckins.length === 0 ? (
        <Card className="bg-card border-white/5">
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Nenhum check-in encontrado com os filtros selecionados
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCheckins.map((checkin) => (
            <Card
              key={checkin.id}
              className="bg-card border-white/5 hover:border-primary/50 transition-colors"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg text-white line-clamp-1">
                      {getJobTitle(checkin.job_id)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {getInstallerName(checkin.installer_id)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(checkin.checkin_at)}
                    </p>
                  </div>
                  <span
                    className={
                      `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        checkin.status === 'completed'
                          ? 'bg-green-500/20 text-green-500 border border-green-500/20'
                          : 'bg-blue-500/20 text-blue-500 border border-blue-500/20'
                      }`
                    }
                  >
                    {checkin.status === 'completed' ? 'Completo' : 'Em andamento'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Photo thumbnail */}
                {checkin.checkin_photo && (
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <img
                      src={`data:image/jpeg;base64,${checkin.checkin_photo}`}
                      alt="Check-in"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                      <Image className="h-3 w-3" />
                      Check-in
                    </div>
                  </div>
                )}

                {/* GPS Info */}
                {checkin.gps_lat && checkin.gps_long && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-blue-400" />
                    <span className="text-xs">
                      {checkin.gps_lat.toFixed(4)}, {checkin.gps_long.toFixed(4)}
                    </span>
                  </div>
                )}

                {/* Duration if completed */}
                {checkin.status === 'completed' && checkin.duration_minutes && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-green-400" />
                    <span className="text-xs">{checkin.duration_minutes} minutos</span>
                  </div>
                )}

                {/* View Details Button */}
                <Button
                  onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="sm"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Detalhes
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Checkins;
