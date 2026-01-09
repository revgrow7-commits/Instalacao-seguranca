import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  BarChart3, TrendingUp, Clock, Ruler, Package, Users, Briefcase,
  ArrowUp, ArrowDown, Minus, RefreshCw, Calendar, Target, Zap,
  Award, Percent
} from 'lucide-react';
import { toast } from 'sonner';

const FamilyKPIsReport = () => {
  const { isAdmin, isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpisData, setKpisData] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadKpis();
  }, []);

  const loadKpis = async () => {
    setLoading(true);
    try {
      const response = await api.getFamilyProductivityKpis(
        startDate || null,
        endDate || null
      );
      setKpisData(response.data);
    } catch (error) {
      console.error('Error loading KPIs:', error);
      toast.error('Erro ao carregar KPIs');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    loadKpis();
  };

  const getEfficiencyColor = (efficiency) => {
    if (efficiency >= 120) return 'text-green-400';
    if (efficiency >= 90) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getEfficiencyIcon = (efficiency) => {
    if (efficiency >= 110) return <ArrowUp className="h-4 w-4 text-green-400" />;
    if (efficiency >= 90) return <Minus className="h-4 w-4 text-yellow-400" />;
    return <ArrowDown className="h-4 w-4 text-red-400" />;
  };

  const getFamilyIcon = (family) => {
    const icons = {
      'Adesivos': '🏷️',
      'Lonas': '🎪',
      'Chapas': '🪧',
      'Placas': '📋',
      'Displays': '🖥️',
      'Serviços': '🔧',
      'Outros': '📦'
    };
    return icons[family] || '📦';
  };

  const getFamilyColor = (family) => {
    const colors = {
      'Adesivos': 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
      'Lonas': 'from-green-500/20 to-green-600/10 border-green-500/30',
      'Chapas': 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
      'Placas': 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
      'Displays': 'from-pink-500/20 to-pink-600/10 border-pink-500/30',
      'Serviços': 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
      'Outros': 'from-gray-500/20 to-gray-600/10 border-gray-500/30'
    };
    return colors[family] || colors['Outros'];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando KPIs...</div>
      </div>
    );
  }

  const { kpis = [], summary = {} } = kpisData || {};

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="family-kpis-report">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-heading font-bold text-white flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            KPIs por Família de Produtos
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Análise de produtividade m²/hora por tipo de material
          </p>
        </div>
        <Button onClick={loadKpis} variant="outline" className="border-white/20">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Date Filters */}
      <Card className="bg-card border-white/10">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white/5 border-white/10 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white/5 border-white/10 w-40"
              />
            </div>
            <Button onClick={handleFilter} className="bg-primary hover:bg-primary/90">
              <Calendar className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Ruler className="h-5 w-5 text-primary" />
              <span className="text-xs text-muted-foreground uppercase">Total m²</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.global_total_m2?.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-500/5 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-blue-400" />
              <span className="text-xs text-muted-foreground uppercase">Total Horas</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.global_total_hours?.toLocaleString()}h</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-500/5 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-green-400" />
              <span className="text-xs text-muted-foreground uppercase">Média m²/h</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.global_avg_m2_per_hour}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-5 w-5 text-yellow-400" />
              <span className="text-xs text-muted-foreground uppercase">Instalações</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.global_installations}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-purple-400" />
              <span className="text-xs text-muted-foreground uppercase">Famílias</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.total_families}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs by Family - Visual Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Desempenho por Família
        </h2>

        {kpis.length === 0 ? (
          <Card className="bg-card border-white/10">
            <CardContent className="p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum dado disponível para o período selecionado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map((kpi) => (
              <Card 
                key={kpi.family_name}
                className={`bg-gradient-to-br ${getFamilyColor(kpi.family_name)} border overflow-hidden`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{getFamilyIcon(kpi.family_name)}</span>
                      <div>
                        <CardTitle className="text-lg text-white">{kpi.family_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">#{kpi.rank} no ranking</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full bg-black/30 ${getEfficiencyColor(kpi.efficiency_percent)}`}>
                      {getEfficiencyIcon(kpi.efficiency_percent)}
                      <span className="text-sm font-bold">{kpi.efficiency_percent}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Main KPI */}
                  <div className="bg-black/20 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase mb-1">Produtividade</p>
                    <p className="text-4xl font-bold text-white">{kpi.avg_m2_per_hour}</p>
                    <p className="text-sm text-muted-foreground">m²/hora</p>
                  </div>

                  {/* Secondary KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/10 rounded-lg p-3">
                      <div className="flex items-center gap-1 mb-1">
                        <Ruler className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase">Total m²</span>
                      </div>
                      <p className="text-lg font-bold text-white">{kpi.total_m2.toLocaleString()}</p>
                    </div>
                    <div className="bg-black/10 rounded-lg p-3">
                      <div className="flex items-center gap-1 mb-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase">Total Horas</span>
                      </div>
                      <p className="text-lg font-bold text-white">{kpi.total_hours}h</p>
                    </div>
                    <div className="bg-black/10 rounded-lg p-3">
                      <div className="flex items-center gap-1 mb-1">
                        <Target className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase">Instalações</span>
                      </div>
                      <p className="text-lg font-bold text-white">{kpi.installation_count}</p>
                    </div>
                    <div className="bg-black/10 rounded-lg p-3">
                      <div className="flex items-center gap-1 mb-1">
                        <Percent className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase">Participação</span>
                      </div>
                      <p className="text-lg font-bold text-white">{kpi.share_of_total_m2}%</p>
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{kpi.unique_installers} instalador(es)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      <span>{kpi.unique_jobs} job(s)</span>
                    </div>
                  </div>

                  {/* Time Range */}
                  <div className="text-xs text-muted-foreground text-center">
                    <span>Tempo médio: </span>
                    <span className="text-white font-medium">{kpi.avg_duration_minutes.toFixed(0)} min</span>
                    <span className="text-muted-foreground"> ({kpi.min_duration_minutes}-{kpi.max_duration_minutes} min)</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detailed Table */}
      {kpis.length > 0 && (
        <Card className="bg-card border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tabela Detalhada de KPIs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-2 text-muted-foreground font-medium">#</th>
                    <th className="text-left py-3 px-2 text-muted-foreground font-medium">Família</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">m²/h</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Total m²</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Horas</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Qtd</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">m²/inst</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">Eficiência</th>
                    <th className="text-right py-3 px-2 text-muted-foreground font-medium">%Total</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((kpi, idx) => (
                    <tr key={kpi.family_name} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-2">
                        {idx < 3 ? (
                          <span className="text-lg">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                        ) : (
                          <span className="text-muted-foreground">{kpi.rank}</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <span>{getFamilyIcon(kpi.family_name)}</span>
                          <span className="text-white font-medium">{kpi.family_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-primary">{kpi.avg_m2_per_hour}</td>
                      <td className="py-3 px-2 text-right text-white">{kpi.total_m2.toLocaleString()}</td>
                      <td className="py-3 px-2 text-right text-muted-foreground">{kpi.total_hours}h</td>
                      <td className="py-3 px-2 text-right text-muted-foreground">{kpi.installation_count}</td>
                      <td className="py-3 px-2 text-right text-muted-foreground">{kpi.avg_m2_per_install}</td>
                      <td className="py-3 px-2 text-right">
                        <span className={`font-bold ${getEfficiencyColor(kpi.efficiency_percent)}`}>
                          {kpi.efficiency_percent}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right text-muted-foreground">{kpi.share_of_total_m2}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FamilyKPIsReport;
