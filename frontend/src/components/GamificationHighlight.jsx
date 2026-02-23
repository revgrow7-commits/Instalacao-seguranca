import React, { useEffect, useState } from 'react';
import { Coins, Trophy, Medal, Star, Crown, TrendingUp, Gift, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';

const GamificationHighlight = () => {
  const [topInstallers, setTopInstallers] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadGamificationData();
  }, []);

  const loadGamificationData = async () => {
    try {
      const response = await api.getGamificationReport();
      if (response.data) {
        // Get top 5 installers by total coins
        const sorted = [...(response.data.installers || [])].sort(
          (a, b) => (b.total_coins || 0) - (a.total_coins || 0)
        );
        setTopInstallers(sorted.slice(0, 5));
        setTotals({
          total_coins_distributed: response.data.totals?.total_coins_distributed || 0,
          total_coins_redeemed: response.data.totals?.total_coins_redeemed || 0,
          total_installers: response.data.totals?.active_installers || 0
        });
      }
    } catch (error) {
      console.error('Error loading gamification data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLevelStyle = (installer) => {
    const level = installer.current_level?.toLowerCase() || 'bronze';
    if (level.includes('faixa') || level.includes('preta')) {
      return { bg: 'bg-gradient-to-r from-gray-900 to-black', border: 'border-primary', text: 'text-primary' };
    }
    if (level.includes('ouro')) {
      return { bg: 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/20', border: 'border-yellow-500', text: 'text-yellow-400' };
    }
    if (level.includes('prata')) {
      return { bg: 'bg-gradient-to-r from-gray-400/20 to-gray-500/20', border: 'border-gray-400', text: 'text-gray-300' };
    }
    return { bg: 'bg-gradient-to-r from-amber-600/20 to-amber-700/20', border: 'border-amber-500', text: 'text-amber-400' };
  };

  const getRankIcon = (index) => {
    switch (index) {
      case 0:
        return <Crown className="h-5 w-5 text-yellow-400" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-300" />;
      case 2:
        return <Medal className="h-5 w-5 text-amber-600" />;
      default:
        return <Star className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 animate-pulse">
        <CardContent className="p-6 h-48" />
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-card via-card to-yellow-500/5 border-yellow-500/20 overflow-hidden relative">
      {/* Animated background sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-4 right-8 text-yellow-500/20 animate-pulse">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="absolute bottom-8 left-4 text-yellow-500/10 animate-pulse delay-300">
          <Coins className="h-12 w-12" />
        </div>
      </div>

      <CardHeader className="pb-2 relative">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Trophy className="h-5 w-5 text-yellow-400" />
            </div>
            <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent font-bold">
              Ranking de Gamificação
            </span>
          </CardTitle>
          <button
            onClick={() => navigate('/bonificacao')}
            className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1 transition-colors"
          >
            Ver detalhes
            <TrendingUp className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-2 relative">
        {/* Totals Summary */}
        {totals && (
          <div className="grid grid-cols-3 gap-2 mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-yellow-400">
                <Coins className="h-4 w-4" />
                <span className="text-lg font-bold">{totals.total_coins_distributed?.toLocaleString() || 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Distribuídas</p>
            </div>
            <div className="text-center border-x border-white/10">
              <div className="flex items-center justify-center gap-1 text-green-400">
                <Gift className="h-4 w-4" />
                <span className="text-lg font-bold">{totals.total_coins_redeemed?.toLocaleString() || 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Resgatadas</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-blue-400">
                <Star className="h-4 w-4" />
                <span className="text-lg font-bold">{totals.total_installers || 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Participantes</p>
            </div>
          </div>
        )}

        {/* Top Installers */}
        <div className="space-y-2">
          {topInstallers.length > 0 ? (
            topInstallers.map((installer, index) => {
              const levelStyle = getLevelStyle(installer.level);
              return (
                <div
                  key={installer.installer_id}
                  className={`flex items-center gap-3 p-2 rounded-lg ${levelStyle.bg} border ${levelStyle.border}/30 transition-all hover:scale-[1.02]`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10">
                    {getRankIcon(index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm truncate">{installer.name || 'Instalador'}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${levelStyle.text}`}>
                        {installer.level_icon} {installer.current_level || 'Bronze'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <Coins className="h-4 w-4 text-yellow-400" />
                      <span className="font-bold text-yellow-400 text-sm">
                        {(installer.total_coins || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum dado de gamificação ainda</p>
            </div>
          )}
        </div>

        {/* CTA to Shop */}
        <button
          onClick={() => navigate('/loja')}
          className="w-full mt-4 p-3 rounded-lg bg-gradient-to-r from-yellow-500/20 to-primary/20 border border-yellow-500/30 hover:border-yellow-500/50 transition-all group"
        >
          <div className="flex items-center justify-center gap-2">
            <Gift className="h-4 w-4 text-yellow-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium text-yellow-400">
              Loja Faixa Preta
            </span>
            <Sparkles className="h-4 w-4 text-yellow-400 group-hover:rotate-12 transition-transform" />
          </div>
        </button>
      </CardContent>
    </Card>
  );
};

export default GamificationHighlight;
