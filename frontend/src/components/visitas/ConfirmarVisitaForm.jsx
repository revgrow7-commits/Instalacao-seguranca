import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import api from '../../utils/api';
import { useCatalogos } from '../../hooks/useCatalogos';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Combobox } from '../ui/combobox';
import { MultiCombobox } from '../ui/multi-combobox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';
import {
  CheckCircle2, XCircle, MapPin, User, Calendar, Building2, Wrench, Ruler, AlertTriangle
} from 'lucide-react';

const confirmarSchema = z.object({
  km_ida: z.coerce.number().min(0).optional().nullable(),
  km_volta: z.coerce.number().min(0).optional().nullable(),
  altura_estimada_m: z.coerce.number().min(0).optional().nullable(),
  nivel_dificuldade: z.coerce.number().min(1).max(4).optional().nullable(),
  ferramentas: z.array(z.string()).optional().default([]),
  remocao_a_realizar: z.boolean().optional().default(false),
  tipos_servico: z.array(z.string()).optional().default([]),
  observacoes_instalador: z.string().optional().nullable(),
});

const NIVEL_DIFICULDADE_OPTIONS = [
  { value: '1', label: '🟢 Nível 1 — Fácil' },
  { value: '2', label: '🟡 Nível 2 — Moderado' },
  { value: '3', label: '🟠 Nível 3 — Difícil' },
  { value: '4', label: '🔴 Nível 4 — Extremo' },
];

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-white font-medium break-words">{value || '—'}</p>
    </div>
  </div>
);

const ConfirmarVisitaForm = ({ visita, onConfirmado, onRejeitado, onCancel }) => {
  const { tiposServico, ferramentas, addTipoServico, addFerramenta } = useCatalogos();
  const [rejeitarOpen, setRejeitarOpen] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [rejeitando, setRejeitando] = useState(false);

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(confirmarSchema),
    defaultValues: {
      km_ida: visita?.km_ida ?? null,
      km_volta: visita?.km_volta ?? null,
      altura_estimada_m: visita?.altura_estimada_m ?? null,
      nivel_dificuldade: visita?.nivel_dificuldade ?? null,
      ferramentas: visita?.ferramentas || [],
      remocao_a_realizar: !!visita?.remocao_a_realizar,
      tipos_servico: visita?.tipos_servico || [],
      observacoes_instalador: visita?.observacoes_instalador || '',
    },
  });

  const formattedDate = visita?.scheduled_date
    ? new Date(visita.scheduled_date).toLocaleDateString('pt-BR')
    : null;
  const formattedTime = visita?.scheduled_time_end
    ? new Date(visita.scheduled_time_end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const tiposServicoLabel = (visita?.tipos_servico || []).join(', ') || '—';

  const onSubmit = async (data) => {
    try {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
      );
      await api.confirmarVisita(visita.id, payload);
      toast.success('Visita confirmada — você já pode iniciar o relatório');
      onConfirmado?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao confirmar visita');
    }
  };

  const handleRejeitar = async () => {
    if (motivoRejeicao.trim().length < 10) {
      toast.error('Motivo deve ter no mínimo 10 caracteres');
      return;
    }
    try {
      setRejeitando(true);
      await api.rejeitarVisita(visita.id, motivoRejeicao.trim());
      toast.success('Agendamento rejeitado — administração será notificada');
      setRejeitarOpen(false);
      setMotivoRejeicao('');
      onRejeitado?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao rejeitar agendamento');
    } finally {
      setRejeitando(false);
    }
  };

  return (
    <Card className="bg-card border-amber-500/30 max-w-2xl mx-auto">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm text-amber-300 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Confirmar Agendamento
          </CardTitle>
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
            A CONFIRMAR
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-5">
        {/* SEÇÃO 1 — O que foi planejado */}
        <section className="rounded-lg bg-white/5 border border-white/5 p-3 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            O que foi planejado
          </p>
          <Separator className="bg-white/5" />
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoRow icon={User} label="Cliente" value={visita?.client_name} />
            <InfoRow icon={MapPin} label="Endereço" value={visita?.client_address} />
            <InfoRow
              icon={Calendar}
              label="Data agendada"
              value={formattedDate ? `${formattedDate}${formattedTime ? ' até ' + formattedTime : ''}` : '—'}
            />
            <InfoRow icon={Building2} label="Filial" value={visita?.branch} />
            <InfoRow icon={User} label="Vendedor" value={visita?.vendedor_nome} />
            <InfoRow icon={Wrench} label="Tipos de serviço" value={tiposServicoLabel} />
          </dl>
        </section>

        {/* SEÇÃO 2 — Confirme ou ajuste */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-2">
              Confirme ou ajuste
            </p>
            <Separator className="bg-white/5 mb-4" />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">KM Ida</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  {...register('km_ida')}
                  placeholder="0.0"
                  className="bg-background border-white/10 text-white"
                />
                {errors.km_ida && <p className="text-xs text-red-400">{errors.km_ida.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">KM Volta</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  {...register('km_volta')}
                  placeholder="0.0"
                  className="bg-background border-white/10 text-white"
                />
                {errors.km_volta && <p className="text-xs text-red-400">{errors.km_volta.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  Altura estimada (m)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  {...register('altura_estimada_m')}
                  placeholder="0.0"
                  className="bg-background border-white/10 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nível de dificuldade</Label>
                <Combobox
                  options={NIVEL_DIFICULDADE_OPTIONS}
                  value={watch('nivel_dificuldade') ? String(watch('nivel_dificuldade')) : ''}
                  onChange={(v) => setValue('nivel_dificuldade', v ? Number(v) : null)}
                  placeholder="Selecionar nível..."
                />
              </div>
            </div>

            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Ferramentas necessárias</Label>
              <MultiCombobox
                options={ferramentas}
                value={watch('ferramentas') || []}
                onChange={(v) => setValue('ferramentas', v)}
                placeholder="Selecionar ferramentas..."
                searchPlaceholder="Buscar ferramenta..."
                creatable
                onCreate={addFerramenta}
              />
            </div>

            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Tipos de serviço</Label>
              <MultiCombobox
                options={tiposServico}
                value={watch('tipos_servico') || []}
                onChange={(v) => setValue('tipos_servico', v)}
                placeholder="Selecionar tipos de serviço..."
                searchPlaceholder="Buscar tipo..."
                creatable
                onCreate={addTipoServico}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mt-3">
              <Label htmlFor="remocao-switch" className="text-xs text-white cursor-pointer">
                Remoção a realizar no local?
              </Label>
              <Switch
                id="remocao-switch"
                checked={!!watch('remocao_a_realizar')}
                onCheckedChange={(v) => setValue('remocao_a_realizar', v)}
              />
            </div>

            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Observações do instalador</Label>
              <Textarea
                {...register('observacoes_instalador')}
                placeholder="Observações sobre o local ou agendamento..."
                className="bg-background border-white/10 text-white resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* SEÇÃO 3 — Ações */}
          <Separator className="bg-white/5" />
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Button
              type="submit"
              disabled={isSubmitting || rejeitando}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Confirmando...' : 'Confirmar visita'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || rejeitando}
              className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
              onClick={() => setRejeitarOpen(true)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Rejeitar agendamento
            </Button>
          </div>
        </form>
      </CardContent>

      <AlertDialog open={rejeitarOpen} onOpenChange={(o) => { if (!rejeitando) setRejeitarOpen(o); }}>
        <AlertDialogContent className="bg-card border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Rejeitar agendamento?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Descreva o motivo da rejeição (mínimo 10 caracteres). A administração será notificada.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Motivo *</Label>
            <Textarea
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Ex: cliente solicitou remarcação, conflito de agenda, endereço incorreto..."
              className="bg-background border-white/10 text-white resize-none"
              rows={4}
              disabled={rejeitando}
            />
            <p className="text-[10px] text-muted-foreground">
              {motivoRejeicao.trim().length}/10 mínimo
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={rejeitando}
              className="bg-transparent border-white/10 text-gray-300 hover:bg-white/5"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={rejeitando || motivoRejeicao.trim().length < 10}
              onClick={(e) => { e.preventDefault(); handleRejeitar(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejeitando ? 'Rejeitando...' : 'Confirmar rejeição'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ConfirmarVisitaForm;
