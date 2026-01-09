import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Coins, Users, TrendingUp, Award, Trophy, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const GamificationReport = () => {
  const { isAdmin, isManager } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    loadReport();
  }, [selectedMonth, selectedYear]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await api.getGamificationReport(selectedMonth, selectedYear);
      setReport(response.data);
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedRewards = async () => {
    setSeeding(true);
    try {
      const response = await api.seedRewards();
      toast.success(response.data.message);
    } catch (error) {
      toast.error('Erro ao criar prêmios padrão');
    } finally {
      setSeeding(false);
    }
  };

  const months = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' },
  ];

  const years = [2025, 2026, 2027];

  const getLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'bronze': return 'text-amber-500';
      case 'prata': return 'text-gray-400';
      case 'ouro': return 'text-yellow-400';
      case 'faixa preta': return 'text-primary';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8" data-testid="gamification-report">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-heading font-bold text-white flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-400" />
            Relatório de Bonificação
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Acompanhe o programa Faixa Preta
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button
              onClick={handleSeedRewards}
              disabled={seeding}
              variant="outline"
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              <Award className="h-4 w-4 mr-2" />
              {seeding ? 'Criando...' : 'Criar Prêmios Padrão'}
            </Button>
          )}
          <Button
            onClick={loadReport}
            variant="outline"
            className="border-white/20"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Mês:</span>
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px] bg-card border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Ano:</span>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px] bg-card border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {report?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-white/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Moedas Distribuídas</CardTitle>
              <Coins className="h-5 w-5 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-yellow-400">
                {report.totals.total_coins_distributed?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">neste mês</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Moedas Resgatadas</CardTitle>
              <Award className="h-5 w-5 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-green-400">
                {report.totals.total_coins_redeemed?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">neste mês</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Checkouts</CardTitle>
              <TrendingUp className="h-5 w-5 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-blue-400">
                {report.totals.total_checkouts || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">neste mês</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-white/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Instaladores Ativos</CardTitle>
              <Users className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {report.totals.active_installers || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">com pontuação</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Installers Table */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5" />
            Ranking de Instaladores - {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">#</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Instalador</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Filial</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Nível</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Ganhos Mês</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Checkouts</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Saldo Total</th>
                </tr>
              </thead>
              <tbody>
                {report?.installers?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum dado disponível para o período selecionado
                    </td>
                  </tr>
                ) : (
                  report?.installers?.map((installer, index) => (
                    <tr key={installer.user_id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4">
                        {index < 3 ? (
                          <span className="text-xl">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </span>
                        ) : (
                          <span className="text-gray-400">{index + 1}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-white font-medium">{installer.name}</p>
                          <p className="text-xs text-muted-foreground">{installer.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-300">{installer.branch || 'N/A'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-medium ${getLevelColor(installer.current_level)}`}>
                          {installer.level_icon} {installer.current_level}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-bold ${installer.month_earned > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                          +{installer.month_earned?.toLocaleString() || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-300">
                        {installer.checkouts_count || 0}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Coins className="h-4 w-4 text-yellow-400" />
                          <span className="text-yellow-400 font-bold">
                            {installer.total_coins?.toLocaleString() || 0}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Lifetime Stats */}
      {report?.installers && report.installers.length > 0 && (
        <Card className="bg-gradient-to-br from-primary/20 to-purple-500/10 border-primary/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              Hall da Fama - Moedas Acumuladas (Lifetime)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {report.installers
                .sort((a, b) => (b.lifetime_coins || 0) - (a.lifetime_coins || 0))
                .slice(0, 3)
                .map((installer, index) => (
                  <div
                    key={installer.user_id}
                    className={`p-4 rounded-lg ${
                      index === 0
                        ? 'bg-yellow-500/20 border border-yellow-500/30'
                        : index === 1
                        ? 'bg-gray-400/20 border border-gray-400/30'
                        : 'bg-amber-600/20 border border-amber-600/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </span>
                      <div className="flex-1">
                        <p className="text-white font-bold">{installer.name}</p>
                        <p className="text-sm text-muted-foreground">{installer.branch}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-yellow-400">
                          {installer.lifetime_coins?.toLocaleString() || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">moedas totais</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GamificationReport;
