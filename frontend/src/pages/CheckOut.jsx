import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Camera, MapPin, Loader2, CheckCircle, Clock, X } from 'lucide-react';
import { toast } from 'sonner';

const CheckOut = () => {
  const { checkinId } = useParams();
  const navigate = useNavigate();
  const [checkin, setCheckin] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [notes, setNotes] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    loadData();
    requestGPS();
    return () => {
      stopCamera();
    };
  }, [checkinId]);

  const loadData = async () => {
    try {
      const checkinsRes = await api.getCheckins();
      const checkinData = checkinsRes.data.find(c => c.id === checkinId);
      
      if (!checkinData) {
        toast.error('Check-in não encontrado');
        navigate('/dashboard');
        return;
      }

      setCheckin(checkinData);

      const jobRes = await api.getJob(checkinData.job_id);
      setJob(jobRes.data);
    } catch (error) {
      toast.error('Erro ao carregar dados');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const requestGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
          toast.success('Localização GPS capturada!');
        },
        (error) => {
          setGpsError(error.message);
          toast.error('Erro ao obter localização GPS');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      setGpsError('GPS não disponível neste dispositivo');
      toast.error('GPS não suportado');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (error) {
      toast.error('Erro ao acessar câmera');
      console.error('Camera error:', error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const photoData = canvas.toDataURL('image/jpeg', 0.8);
      setPhoto(photoData);
      stopCamera();
      toast.success('Foto capturada!');
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  const handleSubmit = async () => {
    if (!photo) {
      toast.error('Tire uma foto antes de fazer check-out');
      return;
    }

    if (!gpsLocation) {
      toast.error('Aguarde a captura da localização GPS');
      return;
    }

    setSubmitting(true);

    try {
      const photoBase64 = photo.split(',')[1];
      
      await api.checkout(checkinId, {
        gps_lat: gpsLocation.latitude,
        gps_long: gpsLocation.longitude,
        photo_base64: photoBase64,
        notes: notes
      });

      toast.success('Check-out realizado com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao fazer check-out');
    } finally {
      setSubmitting(false);
    }
  };

  const getElapsedTime = () => {
    if (!checkin) return '0h 0min';
    const start = new Date(checkin.checkin_at);
    const now = new Date();
    const diffMinutes = Math.floor((now - start) / 60000);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}min`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6" data-testid="checkout-page">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="text-white hover:text-primary mb-4"
        >
          ← Voltar
        </Button>
        <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
          Check-out
        </h1>
        <p className="text-muted-foreground mt-2">{job?.title}</p>
      </div>

      {/* Time Elapsed */}
      <Alert className="border-blue-500/50 bg-blue-500/10">
        <Clock className="h-4 w-4" />
        <AlertDescription className="text-white">
          <strong>Tempo de trabalho:</strong> {getElapsedTime()}
        </AlertDescription>
      </Alert>

      {/* GPS Status */}
      <Alert className={`border ${gpsLocation ? 'border-green-500/50 bg-green-500/10' : 'border-yellow-500/50 bg-yellow-500/10'}`}>
        <MapPin className="h-4 w-4" />
        <AlertDescription className="text-white">
          {gpsLocation ? (
            <>
              ✓ GPS Capturado: {gpsLocation.latitude.toFixed(6)}, {gpsLocation.longitude.toFixed(6)}
              <br />
              <span className="text-sm text-muted-foreground">Precisão: {gpsLocation.accuracy.toFixed(0)}m</span>
            </>
          ) : gpsError ? (
            <>
              ✗ Erro GPS: {gpsError}
              <Button size="sm" variant="link" onClick={requestGPS} className="text-primary">
                Tentar novamente
              </Button>
            </>
          ) : (
            'Obtendo localização GPS...'
          )}
        </AlertDescription>
      </Alert>

      {/* Camera */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Foto de Check-out
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!photo && !cameraActive && (
            <Button
              onClick={startCamera}
              className="w-full bg-primary hover:bg-primary/90 h-14"
              data-testid="open-camera-button"
            >
              <Camera className="mr-2 h-5 w-5" />
              Abrir Câmera
            </Button>
          )}

          {cameraActive && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={capturePhoto}
                  className="flex-1 bg-primary hover:bg-primary/90"
                  data-testid="capture-photo-button"
                >
                  <Camera className="mr-2 h-5 w-5" />
                  Capturar Foto
                </Button>
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {photo && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <img src={photo} alt="Check-out" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Foto Capturada
                </div>
              </div>
              <Button
                onClick={retakePhoto}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                <Camera className="mr-2 h-5 w-5" />
                Tirar Nova Foto
              </Button>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-white">Adicione observações sobre o trabalho (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Instalação concluída sem problemas, cliente satisfeito..."
              className="bg-white/5 border-white/10 text-white min-h-[100px]"
              data-testid="notes-textarea"
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!photo || !gpsLocation || submitting}
        className="w-full bg-green-500 hover:bg-green-600 text-white h-14 text-lg"
        data-testid="submit-checkout-button"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <CheckCircle className="mr-2 h-5 w-5" />
            Confirmar Check-out
          </>
        )}
      </Button>
    </div>
  );
};

export default CheckOut;