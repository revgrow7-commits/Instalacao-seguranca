import React from 'react';
import { Coins, Trophy, TrendingUp } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';

const GamificationWidget = ({ balance, levelInfo, compact = false }) => {
  if (!balance) return null;

  const levelColors = {
    bronze: 'from-amber-600 to-amber-800',
    prata: 'from-gray-300 to-gray-500',
    ouro: 'from-yellow-400 to-yellow-600',
    faixa_preta: 'from-gray-900 to-black'
  };

  const levelBorderColors = {
    bronze: 'border-amber-500',
    prata: 'border-gray-400',
    ouro: 'border-yellow-400',
    faixa_preta: 'border-primary'
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 rounded-full px-3 py-1.5 border border-yellow-500/30">
        <Coins className="h-4 w-4 text-yellow-400" />
        <span className="font-bold text-yellow-400">{balance.total_coins?.toLocaleString() || 0}</span>
        <span className="text-xs text-yellow-400/70">{levelInfo?.icon || '🥉'}</span>
      </div>
    );
  }

  return (
    <Card className={`bg-gradient-to-br ${levelColors[levelInfo?.level] || levelColors.bronze} border-2 ${levelBorderColors[levelInfo?.level] || levelBorderColors.bronze}`}>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl">
              {levelInfo?.icon || '🥉'}
            </div>
            <div>
              <p className="text-white/70 text-sm">Seu Nível</p>
              <h3 className="text-xl font-bold text-white">{levelInfo?.name || 'Bronze'}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-sm">Saldo</p>
            <div className="flex items-center gap-1">
              <Coins className="h-5 w-5 text-yellow-300" />
              <span className="text-2xl font-bold text-white">{balance.total_coins?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>

        {/* Progress to Next Level */}
        {levelInfo?.next_level && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70 flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Progresso para {levelInfo.next_level === 'prata' ? 'Prata' : levelInfo.next_level === 'ouro' ? 'Ouro' : 'Faixa Preta'}
              </span>
              <span className="text-white font-medium">{levelInfo.progress}%</span>
            </div>
            <Progress value={levelInfo.progress} className="h-2 bg-white/20" />
            <p className="text-xs text-white/60 text-center">
              Faltam <span className="font-bold text-white">{levelInfo.coins_to_next?.toLocaleString()}</span> moedas para o próximo nível
            </p>
          </div>
        )}

        {levelInfo?.level === 'faixa_preta' && (
          <div className="flex items-center justify-center gap-2 mt-2 text-white">
            <Trophy className="h-5 w-5 text-yellow-300" />
            <span className="font-bold">Nível Máximo Alcançado!</span>
          </div>
        )}

        {/* Lifetime Stats */}
        <div className="mt-4 pt-4 border-t border-white/20 flex justify-between text-sm">
          <div>
            <p className="text-white/60">Total Acumulado</p>
            <p className="text-white font-bold">{balance.lifetime_coins?.toLocaleString() || 0} moedas</p>
          </div>
          <div className="text-right">
            <p className="text-white/60">Membro desde</p>
            <p className="text-white font-bold">
              {balance.created_at ? new Date(balance.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : 'N/A'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GamificationWidget;
