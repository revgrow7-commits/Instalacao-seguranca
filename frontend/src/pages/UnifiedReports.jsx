import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  FileText, Users, Briefcase, Clock, CheckCircle, AlertCircle, TrendingUp, 
  Calendar, Download, Layers, User, Camera, Image, X, MapPin, Pause, 
  ChevronLeft, ChevronRight, Loader2, BarChart3, Ruler, RefreshCw,
  Filter, ChevronDown, ChevronUp, Package
} from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 10;

const UnifiedReports = () => {
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data states
  const [jobs, setJobs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [itemCheckins, setItemCheckins] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [productivityReport, setProductivityReport] = useState(null);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInstaller, setSelectedInstaller] = useState('all');
  const [selectedJob, setSelectedJob] = useState('all');
  const [selectedProductFamily, setSelectedProductFamily] = useState('all');
  
  // Product family classification
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
  
  // Pagination
  const [jobsPage, setJobsPage] = useState(1);
  const [installersPage, setInstallersPage] = useState(1);
  const [photosPage, setPhotosPage] = useState(1);
  
  // Photo viewer
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoType, setPhotoType] = useState('');
  
  // Expanded rows
  const [expandedInstallers, setExpandedInstallers] = useState({});
  const [expandedJobs, setExpandedJobs] = useState({});

  useEffect(() => {
    if (!isAdmin && !isManager) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [isAdmin, isManager, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, itemCheckinsRes, installersRes] = await Promise.all([
        api.getJobs(),
        api.getAllItemCheckins(),
        api.getInstallers()
      ]);
      
      setJobs(jobsRes.data || []);
      setItemCheckins(itemCheckinsRes.data || []);
      setInstallers(installersRes.data || []);
      
      // Load old checkins separately (may fail)
      try {
        const checkinsRes = await api.getCheckins();
        setCheckins(checkinsRes.data || []);
      } catch {
        setCheckins([]);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const response = await api.exportReports();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar relatório');
    } finally {
      setExporting(false);
    }
  };

  // Stats calculations
  const stats = useMemo(() => {
    const completedCheckins = itemCheckins.filter(c => c.status === 'completed');
    const totalM2 = completedCheckins.reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
    const totalMinutes = completedCheckins.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
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

  // Installer stats
  const installerStats = useMemo(() => {
    return installers.map(installer => {
      const instCheckins = itemCheckins.filter(c => c.installer_id === installer.id);
      const completed = instCheckins.filter(c => c.status === 'completed');
      const totalM2 = completed.reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
      const totalMins = completed.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
      const avgProd = totalMins > 0 ? (totalM2 / (totalMins / 60)).toFixed(2) : 0;
      
      return {
        ...installer,
        totalCheckins: instCheckins.length,
        completedCheckins: completed.length,
        totalM2,
        totalMinutes: totalMins,
        avgProductivity: avgProd
      };
    }).sort((a, b) => b.totalM2 - a.totalM2);
  }, [installers, itemCheckins]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    return itemCheckins.filter(c => {
      const matchesInstaller = selectedInstaller === 'all' || c.installer_id === selectedInstaller;
      const matchesJob = selectedJob === 'all' || c.job_id === selectedJob;
      
      // Filter by product family
      let matchesFamily = true;
      if (selectedProductFamily !== 'all') {
        const productName = c.product_name || c.item_name || '';
        const family = getProductFamily(productName);
        matchesFamily = family === selectedProductFamily;
      }
      
      let matchesDate = true;
      if (startDate || endDate) {
        const checkinDate = new Date(c.checkin_at);
        if (startDate && checkinDate < new Date(startDate)) matchesDate = false;
        if (endDate && checkinDate > new Date(endDate + 'T23:59:59')) matchesDate = false;
      }
      
      return matchesInstaller && matchesJob && matchesFamily && matchesDate && (c.checkin_photo || c.checkout_photo);
    });
  }, [itemCheckins, selectedInstaller, selectedJob, selectedProductFamily, startDate, endDate]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando relatórios...</p>
        </div>
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
          <Button
            onClick={loadData}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button
            onClick={handleExportExcel}
            disabled={exporting}
            className="bg-green-600 hover:bg-green-700"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
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
              <div className="p-2 rounded-lg bg-blue-500/20">
                <CheckCircle className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.completedCheckins}</p>
                <p className="text-xs text-muted-foreground">Check-ins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Ruler className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.totalM2.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">m² Instalados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Clock className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatDuration(stats.totalMinutes)}</p>
                <p className="text-xs text-muted-foreground">Tempo Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.avgProductivity}</p>
                <p className="text-xs text-muted-foreground">m²/hora</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <Users className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.activeInstallers}</p>
                <p className="text-xs text-muted-foreground">Instaladores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-white/5 h-auto p-1">
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
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Status Distribution */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-yellow-500/10 border-yellow-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-yellow-400">{stats.jobsByStatus.aguardando}</p>
                <p className="text-xs text-yellow-300">Aguardando</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/10 border-blue-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">{stats.jobsByStatus.instalando}</p>
                <p className="text-xs text-blue-300">Instalando</p>
              </CardContent>
            </Card>
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-400">{stats.jobsByStatus.finalizado}</p>
                <p className="text-xs text-green-300">Finalizados</p>
              </CardContent>
            </Card>
            <Card className="bg-orange-500/10 border-orange-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-orange-400">{stats.jobsByStatus.pausado}</p>
                <p className="text-xs text-orange-300">Pausados</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Installers */}
          <Card className="bg-card border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Top Instaladores por Produtividade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {installerStats.slice(0, 5).map((inst, idx) => (
                  <div key={inst.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        idx === 0 ? 'bg-yellow-500 text-black' :
                        idx === 1 ? 'bg-gray-400 text-black' :
                        idx === 2 ? 'bg-amber-600 text-white' :
                        'bg-white/10 text-white'
                      }`}>
                        {idx + 1}
                      </span>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Installers Tab */}
        <TabsContent value="installers" className="mt-6">
          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
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
                        {expandedInstallers[inst.id] ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    
                    {expandedInstallers[inst.id] && (
                      <div className="p-4 pt-0 border-t border-white/5 bg-white/5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                          <div>
                            <p className="text-lg font-bold text-white">{inst.totalCheckins}</p>
                            <p className="text-xs text-muted-foreground">Total Check-ins</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-green-400">{inst.completedCheckins}</p>
                            <p className="text-xs text-muted-foreground">Completos</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-blue-400">{inst.totalM2.toFixed(2)} m²</p>
                            <p className="text-xs text-muted-foreground">Área Total</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-purple-400">{formatDuration(inst.totalMinutes)}</p>
                            <p className="text-xs text-muted-foreground">Tempo Total</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="mt-6">
          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              <div className="space-y-2">
                {jobs.slice((jobsPage - 1) * ITEMS_PER_PAGE, jobsPage * ITEMS_PER_PAGE).map(job => {
                  const jobCheckins = itemCheckins.filter(c => c.job_id === job.id);
                  const completedItems = jobCheckins.filter(c => c.status === 'completed').length;
                  const totalM2 = jobCheckins.reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
                  const totalMinutes = jobCheckins.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
                  
                  return (
                    <div key={job.id} className="border border-white/5 rounded-lg overflow-hidden">
                      <div 
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5"
                        onClick={() => setExpandedJobs(prev => ({ ...prev, [job.id]: !prev[job.id] }))}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                              #{job.holdprint_data?.code || job.code || job.id?.slice(0,6)}
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
                          {expandedJobs[job.id] ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      
                      {expandedJobs[job.id] && (
                        <div className="p-4 pt-0 border-t border-white/5 bg-white/5">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                            <div>
                              <p className="text-lg font-bold text-white">{job.items?.length || 0}</p>
                              <p className="text-xs text-muted-foreground">Total Itens</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-green-400">{completedItems}</p>
                              <p className="text-xs text-muted-foreground">Instalados</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-blue-400">{totalM2.toFixed(2)} m²</p>
                              <p className="text-xs text-muted-foreground">Área Instalada</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-orange-400">{formatDuration(totalMinutes)}</p>
                              <p className="text-xs text-muted-foreground">Tempo Total</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-purple-400">{formatDate(job.created_at)}</p>
                              <p className="text-xs text-muted-foreground">Data Criação</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Pagination */}
              {jobs.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setJobsPage(p => Math.max(1, p - 1))}
                    disabled={jobsPage === 1}
                    className="border-white/20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-4 py-2">
                    {jobsPage} / {Math.ceil(jobs.length / ITEMS_PER_PAGE)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setJobsPage(p => Math.min(Math.ceil(jobs.length / ITEMS_PER_PAGE), p + 1))}
                    disabled={jobsPage >= Math.ceil(jobs.length / ITEMS_PER_PAGE)}
                    className="border-white/20"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-6 space-y-4">
          {/* Filters */}
          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Job</Label>
                  <Select value={selectedJob} onValueChange={setSelectedJob}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-white/10 max-h-60">
                      <SelectItem value="all">Todos os Jobs</SelectItem>
                      {jobs.slice(0, 50).map(job => (
                        <SelectItem key={job.id} value={job.id}>
                          #{job.holdprint_data?.code || job.code || job.id?.slice(0,6)} - {job.title?.substring(0, 25)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Instalador</Label>
                  <Select value={selectedInstaller} onValueChange={setSelectedInstaller}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      <SelectItem value="all">Todos</SelectItem>
                      {installers.map(inst => (
                        <SelectItem key={inst.id} value={inst.id}>{inst.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Família de Produto</Label>
                  <Select value={selectedProductFamily} onValueChange={setSelectedProductFamily}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-white/10">
                      {productFamilies.map(fam => (
                        <SelectItem key={fam.value} value={fam.value}>{fam.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white h-9"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => { setSelectedInstaller('all'); setSelectedJob('all'); setStartDate(''); setEndDate(''); }}
                    className="w-full border-white/20 text-white h-9"
                  >
                    Limpar
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {filteredPhotos.length} foto(s) encontrada(s)
              </p>
            </CardContent>
          </Card>

          {/* Photos Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredPhotos.slice((photosPage - 1) * 24, photosPage * 24).map(checkin => {
              // Find job info
              const job = jobs.find(j => j.id === checkin.job_id);
              const jobCode = job?.holdprint_data?.code || job?.code || checkin.job_id?.slice(0, 6);
              const jobTitle = checkin.job_title || job?.title || 'Job';
              const photo = checkin.checkin_photo || checkin.checkout_photo;
              const photoType = checkin.checkout_photo ? 'checkout' : 'checkin';
              
              return (
                <Card key={checkin.id} className="bg-card border-white/5 overflow-hidden group">
                  {/* Job Header */}
                  <div className="px-3 py-2 bg-primary/10 border-b border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-primary bg-primary/20 px-2 py-0.5 rounded">
                        #{jobCode}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        photoType === 'checkout' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {photoType === 'checkout' ? 'SAÍDA' : 'ENTRADA'}
                      </span>
                    </div>
                    <p className="text-xs text-white truncate mt-1" title={jobTitle}>
                      {jobTitle.length > 30 ? jobTitle.substring(0, 30) + '...' : jobTitle}
                    </p>
                  </div>
                  
                  {/* Photo */}
                  <div 
                    className="aspect-square relative cursor-pointer"
                    onClick={() => {
                      setSelectedPhoto(photo);
                      setPhotoType(`${photoType === 'checkout' ? 'Check-out' : 'Check-in'} - Job #${jobCode}: ${jobTitle}`);
                    }}
                  >
                    {photo && (
                      <img
                        src={photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`}
                        alt={`${photoType}_job_${jobCode}_${jobTitle.replace(/\s+/g, '_').substring(0, 20)}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <div className="w-full">
                        <p className="text-white font-medium text-sm truncate">{checkin.installer_name}</p>
                        <p className="text-muted-foreground text-xs">{formatDate(checkin.checkin_at)}</p>
                        {checkin.product_name && (
                          <p className="text-primary text-xs truncate mt-1">{checkin.product_name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Footer Info */}
                  <div className="px-3 py-2 bg-white/5 border-t border-white/5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate flex-1">
                        {checkin.installer_name}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {formatDate(checkin.checkin_at)}
                      </span>
                    </div>
                    {checkin.installed_m2 && (
                      <div className="text-xs text-primary mt-1">
                        {checkin.installed_m2.toFixed(2)} m² | {checkin.duration_minutes || 0}min
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Photos Pagination */}
          {filteredPhotos.length > 24 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhotosPage(p => Math.max(1, p - 1))}
                disabled={photosPage === 1}
                className="border-white/20"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-4 py-2">
                {photosPage} / {Math.ceil(filteredPhotos.length / 24)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhotosPage(p => Math.min(Math.ceil(filteredPhotos.length / 24), p + 1))}
                disabled={photosPage >= Math.ceil(filteredPhotos.length / 24)}
                className="border-white/20"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="bg-card border-white/10 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">{photoType}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <img
              src={selectedPhoto?.startsWith('data:') ? selectedPhoto : `data:image/jpeg;base64,${selectedPhoto}`}
              alt={photoType}
              className="w-full h-auto rounded-lg"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnifiedReports;
