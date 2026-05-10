import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Camera, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../utils/api';

const schema = z.object({
  km_ida: z.coerce.number({ invalid_type_error: 'Informe os km de ida' }).min(0.1, 'Mínimo 0,1 km'),
  km_volta: z.coerce.number({ invalid_type_error: 'Informe os km de volta' }).min(0, 'Deve ser ≥ 0'),
  descricao: z.string().min(10, 'Mínimo 10 caracteres'),
  situacao: z.enum(['normal', 'pendencia', 'retrabalho', 'aprovado'], { required_error: 'Selecione a situação' }),
  assinatura_confirmada: z.boolean().default(false),
  chegada: z.string().min(1, 'Informe o horário de chegada'),
  saida: z.string().optional(),
});

const SITUACAO_LABELS = {
  normal: 'Normal',
  pendencia: 'Pendência Identificada',
  retrabalho: 'Retrabalho Necessário',
  aprovado: 'Aprovado para Instalação',
};

const toDatetimeLocal = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const compressImage = (file, maxPx = 1280, quality = 0.78) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round((height * maxPx) / width); width = maxPx; }
          else { width = Math.round((width * maxPx) / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
          'image/jpeg',
          quality,
        );
      };
      img.src = target.result;
    };
    reader.readAsDataURL(file);
  });

const RelatorioVisitaForm = ({ visita, onSuccess }) => {
  const [fotos, setFotos] = useState([]);
  const [fotoPreviews, setFotoPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      km_ida: '',
      km_volta: '',
      descricao: '',
      situacao: undefined,
      assinatura_confirmada: false,
      chegada: '',
      saida: '',
    },
  });

  useEffect(() => {
    setValue('chegada', toDatetimeLocal(new Date()));
  }, [setValue]);

  const kmIda = watch('km_ida');
  const kmVolta = watch('km_volta');
  const valorPorKm = visita?.valor_por_km ?? 1.5;
  const kmTotal = (Number(kmIda) || 0) + (Number(kmVolta) || 0);
  const estimativa = kmTotal > 0 ? (kmTotal * valorPorKm).toFixed(2) : null;

  const handleFotoChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    setFotos((prev) => [...prev, ...compressed]);
    const previews = compressed.map((f) => URL.createObjectURL(f));
    setFotoPreviews((prev) => [...prev, ...previews]);
  };

  const removeFoto = (index) => {
    setFotos((prev) => prev.filter((_, i) => i !== index));
    setFotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const MAX_TOTAL_MB = 10;

  const onSubmit = async (data) => {
    if (fotos.length === 0) {
      toast.error('Adicione pelo menos 1 foto');
      return;
    }
    const totalBytes = fotos.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
      toast.error(`Total de fotos excede ${MAX_TOTAL_MB}MB. Reduza o tamanho ou quantidade.`);
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('km_ida', data.km_ida);
      formData.append('km_volta', data.km_volta);
      formData.append('descricao', data.descricao);
      formData.append('situacao', data.situacao);
      formData.append('assinatura_confirmada', data.assinatura_confirmada);
      formData.append('chegada', data.chegada);
      if (data.saida) formData.append('saida', data.saida);
      fotos.forEach((f) => formData.append('fotos', f));
      await api.submitRelatorioVisita(visita.id, formData);
      toast.success('Relatório enviado com sucesso!');
      onSuccess();
    } catch (err) {
      console.error('[RelatorioVT] submit failed', err?.response?.status, err?.response?.data, err?.message);
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d) => d?.msg || d?.message || JSON.stringify(d)).join('; ')
        : err?.message === 'Network Error' ? 'Sem conexão — verifique sua internet'
        : err?.response?.status === 413 ? 'Foto muito grande — tente uma imagem menor'
        : err?.message || 'Erro ao enviar relatório';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">KM Ida *</Label>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            {...register('km_ida')}
            placeholder="0,0"
            className="bg-background border-white/10 text-white"
          />
          {errors.km_ida && <p className="text-xs text-red-400">{errors.km_ida.message}</p>}
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">KM Volta *</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            {...register('km_volta')}
            placeholder="0,0"
            className="bg-background border-white/10 text-white"
          />
          {errors.km_volta && <p className="text-xs text-red-400">{errors.km_volta.message}</p>}
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Situação *</Label>
          <Select onValueChange={(v) => setValue('situacao', v)}>
            <SelectTrigger className="bg-background border-white/10 text-white">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/10">
              {Object.entries(SITUACAO_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.situacao && <p className="text-xs text-red-400">{errors.situacao.message}</p>}
        </div>
      </div>

      {estimativa && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 text-sm text-purple-300">
          Estimativa: {kmTotal.toFixed(1)} km × R$ {valorPorKm.toFixed(2)}/km = <span className="font-semibold">R$ {estimativa}</span>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Descrição *</Label>
        <Textarea
          {...register('descricao')}
          placeholder="Descreva o que foi observado/verificado..."
          className="bg-background border-white/10 text-white resize-none"
          rows={4}
        />
        {errors.descricao && <p className="text-xs text-red-400">{errors.descricao.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Chegada *</Label>
          <Input
            type="datetime-local"
            {...register('chegada')}
            className="bg-background border-white/10 text-white"
          />
          {errors.chegada && <p className="text-xs text-red-400">{errors.chegada.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Saída</Label>
          <Input
            type="datetime-local"
            {...register('saida')}
            className="bg-background border-white/10 text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="assinatura_confirmada"
          {...register('assinatura_confirmada')}
          className="h-4 w-4 accent-primary rounded"
        />
        <Label htmlFor="assinatura_confirmada" className="text-sm text-muted-foreground cursor-pointer">
          Cliente confirmou presença/assinatura
        </Label>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Fotos * (mínimo 1)</Label>
        <label className="flex items-center gap-2 cursor-pointer border border-dashed border-white/20 rounded-lg p-3 hover:border-primary/50 transition-colors">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Adicionar fotos</span>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFotoChange}
          />
        </label>
        {fotoPreviews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {fotoPreviews.map((src, i) => (
              <div key={i} className="relative group">
                <img src={src} alt={`Foto ${i + 1}`} loading="lazy" decoding="async" className="w-full h-24 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => removeFoto(i)}
                  className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary hover:bg-primary/90 neon-glow text-white"
      >
        {submitting ? (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
        ) : (
          <Send className="h-4 w-4 mr-2" />
        )}
        Enviar Relatório
      </Button>
    </form>
  );
};

export default RelatorioVisitaForm;
