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
import { MultiCombobox } from '../ui/multi-combobox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../ui/alert-dialog';
import {
  CheckCircle2, XCircle, MapPin, User, Calendar, Building2, Wrench, Ruler,
  AlertTriangle, ChevronRight, ChevronLeft, Car, Layers, Clock
} from 'lucide-react';

const confirmarSchema = z.object({
  km_ida:                   z.coerce.number().min(0).optional().nullable(),
  km_volta:                 z.coerce.number().min(0).optional().nullable(),
  altura_estimada_m:        z.coerce.number().min(0).optional().nullable(),
  nivel_dificuldade:        z.coerce.number().min(1).max(4).optional().nullable(),
  ferramentas:              z.array(z.string()).optional().default([]),
  remocao_a_realizar:       z.boolean().optional().default(false),
  tipos_servico:            z.array(z.string()).optional().default([]),
  observacoes_instalador:   z.string().optional().nullable(),
  // campos do checklist PDF
  tem_estacionamento:       z.boolean().optional().nullable(),
  tem_restricao_horario:    z.boolean().optional().default(false),
  restricao_horario_inicio: z.string().optional().nullable(),
  restricao_horario_fim:    z.string().optional().nullable(),
  tipo_superficie:          z.array(z.string()).optional().default([]),
  tipo_superficie_outro:    z.string().optional().nullable(),
  condicao_superficie:      z.boolean().optional().nullable(),
  material_remocao:         z.string().optional().nullable(),
  tem_ponto_energia:        z.boolean().optional().nullable(),
  medida_largura_m:         z.coerce.number().min(0).optional().nullable(),
  medida_altura_m:          z.coerce.number().min(0).optional().nullable(),
  forma_instalacao:         z.array(z.string()).optional().default([]),
  epi_altura:               z.boolean().optional().nullable(),
  escada_tamanho:           z.string().optional().nullable(),
  andaime_torres:           z.coerce.number().int().min(1).optional().nullable(),
});

const TIPO_SUPERFICIE = ['Alvenaria/Pintura', 'Drywall/Gesso', 'Vidro', 'ACM/Metal', 'Outro'];

const FORMA_INSTALACAO = [
  'Adesivação/Envelopamento',
  'Fixação Mecânica',
  'Fixação Química',
  'Estrutura soldada',
];

const NIVEL_OPTIONS = [
  { value: 1, label: 'Baixo',   active: 'bg-green-500/20  text-green-400  border-green-500/50'  },
  { value: 2, label: 'Médio',   active: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
  { value: 3, label: 'Alto',    active: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
  { value: 4, label: 'Extremo', active: 'bg-red-500/20    text-red-400    border-red-500/50'    },
];

const STEPS = [
  { title: 'Logística',   icon: Car    },
  { title: 'Local',       icon: Layers },
  { title: 'Medições',    icon: Ruler  },
  { title: 'Equipamentos',icon: Wrench },
];

// ── Primitivos de UI ─────────────────────────────────────────────────────────

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-white font-medium break-words">{value || '—'}</p>
    </div>
  </div>
);

const StepHeader = ({ icon: Icon, title, step, total }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="p-2.5 rounded-xl bg-primary/20 flex-shrink-0">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div>
      <p className="text-[11px] text-muted-foreground">Passo {step} de {total}</p>
      <p className="text-base font-semibold text-white">{title}</p>
    </div>
  </div>
);

const ToggleRow = ({ label, hint, checked, onChange }) => (
  <div
    className="flex items-center justify-between gap-4 p-4 bg-white/5 rounded-xl cursor-pointer select-none active:bg-white/10 transition-colors"
    onClick={() => onChange(!checked)}
  >
    <div className="flex-1">
      <p className="text-sm text-white font-medium leading-snug">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    <Switch checked={!!checked} onCheckedChange={onChange} className="flex-shrink-0" />
  </div>
);

const ChipGroup = ({ options, value = [], onChange }) => (
  <div className="flex flex-wrap gap-2">
    {options.map(opt => {
      const sel = value.includes(opt);
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(sel ? value.filter(v => v !== opt) : [...value, opt])}
          className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all touch-manipulation ${
            sel
              ? 'bg-primary/20 text-primary border-primary/50'
              : 'bg-white/5 text-gray-400 border-white/10 active:bg-white/10'
          }`}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

// ── Componente principal ─────────────────────────────────────────────────────

const ConfirmarVisitaForm = ({ visita, onConfirmado, onRejeitado }) => {
  const { tiposServico, ferramentas, addTipoServico, addFerramenta } = useCatalogos();
  const [step, setStep]               = useState(0);
  const [rejeitarOpen, setRejeitarOpen] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [rejeitando, setRejeitando]   = useState(false);
  const TOTAL = STEPS.length;

  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
    resolver: zodResolver(confirmarSchema),
    defaultValues: {
      km_ida:                   visita?.km_ida                   ?? null,
      km_volta:                 visita?.km_volta                 ?? null,
      altura_estimada_m:        visita?.altura_estimada_m        ?? null,
      nivel_dificuldade:        visita?.nivel_dificuldade        ?? null,
      ferramentas:              visita?.ferramentas              || [],
      remocao_a_realizar:       !!visita?.remocao_a_realizar,
      tipos_servico:            visita?.tipos_servico            || [],
      observacoes_instalador:   visita?.observacoes_instalador   || '',
      tem_estacionamento:       visita?.tem_estacionamento       ?? null,
      tem_restricao_horario:    !!(visita?.restricao_horario_inicio),
      restricao_horario_inicio: visita?.restricao_horario_inicio || '',
      restricao_horario_fim:    visita?.restricao_horario_fim    || '',
      tipo_superficie:          visita?.tipo_superficie          || [],
      tipo_superficie_outro:    visita?.tipo_superficie_outro    || '',
      condicao_superficie:      visita?.condicao_superficie      ?? null,
      material_remocao:         visita?.material_remocao         || '',
      tem_ponto_energia:        visita?.tem_ponto_energia        ?? null,
      medida_largura_m:         visita?.medida_largura_m         ?? null,
      medida_altura_m:          visita?.medida_altura_m          ?? null,
      forma_instalacao:         visita?.forma_instalacao         || [],
      epi_altura:               visita?.epi_altura               ?? null,
      escada_tamanho:           visita?.escada_tamanho           || '',
      andaime_torres:           visita?.andaime_torres           ?? null,
    },
  });

  const w = watch();
  const temEscada  = (w.ferramentas || []).some(f => typeof f === 'string' && f.toLowerCase().includes('escada'));
  const temAndaime = (w.ferramentas || []).some(f => typeof f === 'string' && f.toLowerCase().includes('andaime'));

  const onSubmit = async (data) => {
    try {
      const { tem_restricao_horario, ...payload } = data;
      if (!tem_restricao_horario) {
        payload.restricao_horario_inicio = null;
        payload.restricao_horario_fim    = null;
      }
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && v !== '')
      );
      await api.confirmarVisita(visita.id, clean);
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

  const formattedDate = visita?.scheduled_date
    ? new Date(visita.scheduled_date).toLocaleDateString('pt-BR')
    : null;
  const formattedTime = visita?.scheduled_time_end
    ? new Date(visita.scheduled_time_end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Card className="bg-card border-amber-500/30 max-w-2xl mx-auto">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm text-amber-300 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Confirmar Agendamento
          </CardTitle>
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
            A CONFIRMAR
          </Badge>
        </div>

        {/* Barra de progresso */}
        <div className="flex gap-1.5 mt-3">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-primary' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {STEPS.map((s, i) => (
            <p key={i} className={`text-[10px] transition-colors ${i === step ? 'text-primary font-medium' : 'text-muted-foreground/50'}`}>
              {s.title}
            </p>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* Resumo da visita (compacto) */}
        <div className="rounded-xl bg-white/5 border border-white/5 p-3 grid grid-cols-2 gap-2.5">
          <InfoRow icon={User}      label="Cliente"   value={visita?.client_name} />
          <InfoRow icon={Building2} label="Filial"    value={visita?.branch} />
          <InfoRow icon={MapPin}    label="Endereço"  value={visita?.client_address} />
          <InfoRow icon={Calendar}  label="Data"      value={formattedDate ? `${formattedDate}${formattedTime ? ' / ' + formattedTime : ''}` : '—'} />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* ── PASSO 1 — LOGÍSTICA ───────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-3">
              <StepHeader icon={Car} title="Logística de Acesso" step={1} total={TOTAL} />

              <ToggleRow
                label="Tem estacionamento ou área de carga/descarga?"
                hint="Facilita o desembarque de materiais e equipamentos"
                checked={w.tem_estacionamento}
                onChange={(v) => setValue('tem_estacionamento', v)}
              />

              <ToggleRow
                label="Tem restrição de horário para barulho/instalação?"
                hint="Condomínios, shoppings, centros comerciais..."
                checked={w.tem_restricao_horario}
                onChange={(v) => setValue('tem_restricao_horario', v)}
              />

              {w.tem_restricao_horario && (
                <div className="space-y-2 pl-3 border-l-2 border-primary/40 ml-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Pode instalar/fazer barulho das... às...
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Início</Label>
                      <Input
                        type="time"
                        {...register('restricao_horario_inicio')}
                        className="bg-background border-white/10 text-white h-12 text-base"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Fim</Label>
                      <Input
                        type="time"
                        {...register('restricao_horario_fim')}
                        className="bg-background border-white/10 text-white h-12 text-base"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PASSO 2 — LOCAL E SUPERFÍCIE ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <StepHeader icon={Layers} title="Local e Superfície" step={2} total={TOTAL} />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tipo de superfície</Label>
                <ChipGroup
                  options={TIPO_SUPERFICIE}
                  value={w.tipo_superficie || []}
                  onChange={(v) => setValue('tipo_superficie', v)}
                />
                {(w.tipo_superficie || []).includes('Outro') && (
                  <Input
                    {...register('tipo_superficie_outro')}
                    placeholder="Descreva o tipo de superfície..."
                    className="bg-background border-white/10 text-white h-12 mt-2"
                  />
                )}
              </div>

              <ToggleRow
                label="Superfície precisa de limpeza, remoção ou reparo antes de instalar?"
                checked={w.condicao_superficie}
                onChange={(v) => setValue('condicao_superficie', v)}
              />

              <ToggleRow
                label="Há remoção de material a realizar no local?"
                checked={w.remocao_a_realizar}
                onChange={(v) => setValue('remocao_a_realizar', v)}
              />

              {w.remocao_a_realizar && (
                <div className="space-y-1 pl-3 border-l-2 border-orange-500/40 ml-1">
                  <Label className="text-xs text-muted-foreground">Qual material será removido?</Label>
                  <Input
                    {...register('material_remocao')}
                    placeholder="Ex: adesivo antigo, faixa, placa..."
                    className="bg-background border-white/10 text-white h-12"
                  />
                </div>
              )}

              <ToggleRow
                label="Há ponto de energia (tomada 110V/220V) próximo?"
                hint="Para ligar ferramentas elétricas e luminosos"
                checked={w.tem_ponto_energia}
                onChange={(v) => setValue('tem_ponto_energia', v)}
              />
            </div>
          )}

          {/* ── PASSO 3 — MEDIÇÕES E INSTALAÇÃO ──────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <StepHeader icon={Ruler} title="Medições e Instalação" step={3} total={TOTAL} />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Medidas exatas do local</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Largura — L (m)</Label>
                    <Input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      {...register('medida_largura_m')}
                      placeholder="0,00"
                      className="bg-background border-white/10 text-white h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Altura — A (m)</Label>
                    <Input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      {...register('medida_altura_m')}
                      placeholder="0,00"
                      className="bg-background border-white/10 text-white h-12 text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Forma de instalação prevista</Label>
                <ChipGroup
                  options={FORMA_INSTALACAO}
                  value={w.forma_instalacao || []}
                  onChange={(v) => setValue('forma_instalacao', v)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Altura estimada da instalação (m)</Label>
                <Input
                  type="number" step="0.1" min="0" inputMode="decimal"
                  {...register('altura_estimada_m')}
                  placeholder="0,0"
                  className="bg-background border-white/10 text-white h-12 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Grau de dificuldade</Label>
                <div className="grid grid-cols-2 gap-2">
                  {NIVEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue('nivel_dificuldade', w.nivel_dificuldade === opt.value ? null : opt.value)}
                      className={`h-12 rounded-xl border font-semibold text-sm transition-all touch-manipulation ${
                        w.nivel_dificuldade === opt.value
                          ? opt.active
                          : 'bg-white/5 text-gray-400 border-white/10 active:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PASSO 4 — EQUIPAMENTOS + CONFIRMAÇÃO ─────────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              <StepHeader icon={Wrench} title="Equipamentos e Confirmação" step={4} total={TOTAL} />

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ferramentas necessárias</Label>
                <MultiCombobox
                  options={ferramentas}
                  value={w.ferramentas || []}
                  onChange={(v) => setValue('ferramentas', v)}
                  placeholder="Selecionar ferramentas..."
                  searchPlaceholder="Buscar ferramenta..."
                  creatable
                  onCreate={addFerramenta}
                />
              </div>

              {temEscada && (
                <div className="space-y-1 pl-3 border-l-2 border-primary/40 ml-1">
                  <Label className="text-xs text-muted-foreground">Tamanho da escada</Label>
                  <Input
                    {...register('escada_tamanho')}
                    placeholder="Ex: 6m, dupla 8m, extensível 10m..."
                    className="bg-background border-white/10 text-white h-12"
                  />
                </div>
              )}

              {temAndaime && (
                <div className="space-y-1 pl-3 border-l-2 border-primary/40 ml-1">
                  <Label className="text-xs text-muted-foreground">Quantas torres de andaime?</Label>
                  <Input
                    type="number" inputMode="numeric" min="1"
                    {...register('andaime_torres')}
                    placeholder="1"
                    className="bg-background border-white/10 text-white h-12 text-base"
                  />
                </div>
              )}

              <ToggleRow
                label="Necessidade de EPIs para trabalho em altura?"
                hint="Cinto de segurança, linha de vida, capacete..."
                checked={w.epi_altura}
                onChange={(v) => setValue('epi_altura', v)}
              />

              <Separator className="bg-white/5 my-1" />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Deslocamento (km)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Ida</Label>
                    <Input
                      type="number" step="0.1" min="0" inputMode="decimal"
                      {...register('km_ida')}
                      placeholder="0.0"
                      className="bg-background border-white/10 text-white h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Volta</Label>
                    <Input
                      type="number" step="0.1" min="0" inputMode="decimal"
                      {...register('km_volta')}
                      placeholder="0.0"
                      className="bg-background border-white/10 text-white h-12 text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tipos de serviço</Label>
                <MultiCombobox
                  options={tiposServico}
                  value={w.tipos_servico || []}
                  onChange={(v) => setValue('tipos_servico', v)}
                  placeholder="Selecionar tipos..."
                  searchPlaceholder="Buscar tipo..."
                  creatable
                  onCreate={addTipoServico}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Observações do instalador</Label>
                <Textarea
                  {...register('observacoes_instalador')}
                  placeholder="Observações sobre o local, acesso ou agendamento..."
                  className="bg-background border-white/10 text-white resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* ── Navegação ───────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12 border-white/10 text-gray-300"
                onClick={() => setStep(s => s - 1)}
                disabled={isSubmitting}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12 border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={() => setRejeitarOpen(true)}
                disabled={rejeitando}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Rejeitar
              </Button>
            )}

            {step < TOTAL - 1 ? (
              <Button
                type="button"
                className="flex-1 h-12 bg-primary hover:bg-primary/90 text-white"
                onClick={() => setStep(s => s + 1)}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting || rejeitando}
                className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Confirmando...' : 'Confirmar visita'}
              </Button>
            )}
          </div>

          {step > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-400"
              onClick={() => setRejeitarOpen(true)}
              disabled={rejeitando || isSubmitting}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Rejeitar agendamento
            </Button>
          )}
        </form>
      </CardContent>

      {/* ── Modal de rejeição ───────────────────────────────────────────── */}
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
            <p className="text-[10px] text-muted-foreground">{motivoRejeicao.trim().length}/10 mínimo</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejeitando} className="bg-transparent border-white/10 text-gray-300 hover:bg-white/5">
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
