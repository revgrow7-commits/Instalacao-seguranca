import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
// Dialog/DialogContent/DialogHeader/... removidos — o confirm de GPS agora é renderizado por useConfirmDialog.
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ArrowLeft, Package, MapPin, Camera, Check, Clock,
  Ruler, AlertCircle, CheckCircle2, PlayCircle,
  ChevronDown, ChevronUp, Pause, Play, WifiOff
} from 'lucide-react';
import { toast } from 'sonner';
import { getPhotoSrc } from '../lib/photo';
import { extractExif } from '../lib/extractExif';
import LocationPermissionGuide from '../components/LocationPermissionGuide';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useGpsMachine } from '../hooks/useGpsMachine';
// CoinAnimation removido (gamification disabled 2026-05-15).

// FIX C3 (auditoria 2026-05-14): relaxado de 100m para 200m. Em zonas urbanas
// densas e locais semi-fechados, smartphones costumam reportar 80-200m no
// primeiro fix — o limite anterior travava o instalador em loop sem que ele
// pudesse fazer nada além de sair para a rua. Backend ainda valida a 500m
// no checkout (item_checkins.py:21), então a margem operacional é segura.
const GPS_ACCURACY_LIMIT = 200; // metros — rejeita leitura com precisão pior que isso
const GPS_TIMEOUT_MS = 30000;   // 30s — em redes 3G mobile, 15s era curto demais

const PAUSE_REASON_LABELS = {
  "aguardando_cliente": "Aguardando Cliente",
  "chuva": "Chuva/Intempérie",
  "falta_material": "Falta de Material",
  "almoco_intervalo": "Almoço/Intervalo",
  "problema_acesso": "Problema de Acesso",
  "problema_equipamento": "Problema com Equipamento",
  "aguardando_aprovacao": "Aguardando Aprovação",
  "outro": "Outro Motivo"
};

const InstallerJobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [meuPapel, setMeuPapel] = useState(null); // papel do usuário nesta instalação (VC)
  const [itemCheckins, setItemCheckins] = useState({});
  const [pauseLogs, setPauseLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState(null);
  const [processingItem, setProcessingItem] = useState(null);
  const fileInputRef = useRef({});
  const hasAutoExpanded = useRef(false);

  // GPS permission guide state (3D) — fluxo separado da máquina de GPS.
  const [locationPermissionGuideOpen, setLocationPermissionGuideOpen] = useState(false);
  // Pending retry: { itemIndex, type, photoBase64 } — preserva a foto quando GPS falha (3A)
  const [pendingGpsRetry, setPendingGpsRetry] = useState(null);

  // Pause modal state
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseItemIndex, setPauseItemIndex] = useState(null);
  const [pauseReason, setPauseReason] = useState('');

  // [GAMIFICATION DISABLED 2026-05-15] removidos showCoinAnimation/earnedCoins
  // e handleCoinAnimationComplete — eram dead state desde a desativação.

  // Form state for checkout (apenas observação, os outros campos vêm da atribuição)
  const [checkoutForm, setCheckoutForm] = useState({
    notes: ''
  });

  // Confirm dialog para "GPS impreciso" — antes eram 3 useStates + workaround
  // setX(() => resolve). Agora encapsulado em hook.
  const { confirm: confirmLowAccuracyGps, Dialog: GpsConfirmDialog } = useConfirmDialog({
    defaultTitle: 'Sinal GPS Fraco',
    confirmText: 'Continuar mesmo assim',
    cancelText: 'Cancelar',
  });

  // Máquina de estados do GPS — antes eram 7 useStates espalhados (gpsLocation,
  // gpsError, gpsConfirmOpen/Message/Resolve, locationPermissionGuide, ...) +
  // 110 linhas de requestGPS/showGpsConfirm/tryGetPosition inline. Agora 1 hook.
  const {
    error: gpsError,
    requestGPS,
  } = useGpsMachine({
    accuracyLimit: GPS_ACCURACY_LIMIT,
    timeoutMs: GPS_TIMEOUT_MS,
    confirmLowAccuracy: confirmLowAccuracyGps,
    onFallbackAttempt: () => toast.info('GPS com dificuldade — tentando sinal alternativo…', { duration: 4000 }),
  });

  useEffect(() => {
    // FIX M2 (auditoria 2026-05-14): flag de cancelamento — se o usuário
    // navega entre jobs rapidamente, evita setState em componente desmontado
    // (warning React + risco de exibir dados de outro job por race condition).
    let cancelled = false;
    loadJobData(() => cancelled);
    // GPS will be requested only when user clicks check-in/checkout button
    // This prevents the Android overlay permission error
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

  // Buscar os valores de atribuição definidos pelo gerente para um item
  const getItemAssignment = (itemIndex) => {
    if (!job) return null;
    const assignments = job.item_assignments || [];
    return assignments.find(a => a.item_index === itemIndex);
  };

  // requestGPS é fornecido pelo hook useGpsMachine. A lógica de retry/fallback/
  // confirmação de baixa precisão vive lá. Aqui o componente só consome.

  // FIX M2: aceita um callback opcional `isCancelled` para evitar setState
  // após desmontagem (default: sempre false = mantém comportamento antigo).
  const loadJobData = async (isCancelled = () => false) => {
    try {
      setLoading(true);
      const jobRes = await api.getJobById(jobId);
      if (isCancelled()) return;
      setJob(jobRes.data);

      // Busca papel do usuário no Visual Connect (fire-and-forget, não bloqueia o carregamento)
      const hpId = jobRes.data?.holdprint_job_id;
      if (hpId && user?.email) {
        fetch('https://otyrrvkixegiqsthmaaj.supabase.co/functions/v1/installation-list', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'sb_publishable_EuYPYtSpr2X3-rXz1PhqUg_aU0Mj9Zv',
            'Authorization': 'Bearer sb_publishable_EuYPYtSpr2X3-rXz1PhqUg_aU0Mj9Zv',
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
          .catch(() => {});
      }

      // Load item checkins
      const checkinsRes = await api.getItemCheckins(jobId);
      if (isCancelled()) return;
      const checkinsList = Array.isArray(checkinsRes.data) ? checkinsRes.data : [];
      const checkinsMap = {};
      const pauseLogsMap = {};

      // FIX M1 (auditoria 2026-05-14): pause logs em paralelo (Promise.allSettled)
      // em vez do loop sequencial original. Antes: N+1 round-trips bloqueando
      // a tela em 3G ruim — agora 1 ida única e fallback silencioso por checkin.
      checkinsList.forEach(c => { checkinsMap[c.item_index] = c; });

      const activeCheckins = checkinsList.filter(c =>
        c.status === 'in_progress' || c.status === 'paused'
      );

      if (activeCheckins.length > 0) {
        const pauseResults = await Promise.allSettled(
          activeCheckins.map(c => api.getItemPauseLogs(c.id))
        );
        if (isCancelled()) return;
        activeCheckins.forEach((c, idx) => {
          const r = pauseResults[idx];
          if (r.status === 'fulfilled') {
            pauseLogsMap[c.item_index] = r.value.data;
          } else {
            console.warn('[InstallerJobDetail] getItemPauseLogs falhou:', r.reason);
            pauseLogsMap[c.item_index] = { pauses: [], total_pause_minutes: 0 };
          }
        });
      }

      if (isCancelled()) return;
      setItemCheckins(checkinsMap);
      setPauseLogs(pauseLogsMap);
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

  const handleFileSelect = async (itemIndex, type) => {
    // FIX C6 (auditoria 2026-05-14): bloqueia múltiplos cliques no botão.
    // Antes, o usuário podia clicar várias vezes antes do GPS responder e
    // abria múltiplos seletores de câmera. Agora o botão fica desabilitado
    // do click até o final do fluxo.
    if (processingItem !== null) {
      console.warn('[InstallerJobDetail] handleFileSelect ignorado — processamento em andamento');
      return;
    }
    setProcessingItem(itemIndex);

    // FIX C6-safety: timeout absoluto de 60s para garantir que o botão NUNCA
    // fique trancado permanentemente caso algum browser exótico não dispare
    // nem onChange nem focus (cenário improvável mas que deixaria o instalador
    // bloqueado até reiniciar o app).
    const lockTimeoutId = setTimeout(() => {
      console.warn('[InstallerJobDetail] lock timeout — liberando processingItem após 60s');
      setProcessingItem(null);
    }, 60000);

    // For mobile devices, use native file input with camera capture
    // This bypasses getUserMedia permission issues
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    // Detect if mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // On mobile, use capture attribute to open camera directly
      // 'environment' opens rear camera, 'user' opens front camera
      input.setAttribute('capture', 'environment');
    }

    // Garante que se o usuário cancelar o picker (sem onchange), o lock seja
    // liberado. `window.focus` dispara quando o picker fecha.
    let onChangeRan = false;
    const releaseIfCancelled = () => {
      setTimeout(() => {
        if (!onChangeRan) {
          clearTimeout(lockTimeoutId);
          setProcessingItem(null);
          window.removeEventListener('focus', releaseIfCancelled);
        }
      }, 500);
    };

    input.onchange = async (e) => {
      onChangeRan = true;
      clearTimeout(lockTimeoutId);
      window.removeEventListener('focus', releaseIfCancelled);
      const file = e.target.files?.[0];
      if (!file) {
        setProcessingItem(null);
        return;
      }
      try {
        // Extrair EXIF do arquivo original antes da compressão (canvas apaga os metadados)
        const exifData = await extractExif(file);
        // Compress image before converting to base64
        const compressedBase64 = await compressImage(file);

        if (type === 'checkin') {
          await handleItemCheckin(itemIndex, compressedBase64, exifData);
        } else {
          await handleItemCheckout(itemIndex, compressedBase64, exifData);
        }
      } catch (error) {
        console.error('[InstallerJobDetail] handleFileSelect compress/checkin error:', error);
        toast.error('Erro ao processar imagem. Tente novamente.');
        setProcessingItem(null);
      }
    };

    // Reset input to allow selecting same file again
    input.value = '';
    window.addEventListener('focus', releaseIfCancelled, { once: true });
    input.click();
  };

  // Helper function to compress images
  // FIX C2 (auditoria 2026-05-14): compressão iterativa — se ainda passar de
  // ~1MB base64 (que vira ~750KB de bytes JPEG + overhead multipart), reduz
  // a qualidade até caber. Evita estourar o limite de 4.5MB do Vercel para
  // payloads de função serverless. Sem este loop, fotos de smartphones de
  // 48MP+ derrubavam o checkin com timeout/413 silencioso.
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let MAX_WIDTH = 1024;
          let MAX_HEIGHT = 1024;

          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Compressão iterativa — alvo: ≤ 1MB de base64 (~750KB binário).
          const MAX_BASE64_BYTES = 1024 * 1024; // 1MB
          let quality = 0.7;
          let base64 = canvas.toDataURL('image/jpeg', quality);

          // Se ainda muito grande, reduz qualidade progressivamente.
          while (base64.length > MAX_BASE64_BYTES && quality > 0.2) {
            quality -= 0.1;
            base64 = canvas.toDataURL('image/jpeg', quality);
          }

          // Se mesmo a 0.2 ainda está acima, encolhe dimensão progressivamente
          // (até 4 tentativas de 0.7x cada — garante saída ≤ 1MB para câmeras de até ~200MP).
          let resizeAttempts = 0;
          while (base64.length > MAX_BASE64_BYTES && resizeAttempts < 4) {
            canvas.width = Math.round(canvas.width * 0.7);
            canvas.height = Math.round(canvas.height * 0.7);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const q = Math.max(0.3, 0.5 - resizeAttempts * 0.05);
            base64 = canvas.toDataURL('image/jpeg', q);
            resizeAttempts++;
          }

          console.log(`[compressImage] saída: ${(base64.length / 1024).toFixed(0)}KB (quality=${quality.toFixed(2)})`);
          resolve(base64);
        };
        img.onerror = reject;
        img.src = event.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleItemCheckin = async (itemIndex, photoBase64, exifData = {}) => {
    setProcessingItem(itemIndex);
    // GPS é opcional — tenta obter, mas prossegue com null se falhar.
    // Localização de registro vem do EXIF da foto quando GPS não está disponível.
    let location = null;
    try {
      location = await requestGPS();
    } catch (_gpsErr) {
      // GPS indisponível: registra sem coordenadas do navegador.
      // O EXIF da foto (se disponível) servirá como evidência de localização.
    }
    try {
      const formData = new FormData();
      formData.append('job_id', jobId);
      formData.append('item_index', itemIndex);
      formData.append('photo_base64', photoBase64);
      if (location) {
        formData.append('gps_lat', location.lat);
        formData.append('gps_long', location.long);
        formData.append('gps_accuracy', location.accuracy);
      }
      // Metadados EXIF da foto (localização e dispositivo registrados pela câmera)
      if (exifData?.exif_lat != null) formData.append('exif_lat', exifData.exif_lat);
      if (exifData?.exif_long != null) formData.append('exif_long', exifData.exif_long);
      if (exifData?.exif_datetime) formData.append('exif_datetime', exifData.exif_datetime);
      if (exifData?.exif_device) formData.append('exif_device', exifData.exif_device);

      await api.createItemCheckin(formData);
      setPendingGpsRetry(null);
      toast.success('Check-in do item realizado!');
      await loadJobData();
    } catch (error) {
      // FIX C5 (auditoria 2026-05-14): expõe o motivo real do erro em vez
      // do toast genérico. Quando o backend responde 400/409/422, o detail
      // explica o que precisa ser feito (ex: "Item já está em check-in",
      // "Item arquivado", "Você não está atribuído", etc.).
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      let userMessage;
      if (detail) {
        userMessage = detail;
      } else if (status === 413) {
        userMessage = 'Foto muito grande. Tire uma nova com menor resolução.';
      } else if (status >= 500) {
        userMessage = 'Erro no servidor. Tente novamente em alguns segundos.';
      } else if (!error.response) {
        userMessage = 'Sem conexão. Verifique sua internet e tente novamente.';
      } else {
        userMessage = 'Erro ao fazer check-in do item. Tente novamente.';
      }
      toast.error(userMessage, { duration: 6000 });
      console.error('[InstallerJobDetail] handleItemCheckin:', error.response?.data || error);
    } finally {
      setProcessingItem(null);
    }
  };

  // handleRetryGps — chamado pelo toast "Tentar GPS" e pelo LocationPermissionGuide.
  // Usa a foto guardada em pendingGpsRetry para finalizar o fluxo sem re-tirar foto (3A).
  const handleRetryGps = async () => {
    if (!pendingGpsRetry) return;
    const { itemIndex, type, photoBase64 } = pendingGpsRetry;
    // Limpa o retry pendente antes de chamar para evitar loop duplo.
    setPendingGpsRetry(null);
    if (type === 'checkin') {
      await handleItemCheckin(itemIndex, photoBase64);
    } else {
      await handleItemCheckout(itemIndex, photoBase64);
    }
  };

  const handleItemCheckout = async (itemIndex, photoBase64, exifData = {}) => {
    const checkin = itemCheckins[itemIndex];
    if (!checkin) {
      toast.error('Faça o check-in primeiro');
      return;
    }

    setProcessingItem(itemIndex);
    // GPS é opcional — prossegue com null se indisponível.
    let location = null;
    try {
      location = await requestGPS();
    } catch (_gpsErr) {
      // GPS indisponível: checkout registrado sem coordenadas do navegador.
    }

    try {

      const item = getItemByIndex(itemIndex);
      const assignment = getItemAssignment(itemIndex);

      // Usar valores definidos pelo gerente na atribuição
      const complexityLevel = assignment?.manager_difficulty_level || 3;
      // TODO: usar altura real da atribuicao quando disponivel (campo ausente no objeto assignment)
      const heightCategory = 'terreo';
      const scenarioCategory = assignment?.manager_scenario_category || 'loja_rua';
      const installedM2 = item?.total_area_m2 || 0; // Usar o m² calculado do item

      const formData = new FormData();
      formData.append('photo_base64', photoBase64);
      if (location) {
        formData.append('gps_lat', location.lat);
        formData.append('gps_long', location.long);
        formData.append('gps_accuracy', location.accuracy);
      }
      // Metadados EXIF da foto
      if (exifData?.exif_lat != null) formData.append('exif_lat', exifData.exif_lat);
      if (exifData?.exif_long != null) formData.append('exif_long', exifData.exif_long);
      if (exifData?.exif_datetime) formData.append('exif_datetime', exifData.exif_datetime);
      if (exifData?.exif_device) formData.append('exif_device', exifData.exif_device);
      formData.append('installed_m2', installedM2);
      formData.append('complexity_level', complexityLevel);
      formData.append('height_category', heightCategory);
      formData.append('scenario_category', scenarioCategory);
      formData.append('notes', checkoutForm.notes);

      const response = await api.completeItemCheckout(checkin.id, formData);

      // Check for location alert
      if (response.data?.location_alert) {
        const alert = response.data.location_alert;
        toast.warning(
          `⚠️ Alerta de Localização!\n${alert.message}\n\nUm registro foi criado automaticamente.`,
          { duration: 8000 }
        );
      }

      // [GAMIFICATION DISABLED 2026-05-15] award de moedas suspenso após checkout.
      // Toda a chamada a /gamification/process-checkout e a animação de coins foram
      // removidas. Para reverter, ver git: git show HEAD~1 -- frontend/src/pages/InstallerJobDetail.jsx
      toast.success('Check-out do item realizado!');
      
      // Reset form
      setPendingGpsRetry(null);
      setCheckoutForm({ notes: '' });
      setExpandedItem(null);
      await loadJobData();
    } catch (error) {
      // FIX C5: mensagens detalhadas + diagnóstico de problemas de rede
      // e payload (mesma lógica do handleItemCheckin).
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      let userMessage;
      if (detail) {
        userMessage = detail;
      } else if (status === 413) {
        userMessage = 'Foto muito grande. Tire uma nova com menor resolução.';
      } else if (status >= 500) {
        userMessage = 'Erro no servidor. Tente novamente em alguns segundos.';
      } else if (!error.response) {
        userMessage = 'Sem conexão. Verifique sua internet e tente novamente.';
      } else {
        userMessage = 'Erro ao fazer check-out do item. Tente novamente.';
      }
      toast.error(userMessage, { duration: 6000 });
      console.error('[InstallerJobDetail] handleItemCheckout:', error.response?.data || error);
    } finally {
      setProcessingItem(null);
    }
  };

  // [GAMIFICATION DISABLED 2026-05-15] handleCoinAnimationComplete removido —
  // toast de sucesso do checkout já é emitido em handleItemCheckout.

  const getItemByIndex = (index) => {
    const products = job?.products_with_area || [];
    return products[index];
  };

  const getItemStatus = (itemIndex) => {
    const checkin = itemCheckins[itemIndex];
    if (!checkin) return 'pending';
    if (checkin.status === 'completed') return 'completed';
    if (checkin.status === 'paused') return 'paused';
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

  const handleOpenPauseModal = (itemIndex) => {
    setPauseItemIndex(itemIndex);
    setPauseReason('');
    setShowPauseModal(true);
  };

  const handlePauseItem = async () => {
    if (!pauseReason) {
      toast.error('Selecione o motivo da pausa');
      return;
    }
    
    const checkin = itemCheckins[pauseItemIndex];
    if (!checkin) return;
    
    try {
      setProcessingItem(pauseItemIndex);
      await api.pauseItemCheckin(checkin.id, pauseReason);
      toast.success('Item pausado');
      setShowPauseModal(false);
      await loadJobData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Erro ao pausar item';
      toast.error(errorMessage);
      console.error('Pause error:', error.response?.data || error);
    } finally {
      setProcessingItem(null);
    }
  };

  const handleResumeItem = async (itemIndex) => {
    const checkin = itemCheckins[itemIndex];
    if (!checkin) return;
    
    try {
      setProcessingItem(itemIndex);
      await api.resumeItemCheckin(checkin.id);
      toast.success('Item retomado');
      await loadJobData();
    } catch (error) {
      toast.error('Erro ao retomar item');
      console.error(error);
    } finally {
      setProcessingItem(null);
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

  const getElapsedTime = (checkin) => {
    if (!checkin || !checkin.checkin_at) return 0;
    const start = new Date(checkin.checkin_at);
    const now = new Date();
    return Math.floor((now - start) / 60000);
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
    <div className={`min-h-screen bg-background ${completedItems === totalItems && totalItems > 0 ? 'pb-28' : 'pb-8'}`}>
      {/* [GAMIFICATION DISABLED 2026-05-15] CoinAnimation suspenso. */}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center h-10 w-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 active:bg-white/20 active:scale-[0.98] transition-transform mb-3"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <h1 className="text-xl font-bold text-foreground">{job.title}</h1>
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
              <p className="text-xs text-muted-foreground">{job.client_address}</p>
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
            // O array `products` vem filtrado por `getProducts()`, mas o backend grava
            // checkins indexados pelo índice original em `products_with_area`.
            const itemIndex = item.originalIndex ?? index;
            const status = getItemStatus(itemIndex);
            const checkin = itemCheckins[itemIndex];
            const isExpanded = expandedItem === itemIndex;
            const isProcessing = processingItem === itemIndex;

            return (
              <Card
                key={itemIndex}
                className={`bg-card/50 border transition-all ${
                  status === 'completed' ? 'border-green-500/30' :
                  status === 'in_progress' ? 'border-blue-500/30' : 'border-border'
                }`}
              >
                <CardContent className="p-4">
                  {/* Item Header */}
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpandedItem(isExpanded ? null : itemIndex)}
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
                      {/* 3B: GPS status badge — visível apenas quando há erro ou processamento para este item */}
                      {isProcessing && gpsError && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                          <WifiOff className="h-3 w-3" />
                          GPS indisponível
                        </span>
                      )}
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

                  {/* 3B: GPS error banner — aparece quando há retry pendente para este item */}
                  {pendingGpsRetry?.itemIndex === itemIndex && gpsError && (
                    <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <span className="text-xs text-red-400 flex-1">{gpsError}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetryGps(); }}
                        className="text-xs text-primary underline underline-offset-2 shrink-0"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}

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
                              <span className="text-muted-foreground">Tempo Líquido:</span>
                              <span className="ml-2 text-foreground font-medium">{formatDuration(checkin.net_duration_minutes || checkin.duration_minutes)}</span>
                            </div>
                            {checkin.total_pause_minutes > 0 && (
                              <>
                                <div>
                                  <span className="text-muted-foreground">Tempo Bruto:</span>
                                  <span className="ml-2 text-foreground">{formatDuration(checkin.duration_minutes)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Pausas:</span>
                                  <span className="ml-2 text-orange-400">{formatDuration(checkin.total_pause_minutes)}</span>
                                </div>
                              </>
                            )}
                            <div>
                              <span className="text-muted-foreground">Produtividade:</span>
                              <span className="ml-2 text-primary font-medium">{checkin.productivity_m2_h || 0} m²/h</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {status === 'pending' && (
                        <Button
                          onClick={() => handleFileSelect(itemIndex, 'checkin')}
                          disabled={isProcessing}
                          className="w-full bg-blue-600 hover:bg-blue-700 h-12 active:scale-[0.98] transition-transform"
                        >
                          {isProcessing ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                          ) : (
                            <Camera className="h-4 w-4 mr-2" />
                          )}
                          Fazer Check-in (Tirar Foto)
                        </Button>
                      )}

                      {status === 'in_progress' && (
                        <div className="space-y-4">
                          <div className="bg-blue-500/10 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-blue-400 flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Em execução: {formatDuration(getElapsedTime(checkin))}
                              </p>
                              {pauseLogs[itemIndex]?.total_pause_minutes > 0 && (
                                <span className="text-xs text-orange-400">
                                  Pausado: {formatDuration(pauseLogs[itemIndex].total_pause_minutes)}
                                </span>
                              )}
                            </div>
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

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleOpenPauseModal(itemIndex)}
                              disabled={isProcessing}
                              variant="outline"
                              className="flex-1 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 h-12 active:scale-[0.98] transition-transform"
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pausar
                            </Button>
                            <Button
                              onClick={() => handleFileSelect(itemIndex, 'checkout')}
                              disabled={isProcessing}
                              className="flex-1 bg-green-600 hover:bg-green-700 h-12 active:scale-[0.98] transition-transform"
                            >
                              {isProcessing ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                              ) : (
                                <Camera className="h-4 w-4 mr-2" />
                              )}
                              Finalizar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Estado PAUSADO */}
                      {status === 'paused' && (
                        <div className="space-y-4">
                          <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/30">
                            <div className="flex items-center gap-2 text-orange-400 mb-2">
                              <Pause className="h-4 w-4" />
                              <span className="font-medium">Item Pausado</span>
                            </div>
                            {pauseLogs[itemIndex]?.active_pause && (
                              <div className="text-sm">
                                <p className="text-muted-foreground">
                                  Motivo: <span className="text-orange-300">{PAUSE_REASON_LABELS[pauseLogs[itemIndex].active_pause.reason] || pauseLogs[itemIndex].active_pause.reason}</span>
                                </p>
                                <p className="text-muted-foreground">
                                  Pausado há: <span className="text-orange-300">{formatDuration(Math.floor((new Date() - new Date(pauseLogs[itemIndex].active_pause.paused_at)) / 60000))}</span>
                                </p>
                              </div>
                            )}
                            {pauseLogs[itemIndex]?.total_pause_minutes > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Tempo total em pausa: {formatDuration(pauseLogs[itemIndex].total_pause_minutes + (pauseLogs[itemIndex].active_pause ? Math.floor((new Date() - new Date(pauseLogs[itemIndex].active_pause.paused_at)) / 60000) : 0))}
                              </p>
                            )}
                          </div>

                          <Button
                            onClick={() => handleResumeItem(itemIndex)}
                            disabled={isProcessing}
                            className="w-full bg-green-600 hover:bg-green-700 h-12 active:scale-[0.98] transition-transform"
                          >
                            {isProcessing ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Retomar Trabalho
                          </Button>
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
        <div className="fixed bottom-6 left-4 right-4 pb-safe">
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

      {/* GPS Precision Confirm Dialog — fornecido por useConfirmDialog */}
      {GpsConfirmDialog}

      {/* LocationPermissionGuide (3D) */}
      {locationPermissionGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm">
            <LocationPermissionGuide
              onPermissionGranted={() => {
                setLocationPermissionGuideOpen(false);
                handleRetryGps();
              }}
              onSkip={() => {
                setLocationPermissionGuideOpen(false);
                setPendingGpsRetry(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Pause Drawer (Mobile-First) */}
      <Drawer open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DrawerContent className="bg-card border-white/10">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Pause className="h-5 w-5 text-orange-400" />
              Pausar Item
            </DrawerTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Informe o motivo da pausa. O tempo pausado nao sera contado na sua produtividade.
            </p>
          </DrawerHeader>

          <div className="px-4 pb-8 space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Motivo da Pausa *</Label>
              <Select value={pauseReason} onValueChange={setPauseReason}>
                <SelectTrigger className="bg-background border-white/10 h-12 mt-1">
                  <SelectValue placeholder="Selecione o motivo..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {Object.entries(PAUSE_REASON_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/20">
              <p className="text-xs text-orange-400">
                <strong>Importante:</strong> O tempo em pausa sera registrado e excluido do calculo de produtividade (m2/h),
                garantindo que sua metrica seja justa e reflita apenas o tempo efetivamente trabalhado.
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowPauseModal(false)}
                className="flex-1 h-12"
              >
                Cancelar
              </Button>
              <Button
                onClick={handlePauseItem}
                disabled={!pauseReason || processingItem !== null}
                className="flex-1 bg-orange-500 hover:bg-orange-600 h-12 active:scale-[0.98] transition-transform"
              >
                {processingItem !== null ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Confirmar Pausa
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default InstallerJobDetail;
