import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Camera, Loader2, CheckCircle, X, Upload } from 'lucide-react';
import { toast } from 'sonner';

const CheckIn = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [locationAuthorized, setLocationAuthorized] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadJob();
    return () => {
      stopCamera();
    };
  }, [jobId]);

  const loadJob = async () => {
    try {
      const response = await api.getJob(jobId);
      setJob(response.data);
    } catch (error) {
      toast.error('Erro ao carregar job');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraActive(true);
          toast.success('Câmera aberta!');
        };
      }
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Não foi possível abrir a câmera. Use o botão de upload de foto.');
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
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'checkin.jpg', { type: 'image/jpeg' });
          setPhotoFile(file);
          setPhoto(URL.createObjectURL(blob));
          stopCamera();
          toast.success('Foto capturada!');
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setPhotoFile(file);
      setPhoto(URL.createObjectURL(file));
      toast.success('Foto selecionada!');
    } else {
      toast.error('Por favor, selecione uma imagem válida');
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    setPhotoFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!photoFile) {
      toast.error('Tire uma foto ou faça upload de uma imagem');
      return;
    }

    if (!locationAuthorized) {
      toast.error('Por favor, autorize o uso de localização em tempo real');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('job_id', jobId);
      formData.append('photo', photoFile);
      
      await api.createCheckin(formData);

      toast.success('Check-in realizado com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao fazer check-in');
    } finally {
      setSubmitting(false);
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
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6" data-testid="checkin-page">
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
          Check-in
        </h1>
        <p className="text-muted-foreground mt-2">{job?.title}</p>
      </div>

      {/* Location Authorization */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="location-auth"
              checked={locationAuthorized}
              onCheckedChange={setLocationAuthorized}
              className="mt-1"
            />
            <div className="flex-1">
              <Label
                htmlFor="location-auth"
                className="text-white font-medium cursor-pointer"
              >
                Autorizo o uso de localização em tempo real
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Confirmo que estou no local correto para realizar este check-in
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Camera */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Foto de Check-in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!photo && !cameraActive && (
            <div className="space-y-3">
              <Button
                onClick={startCamera}
                className="w-full bg-primary hover:bg-primary/90 h-14"
                data-testid="open-camera-button"
              >
                <Camera className="mr-2 h-5 w-5" />
                Abrir Câmera
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10 h-14"
              >
                <Upload className="mr-2 h-5 w-5" />
                Selecionar Foto
              </Button>
            </div>
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
                <img src={photo} alt="Check-in" className="w-full h-full object-cover" />
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
                Trocar Foto
              </Button>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </CardContent>
      </Card>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!photoFile || !locationAuthorized || submitting}
        className="w-full bg-green-500 hover:bg-green-600 text-white h-14 text-lg"
        data-testid="submit-checkin-button"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <CheckCircle className="mr-2 h-5 w-5" />
            Confirmar Check-in
          </>
        )}
      </Button>
    </div>
  );
};

export default CheckIn;