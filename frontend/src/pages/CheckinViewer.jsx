import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MapPin, Clock, User, Image, FileText, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const CheckinViewer = () => {
  const { checkinId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [checkinId]);

  const loadData = async () => {
    try {
      const response = await api.getCheckinDetails(checkinId);
      setData(response.data);
    } catch (error) {
      toast.error('Erro ao carregar check-in');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  const { checkin, installer, job } = data;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-white hover:text-primary mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
          Detalhes do Check-in
        </h1>
      </div>

      {/* Job & Installer Info */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Informações Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white">
          <div>
            <p className="text-sm text-muted-foreground">Job</p>
            <p className="font-medium">{job?.title || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Cliente</p>
            <p className="font-medium">{job?.client_name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Instalador</p>
            <p className="font-medium">{installer?.full_name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Filial</p>
            <p className="font-medium">{installer?.branch || 'N/A'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Check-in Time & Location */}
      <Card className="bg-card border-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-green-500" />
            Check-in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-white">
            <div>
              <p className="text-sm text-muted-foreground">Horário</p>
              <p className="font-medium">{formatDate(checkin.checkin_at)}</p>
            </div>
            
            {checkin.gps_lat && checkin.gps_long && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-400">Localização GPS</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Latitude: {checkin.gps_lat.toFixed(6)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Longitude: {checkin.gps_long.toFixed(6)}
                    </p>
                    {checkin.gps_accuracy && (
                      <p className="text-xs text-muted-foreground">
                        Precisão: {checkin.gps_accuracy.toFixed(0)}m
                      </p>
                    )}
                    <a
                      href={`https://www.google.com/maps?q=${checkin.gps_lat},${checkin.gps_long}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 underline mt-1 inline-block"
                    >
                      Ver no Google Maps
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Check-in Photo */}
          {checkin.checkin_photo && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Image className="h-4 w-4" />
                Foto de Check-in
              </p>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <img
                  src={`data:image/jpeg;base64,${checkin.checkin_photo}`}
                  alt="Check-in"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check-out Time & Location */}
      {checkin.status === 'completed' && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-500" />
              Check-out
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-white">
              <div>
                <p className="text-sm text-muted-foreground">Horário</p>
                <p className="font-medium">{formatDate(checkin.checkout_at)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Duração</p>
                <p className="font-medium">{checkin.duration_minutes || 0} minutos</p>
              </div>
              
              {checkin.checkout_gps_lat && checkin.checkout_gps_long && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-400">Localização GPS</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Latitude: {checkin.checkout_gps_lat.toFixed(6)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Longitude: {checkin.checkout_gps_long.toFixed(6)}
                      </p>
                      {checkin.checkout_gps_accuracy && (
                        <p className="text-xs text-muted-foreground">
                          Precisão: {checkin.checkout_gps_accuracy.toFixed(0)}m
                        </p>
                      )}
                      <a
                        href={`https://www.google.com/maps?q=${checkin.checkout_gps_lat},${checkin.checkout_gps_long}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline mt-1 inline-block"
                      >
                        Ver no Google Maps
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {checkin.notes && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-300">Observações</p>
                      <p className="text-sm text-muted-foreground mt-1">{checkin.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Check-out Photo */}
            {checkin.checkout_photo && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Foto de Check-out
                </p>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  <img
                    src={`data:image/jpeg;base64,${checkin.checkout_photo}`}
                    alt="Check-out"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CheckinViewer;
