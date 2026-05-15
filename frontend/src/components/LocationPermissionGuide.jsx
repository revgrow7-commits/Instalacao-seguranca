import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { MapPin, AlertCircle, CheckCircle, Smartphone, RefreshCw } from 'lucide-react';

/**
 * LocationPermissionGuide — espelha CameraPermissionGuide.jsx mas para geolocalização.
 * Callbacks:
 *   onPermissionGranted() — chamado quando a permissão é detectada como concedida.
 *   onSkip()             — chamado quando o usuário ignora/fecha o guia.
 */
const LocationPermissionGuide = ({ onPermissionGranted, onSkip }) => {
  const [permissionStatus, setPermissionStatus] = useState('checking');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobile);
    checkPermission();
  }, []);

  const checkPermission = async () => {
    if (!navigator.geolocation) {
      setPermissionStatus('unsupported');
      return;
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          setPermissionStatus(result.state);

          result.onchange = () => {
            setPermissionStatus(result.state);
            if (result.state === 'granted' && onPermissionGranted) {
              onPermissionGranted();
            }
          };
        } catch (permErr) {
          // Alguns browsers não suportam query de geolocalização
          console.warn('[LocationPermissionGuide] permissions.query não suportado:', permErr);
          setPermissionStatus('unknown');
        }
      } else {
        setPermissionStatus('unknown');
      }
    } catch (err) {
      console.warn('[LocationPermissionGuide] checkPermission error:', err);
      setPermissionStatus('unknown');
    }
  };

  // Tenta obter posição para forçar o prompt de permissão do browser.
  const requestPermission = () => {
    setPermissionStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      () => {
        setPermissionStatus('granted');
        if (onPermissionGranted) onPermissionGranted();
      },
      (err) => {
        if (err.code === 1) {
          setPermissionStatus('denied');
        } else {
          // Código 2 (indisponível) ou 3 (timeout) — permissão provavelmente
          // foi concedida mas sem sinal. Notificamos como granted para não
          // travar o instalador — requestGPS vai tentar de novo com fallback.
          setPermissionStatus('granted');
          if (onPermissionGranted) onPermissionGranted();
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else if (onPermissionGranted) {
      onPermissionGranted();
    }
  };

  // Permissão concedida
  if (permissionStatus === 'granted') {
    return (
      <Alert className="border-green-500/50 bg-green-500/10 mb-4">
        <CheckCircle className="h-4 w-4 text-green-400" />
        <AlertTitle className="text-white">GPS Autorizado</AlertTitle>
        <AlertDescription className="text-green-200 text-sm">
          Acesso à localização liberado. O check-in pode prosseguir.
        </AlertDescription>
      </Alert>
    );
  }

  // Dispositivo sem suporte a geolocalização
  if (permissionStatus === 'unsupported') {
    return (
      <Alert className="border-yellow-500/50 bg-yellow-500/10 mb-4">
        <Smartphone className="h-4 w-4 text-yellow-400" />
        <AlertTitle className="text-white">GPS Não Suportado</AlertTitle>
        <AlertDescription className="text-yellow-200 space-y-3">
          <p className="text-sm">
            Este dispositivo não suporta GPS. Use um smartphone com localização ativada para fazer check-in.
          </p>
          <Button
            onClick={handleSkip}
            size="sm"
            className="bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            Fechar
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Solicitando permissão (carregando)
  if (permissionStatus === 'requesting') {
    return (
      <Alert className="border-blue-500/50 bg-blue-500/10 mb-4">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
        <AlertTitle className="text-white">Solicitando GPS…</AlertTitle>
        <AlertDescription className="text-blue-200 text-sm">
          Aguarde — o browser está pedindo permissão de localização.
        </AlertDescription>
      </Alert>
    );
  }

  // Permissão negada — mostrar guia passo-a-passo
  if (permissionStatus === 'denied') {
    return (
      <Alert className="border-red-500/50 bg-red-500/10 mb-4">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <AlertTitle className="text-white">GPS Bloqueado</AlertTitle>
        <AlertDescription className="text-red-200 space-y-3">
          <p className="text-sm">
            O acesso à localização foi bloqueado. Siga os passos para liberar:
          </p>

          <div className="bg-black/30 p-3 rounded-lg space-y-2 text-sm">
            {isMobile ? (
              <>
                <p className="font-bold text-primary">📱 No Celular (Chrome Android):</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Toque nos <strong>3 pontinhos (⋮)</strong> do navegador</li>
                  <li>Vá em <strong>"Configurações do site"</strong></li>
                  <li>Procure <strong>"Localização"</strong> e mude para <strong>"Permitir"</strong></li>
                  <li>Volte para esta página</li>
                </ol>
                <p className="font-bold text-primary mt-2">📱 Safari (iPhone/iPad):</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Abra <strong>Ajustes</strong> do iPhone</li>
                  <li>Vá em <strong>Privacidade e Segurança → Serviços de Localização</strong></li>
                  <li>Procure o <strong>Safari</strong> e escolha <strong>"Ao usar o app"</strong></li>
                  <li>Recarregue esta página</li>
                </ol>
              </>
            ) : (
              <>
                <p className="font-bold text-primary">🖥️ No Computador (Chrome):</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Clique no <strong>cadeado 🔒</strong> na barra de endereço</li>
                  <li>Procure <strong>"Localização"</strong> e mude para <strong>"Permitir"</strong></li>
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
              Pular GPS
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Estado 'prompt', 'unknown' ou 'checking' — pedir permissão
  return (
    <Alert className="border-blue-500/50 bg-blue-500/10 mb-4">
      <MapPin className="h-4 w-4 text-blue-400" />
      <AlertTitle className="text-white">Autorização de GPS</AlertTitle>
      <AlertDescription className="text-blue-200 space-y-3">
        <p className="text-sm">
          Para registrar o check-in com localização, precisamos do acesso ao GPS do seu dispositivo.
        </p>

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={requestPermission}
            size="sm"
            className="bg-blue-500 hover:bg-blue-600"
          >
            <MapPin className="mr-2 h-4 w-4" />
            Autorizar GPS
          </Button>
          <Button
            onClick={handleSkip}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-white"
          >
            Pular GPS
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Se o popup não aparecer, clique no ícone de cadeado na barra de endereço e permita a localização.
        </p>
      </AlertDescription>
    </Alert>
  );
};

export default LocationPermissionGuide;
