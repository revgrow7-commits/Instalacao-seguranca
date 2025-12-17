import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  ArrowLeft, Package, MapPin, Camera, Check, Clock, 
  Ruler, AlertCircle, CheckCircle2, PlayCircle, 
  Square, ChevronDown, ChevronUp, Upload, Pause, Play
} from 'lucide-react';
import { toast } from 'sonner';

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
  const [itemCheckins, setItemCheckins] = useState({});
  const [pauseLogs, setPauseLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState(null);
  const [processingItem, setProcessingItem] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const fileInputRef = useRef({});
  
  // Pause modal state
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseItemIndex, setPauseItemIndex] = useState(null);
  const [pauseReason, setPauseReason] = useState('');

  // Form state for checkout (apenas observação, os outros campos vêm da atribuição)
  const [checkoutForm, setCheckoutForm] = useState({
    notes: ''
  });

  useEffect(() => {
    loadJobData();
    requestGPS();
  }, [jobId]);

  // Buscar os valores de atribuição definidos pelo gerente para um item
  const getItemAssignment = (itemIndex) => {
    if (!job) return null;
    const assignments = job.item_assignments || [];
    return assignments.find(a => a.item_index === itemIndex);
  };

  const requestGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLocation({
            lat: position.coords.latitude,
            long: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          setGpsError('Não foi possível obter localização');
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const loadJobData = async () => {
    try {
      setLoading(true);
      const jobRes = await api.getJobById(jobId);
      setJob(jobRes.data);
      
      // Load item checkins
      const checkinsRes = await api.getItemCheckins(jobId);
      const checkinsMap = {};
      const pauseLogsMap = {};
      
      for (const c of checkinsRes.data) {
        checkinsMap[c.item_index] = c;
        
        // Load pause logs for each checkin
        if (c.status === 'in_progress' || c.status === 'paused') {
          try {
            const pauseRes = await api.getItemPauseLogs(c.id);
            pauseLogsMap[c.item_index] = pauseRes.data;
          } catch (e) {
            pauseLogsMap[c.item_index] = { pauses: [], total_pause_minutes: 0 };
          }
        }
      }
      
      setItemCheckins(checkinsMap);
      setPauseLogs(pauseLogsMap);
    } catch (error) {
      toast.error('Erro ao carregar job');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (itemIndex, type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target.result;
          
          if (type === 'checkin') {
            await handleItemCheckin(itemIndex, base64);
          } else {
            await handleItemCheckout(itemIndex, base64);
          }
        };
        reader.readAsDataURL(file);
      }
    };
    
    input.click();
  };

  const handleItemCheckin = async (itemIndex, photoBase64) => {
    try {
      setProcessingItem(itemIndex);
      
      const formData = new FormData();
      formData.append('job_id', jobId);
      formData.append('item_index', itemIndex);
      formData.append('photo_base64', photoBase64);
      formData.append('gps_lat', gpsLocation?.lat || -29.9);
      formData.append('gps_long', gpsLocation?.long || -51.1);
      formData.append('gps_accuracy', gpsLocation?.accuracy || 10);

      await api.createItemCheckin(formData);
      toast.success('Check-in do item realizado!');
      await loadJobData();
    } catch (error) {
      toast.error('Erro ao fazer check-in do item');
      console.error(error);
    } finally {
      setProcessingItem(null);
    }
  };

  const handleItemCheckout = async (itemIndex, photoBase64) => {
    try {
      setProcessingItem(itemIndex);
      
      const checkin = itemCheckins[itemIndex];
      if (!checkin) {
        toast.error('Faça o check-in primeiro');
        return;
      }

      const item = getItemByIndex(itemIndex);
      const assignment = getItemAssignment(itemIndex);
      
      // Usar valores definidos pelo gerente na atribuição
      const complexityLevel = assignment?.manager_difficulty_level || 3;
      const heightCategory = 'terreo'; // Valor padrão (altura será definida pelo cenário)
      const scenarioCategory = assignment?.manager_scenario_category || 'loja_rua';
      const installedM2 = item?.total_area_m2 || 0; // Usar o m² calculado do item
      
      const formData = new FormData();
      formData.append('photo_base64', photoBase64);
      formData.append('gps_lat', gpsLocation?.lat || -29.9);
      formData.append('gps_long', gpsLocation?.long || -51.1);
      formData.append('gps_accuracy', gpsLocation?.accuracy || 10);
      formData.append('installed_m2', installedM2);
      formData.append('complexity_level', complexityLevel);
      formData.append('height_category', heightCategory);
      formData.append('scenario_category', scenarioCategory);
      formData.append('notes', checkoutForm.notes);

      await api.completeItemCheckout(checkin.id, formData);
      toast.success('Check-out do item realizado!');
      
      // Reset form
      setCheckoutForm({ notes: '' });
      setExpandedItem(null);
      await loadJobData();
    } catch (error) {
      toast.error('Erro ao fazer check-out do item');
      console.error(error);
    } finally {
      setProcessingItem(null);
    }
  };

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
      toast.error('Erro ao pausar item');
      console.error(error);
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

  const products = job.products_with_area || [];
  const totalItems = products.length;
  const completedItems = getCompletedItemsCount();
  const totalM2Job = job.area_m2 || products.reduce((sum, p) => sum + (p.total_area_m2 || 0), 0);

  return (
    <div className="min-h-screen bg-background pb-24">
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
          
          <h1 className="text-xl font-bold text-foreground">{job.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {job.holdprint_data?.client_name || job.client_name || 'Cliente não informado'}
          </p>
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
            const status = getItemStatus(index);
            const checkin = itemCheckins[index];
            const isExpanded = expandedItem === index;
            const isProcessing = processingItem === index;

            return (
              <Card 
                key={index} 
                className={`bg-card/50 border transition-all ${
                  status === 'completed' ? 'border-green-500/30' : 
                  status === 'in_progress' ? 'border-blue-500/30' : 'border-border'
                }`}
              >
                <CardContent className="p-4">
                  {/* Item Header */}
                  <div 
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpandedItem(isExpanded ? null : index)}
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
                          {checkin.checkin_photo && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Foto Check-in</p>
                              <img 
                                src={checkin.checkin_photo.startsWith('data:') ? checkin.checkin_photo : `data:image/jpeg;base64,${checkin.checkin_photo}`}
                                alt="Check-in"
                                className="w-full h-24 object-cover rounded-lg"
                              />
                            </div>
                          )}
                          {checkin.checkout_photo && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Foto Check-out</p>
                              <img 
                                src={checkin.checkout_photo.startsWith('data:') ? checkin.checkout_photo : `data:image/jpeg;base64,${checkin.checkout_photo}`}
                                alt="Check-out"
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
                              <span className="text-muted-foreground">Complexidade:</span>
                              <span className="ml-2 text-foreground">{checkin.complexity_level}/5</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {status === 'pending' && (
                        <Button
                          onClick={() => handleFileSelect(index, 'checkin')}
                          disabled={isProcessing}
                          className="w-full bg-blue-600 hover:bg-blue-700"
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
                              {pauseLogs[index]?.total_pause_minutes > 0 && (
                                <span className="text-xs text-orange-400">
                                  Pausado: {formatDuration(pauseLogs[index].total_pause_minutes)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Info definida pelo Gerente (somente leitura) */}
                          {(() => {
                            const assignment = getItemAssignment(index);
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
                              onClick={() => handleOpenPauseModal(index)}
                              disabled={isProcessing}
                              variant="outline"
                              className="flex-1 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pausar
                            </Button>
                            <Button
                              onClick={() => handleFileSelect(index, 'checkout')}
                              disabled={isProcessing}
                              className="flex-1 bg-green-600 hover:bg-green-700"
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
                            {pauseLogs[index]?.active_pause && (
                              <div className="text-sm">
                                <p className="text-muted-foreground">
                                  Motivo: <span className="text-orange-300">{PAUSE_REASON_LABELS[pauseLogs[index].active_pause.reason] || pauseLogs[index].active_pause.reason}</span>
                                </p>
                                <p className="text-muted-foreground">
                                  Pausado há: <span className="text-orange-300">{formatDuration(Math.floor((new Date() - new Date(pauseLogs[index].active_pause.start_time)) / 60000))}</span>
                                </p>
                              </div>
                            )}
                            {pauseLogs[index]?.total_pause_minutes > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Tempo total em pausa: {formatDuration(pauseLogs[index].total_pause_minutes + (pauseLogs[index].active_pause ? Math.floor((new Date() - new Date(pauseLogs[index].active_pause.start_time)) / 60000) : 0))}
                              </p>
                            )}
                          </div>

                          <Button
                            onClick={() => handleResumeItem(index)}
                            disabled={isProcessing}
                            className="w-full bg-green-600 hover:bg-green-700"
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
        <div className="fixed bottom-20 left-4 right-4 md:bottom-4">
          <Button
            onClick={() => {
              toast.success('Job concluído com sucesso!');
              navigate('/');
            }}
            className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
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
