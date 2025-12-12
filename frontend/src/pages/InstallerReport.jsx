import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  ArrowLeft, 
  User, 
  Ruler, 
  Clock, 
  TrendingUp, 
  Briefcase,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  Award
} from 'lucide-react';

const InstallerReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [expandedInstaller, setExpandedInstaller] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      navigate('/');
      return;
    }
    fetchReport();
  }, [user, navigate]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await api.getReportByInstaller();
      setReport(response.data);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Carregando relatório por instalador...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/reports')}
              className="text-muted-foreground hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                <Users className="h-8 w-8 text-primary" />
                Relatório por Instalador
              </h1>
              <p className="text-muted-foreground mt-1">
                Análise de produtividade (m²) por instalador
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={fetchReport} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-400">Total Instaladores</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.total_installers || 0}</p>
                </div>
                <Users className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-400">Área Total (m²)</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.total_area_m2_all?.toLocaleString('pt-BR') || 0}</p>
                </div>
                <Ruler className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-400">Horas Totais</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.total_hours_all?.toLocaleString('pt-BR') || 0}h</p>
                </div>
                <Clock className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-yellow-400">Produtividade Média</p>
                  <p className="text-2xl font-bold text-white">{report?.summary?.avg_productivity_m2_h || 0} <span className="text-sm">m²/h</span></p>
                </div>
                <TrendingUp className="h-8 w-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Installers List */}
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Ranking de Instaladores por Produtividade
            </CardTitle>
            <CardDescription>
              Ordenado por m²/hora (do mais produtivo ao menos produtivo)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {report?.by_installer?.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum instalador com dados de produtividade.</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Os instaladores precisam realizar check-ins e informar os m² instalados.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {report?.by_installer?.map((installer, index) => (
                  <div key={installer.installer_id} className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                    <div
                      className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedInstaller(
                        expandedInstaller === installer.installer_id ? null : installer.installer_id
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Ranking Badge */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500/50' :
                            index === 1 ? 'bg-gray-300/20 text-gray-300 border-2 border-gray-300/50' :
                            index === 2 ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500/50' :
                            'bg-white/10 text-white/60'
                          }`}>
                            {index + 1}º
                          </div>
                          
                          <div>
                            <h3 className="text-white font-semibold text-lg">{installer.full_name}</h3>
                            <p className="text-sm text-muted-foreground">{installer.branch}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Jobs</p>
                            <p className="text-white font-bold">{installer.metrics.jobs_worked}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Check-ins</p>
                            <p className="text-white font-bold">{installer.metrics.completed_checkins}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Horas</p>
                            <p className="text-white font-bold">{installer.metrics.total_duration_hours}h</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">m² Reportados</p>
                            <p className="text-green-400 font-bold text-lg">{installer.metrics.total_m2_reported}</p>
                          </div>
                          <div className="text-right bg-primary/20 px-3 py-2 rounded-lg border border-primary/30">
                            <p className="text-xs text-primary">Produtividade</p>
                            <p className="text-primary font-bold text-lg">{installer.metrics.productivity_m2_h} <span className="text-xs">m²/h</span></p>
                          </div>
                          
                          {expandedInstaller === installer.installer_id ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedInstaller === installer.installer_id && installer.jobs?.length > 0 && (
                      <div className="border-t border-white/10 p-4 bg-white/5">
                        <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                          <Briefcase className="h-4 w-4" />
                          Jobs Trabalhados ({installer.jobs.length})
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b border-white/10">
                            <span>Job</span>
                            <span>Cliente</span>
                            <span className="text-center">Área Job (m²)</span>
                            <span className="text-center">m² Reportados</span>
                            <span className="text-center">Tempo (min)</span>
                            <span className="text-center">Check-ins</span>
                          </div>
                          {installer.jobs.map((job, jobIndex) => (
                            <div key={jobIndex} className="grid grid-cols-6 gap-2 text-sm py-2 border-b border-white/5">
                              <span className="text-white truncate" title={job.job_title}>
                                {job.job_title}
                              </span>
                              <span className="text-muted-foreground truncate" title={job.client}>
                                {job.client?.substring(0, 15)}
                              </span>
                              <span className="text-center text-purple-400 font-medium">
                                {job.job_area_m2?.toLocaleString('pt-BR') || '-'}
                              </span>
                              <span className="text-center text-green-400 font-medium">
                                {job.m2_reported || '-'}
                              </span>
                              <span className="text-center text-white">
                                {job.duration_min || '-'}
                              </span>
                              <span className="text-center text-white">
                                {job.checkins_count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-white font-medium">Como funciona o cálculo de produtividade</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  A produtividade é calculada com base nos metros quadrados (m²) reportados pelo instalador no check-out 
                  dividido pelo tempo total trabalhado (em horas). Quanto maior o valor, mais produtivo é o instalador.
                </p>
                <div className="mt-3 p-3 bg-white/5 rounded-lg">
                  <p className="text-xs text-muted-foreground">Fórmula:</p>
                  <p className="text-white font-mono">Produtividade = m² Reportados ÷ Horas Trabalhadas</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InstallerReport;
