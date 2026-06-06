import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { MapPin, Clock, User, Image, FileText, ArrowLeft, Archive, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const CheckinViewer = () => {
  const { checkinId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // 'archive' | 'delete'
  const [acting, setActing] = useState(false);

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

  const getPhotoSrc = (photo, photoUrl) => {
    if (photoUrl) return photoUrl;
    if (!photo) return null;
    return photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  const buildWhatsAppUrl = (installerData, jobData, checkinData) => {
    const phone = installerData?.phone;
    if (!phone) return null;

    const digits = phone.replace(/\D/g, '');
    const fullPhone = digits.startsWith('55') ? digits : `55${digits}`;

    const statusMap = {
      in_progress: 'em andamento',
      paused: 'pausado',
      completed: 'concluído',
      pending: 'pendente',
      late: 'atrasado',
    };
    const statusText = statusMap[checkinData?.status] || checkinData?.status || 'desconhecido';
    const jobTitle = jobData?.title || 'N/A';
    const clientName = jobData?.client_name || '';

    const message = `Olá ${installerData?.full_name || ''}! Preciso que você revise o status do job *${jobTitle}*${clientName ? ` (cliente: ${clientName})` : ''}. O status atual está como *${statusText}*. Poderia nos dar uma atualização?`;

    return `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  // Check if data exists and has required fields
  if (!data) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-white hover:text-primary mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Card className="bg-card border-white/5">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Check-in não encontrado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle both old checkin format and new item_checkin format
  const checkin = data.checkin || data;
  const isItemCheckin = checkin.item_index !== undefined && checkin.item_index !== null;

  const handleArchive = async () => {
    setActing(true);
    try {
      if (isItemCheckin) {
        await api.archiveItemCheckin(checkin.id);
      } else {
        await api.archiveCheckin(checkin.id);
      }
      toast.success('Check-in arquivado. Não será contabilizado nos relatórios.');
      navigate(-1);
    } catch {
      toast.error('Erro ao arquivar check-in');
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  const handleDelete = async () => {
    setActing(true);
    try {
      if (isItemCheckin) {
        await api.deleteItemCheckin(checkin.id);
      } else {
        await api.deleteCheckin(checkin.id);
      }
      toast.success('Check-in excluído permanentemente.');
      navigate(-1);
    } catch {
      toast.error('Erro ao excluir check-in');
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };
  const installer = data.installer || { full_name: data.installer_name || 'N/A', email: '' };
  const job = data.job || { title: data.job_title || 'N/A', client_name: '' };

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
            Detalhes do Check-in
          </h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirm('archive')}
              className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 gap-2"
            >
              <Archive className="h-4 w-4" />
              Arquivar
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirm('delete')}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="bg-card border-white/10 w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${confirm === 'delete' ? 'text-red-400' : 'text-yellow-400'}`} />
                {confirm === 'archive' ? 'Arquivar check-in?' : 'Excluir check-in?'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {confirm === 'archive'
                  ? 'O check-in será arquivado e não será contabilizado nos relatórios. Esta ação pode ser revertida.'
                  : 'O check-in será excluído permanentemente. Esta ação não pode ser desfeita.'}
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setConfirm(null)}
                  disabled={acting}
                  className="text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirm === 'archive' ? handleArchive : handleDelete}
                  disabled={acting}
                  className={confirm === 'delete' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white'}
                >
                  {acting ? 'Aguarde...' : confirm === 'archive' ? 'Arquivar' : 'Excluir'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
          {(() => {
            const whatsappUrl = buildWhatsAppUrl(installer, job, checkin);
            return whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  className="mt-2 gap-2 text-white font-medium"
                  style={{ backgroundColor: '#25D366' }}
                >
                  <WhatsAppIcon />
                  Solicitar revisão via WhatsApp
                </Button>
              </a>
            ) : (
              <Button
                disabled
                className="mt-2 gap-2 bg-muted text-muted-foreground cursor-not-allowed"
              >
                <WhatsAppIcon />
                Solicitar revisão via WhatsApp
              </Button>
            );
          })()}
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

            {(checkin.exif_lat || checkin.exif_datetime || checkin.exif_device) && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-5 w-5 text-green-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-400">Metadados da Foto (EXIF)</p>
                    {checkin.exif_lat && checkin.exif_long && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          GPS: {checkin.exif_lat.toFixed(6)}, {checkin.exif_long.toFixed(6)}
                        </p>
                        <a
                          href={`https://www.google.com/maps?q=${checkin.exif_lat},${checkin.exif_long}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-400 hover:text-green-300 underline mt-0.5 inline-block"
                        >
                          Ver no Maps
                        </a>
                      </>
                    )}
                    {checkin.exif_datetime && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Capturado: {checkin.exif_datetime.replace('T', ' ').substring(0, 19)}
                      </p>
                    )}
                    {checkin.exif_device && (
                      <p className="text-xs text-muted-foreground">
                        Dispositivo: {checkin.exif_device}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Check-in Photo */}
          {(checkin.checkin_photo_url || checkin.checkin_photo) && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Image className="h-4 w-4" />
                Foto de Check-in
              </p>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <img
                  src={getPhotoSrc(checkin.checkin_photo, checkin.checkin_photo_url)}
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
                <p className="text-sm text-muted-foreground">⏱️ Duração</p>
                <p className="font-medium">{checkin.duration_minutes || 0} minutos</p>
              </div>

              {checkin.installed_m2 && (
                <div>
                  <p className="text-sm text-muted-foreground">📐 M² Instalado</p>
                  <p className="font-medium text-primary">{checkin.installed_m2} m²</p>
                </div>
              )}
              
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

              {(checkin.checkout_exif_lat || checkin.checkout_exif_datetime || checkin.checkout_exif_device) && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-green-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-400">Metadados da Foto (EXIF)</p>
                      {checkin.checkout_exif_lat && checkin.checkout_exif_long && (
                        <>
                          <p className="text-xs text-muted-foreground mt-1">
                            GPS: {checkin.checkout_exif_lat.toFixed(6)}, {checkin.checkout_exif_long.toFixed(6)}
                          </p>
                          <a
                            href={`https://www.google.com/maps?q=${checkin.checkout_exif_lat},${checkin.checkout_exif_long}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-400 hover:text-green-300 underline mt-0.5 inline-block"
                          >
                            Ver no Maps
                          </a>
                        </>
                      )}
                      {checkin.checkout_exif_datetime && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Capturado: {checkin.checkout_exif_datetime.replace('T', ' ').substring(0, 19)}
                        </p>
                      )}
                      {checkin.checkout_exif_device && (
                        <p className="text-xs text-muted-foreground">
                          Dispositivo: {checkin.checkout_exif_device}
                        </p>
                      )}
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
            {(checkin.checkout_photo_url || checkin.checkout_photo) && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Foto de Check-out
                </p>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  <img
                    src={getPhotoSrc(checkin.checkout_photo, checkin.checkout_photo_url)}
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
