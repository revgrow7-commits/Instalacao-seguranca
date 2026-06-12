import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  ArrowLeft, Package, MapPin, Camera, Check, Clock,
  Ruler, AlertCircle, CheckCircle2, PlayCircle,
  ChevronDown, ChevronUp,
  Images, X
} from 'lucide-react';
import { toast } from 'sonner';
import { getPhotoSrc } from '../lib/photo';
import { extractExif } from '../lib/extractExif';
import { compressImage } from '../lib/compressImage';
import { uploadExtraPhotos } from '../lib/uploadPhotos';
import { exifTimeHM } from '../lib/exifTime';
import PhotoGalleryPicker from '../components/PhotoGalleryPicker';


const InstallerJobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [meuPapel, setMeuPapel] = useState(null); // papel do usuário nesta instalação (VC)
  const [itemCheckins, setItemCheckins] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState(null);
  const [processingItem, setProcessingItem] = useState(null);
  const fileInputRef = useRef({});
  const hasAutoExpanded = useRef(false);
  const itemRefs = useRef({});

  // Form state for checkout (apenas observação, os outros campos vêm da atribuição)
  const [checkoutForm, setCheckoutForm] = useState({
    notes: ''
  });

  // Usa o helper central (timeZone America/Sao_Paulo explícito). O antigo
  // toLocaleTimeString sem timeZone dependia do fuso do celular — em aparelho
  // com TZ errado o horário exibido divergia em horas.
  const formatExifTime = (isoStr) => exifTimeHM(isoStr) || null;

  useEffect(() => {
    let cancelled = false;
    loadJobData(() => cancelled);
    return () => { cancelled = true; };
  }, [jobId]);

  // Auto-expande o primeiro item pendente (sem checkin ou em andamento)
  useEffect(() => {
    if (hasAutoExpanded.current || !job || expandedItem !== null) return;
    const items = job.products_with_area || job.items || [];
    const firstPendingIndex = items.findIndex((_, i) =>
      !itemCheckins[i] || itemCheckins[i]?.status === 'pending'
    );
    if (firstPendingIndex !== -1) {
      setExpandedItem(firstPendingIndex);
      hasAutoExpanded.current = true;
    }
  }, [job, itemCheckins]);

  const toggleExpanded = (itemIndex) => {
    const next = expandedItem === itemIndex ? null : itemIndex;
    setExpandedItem(next);
    if (next !== null) {
      setTimeout(() => {
        itemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  };

  // Buscar os valores de atribuição definidos pelo gerente para um item
  const getItemAssignment = (itemIndex) => {
    if (!job) return null;
    const assignments = job.item_assignments || [];
    return assignments.find(a => a.item_index === itemIndex);
  };

  // FIX M2: aceita um callback opcional `isCancelled` para evitar setState
  // após desmontagem (default: sempre false = mantém comportamento antigo).
  const loadJobData = async (isCancelled = () => false) => {
    try {
      setLoading(true);
      const jobRes = await api.getJob(jobId);
      if (isCancelled()) return;
      setJob(jobRes.data);

      // Busca papel do usuário no Visual Connect (fire-and-forget, não bloqueia o carregamento)
      const hpId = jobRes.data?.holdprint_job_id;
      // M1: URL e chave do Visual Connect agora vêm de variáveis de ambiente
      // (REACT_APP_VISUAL_CONNECT_URL / _KEY). Se não estiverem configuradas, a
      // busca do papel (não essencial, fire-and-forget) é silenciosamente ignorada.
      const VC_URL = process.env.REACT_APP_VISUAL_CONNECT_URL;
      const VC_KEY = process.env.REACT_APP_VISUAL_CONNECT_KEY;
      if (hpId && user?.email && VC_URL && VC_KEY) {
        fetch(`${VC_URL}/installation-list`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': VC_KEY,
            'Authorization': `Bearer ${VC_KEY}`,
          },
          body: JSON.stringify({ holdprint_job_id: hpId }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(vcData => {
            if (isCancelled()) return;
            const vcJob = (vcData?.data ?? [])[0];
            if (!vcJob) return;
            const inst = (vcJob.installers ?? []).find(
              i => i.email?.toLowerCase() === user.email?.toLowerCase()
            );
            if (inst?.papel) setMeuPapel(inst.papel);
          })
          .catch((e) => { console.warn('[InstallerJobDetail] Visual Connect indisponível (fire-and-forget):', e?.message); });
      }

      // Load item checkins
      const checkinsRes = await api.getItemCheckins(jobId);
      if (isCancelled()) return;
      const checkinsList = Array.isArray(checkinsRes.data) ? checkinsRes.data : [];
      const checkinsMap = {};
      checkinsList.forEach(c => { checkinsMap[c.item_index] = c; });

      if (isCancelled()) return;
      setItemCheckins(checkinsMap);
    } catch (error) {
      if (isCancelled()) return;
      // Check if it's an access denied error
      if (error.response?.status === 403) {
        toast.error('Você não tem acesso a este job');
        navigate('/installer');
        return;
      }
      toast.error('Erro ao carregar job');
      console.error('[InstallerJobDetail] loadJobData:', error);
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  };

  // handleItemCheckin — recebe as fotos escolhidas na galeria (modo botão único)
  // e envia direto. Horário/local vêm do EXIF de cada foto (batchCheckin/B1).
  const handleItemCheckin = async (itemIndex, pickedPhotos) => {
    const photos = pickedPhotos || [];
    if (photos.length === 0) {
      toast.error('Selecione pelo menos uma foto de Início');
      return;
    }
    if (processingItem !== null) return;
    setProcessingItem(itemIndex);
    try {
      const photosBase64 = await Promise.all(photos.map(f => compressImage(f.file)));
      const exifData = photos.map(f => f.exif || {});
      await api.batchCheckin({
        job_id: jobId,
        item_index: itemIndex,
        photos: photosBase64,
        exif_data: exifData,
      });
      toast.success('Início registrado!');
      setExpandedItem(itemIndex);
      hasAutoExpanded.current = true;
      await loadJobData();
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      let userMessage;
      if (detail) {
        userMessage = detail;
      } else if (status === 403) {
        userMessage = 'Acesso negado. Verifique se está logado com a conta de instalador.';
      } else if (status === 413) {
        userMessage = 'Foto muito grande. Tente novamente com menor resolução.';
      } else if (status >= 500) {
        userMessage = 'Erro no servidor. Tente novamente em alguns segundos.';
      } else if (!error.response) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout');
        userMessage = isTimeout ? 'O servidor demorou para responder. Tente novamente.' : 'Falha de conexão. Tente novamente.';
      } else {
        userMessage = 'Erro ao registrar início. Tente novamente.';
      }
      toast.error(userMessage, { duration: 6000 });
      console.error('[InstallerJobDetail] handleItemCheckin:', error.code, status, error.response?.data || error);
    } finally {
      setProcessingItem(null);
    }
  };

  // handleItemCheckout — foto[0] via FormData (retrocompatível), extras via uploadExtraPhotos
  const handleItemCheckout = async (itemIndex, pickedPhotos) => {
    const checkin = itemCheckins[itemIndex];
    if (!checkin) { toast.error('Registre o Início primeiro'); return; }

    // NOVA REGRA: o tempo é 100% EXIF (o registro é feito depois da obra, às vezes
    // outro dia). Sem trava de tempo de clique. A única validação de ordem
    // (fim ≥ início) é feita no backend pelo EXIF das fotos.
    const photos = pickedPhotos || [];
    if (photos.length === 0) {
      toast.error('Selecione pelo menos uma foto de Fim');
      return;
    }
    if (processingItem !== null) return;
    setProcessingItem(itemIndex);

    try {
      const item = getItemByIndex(itemIndex);
      const assignment = getItemAssignment(itemIndex);
      const complexityLevel = assignment?.manager_difficulty_level || 3;
      const heightCategory = 'terreo';
      const scenarioCategory = assignment?.manager_scenario_category || 'loja_rua';
      const installedM2 = item?.total_area_m2 || 0;

      const exifTimes = photos.map(f => f.exif?.exif_datetime).filter(Boolean).sort();
      const latestExif = photos.find(f => f.exif?.exif_datetime === exifTimes[exifTimes.length - 1])?.exif || photos[0].exif || {};

      const primaryBase64 = await compressImage(photos[0].file);
      const formData = new FormData();
      formData.append('photo_base64', primaryBase64);
      if (latestExif?.exif_lat != null) {
        formData.append('exif_lat', latestExif.exif_lat);
      } else if (latestExif?._live_lat != null) {
        formData.append('gps_lat', latestExif._live_lat);
      }
      if (latestExif?.exif_long != null) {
        formData.append('exif_long', latestExif.exif_long);
      } else if (latestExif?._live_long != null) {
        formData.append('gps_long', latestExif._live_long);
      }
      if (latestExif?.exif_datetime) formData.append('exif_datetime', latestExif.exif_datetime);
      if (latestExif?.exif_device) formData.append('exif_device', latestExif.exif_device);
      if (latestExif?.exif_offset) formData.append('exif_offset', latestExif.exif_offset);
      if (latestExif?.exif_address) formData.append('exif_address', latestExif.exif_address);
      formData.append('installed_m2', installedM2);
      formData.append('complexity_level', complexityLevel);
      formData.append('height_category', heightCategory);
      formData.append('scenario_category', scenarioCategory);
      formData.append('notes', checkoutForm.notes);
      if (checkin.job_id) formData.append('job_id', checkin.job_id);

      await api.completeItemCheckout(checkin.id, formData);

      // Fotos extras (índices 1..N) — fire-and-forget, não bloqueia o checkout
      if (photos.length > 1) {
        uploadExtraPhotos(jobId, photos.slice(1), `checkout-item-${itemIndex}`)
          .catch(e => console.warn('[checkout extra photos]', e));
      }

      toast.success('Fim registrado!');
      setCheckoutForm({ notes: '' });
      setExpandedItem(null);
      await loadJobData();
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail;

      if (status === 400 && detail === 'Item already checked out') {
        toast.success('Fim registrado!');
        setCheckoutForm({ notes: '' });
        setExpandedItem(null);
        await loadJobData();
        return;
      }

      let userMessage;
      if (detail) {
        userMessage = detail;
      } else if (status === 403) {
        userMessage = 'Acesso negado. Verifique se está logado com a conta de instalador.';
      } else if (status === 413) {
        userMessage = 'Foto muito grande. Tente novamente.';
      } else if (status >= 500) {
        userMessage = 'Erro no servidor. Tente novamente em alguns segundos.';
      } else if (!error.response) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout');
        userMessage = isTimeout ? 'O servidor demorou para responder. Tente novamente.' : 'Falha de conexão. Tente novamente.';
      } else {
        userMessage = 'Erro ao finalizar item. Tente novamente.';
      }
      toast.error(userMessage, { duration: 6000 });
      console.error('[InstallerJobDetail] handleItemCheckout:', error.code, status, error.response?.data || error);
    } finally {
      setProcessingItem(null);
    }
  };

  const getItemByIndex = (index) => {
    const products = job?.products_with_area?.length
      ? job.products_with_area
      : (job?.items || []);
    return products[index];
  };

  const getItemStatus = (itemIndex) => {
    const checkin = itemCheckins[itemIndex];
    if (!checkin) return 'pending';
    if (checkin.status === 'completed') return 'completed';
    // Pausa removida (registro 100% EXIF): itens legados em 'paused' viram
    // 'in_progress' para que o instalador possa concluí-los normalmente.
    return 'in_progress';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'paused': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed': return 'Concluído';
      case 'in_progress': return 'Em Andamento';
      case 'paused': return 'Pausado';
      default: return 'Pendente';
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0min';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins}min`;
  };

  const getCompletedItemsCount = () => {
    return Object.values(itemCheckins).filter(c => c.status === 'completed').length;
  };

  const getTotalM2Installed = () => {
    return Object.values(itemCheckins)
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + (c.installed_m2 || 0), 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Job não encontrado</p>
        </div>
      </div>
    );
  }

  // Get products - try products_with_area first, then items, then holdprint_data.products
  // Also filter out archived items
  const getProducts = () => {
    let products = [];
    
    if (job.products_with_area && job.products_with_area.length > 0) {
      // Add originalIndex to each product
      products = job.products_with_area.map((p, index) => ({ ...p, originalIndex: index }));
    } else if (job.items && job.items.length > 0) {
      products = job.items.map((item, index) => ({
        name: item.name || `Item ${index + 1}`,
        quantity: item.quantity || 1,
        total_area_m2: item.total_area_m2 || 0,
        unit_area_m2: item.unit_area_m2 || 0,
        width_m: item.width_m,
        height_m: item.height_m,
        originalIndex: index
      }));
    } else if (job.holdprint_data?.products && job.holdprint_data.products.length > 0) {
      products = job.holdprint_data.products.map((product, index) => ({
        name: product.name || `Produto ${index + 1}`,
        quantity: product.quantity || 1,
        total_area_m2: product.totalValue || 0,
        unit_area_m2: product.unitPrice || 0,
        originalIndex: index
      }));
    }
    
    // Filter out archived items
    const archivedItems = job.archived_items || [];
    const archivedIndices = new Set(archivedItems.map(a => a.item_index));
    
    // Filter products by originalIndex
    return products.filter(p => !archivedIndices.has(p.originalIndex));
  };

  const products = getProducts();
  const archivedCount = (job.archived_items || []).length;
  const totalItems = products.length;
  const completedItems = getCompletedItemsCount();
  const totalM2Job = job.area_m2 || products.reduce((sum, p) => sum + (p.total_area_m2 || 0), 0);

  return (
    <div className={`min-h-screen bg-background overflow-x-hidden ${completedItems === totalItems && totalItems > 0 ? 'pb-28' : 'pb-8'}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center h-10 w-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 active:bg-white/20 active:scale-[0.98] transition-transform mb-3"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <h1 className="text-xl font-bold text-foreground line-clamp-2">{job.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {job.holdprint_data?.client_name || job.client_name || 'Cliente não informado'}
            </p>
            {meuPapel && meuPapel !== 'instalador' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/20 text-primary capitalize shrink-0">
                {meuPapel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {job.client_address ? (
              <p className="text-xs text-muted-foreground truncate">{job.client_address}</p>
            ) : (
              <p className="text-xs text-yellow-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Endereço não informado — confirme com o responsável
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      <div className="p-4">
        <Card className="bg-card/50 border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{completedItems}/{totalItems}</p>
                <p className="text-xs text-muted-foreground">Itens Concluídos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{getTotalM2Installed().toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">m² Instalados</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{totalM2Job.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">m² Total</p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${totalItems > 0 ? (completedItems / totalItems) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aviso de itens arquivados */}
      {archivedCount > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {archivedCount === 1
                ? '1 item foi arquivado e não aparece na lista abaixo.'
                : `${archivedCount} itens foram arquivados e não aparecem na lista abaixo.`}
              {' '}Fale com o responsável se precisar de esclarecimentos.
            </span>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="p-4 space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Package className="h-5 w-5" />
          Itens do Job ({totalItems})
        </h2>

        {products.length === 0 ? (
          <Card className="bg-card/50 border-border">
            <CardContent className="p-6 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum item neste job</p>
            </CardContent>
          </Card>
        ) : (
          products.map((item, index) => {
            // FIX B1: usar originalIndex para alinhar com backend quando há itens arquivados.
            const itemIndex = item.originalIndex ?? index;
            const status = getItemStatus(itemIndex);
            const checkin = itemCheckins[itemIndex];
            const isExpanded = expandedItem === itemIndex;
            const isProcessing = processingItem === itemIndex;

            // Item concluído: linha compacta verde em vez do Card completo
            if (status === 'completed') {
              return (
                <div
                  key={itemIndex}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 transition-all duration-300 overflow-hidden"
                >
                  <Check className="h-4 w-4 text-green-400 shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-foreground truncate">{item.name || `Item ${index + 1}`}</span>
                  <span className="text-xs text-green-400/70 shrink-0">
                    {(item.total_area_m2 || 0).toFixed(1)} m²
                  </span>
                  {checkin?.exif_duration_minutes != null && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDuration(checkin.exif_duration_minutes)}
                    </span>
                  )}
                  <button
                    onClick={() => setExpandedItem(isExpanded ? null : itemIndex)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {isExpanded && (
                    <div className="w-full mt-2 pt-2 border-t border-green-500/20">
                      {checkin && (
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <span className="text-muted-foreground">m² instalados: <span className="text-foreground">{checkin.installed_m2 || 0}</span></span>
                          <span className="text-muted-foreground">Produtividade: <span className="text-primary">{checkin.productivity_m2_h || 0} m²/h</span></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Card
                key={itemIndex}
                ref={el => { itemRefs.current[itemIndex] = el; }}
                className={`bg-card/50 border transition-all scroll-mt-4 ${
                  status === 'in_progress' ? 'border-blue-500/30' : 'border-border'
                }`}
              >
                <CardContent className="p-4">
                  {/* Item Header */}
                  <div
                    className="flex items-start justify-between cursor-pointer min-h-[56px]"
                    onClick={() => toggleExpanded(itemIndex)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(status)}`}>
                          {getStatusText(status)}
                        </span>
                        {item.family_name && (
                          <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            {item.family_name}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-foreground">{item.name || `Item ${index + 1}`}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Ruler className="h-3 w-3" />
                          {(item.total_area_m2 || 0).toFixed(2)} m²
                        </span>
                        {item.quantity > 1 && (
                          <span>Qtd: {item.quantity}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {status === 'completed' && (
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {/* Item Details */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {item.width && (
                          <div>
                            <span className="text-muted-foreground">Largura:</span>
                            <span className="ml-2 text-foreground">{item.width}m</span>
                          </div>
                        )}
                        {item.height && (
                          <div>
                            <span className="text-muted-foreground">Altura:</span>
                            <span className="ml-2 text-foreground">{item.height}m</span>
                          </div>
                        )}
                      </div>

                      {/* Check-in/Check-out Photos */}
                      {checkin && (
                        <div className="grid grid-cols-2 gap-3">
                          {(checkin.checkin_photo || checkin.checkin_photo_url) && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Foto Check-in</p>
                              <img
                                src={getPhotoSrc(checkin.checkin_photo, checkin.checkin_photo_url)}
                                alt="Check-in"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-24 object-cover rounded-lg"
                              />
                            </div>
                          )}
                          {(checkin.checkout_photo || checkin.checkout_photo_url) && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Foto Check-out</p>
                              <img
                                src={getPhotoSrc(checkin.checkout_photo, checkin.checkout_photo_url)}
                                alt="Check-out"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-24 object-cover rounded-lg"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Completed Info */}
                      {status === 'completed' && checkin && (
                        <div className="bg-green-500/10 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="font-medium">Item Concluído</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">m² Instalados:</span>
                              <span className="ml-2 text-foreground font-medium">{checkin.installed_m2 || 0}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duração (EXIF):</span>
                              <span className="ml-2 text-foreground font-medium">{checkin.exif_duration_minutes != null ? formatDuration(checkin.exif_duration_minutes) : '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Início:</span>
                              <span className="ml-2 text-foreground">{formatExifTime(checkin.exif_checkin_at) || '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Fim:</span>
                              <span className="ml-2 text-foreground">{formatExifTime(checkin.exif_checkout_at) || '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Produtividade:</span>
                              <span className="ml-2 text-primary font-medium">
                                {checkin.installed_m2 > 0 && checkin.exif_duration_minutes > 0
                                  ? `${(checkin.installed_m2 / (checkin.exif_duration_minutes / 60)).toFixed(1)} m²/h`
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Ação: carregar fotos de Início (carrega → lê EXIF → salva direto) */}
                      {status === 'pending' && (
                        <div className="space-y-2">
                          <PhotoGalleryPicker
                            onPicked={(picked) => handleItemCheckin(itemIndex, picked)}
                            triggerLabel="Carregar fotos início"
                            disabled={isProcessing}
                            galleryOnly
                            requireExifDate
                          />
                          <p className="text-[11px] text-muted-foreground text-center">
                            Escolha a(s) foto(s) de início da galeria — o horário vem do EXIF da foto.
                          </p>
                        </div>
                      )}

                      {status === 'in_progress' && (
                        <div className="space-y-4">
                          <div className="bg-blue-500/10 rounded-lg p-3">
                            <p className="text-sm text-blue-400 flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {formatExifTime(checkin?.exif_checkin_at)
                                ? `Início registrado: ${formatExifTime(checkin.exif_checkin_at)}`
                                : 'Início registrado'}
                            </p>
                          </div>

                          {/* Info definida pelo Gerente (somente leitura) */}
                          {(() => {
                            const assignment = getItemAssignment(itemIndex);
                            const scenarioLabels = {
                              'loja_rua': 'Loja de Rua',
                              'shopping': 'Shopping',
                              'evento': 'Evento',
                              'fachada': 'Fachada',
                              'outdoor': 'Outdoor',
                              'veiculo': 'Veículo'
                            };
                            return assignment ? (
                              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Dados definidos pelo Gerente</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">m² do Item:</span>
                                    <span className="ml-2 text-foreground font-medium">{(item.total_area_m2 || 0).toFixed(2)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Dificuldade:</span>
                                    <span className="ml-2 text-foreground font-medium">{assignment.manager_difficulty_level || 3}/5</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Cenário:</span>
                                    <span className="ml-2 text-foreground font-medium">
                                      {scenarioLabels[assignment.manager_scenario_category] || assignment.manager_scenario_category || 'Loja de Rua'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-yellow-500/10 rounded-lg p-3">
                                <p className="text-xs text-yellow-400">Dados de atribuição não encontrados. Serão usados valores padrão.</p>
                              </div>
                            );
                          })()}

                          {/* Campo de Observação */}
                          <div>
                            <Label className="text-sm text-muted-foreground">Observação (opcional)</Label>
                            <textarea
                              placeholder="Adicione uma observação sobre a instalação..."
                              value={checkoutForm.notes}
                              onChange={(e) => setCheckoutForm({...checkoutForm, notes: e.target.value})}
                              className="w-full mt-1 p-3 rounded-md bg-background/50 border border-border text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                              rows={3}
                            />
                          </div>

                          {/* Ação: carregar fotos de Fim (carrega → lê EXIF → salva direto) */}
                          <PhotoGalleryPicker
                            onPicked={(picked) => handleItemCheckout(itemIndex, picked)}
                            triggerLabel="Carregar fotos final"
                            disabled={isProcessing}
                            galleryOnly
                            requireExifDate
                          />
                          <p className="text-[11px] text-muted-foreground text-center">
                            Escolha a(s) foto(s) de conclusão da galeria — o horário vem do EXIF da foto.
                          </p>
                        </div>
                      )}

                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Complete Job Button */}
      {completedItems === totalItems && totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <Button
            onClick={async () => {
              try {
                await api.finalizeJob(jobId);
                toast.success('Job concluído com sucesso!');
                navigate('/');
              } catch (error) {
                const errorMessage = error.response?.data?.detail || 'Erro ao finalizar job';
                toast.error(errorMessage);
              }
            }}
            className="w-full bg-green-600 hover:bg-green-700 h-12 text-base active:scale-[0.98] transition-transform"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Finalizar Job
          </Button>
        </div>
      )}

    </div>
  );
};

export default InstallerJobDetail;
