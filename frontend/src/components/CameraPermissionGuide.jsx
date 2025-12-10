import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Camera, AlertCircle, CheckCircle } from 'lucide-react';

const CameraPermissionGuide = ({ onPermissionGranted }) => {
  const [permissionStatus, setPermissionStatus] = useState('checking'); // checking, granted, denied, prompt
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'camera' });
        setPermissionStatus(result.state); // 'granted', 'denied', or 'prompt'
        
        result.onchange = () => {
          setPermissionStatus(result.state);
          if (result.state === 'granted' && onPermissionGranted) {
            onPermissionGranted();
          }
        };
      } else {
        setPermissionStatus('unknown');
      }
    } catch (error) {
      console.log('Permission API not supported:', error);
      setPermissionStatus('unknown');
    }
  };

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus('granted');
      if (onPermissionGranted) {
        onPermissionGranted();
      }
    } catch (error) {
      console.error('Permission error:', error);
      if (error.name === 'NotAllowedError') {
        setPermissionStatus('denied');
        setShowGuide(true);
      }
    }
  };

  if (permissionStatus === 'granted') {
    return (
      <Alert className="border-green-500/50 bg-green-500/10 mb-4">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle className="text-white">Câmera Autorizada</AlertTitle>
        <AlertDescription className="text-white text-sm">
          Você já autorizou o acesso à câmera. Clique em "Abrir Câmera" para continuar.
        </AlertDescription>
      </Alert>
    );
  }

  if (permissionStatus === 'denied' || showGuide) {
    return (
      <Alert className="border-red-500/50 bg-red-500/10 mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="text-white">Câmera Bloqueada</AlertTitle>
        <AlertDescription className="text-white space-y-3">
          <p className="text-sm">
            O Chrome bloqueou o acesso à câmera. Siga os passos para desbloquear:
          </p>
          
          <div className="bg-black/30 p-3 rounded-lg space-y-2 text-sm">
            <p className="font-bold text-primary">📱 Passo a Passo:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Clique no <strong>ícone de cadeado 🔒</strong> (ou câmera 📷) na barra de endereço</li>
              <li>Procure por <strong>"Câmera"</strong> nas permissões</li>
              <li>Mude de <strong>"Bloquear"</strong> para <strong>"Permitir"</strong></li>
              <li>Clique em <strong>"Recarregar"</strong> ou pressione F5</li>
            </ol>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => window.location.reload()}
              className="bg-primary hover:bg-primary/90"
            >
              Recarregar Página
            </Button>
            <Button
              onClick={requestPermission}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Tentar Novamente
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (permissionStatus === 'prompt' || permissionStatus === 'unknown') {
    return (
      <Alert className="border-yellow-500/50 bg-yellow-500/10 mb-4">
        <Camera className="h-4 w-4" />
        <AlertTitle className="text-white">Autorização Necessária</AlertTitle>
        <AlertDescription className="text-white space-y-3">
          <p className="text-sm">
            Para fazer check-in, você precisa autorizar o acesso à câmera.
          </p>
          
          <Button
            onClick={requestPermission}
            className="w-full bg-primary hover:bg-primary/90"
          >
            <Camera className="mr-2 h-5 w-5" />
            Solicitar Acesso à Câmera
          </Button>

          <p className="text-xs text-muted-foreground">
            ⚠️ Se o popup não aparecer, a câmera pode estar bloqueada. Clique no ícone de cadeado na barra de endereço.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};

export default CameraPermissionGuide;
