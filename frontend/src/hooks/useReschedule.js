import { useState } from 'react';
import { toast } from 'sonner';
import api from '../utils/api';

export function useReschedule(onSuccess) {
  const [loading, setLoading] = useState(false);

  const reschedule = async (jobId, { date, time, timeEnd, installerIds, status, rescheduleNote }) => {
    if (!date || !time) {
      toast.error('Informe data e hora.');
      return false;
    }

    // Brasil sem DST desde 2019 — offset BRT fixo em -03:00
    const utcIso = new Date(`${date}T${time}:00-03:00`).toISOString();

    let timeEndUtc = null;
    if (timeEnd) {
      timeEndUtc = new Date(`${date}T${timeEnd}:00-03:00`).toISOString();
    }

    setLoading(true);
    try {
      const updated = await api.scheduleJob(jobId, {
        scheduledDate: utcIso,
        scheduledTimeEnd: timeEndUtc,
        installerIds: installerIds?.length ? installerIds : null,
        status: status || 'agendado',
        rescheduleNote: rescheduleNote || undefined,
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
