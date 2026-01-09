import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Trophy, Medal, Flame, TrendingUp, Coins } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const WeeklyLeaderboard = ({ compact = false }) => {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState(null);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const response = await api.getLeaderboard('week', 10);
      setLeaderboard(response.data.leaderboard || []);
      
      // Find current user's rank
      const myRank = response.data.leaderboard?.find(r => r.user_id === user?.id);
      setUserRank(myRank);
    } catch (error) {
      console.log('Could not load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1:
        return <span className="text-2xl">🥇</span>;
      case 2:
        return <span className="text-2xl">🥈</span>;
      case 3:
        return <span className="text-2xl">🥉</span>;
      default:
        return <span className="text-lg font-bold text-gray-400">{rank}º</span>;
    }
  };

  const getRankStyle = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 border-yellow-500/30';
      case 2:
        return 'bg-gradient-to-r from-gray-400/20 to-gray-500/10 border-gray-400/30';
      case 3:
        return 'bg-gradient-to-r from-amber-600/20 to-amber-700/10 border-amber-600/30';
      default:
        return 'bg-white/5 border-white/10';
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5">
        <CardContent className="py-8 text-center">
          <div className="loading-pulse text-muted-foreground">Carregando ranking...</div>
        </CardContent>
      </Card>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Card className="bg-card border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Ranking Semanal
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center">
          <Medal className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Nenhuma pontuação registrada esta semana.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Complete check-outs para aparecer no ranking!
          </p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    // Compact version for sidebar or small spaces
    return (
      <Card className="bg-card border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-400" />
            Top 3 da Semana
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {leaderboard.slice(0, 3).map((entry) => (
            <div 
              key={entry.user_id}
              className={`flex items-center justify-between p-2 rounded-lg border ${getRankStyle(entry.rank)} ${
                entry.user_id === user?.id ? 'ring-2 ring-primary' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {getRankIcon(entry.rank)}
                <span className={`text-sm font-medium ${entry.user_id === user?.id ? 'text-primary' : 'text-white'}`}>
                  {entry.name}
                </span>
              </div>
              <span className="text-yellow-400 font-bold text-sm">
                +{entry.coins_earned}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-white/5 overflow-hidden">
      <CardHeader className="pb-2 bg-gradient-to-r from-yellow-500/10 to-orange-500/5 border-b border-white/5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Ranking Semanal
            <Flame className="h-4 w-4 text-orange-500 animate-pulse" />
          </CardTitle>
          <span className="text-xs text-muted-foreground bg-white/10 px-2 py-1 rounded-full">
            Esta semana
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-white/5">
          {leaderboard.map((entry, index) => {
            const isCurrentUser = entry.user_id === user?.id;
            return (
              <div
                key={entry.user_id}
                className={`flex items-center justify-between p-3 md:p-4 transition-colors ${
                  isCurrentUser 
                    ? 'bg-primary/10 border-l-4 border-primary' 
                    : index < 3 
                    ? getRankStyle(entry.rank)
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 flex justify-center">
                    {getRankIcon(entry.rank)}
                  </div>
                  <div>
                    <p className={`font-medium ${isCurrentUser ? 'text-primary' : 'text-white'}`}>
                      {entry.name}
                      {isCurrentUser && <span className="ml-2 text-xs text-primary">(Você)</span>}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{entry.level_icon} {entry.level}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Coins className="h-4 w-4 text-yellow-400" />
                    <span className="text-lg font-bold text-yellow-400">+{entry.coins_earned}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">moedas</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Current user not in top 10 */}
        {userRank === null && user && (
          <div className="p-4 bg-white/5 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 flex justify-center">
                  <span className="text-sm text-muted-foreground">--</span>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">
                    {user.name} (Você)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Complete check-outs para subir no ranking!
                  </p>
                </div>
              </div>
              <div className="text-right">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyLeaderboard;
