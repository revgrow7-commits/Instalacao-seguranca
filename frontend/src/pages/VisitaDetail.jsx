import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  ArrowLeft, MapPin, User, Building2, Calendar, Clock,
  CheckCircle2, AlertCircle, Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import RelatorioVisitaForm from '../components/visitas/RelatorioVisitaForm';

const STATUS_STYLES = {
  AGUARDANDO: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  EM_VISITA: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  CONCLUIDA: 'bg-green-500/20 text-green-400 border border-green-500/30',
  CANCELADA: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

const STATUS_LABELS = {
  AGUARDANDO: 'AGUARDANDO',
  EM_VISITA: 'EM VISITA',
  CONCLUIDA: 'CONCLUÍDA',
  CANCELADA: 'CANCELADA',
};

const SITUACAO_STYLES = {
  normal: 'bg-green-500/20 text-green-400 border border-green-500/30',
  pendencia: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  retrabalho: 'bg-red-500/20 text-red-400 border border-red-500/30',
  aprovado: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
};

const SITUACAO_LABELS = {
  normal: 'Normal',
  pendencia: 'Pendência Identificada',
  retrabalho: 'Retrabalho Necessário',
  aprovado: 'Aprovado para Instalação',
};

const InfoRow = ({ label, value, icon: Icon }) => (
  <div className="flex items-start gap-2">
    {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-white font-medium">{value || '—'}</p>
    </div>
  </div>
);

const VisitaDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isManager, isInstaller } = useAuth();
  const [visita, setVisita] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const loadVisita = async () => {
    try {
      setLoading(true);
      const res = await api.getVisita(id);
      setVisita(res.data);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Você não tem acesso a esta visita');
        navigate('/visitas-tecnicas');
        return;
      }
      toast.error('Erro ao carregar visita técnica');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisita();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!visita) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Visita técnica não encontrada</p>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[visita.status] || STATUS_STYLES.AGUARDANDO;
  const statusLabel = STATUS_LABELS[visita.status] || visita.status;
  const canSendRelatorio =
    isInstaller &&
    String(visita.installer_id) === String(user?.installer_id) &&
    visita.status !== 'CONCLUIDA' &&
    visita.status !== 'CANCELADA';
  const hasRelatorio = !!visita.relatorio_enviado_em;

  const formattedDate = visita.scheduled_date
    ? new Date(visita.scheduled_date).toLocaleDateString('pt-BR')
    : null;

  const formatDatetime = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Banner de identificação */}
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <MapPin className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-purple-300/70 uppercase tracking-wide font-medium">Visita Técnica</p>
            <p className="text-lg font-bold text-purple-200 truncate">
              {visita.numero_vt || `VT-${visita.id}`}
            </p>
          </div>
          <span className={`px-2 py-1 rounded text-[10px] font-bold flex-shrink-0 ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>

        {/* Cards de info */}
        <Card className="bg-card border-white/5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Informações da Visita</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Cliente" value={visita.client_name} icon={User} />
            <InfoRow label="Endereço" value={visita.client_address} icon={MapPin} />
            <InfoRow label="Filial" value={visita.branch} icon={Building2} />
            <InfoRow label="Instalador" value={visita.installer_name || (visita.installer_id ? visita.installer_id.slice(0, 8) + '…' : '—')} icon={User} />
            <InfoRow
              label="Data Agendada"
              value={formattedDate ? `${formattedDate}${visita.scheduled_time_end ? ' até ' + visita.scheduled_time_end : ''}` : '—'}
              icon={Calendar}
            />
            <InfoRow
              label="Valor por km"
              value={visita.valor_por_km != null ? `R$ ${Number(visita.valor_por_km).toFixed(2)}` : '—'}
              icon={Clock}
            />
          </CardContent>
        </Card>

        {visita.observacoes_admin && (
          <Card className="bg-card border-white/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm text-white">{visita.observacoes_admin}</p>
            </CardContent>
          </Card>
        )}

        {/* Painel de relatório (CONCLUIDA) */}
        {hasRelatorio && (
          <Card className="bg-card border-green-500/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-green-400 uppercase tracking-wide flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Relatório Enviado
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Km Rodados</p>
                  <p className="text-sm font-semibold text-white">{visita.km_rodados ?? '—'} km</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                  <p className="text-sm font-semibold text-white">
                    {visita.valor_total != null ? `R$ ${Number(visita.valor_total).toFixed(2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Chegada</p>
                  <p className="text-sm text-white">{formatDatetime(visita.relatorio_chegada)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saída</p>
                  <p className="text-sm text-white">{formatDatetime(visita.relatorio_saida)}</p>
                </div>
              </div>

              {visita.relatorio_situacao && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Situação</p>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${SITUACAO_STYLES[visita.relatorio_situacao] || ''}`}>
                    {SITUACAO_LABELS[visita.relatorio_situacao] || visita.relatorio_situacao}
                  </span>
                </div>
              )}

              {visita.relatorio_descricao && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm text-white whitespace-pre-line">{visita.relatorio_descricao}</p>
                </div>
              )}

              {visita.relatorio_assinatura_confirmada && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Cliente confirmou presença/assinatura
                </div>
              )}

              {visita.relatorio_fotos && visita.relatorio_fotos.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    Fotos ({visita.relatorio_fotos.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {visita.relatorio_fotos.map((src, i) => (
                      <img
                        key={i}
                        src={typeof src === 'string' ? src : src?.url}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxSrc(typeof src === 'string' ? src : src?.url)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Enviado em {formatDatetime(visita.relatorio_enviado_em)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Formulário de relatório para o instalador */}
        {canSendRelatorio && !hasRelatorio && (
          <Card className="bg-card border-purple-500/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-purple-300 uppercase tracking-wide flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Enviar Relatório da Visita
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <RelatorioVisitaForm visita={visita} onSuccess={loadVisita} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Foto ampliada"
            className="max-w-full max-h-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
};

export default VisitaDetail;
