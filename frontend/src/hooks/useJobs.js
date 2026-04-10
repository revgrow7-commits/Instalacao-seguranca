/**
 * useJobs - Custom hook for job data fetching and mutations
 * Handles API calls, loading states, and error handling
 */
import { useState, useCallback, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'sonner';

export function useJobs() {
  const [jobs, setJobs] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.getJobs();
      setJobs(response.data || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err.response?.data?.detail || 'Erro ao carregar jobs');
      toast.error('Erro ao carregar jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch installers
  const fetchInstallers = useCallback(async () => {
    try {
      const response = await api.getInstallers();
      setInstallers(response.data || []);
    } catch (err) {
      console.error('Error fetching installers:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
    fetchInstallers();
  }, [fetchJobs, fetchInstallers]);

  // Sync with Holdprint
  const syncHoldprint = useCallback(async () => {
    try {
      setSyncing(true);
      await api.post('/jobs/import-current-month');
      toast.success('Sincronização iniciada');
      
      // Refresh jobs after sync
      setTimeout(() => {
        fetchJobs();
        setSyncing(false);
      }, 2000);
    } catch (err) {
      console.error('Error syncing:', err);
      toast.error('Erro na sincronização');
      setSyncing(false);
    }
  }, [fetchJobs]);

  // Update job
  const updateJob = useCallback(async (jobId, data) => {
    try {
      setActionLoading(jobId);
      await api.updateJob(jobId, data);
      
      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, ...data } : job
      ));
      
      return true;
    } catch (err) {
      console.error('Error updating job:', err);
      toast.error(err.response?.data?.detail || 'Erro ao atualizar job');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Schedule job
  const scheduleJob = useCallback(async (jobId, scheduledDate, installerIds = []) => {
    try {
      setActionLoading(jobId);
      
      const data = {
        scheduled_date: scheduledDate,
        assigned_installers: installerIds,
        status: 'agendado'
      };
      
      await api.updateJob(jobId, data);
      
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, ...data } : job
      ));
      
      toast.success('Job agendado com sucesso');
      return true;
    } catch (err) {
      console.error('Error scheduling job:', err);
      toast.error(err.response?.data?.detail || 'Erro ao agendar job');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Finalize job
  const finalizeJob = useCallback(async (jobId) => {
    try {
      setActionLoading(jobId);
      await api.finalizeJob(jobId);
      
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'finalizado', completed_at: new Date().toISOString() } : job
      ));
      
      toast.success('Job finalizado com sucesso');
      return true;
    } catch (err) {
      console.error('Error finalizing job:', err);
      toast.error(err.response?.data?.detail || 'Erro ao finalizar job');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Archive job
  const archiveJob = useCallback(async (jobId, archive = true) => {
    try {
      setActionLoading(jobId);
      
      await api.updateJob(jobId, { 
        archived: archive,
        archived_at: archive ? new Date().toISOString() : null
      });
      
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { 
          ...job, 
          archived: archive,
          status: archive ? 'arquivado' : 'aguardando'
        } : job
      ));
      
      toast.success(archive ? 'Job arquivado' : 'Job restaurado');
      return true;
    } catch (err) {
      console.error('Error archiving job:', err);
      toast.error(err.response?.data?.detail || 'Erro ao arquivar job');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Submit justification
  const submitJustification = useCallback(async (jobId, type, reason) => {
    try {
      setActionLoading(jobId);
      
      await api.post('/jobs/justify', {
        job_id: jobId,
        type,
        reason
      });
      
      toast.success('Justificativa enviada');
      return true;
    } catch (err) {
      console.error('Error submitting justification:', err);
      toast.error(err.response?.data?.detail || 'Erro ao enviar justificativa');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Get job by ID
  const getJobById = useCallback((jobId) => {
    return jobs.find(job => job.id === jobId);
  }, [jobs]);

  return {
    // Data
    jobs,
    installers,
    
    // States
    loading,
    error,
    syncing,
    actionLoading,
    
    // Actions
    fetchJobs,
    fetchInstallers,
    syncHoldprint,
    updateJob,
    scheduleJob,
    finalizeJob,
    archiveJob,
    submitJustification,
    
    // Helpers
    getJobById,
    refresh: fetchJobs
  };
}

export default useJobs;
