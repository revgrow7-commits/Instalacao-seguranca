import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { ArrowLeft, Users, MapPin, Calendar, Briefcase, Clock, User, AlertCircle, CheckCircle, Image, Eye, FileText, Package, Ruler, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';

const JobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isManager } = useAuth();
  const [job, setJob] = useState(null);
  const [installers, setInstallers] = useState([]);
  const [selectedInstallers, setSelectedInstallers] = useState([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [checkins, setCheckins] = useState([]);
  
  // Estados para atribuição de itens
  const [showAssignItemsDialog, setShowAssignItemsDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedItemInstallers, setSelectedItemInstallers] = useState([]);
  const [assignments, setAssignments] = useState(null);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = async () => {
    try {
      const [jobRes, installersRes, checkinsRes] = await Promise.all([
        api.getJob(jobId),
        isAdmin || isManager ? api.getInstallers() : Promise.resolve({ data: [] }),
        api.getCheckins(jobId)
      ]);
      
      setJob(jobRes.data);
      setInstallers(installersRes.data);
      setCheckins(checkinsRes.data);
      setSelectedInstallers(jobRes.data.assigned_installers || []);
      
      if (jobRes.data.scheduled_date) {
        const date = new Date(jobRes.data.scheduled_date);
        setScheduledDate(date.toISOString().slice(0, 16));
      }
      
      // Carregar atribuições de itens
      if (isAdmin || isManager) {
        try {
          const assignmentsRes = await api.getJobAssignments(jobId);
          setAssignments(assignmentsRes.data);
        } catch (e) {
          // Se não tiver atribuições, ignora
        }
      }
    } catch (error) {
      toast.error('Erro ao carregar job');
      navigate('/jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignInstallers = async () => {
    if (selectedInstallers.length === 0) {
      toast.error('Selecione pelo menos um instalador');
      return;
    }

    try {
      await api.assignJob(jobId, selectedInstallers);
      toast.success('Instaladores atribuídos com sucesso!');
      setShowAssignDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erro ao atribuir instaladores');
    }
  };

  const toggleItemSelection = (index) => {
    setSelectedItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleItemInstaller = (installerId) => {
    setSelectedItemInstallers(prev => 
      prev.includes(installerId) 
        ? prev.filter(id => id !== installerId)
        : [...prev, installerId]
    );
  };

  const handleAssignItems = async () => {
    if (selectedItems.length === 0) {
      toast.error('Selecione pelo menos um item');
      return;
    }
    if (selectedItemInstallers.length === 0) {
      toast.error('Selecione pelo menos um instalador');
      return;
    }

    try {
      await api.assignItemsToInstallers(jobId, selectedItems, selectedItemInstallers);
      toast.success('Itens atribuídos com sucesso!');
      setShowAssignItemsDialog(false);
      setSelectedItems([]);
      setSelectedItemInstallers([]);
      loadData();
    } catch (error) {
      toast.error('Erro ao atribuir itens');
    }
  };

  // Verificar se um item já está atribuído
  const getItemAssignment = (itemIndex) => {
    if (!assignments?.by_item) return null;
    return assignments.by_item.find(item => item.item_index === itemIndex);
  };

  const handleScheduleJob = async () => {
    if (!scheduledDate) {
      toast.error('Selecione uma data e hora');
      return;
    }

    try {
      await api.scheduleJob(jobId, scheduledDate, selectedInstallers.length > 0 ? selectedInstallers : null);
      toast.success('Job agendado com sucesso!');
      setShowScheduleDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erro ao agendar job');
    }
  };

  const toggleInstaller = (installerId) => {
    setSelectedInstallers(prev => 
      prev.includes(installerId)
        ? prev.filter(id => id !== installerId)
        : [...prev, installerId]
    );
  };

  const handleChangeStatus = async () => {
    if (!newStatus) {
      toast.error('Selecione um status');
      return;
    }

    try {
      await api.updateJob(jobId, { status: newStatus });
      toast.success('Status atualizado com sucesso!');
      setShowStatusDialog(false);
      loadData();
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'aguardando': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
      'instalando': 'bg-blue-500/20 text-blue-500 border-blue-500/20',
      'pausado': 'bg-orange-500/20 text-orange-500 border-orange-500/20',
      'finalizado': 'bg-green-500/20 text-green-500 border-green-500/20',
      'atrasado': 'bg-red-500/20 text-red-500 border-red-500/20',
      // Legacy status mapping
      'pending': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
      'in_progress': 'bg-blue-500/20 text-blue-500 border-blue-500/20',
      'completed': 'bg-green-500/20 text-green-500 border-green-500/20'
    };
    return colors[status?.toLowerCase()] || 'bg-gray-500/20 text-gray-500 border-gray-500/20';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'aguardando': 'AGUARDANDO',
      'instalando': 'INSTALANDO',
      'pausado': 'PAUSADO',
      'finalizado': 'FINALIZADO',
      'atrasado': 'ATRASADO',
      // Legacy status mapping
      'pending': 'AGUARDANDO',
      'in_progress': 'INSTALANDO',
      'completed': 'FINALIZADO'
    };
    return labels[status?.toLowerCase()] || status?.toUpperCase();
  };

  const isJobDelayed = () => {
    if (!job?.scheduled_date) return false;
    const scheduledDate = new Date(job.scheduled_date);
    const now = new Date();
    return scheduledDate < now && job.status !== 'finalizado' && job.status !== 'completed';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-pulse text-primary text-2xl font-heading">Carregando...</div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const assignedInstallersData = installers.filter(i => selectedInstallers.includes(i.id));

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="job-detail-page">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate('/jobs')}
        className="text-white hover:text-primary"
        data-testid="back-button"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar para Jobs
      </Button>

      {/* Job Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-4xl font-heading font-bold text-white tracking-tight">
              {job.title}
            </h1>
            {job.holdprint_data?.code && (
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold border border-purple-500/30">
                OS #{job.holdprint_data.code}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-2">Job ID: {job.id}</p>
        </div>

        <div className="flex items-center gap-3">
          {isJobDelayed() && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold text-red-500 uppercase">ATRASADO</span>
            </div>
          )}
          <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
            {getStatusLabel(job.status)}
          </span>
        </div>
      </div>

      {/* Action Buttons - Admin/Manager only */}
      {(isAdmin || isManager) && (
        <div className="flex gap-3">
          <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Alterar Status
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Alterar Status do Job</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Selecione o novo status para este job
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-white">Status Atual</Label>
                  <div className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider border inline-block ${getStatusColor(job.status)}`}>
                    {getStatusLabel(job.status)}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Novo Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aguardando">🟡 AGUARDANDO</SelectItem>
                      <SelectItem value="instalando">🔵 INSTALANDO</SelectItem>
                      <SelectItem value="pausado">🟠 PAUSADO</SelectItem>
                      <SelectItem value="finalizado">🟢 FINALIZADO</SelectItem>
                      <SelectItem value="atrasado">🔴 ATRASADO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowStatusDialog(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleChangeStatus}
                  className="bg-primary hover:bg-primary/90"
                >
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <Users className="mr-2 h-4 w-4" />
                Atribuir Instaladores
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Atribuir Instaladores</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Selecione os instaladores para este job
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 mt-4 max-h-96 overflow-y-auto">
                {installers.map((installer) => (
                  <div
                    key={installer.id}
                    className="flex items-center space-x-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <Checkbox
                      checked={selectedInstallers.includes(installer.id)}
                      onCheckedChange={() => toggleInstaller(installer.id)}
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">{installer.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {installer.branch} • {installer.phone || 'Sem telefone'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowAssignDialog(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button onClick={handleAssignInstallers} className="bg-primary hover:bg-primary/90">
                  Atribuir ({selectedInstallers.length})
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog para atribuir itens específicos */}
          <Dialog open={showAssignItemsDialog} onOpenChange={setShowAssignItemsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-green-500/50 text-green-400 hover:bg-green-500/10">
                <UserPlus className="mr-2 h-4 w-4" />
                Atribuir Itens
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Atribuir Itens a Instaladores</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Selecione os itens e instaladores. O m² será calculado automaticamente.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Selecionar itens */}
                <div>
                  <Label className="text-white mb-2 block">1. Selecione os Itens</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-lg p-2">
                    {(job?.products_with_area || job?.holdprint_data?.products || []).map((product, index) => {
                      const itemAssignment = getItemAssignment(index);
                      const isAssigned = !!itemAssignment;
                      
                      return (
                        <div
                          key={index}
                          className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                            selectedItems.includes(index) 
                              ? 'bg-green-500/20 border border-green-500/50' 
                              : isAssigned
                                ? 'bg-blue-500/10 border border-blue-500/30'
                                : 'bg-white/5 hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          <Checkbox
                            checked={selectedItems.includes(index)}
                            onCheckedChange={() => toggleItemSelection(index)}
                          />
                          <div className="flex-1">
                            <p className="text-white font-medium">{product.name}</p>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">Qtd: {product.quantity}</span>
                              {product.total_area_m2 && (
                                <span className="text-green-400 font-medium">{product.total_area_m2} m²</span>
                              )}
                              {isAssigned && (
                                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs">
                                  Atribuído: {itemAssignment.installers.map(i => i.installer_name).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedItems.length > 0 && (
                    <p className="text-sm text-green-400 mt-2">
                      {selectedItems.length} item(s) selecionado(s) - Total: {
                        selectedItems.reduce((acc, idx) => {
                          const products = job?.products_with_area || job?.holdprint_data?.products || [];
                          return acc + (products[idx]?.total_area_m2 || 0);
                        }, 0).toFixed(2)
                      } m²
                    </p>
                  )}
                </div>

                {/* Selecionar instaladores */}
                <div>
                  <Label className="text-white mb-2 block">2. Selecione os Instaladores</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2">
                    {installers.map((installer) => (
                      <div
                        key={installer.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                          selectedItemInstallers.includes(installer.id) 
                            ? 'bg-primary/20 border border-primary/50' 
                            : 'bg-white/5 hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <Checkbox
                          checked={selectedItemInstallers.includes(installer.id)}
                          onCheckedChange={() => toggleItemInstaller(installer.id)}
                        />
                        <div className="flex-1">
                          <p className="text-white font-medium">{installer.full_name}</p>
                          <p className="text-sm text-muted-foreground">{installer.branch}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumo */}
                {selectedItems.length > 0 && selectedItemInstallers.length > 0 && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <p className="text-green-400 font-medium">Resumo da Atribuição:</p>
                    <p className="text-sm text-white mt-1">
                      {selectedItems.length} item(s) serão atribuídos a {selectedItemInstallers.length} instalador(es)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Cada instalador receberá: {
                        (selectedItems.reduce((acc, idx) => {
                          const products = job?.products_with_area || job?.holdprint_data?.products || [];
                          return acc + (products[idx]?.total_area_m2 || 0);
                        }, 0) / selectedItemInstallers.length).toFixed(2)
                      } m² (dividido igualmente)
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAssignItemsDialog(false);
                    setSelectedItems([]);
                    setSelectedItemInstallers([]);
                  }}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleAssignItems} 
                  className="bg-green-600 hover:bg-green-700"
                  disabled={selectedItems.length === 0 || selectedItemInstallers.length === 0}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Atribuir Itens
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                <Calendar className="mr-2 h-4 w-4" />
                Agendar
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading text-white">Agendar Job</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Defina a data e hora para este job
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduled-date" className="text-white">Data e Hora</Label>
                  <Input
                    id="scheduled-date"
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Instaladores Atribuídos</Label>
                  {assignedInstallersData.length > 0 ? (
                    <div className="space-y-2">
                      {assignedInstallersData.map((installer) => (
                        <div key={installer.id} className="p-2 rounded bg-white/5 text-sm text-white">
                          ✓ {installer.full_name} ({installer.branch})
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum instalador atribuído. Atribua instaladores primeiro.
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowScheduleDialog(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Cancelar
                </Button>
                <Button onClick={handleScheduleJob} className="bg-primary hover:bg-primary/90">
                  Agendar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Job Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Informações do Job
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Número da OS */}
            {job.holdprint_data?.code && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Número da OS
                </p>
                <p className="text-white font-bold text-lg">#{job.holdprint_data.code}</p>
              </div>
            )}

            {/* Cliente - usando dados da Holdprint se disponível */}
            <div>
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="text-white font-medium">
                {job.holdprint_data?.customerName || job.client_name}
              </p>
            </div>
            
            {job.client_address && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Endereço
                </p>
                <p className="text-white">{job.client_address}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground">Filial</p>
              <p className="text-white font-medium">{job.branch === 'SP' ? 'São Paulo' : 'Porto Alegre'}</p>
            </div>

            {/* Área Total do Job */}
            {(job.area_m2 > 0 || job.total_products > 0) && (
              <div className="pt-3 border-t border-white/10">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-primary/10 rounded-lg p-2 border border-primary/20 text-center">
                    <p className="text-xs text-primary">Área Total</p>
                    <p className="text-white font-bold text-lg">{job.area_m2?.toLocaleString('pt-BR') || 0} <span className="text-xs">m²</span></p>
                  </div>
                  <div className="bg-blue-500/10 rounded-lg p-2 border border-blue-500/20 text-center">
                    <p className="text-xs text-blue-400">Produtos</p>
                    <p className="text-white font-bold text-lg">{job.total_products || 0}</p>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-2 border border-green-500/20 text-center">
                    <p className="text-xs text-green-400">Quantidade</p>
                    <p className="text-white font-bold text-lg">{job.total_quantity || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {job.scheduled_date && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Agendado para
                </p>
                <p className="text-white font-medium">
                  {new Date(job.scheduled_date).toLocaleString('pt-BR')}
                </p>
              </div>
            )}

            {/* Data de Criação */}
            {job.holdprint_data?.creationTime && (
              <div>
                <p className="text-sm text-muted-foreground">Data de Criação</p>
                <p className="text-white">
                  {new Date(job.holdprint_data.creationTime).toLocaleString('pt-BR')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Instaladores Atribuídos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedInstallersData.length > 0 ? (
              <div className="space-y-2">
                {assignedInstallersData.map((installer) => (
                  <div
                    key={installer.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
                  >
                    <User className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-white font-medium">{installer.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {installer.branch} • {installer.phone || 'Sem telefone'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">
                Nenhum instalador atribuído ainda
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Produtos/Itens do Job - com área calculada */}
      {(job.products_with_area?.length > 0 || (job.holdprint_data?.products && job.holdprint_data.products.length > 0)) && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Produtos / Itens ({job.products_with_area?.length || job.holdprint_data?.products?.length || 0})
              </div>
              {job.area_m2 > 0 && (
                <span className="text-sm font-normal px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
                  Total: {job.area_m2?.toLocaleString('pt-BR')} m²
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Usar products_with_area se disponível, senão holdprint_data.products */}
              {(job.products_with_area?.length > 0 ? job.products_with_area : job.holdprint_data?.products || []).map((product, index) => {
                // Se for do products_with_area, já tem os dados calculados
                const isCalculated = job.products_with_area?.length > 0;
                
                // Extrair medidas da descrição HTML se não tiver dados calculados
                let measures = null;
                if (!isCalculated && product.description) {
                  const widthMatch = product.description.match(/Largura:\s*<span[^>]*>([0-9.,]+)\s*m/i);
                  const heightMatch = product.description.match(/Altura:\s*<span[^>]*>([0-9.,]+)\s*m/i);
                  const copiesMatch = product.description.match(/Cópias:\s*<span[^>]*>([0-9]+)/i);
                  
                  if (widthMatch || heightMatch) {
                    measures = {
                      width: widthMatch ? parseFloat(widthMatch[1].replace(',', '.')) : null,
                      height: heightMatch ? parseFloat(heightMatch[1].replace(',', '.')) : null,
                      copies: copiesMatch ? parseInt(copiesMatch[1]) : 1
                    };
                  }
                }
                
                // Dados do produto
                const width = isCalculated ? product.width_m : measures?.width;
                const height = isCalculated ? product.height_m : measures?.height;
                const copies = isCalculated ? product.copies : measures?.copies || 1;
                const quantity = product.quantity || 1;
                const unitArea = width && height ? (width * height) : null;
                const totalArea = isCalculated ? product.total_area_m2 : (unitArea ? unitArea * quantity * copies : null);
                const familyName = product.family_name;
                
                return (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-semibold text-lg">{product.name}</h4>
                          {familyName && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-primary/20 text-primary">
                              {familyName}
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                          {/* Quantidade */}
                          <div className="bg-blue-500/10 rounded-lg p-2 border border-blue-500/20">
                            <p className="text-xs text-blue-400">Quantidade</p>
                            <p className="text-white font-bold">{quantity}</p>
                          </div>
                          
                          {/* Largura */}
                          {width && (
                            <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/20">
                              <p className="text-xs text-purple-400 flex items-center gap-1">
                                <Ruler className="h-3 w-3" /> Largura
                              </p>
                              <p className="text-white font-bold">{width}m</p>
                            </div>
                          )}
                          
                          {/* Altura */}
                          {height && (
                            <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/20">
                              <p className="text-xs text-purple-400 flex items-center gap-1">
                                <Ruler className="h-3 w-3" /> Altura
                              </p>
                              <p className="text-white font-bold">{height}m</p>
                            </div>
                          )}
                          
                          {/* Cópias */}
                          {copies > 1 && (
                            <div className="bg-yellow-500/10 rounded-lg p-2 border border-yellow-500/20">
                              <p className="text-xs text-yellow-400">Cópias</p>
                              <p className="text-white font-bold">{copies}</p>
                            </div>
                          )}
                          
                          {/* Área Total do Item */}
                          {totalArea && (
                            <div className="bg-green-500/10 rounded-lg p-2 border border-green-500/20">
                              <p className="text-xs text-green-400 font-medium">Área Total</p>
                              <p className="text-green-400 font-bold text-lg">{totalArea.toLocaleString('pt-BR')} m²</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Cálculo detalhado */}
                        {width && height && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Cálculo: {width}m × {height}m{copies > 1 ? ` × ${copies} cópias` : ''} × {quantity} un = <span className="text-green-400 font-medium">{totalArea?.toLocaleString('pt-BR')} m²</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Atribuições por Instalador */}
      {(isAdmin || isManager) && assignments?.by_installer?.length > 0 && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Atribuições por Instalador
              </div>
              <span className="text-sm font-normal px-3 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                {assignments.by_installer.reduce((acc, i) => acc + i.total_m2, 0).toFixed(2)} m² atribuídos
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assignments.by_installer.map((installer) => (
                <div key={installer.installer_id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      <span className="text-white font-semibold">{installer.installer_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{installer.items.length} item(s)</span>
                      <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 font-bold">
                        {installer.total_m2.toFixed(2)} m²
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {installer.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-white/5">
                        <span className="text-white">{item.item_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-medium">{item.assigned_m2} m²</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            item.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            item.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {item.status === 'completed' ? 'Concluído' : 
                             item.status === 'in_progress' ? 'Em andamento' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Itens de Produção */}
      {job.holdprint_data?.production?.items && job.holdprint_data.production.items.length > 0 && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Itens de Produção ({job.holdprint_data.production.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {job.holdprint_data.production.items.map((item, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-white/5 border border-white/5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium">{item.name}</p>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20">
                      Qtd: {item.quantity}
                    </span>
                  </div>
                  
                  {/* Tasks/Processos */}
                  {item.tasks && item.tasks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tasks
                        .filter(task => task.name && task.isProductive)
                        .map((task, taskIndex) => (
                          <span
                            key={taskIndex}
                            className={`px-2 py-0.5 text-xs rounded ${
                              task.productionStatus === 'Finalized' 
                                ? 'bg-green-500/20 text-green-400'
                                : task.productionStatus === 'Ready'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {task.name}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy: Itens simples se não tiver dados da Holdprint */}
      {(!job.holdprint_data?.products || job.holdprint_data.products.length === 0) && job.items && job.items.length > 0 && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white">Itens do Job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {job.items.map((item, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-white/5 border border-white/5"
                >
                  <p className="text-white font-medium">{item.name || `Item ${index + 1}`}</p>
                  {item.quantity && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Quantidade: {item.quantity}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check-ins Section */}
      {checkins.length > 0 && (
        <Card className="bg-card border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Check-ins Realizados ({checkins.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {checkins.map((checkin) => {
                const installer = installers.find(i => i.id === checkin.installer_id);
                
                return (
                  <div key={checkin.id} className="border border-white/10 rounded-lg p-4 bg-white/5">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-white font-medium">{installer?.full_name || 'Instalador'}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(checkin.checkin_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                        checkin.status === 'completed' 
                          ? 'bg-green-500/20 text-green-500 border-green-500/20'
                          : 'bg-blue-500/20 text-blue-500 border-blue-500/20'
                      }`}>
                        {checkin.status === 'completed' ? 'COMPLETO' : 'EM ANDAMENTO'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Check-in Info */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Check-in
                        </h4>
                        
                        {/* Check-in Photo */}
                        {checkin.checkin_photo && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Image className="h-3 w-3" />
                              Foto de Check-in
                            </p>
                            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                              <img
                                src={checkin.checkin_photo.startsWith('data:'\) ? checkin.checkin_photo : `data:image/jpeg;base64,${checkin.checkin_photo}`}
                                alt="Check-in"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}

                        {/* GPS Check-in */}
                        {checkin.gps_lat && checkin.gps_long && (
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-blue-400 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs font-medium text-blue-400">Localização</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Lat: {checkin.gps_lat.toFixed(6)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Long: {checkin.gps_long.toFixed(6)}
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
                                  Ver no Google Maps →
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Check-out Info */}
                      {checkin.status === 'completed' && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Clock className="h-4 w-4 text-red-500" />
                            Check-out
                          </h4>
                          
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Horário: {new Date(checkin.checkout_at).toLocaleString('pt-BR')}</p>
                            {checkin.duration_minutes && (
                              <p className="text-white font-medium">⏱️ Duração: {checkin.duration_minutes} minutos</p>
                            )}
                            {checkin.installed_m2 && (
                              <p className="text-white font-medium">📐 M² Instalado: {checkin.installed_m2} m²</p>
                            )}
                          </div>

                          {/* Check-out Photo */}
                          {checkin.checkout_photo && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Image className="h-3 w-3" />
                                Foto de Check-out
                              </p>
                              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                                <img
                                  src={checkin.checkout_photo.startsWith('data:'\) ? checkin.checkout_photo : `data:image/jpeg;base64,${checkin.checkout_photo}`}
                                  alt="Check-out"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </div>
                          )}

                          {/* GPS Check-out */}
                          {checkin.checkout_gps_lat && checkin.checkout_gps_long && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-blue-400 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-blue-400">Localização</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Lat: {checkin.checkout_gps_lat.toFixed(6)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Long: {checkin.checkout_gps_long.toFixed(6)}
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
                                    Ver no Google Maps →
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {checkin.notes && (
                            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                              <p className="text-xs font-medium text-gray-300 mb-1">Observações</p>
                              <p className="text-xs text-muted-foreground">{checkin.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* View Full Details Button */}
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <Button
                        onClick={() => navigate(`/checkin-viewer/${checkin.id}`)}
                        variant="outline"
                        size="sm"
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Detalhes Completos
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default JobDetail;
