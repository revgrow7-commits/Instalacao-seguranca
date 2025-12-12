import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { RefreshCw, X } from 'lucide-react';

const UpdateNotification = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    // Check for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        
        // Check for waiting worker
        if (reg.waiting) {
          setShowUpdate(true);
        }
        
        // Listen for new service worker
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdate(true);
              }
            });
          }
        });
      });

      // Handle controller change (new SW activated)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Check for updates periodically
    const checkForUpdates = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkForUpdates);
  }, []);

  const handleUpdate = () => {
    if (registration && registration.waiting) {
      // Tell waiting SW to take over
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdate(false);
  };

  const handleClearCache = async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    
    // Unregister service worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
    
    // Hard reload
    window.location.reload(true);
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      <div className="bg-primary/90 backdrop-blur-sm text-white rounded-lg shadow-lg p-4 border border-primary">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <div>
              <p className="font-medium">Nova versão disponível!</p>
              <p className="text-sm opacity-90">Atualize para ver as últimas melhorias.</p>
            </div>
          </div>
          <button 
            onClick={() => setShowUpdate(false)}
            className="text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            onClick={handleUpdate}
            variant="secondary"
            size="sm"
            className="flex-1 bg-white text-primary hover:bg-white/90"
          >
            Atualizar Agora
          </Button>
          <Button
            onClick={handleClearCache}
            variant="outline"
            size="sm"
            className="border-white/30 text-white hover:bg-white/10"
          >
            Limpar Cache
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
