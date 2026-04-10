/**
 * useJobFilters - Custom hook for managing job filters
 * Extracted from Jobs.jsx to improve code organization
 */
import { useState, useMemo, useCallback } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os Status' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'instalando', label: 'Instalando' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'arquivado', label: 'Arquivado' }
];

const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas as Datas' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'last_week', label: 'Última Semana' },
  { value: 'month', label: 'Este Mês' },
  { value: 'custom', label: 'Período Personalizado' }
];

export function useJobFilters(jobs = [], userRole = 'installer', userId = null) {
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('last_week');
  const [branchFilter, setBranchFilter] = useState('all');
  const [installerFilter, setInstallerFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ from: null, to: null });
  const [showArchived, setShowArchived] = useState(false);

  // Calculate date range based on filter
  const getDateRange = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (dateFilter) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 86400000) };
      case 'week':
        return { start: startOfWeek(today, { weekStartsOn: 0 }), end: endOfWeek(today, { weekStartsOn: 0 }) };
      case 'last_week':
        return { start: subDays(today, 7), end: today };
      case 'month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'custom':
        return { start: customDateRange.from, end: customDateRange.to };
      default:
        return { start: null, end: null };
    }
  }, [dateFilter, customDateRange]);

  // Check if searching for a specific job code
  const isSearchingJobCode = useMemo(() => {
    const trimmed = searchTerm.trim();
    // Check if it's a number or starts with #
    return /^#?\d+$/.test(trimmed);
  }, [searchTerm]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    if (!jobs.length) return [];

    let result = [...jobs];

    // Special case: searching for job code bypasses other filters
    if (isSearchingJobCode) {
      const codeToFind = searchTerm.replace('#', '').trim();
      return result.filter(job => {
        const jobCode = job.holdprint_data?.code || job.code || '';
        return String(jobCode).includes(codeToFind);
      });
    }

    // Role-based filtering for installers
    if (userRole === 'installer' && userId) {
      result = result.filter(job => 
        job.assigned_installers?.includes(userId) ||
        job.item_assignments?.some(a => a.installer_id === userId)
      );
    }

    // Archive filter
    if (!showArchived) {
      result = result.filter(job => !job.archived && job.status !== 'arquivado');
    }

    // Search filter (non-code search)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(job => 
        job.title?.toLowerCase().includes(term) ||
        job.client_name?.toLowerCase().includes(term) ||
        job.client_address?.toLowerCase().includes(term) ||
        job.holdprint_data?.customerName?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(job => job.status === statusFilter);
    }

    // Branch filter
    if (branchFilter !== 'all') {
      result = result.filter(job => job.branch === branchFilter);
    }

    // Installer filter (for managers/admins)
    if (installerFilter !== 'all') {
      result = result.filter(job => 
        job.assigned_installers?.includes(installerFilter) ||
        job.item_assignments?.some(a => a.installer_id === installerFilter)
      );
    }

    // Date filter
    const dateRange = getDateRange();
    if (dateRange.start && dateRange.end) {
      result = result.filter(job => {
        const jobDate = job.scheduled_date || job.created_at;
        if (!jobDate) return true; // Include jobs without dates
        
        const date = new Date(jobDate);
        return date >= dateRange.start && date <= dateRange.end;
      });
    }

    return result;
  }, [
    jobs, searchTerm, statusFilter, dateFilter, branchFilter, 
    installerFilter, showArchived, userRole, userId, 
    isSearchingJobCode, getDateRange
  ]);

  // Sort jobs
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      // Priority: In progress > Scheduled > Waiting > Completed > Archived
      const statusPriority = {
        'instalando': 0,
        'in_progress': 0,
        'agendado': 1,
        'scheduled': 1,
        'aguardando': 2,
        'pending': 2,
        'finalizado': 3,
        'completed': 3,
        'arquivado': 4
      };
      
      const priorityA = statusPriority[a.status] ?? 5;
      const priorityB = statusPriority[b.status] ?? 5;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Same status: sort by date (older first for pending, newer first for completed)
      const dateA = new Date(a.scheduled_date || a.created_at || 0);
      const dateB = new Date(b.scheduled_date || b.created_at || 0);
      
      if (priorityA <= 2) {
        return dateA - dateB; // Older first for pending/scheduled
      }
      return dateB - dateA; // Newer first for completed
    });
  }, [filteredJobs]);

  // Stats
  const stats = useMemo(() => ({
    total: jobs.length,
    filtered: filteredJobs.length,
    byStatus: {
      aguardando: jobs.filter(j => j.status === 'aguardando').length,
      agendado: jobs.filter(j => j.status === 'agendado').length,
      instalando: jobs.filter(j => j.status === 'instalando' || j.status === 'in_progress').length,
      finalizado: jobs.filter(j => j.status === 'finalizado' || j.status === 'completed').length,
      arquivado: jobs.filter(j => j.archived || j.status === 'arquivado').length
    }
  }), [jobs, filteredJobs]);

  // Reset filters
  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('last_week');
    setBranchFilter('all');
    setInstallerFilter('all');
    setCustomDateRange({ from: null, to: null });
    setShowArchived(false);
  }, []);

  return {
    // States
    searchTerm,
    statusFilter,
    dateFilter,
    branchFilter,
    installerFilter,
    customDateRange,
    showArchived,
    
    // Setters
    setSearchTerm,
    setStatusFilter,
    setDateFilter,
    setBranchFilter,
    setInstallerFilter,
    setCustomDateRange,
    setShowArchived,
    
    // Computed
    filteredJobs: sortedJobs,
    stats,
    isSearchingJobCode,
    
    // Actions
    resetFilters,
    
    // Constants
    STATUS_OPTIONS,
    DATE_FILTER_OPTIONS
  };
}

export default useJobFilters;
