import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Bell, BellOff, Loader2, AlertCircle } from 'lucide-react';
import usePushNotifications from '../hooks/usePushNotifications';
import { toast } from 'sonner';

const NotificationPermissionModal = ({ isOpen, onClose, onComplete }) => {
  const { 
    isSupported, 
    isSubscribed, 
    permission, 
    loading, 
    subscribe, 
    unsubscribe 
  } = usePushNotifications();
  
  // Show modal only if:
  // 1. Push is supported
  // 2. User is not already subscribed
  // 3. Permission is not denied
  // 4. isOpen is true
  const shouldShowModal = isOpen && isSupported && !isSubscribed && permission !== 'denied';

  const handleAllow = async () => {
    try {
      const success = await subscribe();
      if (success) {
        toast.success('Notificações ativadas com sucesso!');
        onComplete && onComplete(true);
      } else {
        toast.error('Erro ao ativar notificações');
      }
    } catch (err) {
      console.error('Error enabling notifications:', err);
      toast.error('Erro ao ativar notificações: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const handleDeny = () => {
    onClose && onClose();
    onComplete && onComplete(false);
  };

  if (!isSupported) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && (onClose && onClose())}>
        <DialogContent className="bg-card border-white/10 max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-yellow-500/20 rounded-full">
                <AlertCircle className="h-12 w-12 text-yellow-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-heading text-white text-center">
              Notificações
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-center mt-4">
              Seu navegador não suporta notificações push. Para receber alertas, use um navegador moderno como Chrome, Firefox ou Edge.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button 
              onClick={() => onClose && onClose()} 
              className="bg-primary hover:bg-primary/90 w-full"
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={showModal} onOpenChange={(open) => !open && handleDeny()}>
      <DialogContent className="bg-card border-white/10 max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-primary/20 rounded-full">
              <Bell className="h-12 w-12 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-heading text-white text-center">
            Ativar Notificações
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-center mt-4">
            Receba alertas sobre:
            <ul className="mt-4 space-y-2 text-left">
              <li className="flex items-center gap-2">
                <span className="text-primary">📅</span>
                <span>Novos agendamentos de jobs</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">⏰</span>
                <span>Lembretes de check-in</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">⚠️</span>
                <span>Alertas de atrasos</span>
              </li>
            </ul>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-6 flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDeny}
            className="border-white/20 text-white hover:bg-white/10 w-full sm:w-auto"
          >
            <BellOff className="mr-2 h-4 w-4" />
            Agora Não
          </Button>
          <Button
            onClick={handleAllow}
            disabled={loading}
            className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bell className="mr-2 h-4 w-4" />
            )}
            Ativar Notificações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPermissionModal;
