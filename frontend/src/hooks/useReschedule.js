import { useState } from 'react';
import { toast } from 'sonner';
import api from '../utils/api';

export function useReschedule(onSuccess) {
  const [loading, setLoading] = useState(false);

  const reschedule = async (jobId, { date, time, timeEnd, installerIds, status }) => {
    if (!date || !time) {
      toast.error('Informe data e hora.');
      return false;
    }

    // Converte horário local (BRT) para UTC subtraindo 3h
    const localIso = `${date}T${time}:00`;
    const localDate = new Date(localIso);
    const utcIso = new Date(localDate.getTime() + 3 * 60 * 60 * 1000).toISOString();

    let timeEndUtc = null;
    if (timeEnd) {
      const localEnd = new Date(`${date}T${timeEnd}:00`);
      timeEndUtc = new Date(localEnd.getTime() + 3 * 60 * 60 * 1000).toISOString();
    }

    setLoading(true);
    try {
      const updated = await api.scheduleJob(jobId, {
        scheduledDate: utcIso,
        scheduledTimeEnd: timeEndUtc,
        installerIds: installerIds?.length ? installerIds : null,
        status: status || 'agendado',
      });
      toast.success('Job reagendado com sucesso!');
      onSuccess?.(updated);
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao reagendar job.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { reschedule, loading };
}
