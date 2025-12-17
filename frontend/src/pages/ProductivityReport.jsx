import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Ruler, 
  ArrowLeft,
  RefreshCw,
  Users,
  Briefcase,
  Layers,
  Package,
  Filter,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const ProductivityReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [installers, setInstallers] = useState([]);
  const [jobs, setJobs] = useState([]);
  
  // Filters
  const [filterBy, setFilterBy] = useState('');
  const [filterId, setFilterId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Expanded states
  const [expandedInstallers, setExpandedInstallers] = useState({});
  const [expandedJobs, setExpandedJobs] = useState({});
  const [expandedFamilies, setExpandedFamilies] = useState({});

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reportRes, installersRes, jobsRes] = await Promise.all([
        api.getProductivityReport({ filter_by: filterBy, filter_id: filterId, date_from: dateFrom, date_to: dateTo }),
        api.getInstallers(),
        api.getJobs()
      ]);
      setReport(reportRes.data);
      setInstallers(installersRes.data);
      setJobs(jobsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    fetchData();
  };

  const clearFilters = () => {
    setFilterBy('');
    setFilterId('');
    setDateFrom('');
    setDateTo('');
    setTimeout(() => fetchData(), 100);
  };

  const toggleExpanded = (type, id) => {
    if (type === 'installer') {
      setExpandedInstallers(prev => ({ ...prev, [id]: !prev[id] }));
    } else if (type === 'job') {
      setExpandedJobs(prev => ({ ...prev, [id]: !prev[id] }));
    } else if (type === 'family') {
      setExpandedFamilies(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0min';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins}min`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Carregando relatório...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="text-muted-foreground hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              Relatório de Produtividade
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              m² da API × Tempo Líquido (excluindo pausas)
            </p>
          </div>
        </div>

        <Button variant="outline" onClick={fetchData} className="gap-2 w-full sm:w-auto">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-card border-white/5">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-sm md:text-base">
            <Filter className="h-4 w-4 text-primary" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Filtrar por</Label>
              <Select value={filterBy || "all"} onValueChange={(v) => { setFilterBy(v === "all" ? "" : v); setFilterId(''); }}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="installer">Instalador</SelectItem>
                  <SelectItem value="job">Job</SelectItem>
                  <SelectItem value="family">Família</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterBy === 'installer' && (
              <div>
                <Label className="text-xs text-muted-foreground">Instalador</Label>
                <Select value={filterId} onValueChange={setFilterId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10">
                    {installers.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {filterBy === 'job' && (
              <div>
                <Label className="text-xs text-muted-foreground">Job</Label>
                <Select value={filterId} onValueChange={setFilterId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-white/10">
                    {jobs.map(job => (
                      <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Data Início</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-white/5 border-white/10 text-white h-9"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Data Fim</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-white/5 border-white/10 text-white h-9"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={applyFilters} className="flex-1 h-9 text-sm">Aplicar</Button>
              <Button variant="outline" onClick={clearFilters} className="h-9 text-sm">Limpar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/20">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-blue-400">m² Total</p>
                <p className="text-lg md:text-2xl font-bold text-white">{report?.summary?.total_m2?.toLocaleString('pt-BR') || 0}</p>
              </div>
              <Ruler className="h-6 w-6 md:h-8 md:w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/20">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-purple-400">Tempo Total</p>
                <p className="text-lg md:text-2xl font-bold text-white">{report?.summary?.total_hours?.toLocaleString('pt-BR') || 0}h</p>
              </div>
              <Clock className="h-6 w-6 md:h-8 md:w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/20">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-green-400">Produtividade</p>
                <p className="text-lg md:text-2xl font-bold text-white">{report?.summary?.avg_productivity_m2_h || 0} <span className="text-xs">m²/h</span></p>
              </div>
              <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/20">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-yellow-400">Jobs</p>
                <p className="text-lg md:text-2xl font-bold text-white">{report?.summary?.total_jobs || 0}</p>
              </div>
              <Briefcase className="h-6 w-6 md:h-8 md:w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/20">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs text-cyan-400">Instaladores</p>
                <p className="text-lg md:text-2xl font-bold text-white">{report?.summary?.total_installers || 0}</p>
              </div>
              <Users className="h-6 w-6 md:h-8 md:w-8 text-cyan-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="installer" className="space-y-4">
        <TabsList className="bg-white/5 w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="installer" className="data-[state=active]:bg-primary text-xs md:text-sm whitespace-nowrap">
            <Users className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            Por Instalador
          </TabsTrigger>
          <TabsTrigger value="job" className="data-[state=active]:bg-primary text-xs md:text-sm whitespace-nowrap">
            <Briefcase className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            Por Job
          </TabsTrigger>
          <TabsTrigger value="family" className="data-[state=active]:bg-primary text-xs md:text-sm whitespace-nowrap">
            <Layers className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            Por Família
          </TabsTrigger>
          <TabsTrigger value="item" className="data-[state=active]:bg-primary text-xs md:text-sm whitespace-nowrap">
            <Package className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            Por Item
          </TabsTrigger>
        </TabsList>

        {/* By Installer */}
        <TabsContent value="installer">
          <Card className="bg-card border-white/5">
            <CardHeader className="p-4">
              <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                <Users className="h-5 w-5 text-primary" />
                Produtividade por Instalador
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {report?.by_installer?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-3">
                  {report?.by_installer?.map((inst, idx) => (
                    <div key={inst.installer_id} className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                      <button
                        onClick={() => toggleExpanded('installer', inst.installer_id)}
                        className="w-full p-3 md:p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                            {idx + 1}
                          </div>
                          <div className="text-left">
                            <p className="text-white font-medium text-sm md:text-base">{inst.installer_name}</p>
                            <p className="text-xs text-muted-foreground">{inst.branch || 'Sem filial'} • {inst.jobs_count} jobs</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 md:gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="text-white font-bold">{inst.total_m2} m²</p>
                            <p className="text-xs text-muted-foreground">{inst.total_hours}h</p>
                          </div>
                          <div className="text-right">
                            <p className="text-primary font-bold text-lg">{inst.productivity_m2_h}</p>
                            <p className="text-xs text-muted-foreground">m²/h</p>
                          </div>
                          {expandedInstallers[inst.installer_id] ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expandedInstallers[inst.installer_id] && inst.records?.length > 0 && (
                        <div className="border-t border-white/10 p-3 space-y-2 bg-black/20">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Últimas execuções (Tempo Líquido)</p>
                          {inst.records.slice(0, 10).map((rec, i) => (
                            <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                              <div>
                                <p className="text-white text-xs md:text-sm line-clamp-1">{rec.item_name}</p>
                                <p className="text-xs text-muted-foreground">{rec.job_title}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-white text-xs">{rec.m2_api} m² • {formatDuration(rec.duration_minutes)}</p>
                                {rec.pause_minutes > 0 && (
                                  <p className="text-xs text-orange-400">Pausas: {formatDuration(rec.pause_minutes)}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Job */}
        <TabsContent value="job">
          <Card className="bg-card border-white/5">
            <CardHeader className="p-4">
              <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                <Briefcase className="h-5 w-5 text-primary" />
                Produtividade por Job
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {report?.by_job?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-3">
                  {report?.by_job?.map((job) => (
                    <div key={job.job_id} className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                      <button
                        onClick={() => toggleExpanded('job', job.job_id)}
                        className="w-full p-3 md:p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                      >
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-white font-medium text-sm md:text-base line-clamp-1">{job.job_title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{job.client_name} • {job.installers_count} instalador(es)</p>
                        </div>
                        <div className="flex items-center gap-3 md:gap-6 ml-2">
                          <div className="text-right hidden sm:block">
                            <p className="text-white font-bold">{job.total_m2_executed}/{job.total_m2_api} m²</p>
                            <p className="text-xs text-muted-foreground">{job.completion_percent}% concluído</p>
                          </div>
                          <div className="text-right">
                            <p className="text-primary font-bold text-lg">{job.productivity_m2_h}</p>
                            <p className="text-xs text-muted-foreground">m²/h</p>
                          </div>
                          {expandedJobs[job.job_id] ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expandedJobs[job.job_id] && job.records?.length > 0 && (
                        <div className="border-t border-white/10 p-3 space-y-2 bg-black/20">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Itens executados</p>
                          {job.records.slice(0, 10).map((rec, i) => (
                            <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                              <div>
                                <p className="text-white text-xs md:text-sm line-clamp-1">{rec.item_name}</p>
                                <p className="text-xs text-muted-foreground">{rec.installer_name}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-white text-xs">{rec.m2_api} m² • {formatDuration(rec.duration_minutes)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Family */}
        <TabsContent value="family">
          <Card className="bg-card border-white/5">
            <CardHeader className="p-4">
              <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                <Layers className="h-5 w-5 text-primary" />
                Produtividade por Família de Produto
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {report?.by_family?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-3">
                  {report?.by_family?.map((family) => (
                    <div key={family.family_name} className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                      <button
                        onClick={() => toggleExpanded('family', family.family_name)}
                        className="w-full p-3 md:p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                      >
                        <div className="text-left">
                          <p className="text-white font-medium text-sm md:text-base">{family.family_name}</p>
                          <p className="text-xs text-muted-foreground">{family.jobs_count} jobs • {family.items_count} itens</p>
                        </div>
                        <div className="flex items-center gap-3 md:gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="text-white font-bold">{family.total_m2} m²</p>
                            <p className="text-xs text-muted-foreground">{family.total_hours}h</p>
                          </div>
                          <div className="text-right">
                            <p className="text-primary font-bold text-lg">{family.productivity_m2_h}</p>
                            <p className="text-xs text-muted-foreground">m²/h</p>
                          </div>
                          {expandedFamilies[family.family_name] ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expandedFamilies[family.family_name] && family.records?.length > 0 && (
                        <div className="border-t border-white/10 p-3 space-y-2 bg-black/20">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Últimas execuções</p>
                          {family.records.slice(0, 10).map((rec, i) => (
                            <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                              <div>
                                <p className="text-white text-xs md:text-sm line-clamp-1">{rec.item_name}</p>
                                <p className="text-xs text-muted-foreground">{rec.installer_name} • {rec.job_title}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-white text-xs">{rec.m2_api} m² • {formatDuration(rec.duration_minutes)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Item */}
        <TabsContent value="item">
          <Card className="bg-card border-white/5">
            <CardHeader className="p-4">
              <CardTitle className="text-white flex items-center gap-2 text-base md:text-lg">
                <Package className="h-5 w-5 text-primary" />
                Produtividade por Item
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {report?.by_item?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-2">
                  {report?.by_item?.slice(0, 50).map((item, idx) => (
                    <div key={idx} className="p-3 bg-white/5 rounded-lg border border-white/10 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium line-clamp-1">{item.item_name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{item.job_title} • {item.family_name}</p>
                      </div>
                      <div className="flex items-center gap-4 ml-2">
                        <div className="text-right">
                          <p className="text-white text-sm font-bold">{item.m2_api} m²</p>
                          <p className="text-xs text-muted-foreground">{formatDuration(item.total_minutes)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-primary font-bold">{item.productivity_m2_h}</p>
                          <p className="text-xs text-muted-foreground">m²/h</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProductivityReport;
