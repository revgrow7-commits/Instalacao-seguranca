import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Coins, Gift, ShoppingBag, Trophy, History, CheckCircle, Clock, XCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import GamificationWidget from '../components/GamificationWidget';

const LojaFaixaPreta = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [levelInfo, setLevelInfo] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState(null);
  const [redeeming, setRedeeming] = useState(false);
  const [activeTab, setActiveTab] = useState('store');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [balanceRes, rewardsRes, redemptionsRes] = await Promise.all([
        api.getGamificationBalance(),
        api.getRewards(),
        api.getMyRedemptions()
      ]);
      
      setBalance(balanceRes.data);
      setLevelInfo(balanceRes.data.level_info);
      setRewards(rewardsRes.data);
      setRedemptions(redemptionsRes.data);
    } catch (error) {
      console.error('Error loading gamification data:', error);
      toast.error('Erro ao carregar dados da loja');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!selectedReward) return;
    
    setRedeeming(true);
    try {
      const response = await api.redeemReward(selectedReward.id);
      toast.success(response.data.message);
      setSelectedReward(null);
      loadData(); // Reload data
    } catch (error) {
      const message = error.response?.data?.detail || 'Erro ao resgatar prêmio';
      toast.error(message);
    } finally {
      setRedeeming(false);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'voucher': return <ShoppingBag className="h-6 w-6" />;
      case 'equipment': return <Gift className="h-6 w-6" />;
      case 'bonus': return <Coins className="h-6 w-6" />;
      case 'experience': return <Trophy className="h-6 w-6" />;
      default: return <Gift className="h-6 w-6" />;
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'voucher': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'equipment': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'bonus': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'experience': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="flex items-center gap-1 text-yellow-400"><Clock className="h-4 w-4" /> Pendente</span>;
      case 'approved':
        return <span className="flex items-center gap-1 text-blue-400"><CheckCircle className="h-4 w-4" /> Aprovado</span>;
      case 'delivered':
        return <span className="flex items-center gap-1 text-green-400"><CheckCircle className="h-4 w-4" /> Entregue</span>;
      case 'rejected':
        return <span className="flex items-center gap-1 text-red-400"><XCircle className="h-4 w-4" /> Rejeitado</span>;
      default:
        return <span className="text-gray-400">{status}</span>;
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
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-24 md:pb-8" data-testid="loja-faixa-preta">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-heading font-bold text-white flex items-center gap-3">
            <span className="text-3xl">🥋</span>
            Loja Faixa Preta
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Troque suas moedas por prêmios exclusivos
          </p>
        </div>
      </div>

      {/* Balance Widget */}
      <GamificationWidget balance={balance} levelInfo={levelInfo} />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'store'
              ? 'bg-primary/20 text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="h-4 w-4 inline mr-2" />
          Prêmios
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-primary/20 text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <History className="h-4 w-4 inline mr-2" />
          Meus Resgates
        </button>
      </div>

      {/* Store Tab */}
      {activeTab === 'store' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {rewards.length === 0 ? (
            <Card className="col-span-full bg-card border-white/5">
              <CardContent className="py-12 text-center">
                <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum prêmio disponível no momento</p>
              </CardContent>
            </Card>
          ) : (
            rewards.map((reward) => {
              const canAfford = (balance?.total_coins || 0) >= reward.cost_coins;
              const isOutOfStock = reward.stock !== null && reward.stock <= 0;
              
              return (
                <Card
                  key={reward.id}
                  className={`bg-card border-white/5 hover:border-primary/50 transition-all ${
                    !canAfford || isOutOfStock ? 'opacity-60' : ''
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-lg ${getCategoryColor(reward.category)} border`}>
                        {getCategoryIcon(reward.category)}
                      </div>
                      {isOutOfStock && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
                          Esgotado
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-lg text-white mt-3">{reward.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{reward.description}</p>
                    
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <div className="flex items-center gap-1">
                        <Coins className="h-5 w-5 text-yellow-400" />
                        <span className="text-xl font-bold text-yellow-400">{reward.cost_coins.toLocaleString()}</span>
                      </div>
                      
                      <Button
                        onClick={() => setSelectedReward(reward)}
                        disabled={!canAfford || isOutOfStock}
                        className={`${
                          canAfford && !isOutOfStock
                            ? 'bg-primary hover:bg-primary/90'
                            : 'bg-gray-600 cursor-not-allowed'
                        }`}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Resgatar
                      </Button>
                    </div>
                    
                    {!canAfford && !isOutOfStock && (
                      <p className="text-xs text-red-400 text-center">
                        Faltam {(reward.cost_coins - (balance?.total_coins || 0)).toLocaleString()} moedas
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {redemptions.length === 0 ? (
            <Card className="bg-card border-white/5">
              <CardContent className="py-12 text-center">
                <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Você ainda não resgatou nenhum prêmio</p>
              </CardContent>
            </Card>
          ) : (
            redemptions.map((redemption) => (
              <Card key={redemption.id} className="bg-card border-white/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Gift className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{redemption.reward_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(redemption.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(redemption.status)}
                    <p className="text-sm text-yellow-400 mt-1">
                      -{redemption.cost_coins.toLocaleString()} moedas
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Redeem Confirmation Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Confirmar Resgate
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Você está prestes a resgatar este prêmio
            </DialogDescription>
          </DialogHeader>
          
          {selectedReward && (
            <div className="space-y-4 py-4">
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-lg font-bold text-white">{selectedReward.name}</h4>
                <p className="text-sm text-muted-foreground mt-1">{selectedReward.description}</p>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <span className="text-white">Custo:</span>
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-yellow-400" />
                  <span className="text-xl font-bold text-yellow-400">
                    {selectedReward.cost_coins.toLocaleString()}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <span className="text-muted-foreground">Seu saldo atual:</span>
                <span className="text-white font-bold">{balance?.total_coins?.toLocaleString() || 0} moedas</span>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                <span className="text-white">Saldo após resgate:</span>
                <span className="text-green-400 font-bold">
                  {((balance?.total_coins || 0) - selectedReward.cost_coins).toLocaleString()} moedas
                </span>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedReward(null)}
              className="border-white/20"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRedeem}
              disabled={redeeming}
              className="bg-primary hover:bg-primary/90"
            >
              {redeeming ? 'Resgatando...' : 'Confirmar Resgate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LojaFaixaPreta;
