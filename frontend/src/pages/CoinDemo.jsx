import React, { useState } from 'react';
import CoinAnimation from '../components/CoinAnimation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Coins, Play } from 'lucide-react';

const CoinDemo = () => {
  const [showAnimation, setShowAnimation] = useState(false);
  const [coins, setCoins] = useState(150);

  const handleTrigger = (amount) => {
    setCoins(amount);
    setShowAnimation(true);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <CoinAnimation 
        show={showAnimation} 
        coins={coins} 
        onComplete={() => setShowAnimation(false)}
      />

      <Card className="max-w-md mx-auto bg-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Coins className="h-6 w-6 text-yellow-400" />
            Demo: Animação de Moedas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Clique nos botões abaixo para simular diferentes quantidades de moedas ganhas após um checkout.
          </p>
          
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={() => handleTrigger(50)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              +50 moedas
            </Button>
            <Button 
              onClick={() => handleTrigger(100)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-4 w-4 mr-2" />
              +100 moedas
            </Button>
            <Button 
              onClick={() => handleTrigger(250)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Play className="h-4 w-4 mr-2" />
              +250 moedas
            </Button>
            <Button 
              onClick={() => handleTrigger(500)}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              <Play className="h-4 w-4 mr-2" />
              +500 moedas
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground text-center pt-4">
            Esta animação aparece automaticamente após cada checkout com m² registrado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CoinDemo;
