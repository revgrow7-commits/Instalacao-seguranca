import React, { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useVisitas } from '../hooks/useVisitas';
import api from '../utils/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  MapPin, Plus, Calendar, User, Building2, ChevronDown,
  Clock, X, RefreshCw, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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

const novaVisitaSchema = z.object({
  client_name: z.string().min(1, 'Nome do cliente obrigatório'),
  client_address: z.string().min(1, 'Endereço obrigatório'),
  branch: z.enum(['POA', 'SP'], { required_error: 'Filial obrigatória' }),
  installer_id: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  scheduled_time_end: z.string().optional().nullable(),
  valor_por_km: z.coerce.number().min(0).default(1.50),
  observacoes_admin: z.string().optional().nullable(),
});

const agendarSchema = z.object({
  installer_id: z.string().min(1, 'Instalador obrigatório'),
  scheduled_date: z.string().min(1, 'Data obrigatória'),
  scheduled_time_end: z.string().optional().nullable(),
  observacoes_admin: z.string().optional().nullable(),
});

const VisitaCard = React.memo(({ visita, onAgendar, onEditar, onCancelar, isAdmin, isManager }) => {
  const navigate = useNavigate();
  const statusStyle = STATUS_STYLES[visita.status] || STATUS_STYLES.AGUARDANDO;
  const statusLabel = STATUS_LABELS[visita.status] || visita.status;
  const canAct = visita.status !== 'CONCLUIDA' && visita.status !== 'CANCELADA';
  const formattedDate = visita.scheduled_date
    ? new Date(visita.scheduled_date).toLocaleDateString('pt-BR')
    : null;

  return (
    <Card className="bg-card border-white/5 hover:border-primary/30 transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {visita.numero_vt && (
              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                {visita.numero_vt}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
              {visita.branch || 'N/A'}
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>

        <p className="text-sm font-semibold text-white truncate mb-1">
          {visita.client_name}
        </p>
        {visita.client_address && (
          <p className="text-xs text-muted-foreground truncate mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            {visita.client_address}
          </p>
        )}
        {visita.installer_id && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <User className="h-3 w-3 flex-shrink-0" />
            {`Instalador: ${visita.installer_id.slice(0, 8)}…`}
          </p>
        )}
        {formattedDate && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            {formattedDate}
            {visita.scheduled_time_end && (
              <span className="ml-1 flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {new Date(visita.scheduled_time_end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        )}
        {!formattedDate && <div className="mb-3" />}

        <div className="pt-2 border-t border-white/5 mb-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            onClick={() => navigate(`/visitas-tecnicas/${visita.id}`)}
          >
            <Eye className="h-3 w-3 mr-1" />
            Ver Detalhes
          </Button>
        </div>

        {(isAdmin || isManager) && (
          <div className="flex gap-2">
            {canAct && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={() => onAgendar(visita)}
              >
                <Calendar className="h-3 w-3 mr-1" />
                Agendar
              </Button>
            )}
            {canAct && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs border-white/10 text-gray-300 hover:bg-white/5"
                onClick={() => onEditar(visita)}
              >
                Editar
              </Button>
            )}
            {canAct && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-red-500/20 text-red-400 hover:bg-red-500/10"
                onClick={() => onCancelar(visita)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const NovaVisitaModal = ({ open, onClose, onSuccess, installers }) => {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(novaVisitaSchema),
    defaultValues: { valor_por_km: 1.50 },
  });

  const onSubmit = async (data) => {
    try {
      await api.createVisita(data);
      toast.success('Visita técnica criada com sucesso');
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao criar visita');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Nova Visita Técnica
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cliente *</Label>
            <Input
              {...register('client_name')}
              placeholder="Nome do cliente"
              className="bg-background border-white/10 text-white"
            />
            {errors.client_name && <p className="text-xs text-red-400">{errors.client_name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Endereço *</Label>
            <Input
              {...register('client_address')}
              placeholder="Endereço completo"
              className="bg-background border-white/10 text-white"
            />
            {errors.client_address && <p className="text-xs text-red-400">{errors.client_address.message}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Filial *</Label>
            <Select onValueChange={(v) => setValue('branch', v)}>
              <SelectTrigger className="bg-background border-white/10 text-white">
                <SelectValue placeholder="Selecione a filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="POA">POA — Porto Alegre</SelectItem>
                <SelectItem value="SP">SP — São Paulo</SelectItem>
              </SelectContent>
            </Select>
            {errors.branch && <p className="text-xs text-red-400">{errors.branch.message}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Instalador</Label>
            <Select onValueChange={(v) => setValue('installer_id', v === 'none' ? null : v)}>
              <SelectTrigger className="bg-background border-white/10 text-white">
                <SelectValue placeholder="Sem instalador" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="none">Sem instalador</SelectItem>
                {installers.map(inst => (
                  <SelectItem key={inst.id} value={String(inst.id)}>
                    {inst.name || inst.full_name || inst.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data agendada</Label>
              <Input
                type="date"
                {...register('scheduled_date')}
                className="bg-background border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Previsão de término</Label>
              <Input
                type="time"
                {...register('scheduled_time_end')}
                className="bg-background border-white/10 text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valor por km (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register('valor_por_km')}
              className="bg-background border-white/10 text-white"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea
              {...register('observacoes_admin')}
              placeholder="Observações internas..."
              className="bg-background border-white/10 text-white resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 border-white/10" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-primary hover:bg-primary/90 neon-glow text-white">
              {isSubmitting ? 'Criando...' : 'Criar Visita'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const AgendarVisitaModal = ({ open, visita, onClose, onSuccess, installers }) => {
  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(agendarSchema),
  });

  const onSubmit = async (data) => {
    try {
      await api.agendarVisita(visita.id, data);
      toast.success('Visita agendada com sucesso');
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao agendar visita');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendar Visita
          </DialogTitle>
        </DialogHeader>
        {visita && (
          <p className="text-sm text-muted-foreground -mt-2 mb-1">{visita.client_name}</p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Instalador *</Label>
            <Select onValueChange={(v) => setValue('installer_id', v)}>
              <SelectTrigger className="bg-background border-white/10 text-white">
                <SelectValue placeholder="Selecione o instalador" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                {installers.map(inst => (
                  <SelectItem key={inst.id} value={String(inst.id)}>
                    {inst.name || inst.full_name || inst.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.installer_id && <p className="text-xs text-red-400">{errors.installer_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data *</Label>
              <Input
                type="date"
                {...register('scheduled_date')}
                className="bg-background border-white/10 text-white"
              />
              {errors.scheduled_date && <p className="text-xs text-red-400">{errors.scheduled_date.message}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Previsão de término</Label>
              <Input
                type="time"
                {...register('scheduled_time_end')}
                className="bg-background border-white/10 text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea
              {...register('observacoes_admin')}
              placeholder="Observações internas..."
              className="bg-background border-white/10 text-white resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 border-white/10" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-primary hover:bg-primary/90 neon-glow text-white">
              {isSubmitting ? 'Salvando...' : 'Confirmar Agendamento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const EditarVisitaModal = ({ open, visita, onClose, onSuccess, installers }) => {
  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(novaVisitaSchema),
    values: visita ? {
      client_name: visita.client_name || '',
      client_address: visita.client_address || '',
      branch: visita.branch || '',
      installer_id: visita.installer_id ? String(visita.installer_id) : null,
      scheduled_date: visita.scheduled_date || '',
      scheduled_time_end: visita.scheduled_time_end || '',
      valor_por_km: visita.valor_por_km ?? 1.50,
      observacoes_admin: visita.observacoes_admin || '',
    } : {},
  });

  const onSubmit = async (data) => {
    try {
      await api.updateVisita(visita.id, data);
      toast.success('Visita atualizada com sucesso');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao atualizar visita');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Editar Visita Técnica
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cliente *</Label>
            <Input
              {...register('client_name')}
              className="bg-background border-white/10 text-white"
            />
            {errors.client_name && <p className="text-xs text-red-400">{errors.client_name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Endereço *</Label>
            <Input
              {...register('client_address')}
              className="bg-background border-white/10 text-white"
            />
            {errors.client_address && <p className="text-xs text-red-400">{errors.client_address.message}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Filial *</Label>
            <Select defaultValue={visita?.branch} onValueChange={(v) => setValue('branch', v)}>
              <SelectTrigger className="bg-background border-white/10 text-white">
                <SelectValue placeholder="Selecione a filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="POA">POA — Porto Alegre</SelectItem>
                <SelectItem value="SP">SP — São Paulo</SelectItem>
              </SelectContent>
            </Select>
            {errors.branch && <p className="text-xs text-red-400">{errors.branch.message}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Instalador</Label>
            <Select
              defaultValue={visita?.installer_id ? String(visita.installer_id) : 'none'}
              onValueChange={(v) => setValue('installer_id', v === 'none' ? null : v)}
            >
              <SelectTrigger className="bg-background border-white/10 text-white">
                <SelectValue placeholder="Sem instalador" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="none">Sem instalador</SelectItem>
                {installers.map(inst => (
                  <SelectItem key={inst.id} value={String(inst.id)}>
                    {inst.name || inst.full_name || inst.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data agendada</Label>
              <Input
                type="date"
                {...register('scheduled_date')}
                className="bg-background border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Previsão de término</Label>
              <Input
                type="time"
                {...register('scheduled_time_end')}
                className="bg-background border-white/10 text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valor por km (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register('valor_por_km')}
              className="bg-background border-white/10 text-white"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea
              {...register('observacoes_admin')}
              className="bg-background border-white/10 text-white resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 border-white/10" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-primary hover:bg-primary/90 neon-glow text-white">
              {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const VisitasTecnicas = () => {
  const { user, isAdmin, isManager } = useAuth();

  // Filtros usam 'all' como sentinela — Radix UI Select proíbe SelectItem
  // com value="" (lança Error em runtime e quebra a página).
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState(null);
  const [filterDateTo, setFilterDateTo] = useState(null);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [installers, setInstallers] = useState([]);

  const [novaVisitaOpen, setNovaVisitaOpen] = useState(false);
  const [agendarVisita, setAgendarVisita] = useState(null);
  const [editarVisita, setEditarVisita] = useState(null);

  const { visitas, loading, error, counters, refetch } = useVisitas();

  React.useEffect(() => {
    api.getInstallers()
      .then(res => setInstallers(res.data || []))
      .catch(() => {});
  }, []);

  const handleCancelar = useCallback(async (visita) => {
    if (!window.confirm(`Cancelar visita de "${visita.client_name}"?`)) return;
    try {
      await api.cancelarVisita(visita.id);
      toast.success('Visita cancelada');
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao cancelar visita');
    }
  }, [refetch]);

  const filteredVisitas = useMemo(() => {
    return visitas.filter(v => {
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;
      if (filterBranch !== 'all' && v.branch !== filterBranch) return false;
      if (filterDateFrom && v.scheduled_date && new Date(v.scheduled_date) < filterDateFrom) return false;
      if (filterDateTo && v.scheduled_date && new Date(v.scheduled_date) > filterDateTo) return false;
      return true;
    });
  }, [visitas, filterStatus, filterBranch, filterDateFrom, filterDateTo]);

  const hasFilters = filterStatus !== 'all' || filterBranch !== 'all' || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterBranch('all');
    setFilterDateFrom(null);
    setFilterDateTo(null);
  };

  const dateRangeLabel = filterDateFrom || filterDateTo
    ? `${filterDateFrom ? format(filterDateFrom, 'dd/MM/yy') : '…'} — ${filterDateTo ? format(filterDateTo, 'dd/MM/yy') : '…'}`
    : 'Período';

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-white tracking-tight flex items-center gap-3">
            <MapPin className="h-7 w-7 text-primary" />
            Visitas Técnicas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie visitas técnicas de pré-instalação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/10 text-gray-300"
            onClick={refetch}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {(isAdmin || isManager) && (
            <Button
              className="bg-primary hover:bg-primary/90 neon-glow text-white"
              onClick={() => setNovaVisitaOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Visita Técnica
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{loading ? '—' : counters.total}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="h-4 w-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{loading ? '—' : counters.aguardando}</p>
              <p className="text-[10px] text-muted-foreground">Aguardando</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <User className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{loading ? '—' : counters.emVisita}</p>
              <p className="text-[10px] text-muted-foreground">Em Visita</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-white/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Building2 className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{loading ? '—' : counters.concluidas}</p>
              <p className="text-[10px] text-muted-foreground">Concluídas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="bg-background border-white/10 text-white w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="AGUARDANDO">Aguardando</SelectItem>
                <SelectItem value="EM_VISITA">Em Visita</SelectItem>
                <SelectItem value="CONCLUIDA">Concluída</SelectItem>
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="bg-background border-white/10 text-white w-36">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="all">Todas filiais</SelectItem>
                <SelectItem value="POA">POA</SelectItem>
                <SelectItem value="SP">SP</SelectItem>
              </SelectContent>
            </Select>

            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`border-white/10 text-sm gap-2 ${(filterDateFrom || filterDateTo) ? 'text-primary border-primary/30' : 'text-gray-300'}`}
                >
                  <Calendar className="h-4 w-4" />
                  {dateRangeLabel}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="bg-card border-white/10 p-0 w-auto" align="start">
                <CalendarComponent
                  mode="range"
                  selected={{ from: filterDateFrom, to: filterDateTo }}
                  onSelect={(range) => {
                    setFilterDateFrom(range?.from || null);
                    setFilterDateTo(range?.to || null);
                  }}
                  className="text-white"
                />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-white"
                onClick={clearFilters}
              >
                <X className="h-3 w-3 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="text-center py-8 text-red-400 text-sm">{error}</div>
      )}

      {loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="bg-card border-white/5 animate-pulse">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-5 bg-white/10 rounded w-20" />
                  <div className="h-5 bg-white/10 rounded w-24" />
                </div>
                <div className="h-4 bg-white/10 rounded w-4/5" />
                <div className="h-4 bg-white/10 rounded w-3/5" />
                <div className="h-4 bg-white/10 rounded w-2/5" />
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <div className="h-8 bg-white/10 rounded flex-1" />
                  <div className="h-8 bg-white/10 rounded flex-1" />
                  <div className="h-8 bg-white/10 rounded w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && filteredVisitas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Nenhuma visita técnica encontrada</p>
          {hasFilters && (
            <p className="text-sm text-muted-foreground/60 mt-1">
              Tente limpar os filtros
            </p>
          )}
          {!hasFilters && (isAdmin || isManager) && (
            <Button
              className="mt-4 bg-primary hover:bg-primary/90 text-white"
              onClick={() => setNovaVisitaOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira visita
            </Button>
          )}
        </div>
      )}

      {!loading && !error && filteredVisitas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredVisitas.map(visita => (
            <VisitaCard
              key={visita.id}
              visita={visita}
              onAgendar={setAgendarVisita}
              onEditar={setEditarVisita}
              onCancelar={handleCancelar}
              isAdmin={isAdmin}
              isManager={isManager}
            />
          ))}
        </div>
      )}

      <NovaVisitaModal
        open={novaVisitaOpen}
        onClose={() => setNovaVisitaOpen(false)}
        onSuccess={refetch}
        installers={installers}
      />

      <AgendarVisitaModal
        open={!!agendarVisita}
        visita={agendarVisita}
        onClose={() => setAgendarVisita(null)}
        onSuccess={refetch}
        installers={installers}
      />

      <EditarVisitaModal
        open={!!editarVisita}
        visita={editarVisita}
        onClose={() => setEditarVisita(null)}
        onSuccess={refetch}
        installers={installers}
      />
    </div>
  );
};

export default VisitasTecnicas;
