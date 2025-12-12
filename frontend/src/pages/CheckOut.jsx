import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Loader2, CheckCircle, Clock, Upload, Ruler, Mountain, Building, Target } from 'lucide-react';
import { toast } from 'sonner';

// Opções de métricas (mesmas da seção de Métricas)
const complexityOptions = [
  { value: "1", label: "1 - Muito Fácil", color: "bg-green-500" },
  { value: "2", label: "2 - Fácil", color: "bg-blue-500" },
  { value: "3", label: "3 - Médio", color: "bg-yellow-500" },
  { value: "4", label: "4 - Difícil", color: "bg-orange-500" },
  { value: "5", label: "5 - Muito Difícil", color: "bg-red-500" }
];

const heightOptions = [
  { value: "terreo", label: "Térreo (até 2m)", icon: "🏠" },
  { value: "media", label: "Média (2-4m)", icon: "🏢" },
  { value: "alta", label: "Alta (4-8m)", icon: "🏗️" },
  { value: "muito_alta", label: "Muito Alta (+8m)", icon: "🏔️" }
];

const scenarioOptions = [
  { value: "loja_rua", label: "Loja de Rua", icon: "🏪" },
  { value: "shopping", label: "Shopping", icon: "🛒" },
  { value: "evento", label: "Evento", icon: "🎪" },
  { value: "fachada", label: "Fachada", icon: "🏛️" },
  { value: "outdoor", label: "Outdoor", icon: "📺" },
  { value: "veiculo", label: "Veículo", icon: "🚗" }
];

const CheckOut = () => {
  const { checkinId } = useParams();
  const navigate = useNavigate();
  const [checkin, setCheckin] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [locationAuthorized, setLocationAuthorized] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [installedM2, setInstalledM2] = useState('');
  
  // Novos campos de métricas
  const [complexityLevel, setComplexityLevel] = useState('');
  const [heightCategory, setHeightCategory] = useState('');
  const [scenarioCategory, setScenarioCategory] = useState('');
  const [difficultyDescription, setDifficultyDescription] = useState('');
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [checkinId]);

  useEffect(() => {
    if (locationAuthorized) {
      getGPSLocation();
    }
  }, [locationAuthorized]);

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

  const getGPSLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada pelo navegador');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setGpsLoading(false);
        toast.success('Localização capturada com sucesso!');
      },
      (error) => {
        console.error('GPS error:', error);
        toast.error('Erro ao capturar localização. Verifique as permissões do navegador.');
        setGpsLoading(false);
        setLocationAuthorized(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setPhotoBase64(base64.split(',')[1]); // Remove prefix
        setPhoto(base64);
        toast.success('Foto selecionada!');
      };
      reader.readAsDataURL(file);
    } else {
      toast.error('Por favor, selecione uma imagem válida');
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    setPhotoBase64(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDifficultyChange = (value) => {
    setDifficultyLevel(value);
    if (!value) {
      setDifficultyDescription('');
    }
  };

  const handleSubmit = async () => {
    if (!photoBase64) {
      toast.error('Tire uma foto ou faça upload de uma imagem');
      return;
    }

    if (!locationAuthorized || !gpsCoords) {
      toast.error('Por favor, autorize o uso de localização e aguarde a captura do GPS');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('photo_base64', photoBase64);
      formData.append('gps_lat', gpsCoords.latitude);
      formData.append('gps_long', gpsCoords.longitude);
      formData.append('gps_accuracy', gpsCoords.accuracy);
      if (installedM2) {
        formData.append('installed_m2', installedM2);
      }
      formData.append('notes', notes);
      
      await api.checkout(checkinId, formData);

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
      <Card className="bg-card border-white/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Tempo de trabalho</p>
              <p className="text-2xl font-bold text-white">{getElapsedTime()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location Authorization */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-6">
          <div className="space-y-4">
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
                  Confirmo que concluí o trabalho no local correto
                </p>
              </div>
            </div>
            
            {gpsLoading && (
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Capturando localização GPS...
              </div>
            )}
            
            {gpsCoords && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <p className="text-sm text-green-400 font-medium">✓ Localização capturada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Lat: {gpsCoords.latitude.toFixed(6)}, Long: {gpsCoords.longitude.toFixed(6)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Precisão: {gpsCoords.accuracy.toFixed(0)}m
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Photo Upload */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Foto de Check-out
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!photo && (
            <div className="space-y-3">
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
                className="w-full bg-red-500 hover:bg-red-600 text-white h-14"
                data-testid="select-photo-button"
              >
                <Upload className="mr-2 h-5 w-5" />
                Selecionar Foto
              </Button>
            </div>
          )}

          {photo && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <img src={photo} alt="Check-out" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Foto Selecionada
                </div>
              </div>
              <Button
                onClick={retakePhoto}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                <Upload className="mr-2 h-5 w-5" />
                Trocar Foto
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installed M² */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            📐 M² Instalado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {job?.area_m2 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-3">
                <p className="text-sm text-blue-400 font-medium">📋 Área Total do Job</p>
                <p className="text-2xl font-bold text-white mt-1">{job.area_m2} m²</p>
              </div>
            )}
            
            <Label htmlFor="installed-m2" className="text-white font-medium">
              Informe quantos M² foram instalados
            </Label>
            <div className="relative">
              <input
                id="installed-m2"
                type="number"
                step="0.01"
                min="0"
                value={installedM2}
                onChange={(e) => setInstalledM2(e.target.value)}
                placeholder="Ex: 15.5"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                m²
              </span>
            </div>
            {installedM2 && job?.area_m2 && (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${Math.min((parseFloat(installedM2) / job.area_m2) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-white font-medium min-w-[60px] text-right">
                  {((parseFloat(installedM2) / job.area_m2) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Difficulty Level */}
      <Card className="bg-card border-white/5">
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-white font-medium">Nível de Dificuldade</Label>
            <Select value={difficultyLevel} onValueChange={handleDifficultyChange}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Selecione o nível de dificuldade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="obstaculo1">Obstáculo 1</SelectItem>
                <SelectItem value="obstaculo2">Obstáculo 2</SelectItem>
                <SelectItem value="obstaculo3">Obstáculo 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {difficultyLevel && (
            <div className="space-y-2">
              <Label className="text-white font-medium">Descreva a Dificuldade</Label>
              <Textarea
                value={difficultyDescription}
                onChange={(e) => setDifficultyDescription(e.target.value)}
                placeholder="Descreva qual foi a dificuldade encontrada..."
                className="bg-white/5 border-white/10 text-white min-h-[100px] resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {difficultyDescription.length}/500 caracteres
              </p>
            </div>
          )}
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
        disabled={!photoBase64 || !locationAuthorized || !gpsCoords || submitting}
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