import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../components/ui/drawer';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Package, ChevronRight, AlertTriangle, CheckCircle2,
  Camera, X, Clock, Images, CheckCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { extractExif } from '../lib/extractExif';

const MAX_PHOTOS = 10;
const MAX_PHOTO_B64_BYTES = 200 * 1024; // 200KB por foto no lote

const STATUS_ORDER = { instalando: 0, in_progress: 0, agendado: 1, scheduled: 1, aguardando: 2, pending: 2 };

const statusBadge = (status, isLate) => {
  if (isLate) return { label: 'ATRASADO', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' };
  switch (status) {
    case 'instalando':
    case 'in_progress': return { label: 'EM ANDAMENTO', cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' };
    case 'agendado':
    case 'scheduled':  return { label: 'AGENDADO', cls: 'bg-green-500/20 text-green-400 border border-green-500/30' };
    default:           return { label: 'AGUARDANDO', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' };
  }
};

// Comprime imagem para ~200KB de base64 (uso no lote)
const compressForBatch = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const MAX = 800;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.65;
        let b64 = canvas.toDataURL('image/jpeg', q);
        while (b64.length > MAX_PHOTO_B64_BYTES && q > 0.2) { q -= 0.1; b64 = canvas.toDataURL('image/jpeg', q); }
        resolve(b64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const formatExifTime = (isoStr) => {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
};

const formatDuration = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

const InstallerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Bottom sheet de checkin rápido
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetJob, setSheetJob] = useState(null);
  const [sheetItemIndex, setSheetItemIndex] = useState('0');
  const [selectedFiles, setSelectedFiles] = useState([]); // { file, exif, preview }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const fileInputRef = useRef(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.getJobs();
      setJobs(res.data ?? []);
      if (res._stale && res._fresh) {
        res._fresh
          .then(fresh => setJobs(fresh.data ?? []))
          .catch(e => console.warn('[InstallerDashboard] revalidação falhou:', e));
      }
    } catch (e) {
      console.error('[InstallerDashboard] loadJobs:', e);
      toast.error('Erro ao carregar jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const activeJobs = jobs
    .filter(j => !['completed', 'finalizado', 'cancelado', 'arquivado'].includes(j.status) && !j.archived)
    .sort((a, b) => {
      const isLateA = a.scheduled_date && new Date(a.scheduled_date) < new Date() ? -1 : 0;
      const isLateB = b.scheduled_date && new Date(b.scheduled_date) < new Date() ? -1 : 0;
      if (isLateA !== isLateB) return isLateA - isLateB;
      const orderA = STATUS_ORDER[a.status] ?? 9;
      const orderB = STATUS_ORDER[b.status] ?? 9;
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.scheduled_date || a.holdprint_data?.deliveryNeeded || a.created_at || '';
      const dateB = b.scheduled_date || b.holdprint_data?.deliveryNeeded || b.created_at || '';
      return dateA.localeCompare(dateB);
    });

  const getJobItems = (job) =>
    (job.products_with_area || job.items || []).filter(
      (_, i) => !(job.archived_items || []).some(a => a.item_index === i)
    );

  const openCheckinSheet = (e, job) => {
    e.stopPropagation();
    setSheetJob(job);
    setSheetItemIndex('0');
    setSelectedFiles([]);
    setCheckinResult(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    if (checkinResult) loadJobs();
  };

  const handleAddPhotos = () => {
    if (selectedFiles.length >= MAX_PHOTOS) {
      toast.warning(`Máximo de ${MAX_PHOTOS} fotos por lote`);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) input.setAttribute('capture', 'environment');
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - selectedFiles.length);
      if (!files.length) return;
      const processed = await Promise.all(
        files.map(async (file) => {
          const exif = await extractExif(file).catch(() => ({}));
          const preview = URL.createObjectURL(file);
          return { file, exif, preview };
        })
      );
      setSelectedFiles(prev => [...prev, ...processed]);
    };
    input.click();
  };

  const removePhoto = (idx) => {
    setSelectedFiles(prev => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[idx].preview);
      copy.splice(idx, 1);
      return copy;
    });
  };

  const handleSubmit = async () => {
    if (!sheetJob || selectedFiles.length === 0) return;
    setIsSubmitting(true);
    try {
      const photos = await Promise.all(selectedFiles.map(f => compressForBatch(f.file)));
      const exif_data = selectedFiles.map(f => f.exif);

      const res = await api.batchCheckin({
        job_id: sheetJob.id,
        item_index: parseInt(sheetItemIndex, 10),
        photos,
        exif_data,
      });

      setCheckinResult(res.data);
      toast.success('Check-in registrado!');
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erro ao fazer check-in. Tente novamente.';
      toast.error(msg, { duration: 6000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sheetItems = sheetJob ? getJobItems(sheetJob) : [];
  const earliestExif = selectedFiles.length
    ? selectedFiles.map(f => f.exif?.exif_datetime).filter(Boolean).sort()[0]
    : null;
  const latestExif = selectedFiles.length > 1
    ? selectedFiles.map(f => f.exif?.exif_datetime).filter(Boolean).sort().slice(-1)[0]
    : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">Olá,</p>
        <h1 className="text-lg font-bold text-white leading-tight">
          {user?.name?.split(' ')[0] || 'Instalador'}
        </h1>
      </div>

      <div className="px-4 pt-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card border border-white/5 h-24 animate-pulse" />
          ))
        ) : activeJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-base font-semibold text-white">Tudo em dia!</p>
            <p className="text-sm text-muted-foreground mt-1">Nenhum job pendente no momento.</p>
          </div>
        ) : (
          activeJobs.map(job => {
            const isLate = !!(job.scheduled_date && new Date(job.scheduled_date) < new Date());
            const badge = statusBadge(job.status, isLate);
            const client = job.holdprint_data?.customerName || job.client_name || '';
            const itemCount = getJobItems(job).length;
            const code = job.holdprint_data?.code || job.code || '';

            return (
              <div
                key={job.id}
                className={`rounded-xl bg-card border transition-colors
                  ${isLate ? 'border-red-500/40' : 'border-white/5'}
                `}
              >
                {/* Linha principal do card — navega para o job */}
                <button
                  onClick={() => navigate(`/installer/job/${job.id}`)}
                  className="w-full text-left flex items-stretch gap-0 active:bg-white/5 active:scale-[0.99] transition-transform"
                >
                  <div className={`w-1 rounded-l-xl shrink-0 ${isLate ? 'bg-red-500' : job.status === 'instalando' || job.status === 'in_progress' ? 'bg-blue-500' : 'bg-white/10'}`} />
                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isLate && <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {code && <span className="text-[10px] text-muted-foreground font-mono">#{code}</span>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <p className="text-sm font-semibold text-white line-clamp-1">{job.title}</p>
                    {client && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{client}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      {itemCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Package className="h-3 w-3" />
                          {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                        </span>
                      )}
                      {job.scheduled_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(job.scheduled_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Botão de checkin rápido — abre o bottom sheet */}
                {(job.status !== 'instalando' && job.status !== 'in_progress') && (
                  <div className="px-4 pb-3 pt-0">
                    <button
                      onClick={(e) => openCheckinSheet(e, job)}
                      className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-medium active:bg-primary/25 transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      Fazer Check-in
                    </button>
                  </div>
                )}
                {(job.status === 'instalando' || job.status === 'in_progress') && (
                  <div className="px-4 pb-3 pt-0">
                    <button
                      onClick={() => navigate(`/installer/job/${job.id}`)}
                      className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-medium active:bg-blue-500/25 transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                      Em andamento — Continuar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Sheet de Check-in Rápido */}
      <Drawer open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <DrawerContent className="bg-card border-white/10 max-h-[90vh]">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-white flex items-center gap-2 text-base">
              <Camera className="h-5 w-5 text-primary" />
              Check-in Rápido
            </DrawerTitle>
            {sheetJob && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {sheetJob.holdprint_data?.code ? `#${sheetJob.holdprint_data.code} · ` : ''}{sheetJob.title}
              </p>
            )}
          </DrawerHeader>

          <div className="px-4 pb-8 space-y-4 overflow-y-auto">
            {checkinResult ? (
              /* ── Estado: sucesso ── */
              <div className="space-y-4">
                <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-400 font-semibold">
                    <CheckCheck className="h-5 w-5" />
                    Check-in registrado!
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {checkinResult.exif_checkin_at && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Horário entrada (EXIF):</span>
                        <span className="ml-2 text-white font-medium">
                          {formatExifTime(checkinResult.exif_checkin_at)}
                        </span>
                      </div>
                    )}
                    {checkinResult.exif_duration_minutes && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Duração estimada (EXIF):</span>
                        <span className="ml-2 text-white font-medium">
                          {formatDuration(checkinResult.exif_duration_minutes)}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Fotos:</span>
                      <span className="ml-2 text-white font-medium">{checkinResult.photos_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className="ml-2 text-blue-400 font-medium">Em andamento</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={closeSheet}
                    className="flex-1 h-11 border-white/10"
                  >
                    Fechar
                  </Button>
                  <Button
                    onClick={() => { closeSheet(); navigate(`/installer/job/${sheetJob?.id}`); }}
                    className="flex-1 h-11 bg-primary hover:bg-primary/90"
                  >
                    Abrir Job
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Estado: formulário ── */
              <div className="space-y-4">
                {/* Seletor de item (se job tiver > 1 item) */}
                {sheetItems.length > 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Item do Job</p>
                    <Select value={sheetItemIndex} onValueChange={setSheetItemIndex}>
                      <SelectTrigger className="bg-background border-white/10 h-11">
                        <SelectValue placeholder="Selecione o item..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-white/10">
                        {sheetItems.map((item, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {item.name || `Item ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Preview das fotos selecionadas */}
                {selectedFiles.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {selectedFiles.length} foto{selectedFiles.length !== 1 ? 's' : ''} selecionada{selectedFiles.length !== 1 ? 's' : ''}
                      {selectedFiles.length < MAX_PHOTOS && ` (máx ${MAX_PHOTOS})`}
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {selectedFiles.map((f, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                          <img src={f.preview} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => removePhoto(i)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                          {f.exif?.exif_datetime && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                              <p className="text-[9px] text-white/80 text-center truncate">
                                {formatExifTime(f.exif.exif_datetime)}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resumo EXIF se tiver timestamps */}
                {earliestExif && (
                  <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Relatório de tempo (EXIF)</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span>
                        <span className="text-muted-foreground">Início: </span>
                        <span className="text-white">{formatExifTime(earliestExif)}</span>
                      </span>
                      {latestExif && latestExif !== earliestExif && (
                        <span>
                          <span className="text-muted-foreground">Fim: </span>
                          <span className="text-white">{formatExifTime(latestExif)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Botão de adicionar fotos */}
                <button
                  onClick={handleAddPhotos}
                  disabled={selectedFiles.length >= MAX_PHOTOS}
                  className={`w-full flex items-center justify-center gap-2 h-14 rounded-xl border-2 border-dashed text-sm font-medium transition-colors
                    ${selectedFiles.length >= MAX_PHOTOS
                      ? 'border-white/10 text-muted-foreground cursor-not-allowed'
                      : 'border-primary/40 text-primary hover:border-primary/70 hover:bg-primary/5 active:bg-primary/10'
                    }`}
                >
                  <Images className="h-5 w-5" />
                  {selectedFiles.length === 0
                    ? 'Adicionar Fotos (câmera ou galeria)'
                    : selectedFiles.length >= MAX_PHOTOS
                      ? `Limite atingido (${MAX_PHOTOS})`
                      : `Adicionar mais fotos (${selectedFiles.length}/${MAX_PHOTOS})`
                  }
                </button>

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={closeSheet}
                    className="flex-1 h-12 border-white/10"
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={selectedFiles.length === 0 || isSubmitting}
                    className="flex-1 h-12 bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
                  >
                    {isSubmitting ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    ) : (
                      <Camera className="h-4 w-4 mr-2" />
                    )}
                    {isSubmitting ? 'Enviando...' : 'Confirmar Check-in'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default InstallerDashboard;
