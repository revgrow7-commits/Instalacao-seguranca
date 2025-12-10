import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertTriangle } from 'lucide-react';

const BrowserCheck = () => {
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    const checks = [];

    // Check HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      checks.push('O site não está usando HTTPS. Câmera e GPS podem não funcionar.');
    }

    // Check camera support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      checks.push('Seu navegador não suporta acesso à câmera.');
    }

    // Check geolocation support
    if (!navigator.geolocation) {
      checks.push('Seu navegador não suporta geolocalização (GPS).');
    }

    setWarnings(checks);
  }, []);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <Alert className="border-orange-500/50 bg-orange-500/10 mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-white">Atenção</AlertTitle>
      <AlertDescription className="text-white">
        <ul className="list-disc list-inside space-y-1 mt-2">
          {warnings.map((warning, index) => (
            <li key={index} className="text-sm">{warning}</li>
          ))}
        </ul>
        <p className="text-sm mt-2">
          Recomendamos usar um navegador moderno (Chrome, Safari, Firefox) e garantir que está acessando via HTTPS.
        </p>
      </AlertDescription>
    </Alert>
  );
};

export default BrowserCheck;
