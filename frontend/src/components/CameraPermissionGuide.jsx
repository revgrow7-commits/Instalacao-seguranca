import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Camera, AlertCircle, CheckCircle, Smartphone, RefreshCw } from 'lucide-react';

const CameraPermissionGuide = ({ onPermissionGranted, onSkip }) => {
  const [permissionStatus, setPermissionStatus] = useState('checking');
  const [showGuide, setShowGuide] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobile);
    
    // On mobile, camera permission works differently through file input
    // So we can consider it "ready" if we detect mobile
    if (mobile) {
      setPermissionStatus('mobile-ready');
      if (onPermissionGranted) {
        onPermissionGranted();
      }
      return;
    }
    
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      // Check if Permissions API is supported
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({ name: 'camera' });
          setPermissionStatus(result.state);
          
          result.onchange = () => {
            setPermissionStatus(result.state);
            if (result.state === 'granted' && onPermissionGranted) {
              onPermissionGranted();
            }
          };
        } catch (permError) {
          // Firefox doesn't support camera permission query
          console.log('Camera permission query not supported:', permError);
          setPermissionStatus('unknown');
        }
      } else {
        setPermissionStatus('unknown');
      }
    } catch (error) {
      console.log('Permission API error:', error);
      setPermissionStatus('unknown');
    }
  };

  const requestPermission = async () => {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback for older browsers - use file input
        setPermissionStatus('fallback');
        if (onPermissionGranted) {
          onPermissionGranted();
        }
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      // Stop the stream immediately
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus('granted');
      
      if (onPermissionGranted) {
        onPermissionGranted();
      }
    } catch (error) {
      console.error('Permission error:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionStatus('denied');
        setShowGuide(true);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        // No camera found - allow fallback to file upload
        setPermissionStatus('no-camera');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        // Camera is being used by another app
        setPermissionStatus('in-use');
      } else if (error.name === 'OverconstrainedError') {
        // Try without constraints
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
          setPermissionStatus('granted');
          if (onPermissionGranted) onPermissionGranted();
        } catch {
          setPermissionStatus('error');
        }
      } else {
        // For any other error, use fallback
        setPermissionStatus('fallback');
        if (onPermissionGranted) {
          onPermissionGranted();
        }
      }
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else if (onPermissionGranted) {
      onPermissionGranted();
    }
  };

  // Mobile ready - no guide needed
  if (permissionStatus === 'mobile-ready' || permissionStatus === 'fallback') {
    return null;
  }

  // Permission granted
  if (permissionStatus === 'granted') {
    return (
      <Alert className="border-green-500/50 bg-green-500/10 mb-4">
        <CheckCircle className="h-4 w-4 text-green-400" />
        <AlertTitle className="text-white">Câmera Autorizada</AlertTitle>
        <AlertDescription className="text-green-200 text-sm">
          Acesso à câmera liberado. Você pode tirar fotos para o check-in.
        </AlertDescription>
      </Alert>
    );
  }

  // Camera in use
  if (permissionStatus === 'in-use') {
    return (
      <Alert className="border-orange-500/50 bg-orange-500/10 mb-4">
        <AlertCircle className="h-4 w-4 text-orange-400" />
        <AlertTitle className="text-white">Câmera em Uso</AlertTitle>
        <AlertDescription className="text-orange-200 space-y-3">
          <p className="text-sm">
            A câmera está sendo usada por outro aplicativo. Feche outros apps que usam a câmera e tente novamente.
          </p>
          <Button
            onClick={requestPermission}
            size="sm"
            className="bg-orange-500 hover:bg-orange-600"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar Novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // No camera found
  if (permissionStatus === 'no-camera') {
    return (
      <Alert className="border-yellow-500/50 bg-yellow-500/10 mb-4">
        <Smartphone className="h-4 w-4 text-yellow-400" />
        <AlertTitle className="text-white">Câmera Não Encontrada</AlertTitle>
        <AlertDescription className="text-yellow-200 space-y-3">
          <p className="text-sm">
            Nenhuma câmera foi detectada. Você pode escolher uma foto da galeria.
          </p>
          <Button
            onClick={handleSkip}
            size="sm"
            className="bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            Usar Galeria
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Permission denied - show guide
  if (permissionStatus === 'denied' || showGuide) {
    return (
      <Alert className="border-red-500/50 bg-red-500/10 mb-4">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <AlertTitle className="text-white">Câmera Bloqueada</AlertTitle>
        <AlertDescription className="text-red-200 space-y-3">
          <p className="text-sm">
            O acesso à câmera foi bloqueado. Siga os passos abaixo:
          </p>
          
          <div className="bg-black/30 p-3 rounded-lg space-y-2 text-sm">
            {isMobile ? (
              <>
                <p className="font-bold text-primary">📱 No Celular:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Toque nos <strong>3 pontinhos (⋮)</strong> do navegador</li>
                  <li>Vá em <strong>"Configurações do site"</strong></li>
                  <li>Procure <strong>"Câmera"</strong> e permita</li>
                  <li>Recarregue a página</li>
                </ol>
              </>
            ) : (
              <>
                <p className="font-bold text-primary">🖥️ No Computador:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Clique no <strong>cadeado 🔒</strong> na barra de endereço</li>
                  <li>Procure <strong>"Câmera"</strong> e mude para <strong>"Permitir"</strong></li>
                  <li>Recarregue a página (F5)</li>
                </ol>
              </>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => window.location.reload()}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </Button>
            <Button
              onClick={requestPermission}
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Tentar Novamente
            </Button>
            <Button
              onClick={handleSkip}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-white"
            >
              Usar Galeria
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Prompt or unknown - ask for permission
  if (permissionStatus === 'prompt' || permissionStatus === 'unknown' || permissionStatus === 'checking') {
    return (
      <Alert className="border-blue-500/50 bg-blue-500/10 mb-4">
        <Camera className="h-4 w-4 text-blue-400" />
        <AlertTitle className="text-white">Autorização de Câmera</AlertTitle>
        <AlertDescription className="text-blue-200 space-y-3">
          <p className="text-sm">
            Para tirar fotos do check-in, precisamos do acesso à câmera.
          </p>
          
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={requestPermission}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600"
            >
              <Camera className="mr-2 h-4 w-4" />
              Autorizar Câmera
            </Button>
            <Button
              onClick={handleSkip}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-white"
            >
              Usar Galeria
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            💡 Se o popup não aparecer, clique no ícone de cadeado na barra de endereço.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};

export default CameraPermissionGuide;
