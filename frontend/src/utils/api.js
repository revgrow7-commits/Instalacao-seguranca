import axios from 'axios';
import tokenManager from './tokenManager';

const API_URL = (process.env.REACT_APP_BACKEND_URL?.trim() || window.location.origin) + '/api';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getAuthHeader = () => {
  return tokenManager.getAuthHeader();
};

// Helper to get cached data or fetch
const getCachedOrFetch = async (key, fetchFn, ttl = CACHE_TTL) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  const response = await fetchFn();
  cache.set(key, { data: response, timestamp: Date.now() });
  return response;
};

// Clear cache for a specific key or all
const clearCache = (key = null) => {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};

// ── Stale-while-revalidate cache para getJobs (localStorage) ──
const JOBS_CACHE_KEY = 'cache_jobs_v1';
const JOBS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Retorna { data, _stale: true } instantaneamente se cache válido existe.
// Sempre dispara o fetch real em background; quando resolver, atualiza localStorage.
// Se sem cache, aguarda o fetch.
const getJobsWithCache = async (includeArchived = false) => {
  const key = `${JOBS_CACHE_KEY}_${includeArchived}`;
  let stale = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) stale = JSON.parse(raw);
  } catch { /* localStorage indisponível */ }

  const freshPromise = axios
    .get(`${API_URL}/jobs${includeArchived ? '?include_archived=true' : ''}`, { headers: getAuthHeader() })
    .then(res => {
      try {
        localStorage.setItem(key, JSON.stringify({ data: res.data, t: Date.now() }));
      } catch { /* quota exceeded */ }
      return res;
    });

  if (stale && Date.now() - stale.t < JOBS_CACHE_TTL) {
    // retorna stale agora, fresh continua em background
    return { data: stale.data, _stale: true, _fresh: freshPromise };
  }
  return freshPromise;
};

export const api = {
  // Cache control
  clearCache,
  
  // Auth
  login: (email, password) => {
    clearCache(); // Clear all cache on login
    return axios.post(`${API_URL}/auth/login`, { email, password });
  },
  register: (data) => axios.post(`${API_URL}/auth/self-register`, data),
  getMe: () => axios.get(`${API_URL}/auth/me`, { headers: getAuthHeader() }),
  forgotPassword: (email) => axios.post(`${API_URL}/auth/forgot-password`, { email }),
  resetPassword: (token, newPassword) => axios.post(`${API_URL}/auth/reset-password`, { token, new_password: newPassword }),
  verifyResetToken: (token) => axios.get(`${API_URL}/auth/verify-reset-token?token=${token}`),
  adminResetPassword: (userId, newPassword) => axios.put(`${API_URL}/users/${userId}/reset-password`, { new_password: newPassword }, { headers: getAuthHeader() }),

  // Users
  getUsers: () => axios.get(`${API_URL}/users`, { headers: getAuthHeader() }),
  createUser: (data) => {
    clearCache('users');
    return axios.post(`${API_URL}/auth/register`, data, { headers: getAuthHeader() });
  },
  updateUser: (userId, data) => {
    clearCache('users');
    return axios.put(`${API_URL}/users/${userId}`, data, { headers: getAuthHeader() });
  },
  deleteUser: (userId) => {
    clearCache('users');
    return axios.delete(`${API_URL}/users/${userId}`, { headers: getAuthHeader() });
  },
  changePassword: (currentPassword, newPassword) => axios.post(`${API_URL}/users/change-password`, { current_password: currentPassword, new_password: newPassword }, { headers: getAuthHeader() }),

  // Installers (cached)
  getInstallers: () => getCachedOrFetch('installers', () => 
    axios.get(`${API_URL}/installers`, { headers: getAuthHeader() })
  ),
  updateInstaller: (installerId, data) => {
    clearCache('installers');
    return axios.put(`${API_URL}/installers/${installerId}`, data, { headers: getAuthHeader() });
  },

  // Holdprint & Jobs
  importAllJobs: (branch, month, year) => axios.post(`${API_URL}/jobs/import-all`, { branch, ...(month != null && year != null ? { month, year } : {}) }, { headers: getAuthHeader(), timeout: 90000 }),
  importCurrentMonthJobs: () => axios.post(`${API_URL}/jobs/import-current-month`, {}, { headers: getAuthHeader(), timeout: 90000 }),
  getHoldprintJobs: (branch, month, year) => {
    let url = `${API_URL}/holdprint/jobs/${branch}`;
    const params = [];
    if (month) params.push(`month=${month}`);
    if (year) params.push(`year=${year}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return axios.get(url, { headers: getAuthHeader() });
  },
  syncHoldprintJobs: (monthsBack = 2) => axios.post(`${API_URL}/jobs/sync-holdprint?months_back=${monthsBack}`, {}, { headers: getAuthHeader() }),
  getSyncStatus: () => axios.get(`${API_URL}/jobs/sync-status`, { headers: getAuthHeader() }),
  createJob: (data) => {
    clearCache('jobs_false'); clearCache('jobs_true'); clearCache('team_calendar');
    return axios.post(`${API_URL}/jobs`, data, { headers: getAuthHeader() });
  },
  getJobs: (includeArchived = false) => getJobsWithCache(includeArchived),
  bulkArchivePre2026: () => axios.post(`${API_URL}/jobs/bulk-archive-pre-2026`, {}, { headers: getAuthHeader(), timeout: 120000 }),
  bulkUnarchiveJobs: (year, month) => {
    const params = year && month ? `?year=${year}&month=${month}` : '';
    return axios.post(`${API_URL}/jobs/bulk-unarchive${params}`, {}, { headers: getAuthHeader(), timeout: 120000 });
  },
  getJob: (jobId) => getCachedOrFetch(
    `job_${jobId}`,
    () => axios.get(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
    20000
  ),
  updateJob: (jobId, data) => {
    clearCache('jobs_false'); clearCache('jobs_true'); clearCache('team_calendar');
    clearCache(`job_${jobId}`);
    return axios.put(`${API_URL}/jobs/${jobId}`, data, { headers: getAuthHeader() });
  },
  assignJob: (jobId, installerIds) => {
    clearCache('jobs_false'); clearCache('jobs_true'); clearCache('team_calendar');
    return axios.put(`${API_URL}/jobs/${jobId}/assign`, { installer_ids: installerIds }, { headers: getAuthHeader() });
  },
  scheduleJob: async (jobId, { scheduledDate, scheduledTimeEnd, installerIds, status } = {}) => {
    clearCache('jobs_false'); clearCache('jobs_true'); clearCache('team_calendar');
    const response = await axios.put(`${API_URL}/jobs/${jobId}/schedule`, {
      scheduled_date: scheduledDate,
      scheduled_time_end: scheduledTimeEnd || null,
      installer_ids: installerIds || null,
      status: status || null,
    }, { headers: getAuthHeader() });
    return response.data;
  },
  
  // Item Assignments
  assignItemsToInstallers: (jobId, itemIndices, installerIds, options = {}) => axios.post(`${API_URL}/jobs/${jobId}/assign-items`, {
    item_indices: itemIndices,
    installer_ids: installerIds,
    difficulty_level: options.difficulty_level || null,
    scenario_category: options.scenario_category || null,
    apply_to_all: options.apply_to_all !== undefined ? options.apply_to_all : true,
    remocao_prevista: options.remocao_prevista || false,
    ferramentas: options.ferramentas || null,
  }, { headers: getAuthHeader() }),
  getJobAssignments: (jobId) => axios.get(`${API_URL}/jobs/${jobId}/assignments`, { headers: getAuthHeader() }),
  updateAssignmentStatus: (jobId, itemIndex, data) => axios.put(`${API_URL}/jobs/${jobId}/assignments/${itemIndex}/status`, data, { headers: getAuthHeader() }),
  getTeamCalendarJobs: () => getCachedOrFetch(
    'team_calendar',
    () => axios.get(`${API_URL}/jobs/team-calendar`, { headers: getAuthHeader() }),
    30000
  ),

  // Batch Schedule / Archive
  batchScheduleJobs: (jobIds, scheduledDate, assignedInstallers) => axios.post(`${API_URL}/jobs/batch-schedule`, { job_ids: jobIds, scheduled_date: scheduledDate, assigned_installers: assignedInstallers }, { headers: getAuthHeader(), timeout: 60000 }),
  batchArchiveJobs: (jobIds) => axios.post(`${API_URL}/jobs/batch-archive`, { job_ids: jobIds }, { headers: getAuthHeader(), timeout: 60000 }),
  archiveJob: (jobId, excludeFromMetrics) => axios.post(`${API_URL}/jobs/${jobId}/archive`, { exclude_from_metrics: excludeFromMetrics }, { headers: getAuthHeader() }),
  unarchiveJob: (jobId) => axios.post(`${API_URL}/jobs/${jobId}/unarchive`, {}, { headers: getAuthHeader() }),
  archiveJobItems: (jobId, itemIndices, excludeFromMetrics) => axios.post(`${API_URL}/jobs/${jobId}/archive-items`, { item_indices: itemIndices, exclude_from_metrics: excludeFromMetrics }, { headers: getAuthHeader() }),
  unarchiveJobItems: (jobId, itemIndices) => axios.post(`${API_URL}/jobs/${jobId}/unarchive-items`, itemIndices, { headers: getAuthHeader() }),

  // Check-ins
  createCheckin: (formData) => {
    clearCache('checkins_all');
    return axios.post(`${API_URL}/checkins`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  checkout: (checkinId, formData) => {
    clearCache('checkins_all');
    clearCache('gamification_balance');
    clearCache('gamification_transactions');
    return axios.put(`${API_URL}/checkins/${checkinId}/checkout`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  getCheckins: (jobId = null) => getCachedOrFetch(
    `checkins_${jobId || 'all'}`,
    () => {
      const url = jobId ? `${API_URL}/checkins?job_id=${jobId}` : `${API_URL}/checkins`;
      return axios.get(url, { headers: getAuthHeader() });
    },
    15000
  ),
  getCheckinDetails: (checkinId) => axios.get(`${API_URL}/checkins/${checkinId}/details`, { headers: getAuthHeader() }),
  deleteCheckin: (checkinId) => axios.delete(`${API_URL}/checkins/${checkinId}`, { headers: getAuthHeader() }),
  
  // Item Check-ins (per item)
  createItemCheckin: (formData) => {
    const jobId = formData.get ? formData.get('job_id') : null;
    if (jobId) clearCache(`item_checkins_${jobId}`);
    return axios.post(`${API_URL}/item-checkins`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  completeItemCheckout: (checkinId, formData) => {
    const jobId = formData.get ? formData.get('job_id') : null;
    if (jobId) clearCache(`item_checkins_${jobId}`);
    clearCache(`item_pause_logs_${checkinId}`);
    clearCache('gamification_balance');
    clearCache('gamification_transactions');
    return axios.put(`${API_URL}/item-checkins/${checkinId}/checkout`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  getItemCheckins: (jobId) => getCachedOrFetch(
    `item_checkins_${jobId}`,
    () => axios.get(`${API_URL}/item-checkins?job_id=${jobId}`, { headers: getAuthHeader() }),
    20000
  ),
  getAllItemCheckins: async () => {
    const PAGE = 500;
    let offset = 0;
    const all = [];
    while (true) {
      const r = await axios.get(
        `${API_URL}/item-checkins/all?limit=${PAGE}&offset=${offset}`,
        { headers: getAuthHeader(), timeout: 15000 }
      );
      const batch = r.data || [];
      all.push(...batch);
      if (batch.length < PAGE) break;
      offset += PAGE;
      if (offset > 50000) break;
    }
    return all;
  },
  deleteItemCheckin: (checkinId) => axios.delete(`${API_URL}/item-checkins/${checkinId}`, { headers: getAuthHeader() }),
  archiveItemCheckin: (checkinId) => axios.put(`${API_URL}/item-checkins/${checkinId}/archive`, {}, { headers: getAuthHeader() }),
  
  // Item Pause/Resume
  pauseItemCheckin: (checkinId, reason) => {
    clearCache(`item_pause_logs_${checkinId}`);
    const formData = new FormData();
    formData.append('reason', reason);
    return axios.post(`${API_URL}/item-checkins/${checkinId}/pause`, formData, {
      headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' }
    });
  },
  resumeItemCheckin: (checkinId) => {
    clearCache(`item_pause_logs_${checkinId}`);
    return axios.post(`${API_URL}/item-checkins/${checkinId}/resume`, {}, { headers: getAuthHeader() });
  },
  getItemPauseLogs: (checkinId) => getCachedOrFetch(
    `item_pause_logs_${checkinId}`,
    () => axios.get(`${API_URL}/item-checkins/${checkinId}/pauses`, { headers: getAuthHeader() }),
    30000
  ),
  getPauseReasons: () => axios.get(`${API_URL}/pause-reasons`, { headers: getAuthHeader() }),
  
  // Job by ID
  getJobById: (jobId) => axios.get(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
  deleteJob: (jobId) => axios.delete(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
  reprocessJobProducts: (jobId) => axios.post(`${API_URL}/jobs/${jobId}/reprocess-products`, {}, { headers: getAuthHeader() }),
  finalizeJob: (jobId) => axios.post(`${API_URL}/jobs/${jobId}/finalize`, {}, { headers: getAuthHeader() }),

  // Metrics
  getMetrics: () => axios.get(`${API_URL}/metrics`, { headers: getAuthHeader() }),

  // Product Families
  getProductFamilies: () => axios.get(`${API_URL}/product-families`, { headers: getAuthHeader() }),
  createProductFamily: (data) => axios.post(`${API_URL}/product-families`, data, { headers: getAuthHeader() }),
  updateProductFamily: (familyId, data) => axios.put(`${API_URL}/product-families/${familyId}`, data, { headers: getAuthHeader() }),
  deleteProductFamily: (familyId) => axios.delete(`${API_URL}/product-families/${familyId}`, { headers: getAuthHeader() }),
  seedProductFamilies: () => axios.post(`${API_URL}/product-families/seed`, {}, { headers: getAuthHeader() }),

  // Products Installed & Productivity
  getProductsInstalled: (jobId = null, familyId = null) => {
    let url = `${API_URL}/products-installed`;
    const params = [];
    if (jobId) params.push(`job_id=${jobId}`);
    if (familyId) params.push(`family_id=${familyId}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return axios.get(url, { headers: getAuthHeader() });
  },
  createProductInstalled: (data) => axios.post(`${API_URL}/products-installed`, data, { headers: getAuthHeader() }),
  getProductivityHistory: (familyId = null) => {
    let url = `${API_URL}/productivity-history`;
    if (familyId) url += `?family_id=${familyId}`;
    return axios.get(url, { headers: getAuthHeader() });
  },
  getProductivityMetrics: () => axios.get(`${API_URL}/productivity-metrics`, { headers: getAuthHeader() }),

  // Reports
  getReportByFamily: () => axios.get(`${API_URL}/reports/by-family`, { headers: getAuthHeader() }),
  getReportByInstaller: () => axios.get(`${API_URL}/reports/by-installer`, { headers: getAuthHeader() }),
  getProductivityReport: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.filter_by) queryParams.append('filter_by', params.filter_by);
    if (params.filter_id) queryParams.append('filter_id', params.filter_id);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);
    const queryString = queryParams.toString();
    return axios.get(`${API_URL}/reports/productivity${queryString ? '?' + queryString : ''}`, { headers: getAuthHeader() });
  },
  classifyJobProducts: (jobId) => axios.post(`${API_URL}/jobs/${jobId}/classify-products`, {}, { headers: getAuthHeader() }),
  recalculateJobAreas: () => axios.post(`${API_URL}/jobs/recalculate-areas`, {}, { headers: getAuthHeader() }),
  exportReports: () => axios.get(`${API_URL}/reports/export`, { 
    headers: getAuthHeader(),
    responseType: 'blob'
  }),

  // Google Calendar
  getGoogleAuthUrl: () => axios.get(`${API_URL}/auth/google/login`, { headers: getAuthHeader() }),
  getGoogleAuthStatus: () => axios.get(`${API_URL}/auth/google/status`, { headers: getAuthHeader() }),
  disconnectGoogle: () => axios.delete(`${API_URL}/auth/google/disconnect`, { headers: getAuthHeader() }),
  getGoogleCalendarEvents: () => axios.get(`${API_URL}/calendar/events`, { headers: getAuthHeader() }),
  createGoogleCalendarEvent: (data) => axios.post(`${API_URL}/calendar/events`, data, { headers: getAuthHeader() }),
  deleteGoogleCalendarEvent: (eventId) => axios.delete(`${API_URL}/calendar/events/${eventId}`, { headers: getAuthHeader() }),

  // Scheduler (Agendamento Automático)
  getSchedulerJobs: () => axios.get(`${API_URL}/scheduler/jobs`, { headers: getAuthHeader() }),
  pauseSchedulerJob: (jobId) => axios.post(`${API_URL}/scheduler/jobs/${jobId}/pause`, {}, { headers: getAuthHeader() }),
  resumeSchedulerJob: (jobId) => axios.post(`${API_URL}/scheduler/jobs/${jobId}/resume`, {}, { headers: getAuthHeader() }),
  runSchedulerJobNow: (jobId) => axios.post(`${API_URL}/scheduler/jobs/${jobId}/run-now`, {}, { headers: getAuthHeader() }),

  // Push Notifications
  getVapidPublicKey: () => axios.get(`${API_URL}/notifications/vapid-public-key`),
  subscribeToNotifications: (subscription) => axios.post(`${API_URL}/notifications/subscribe`, subscription, { headers: getAuthHeader() }),
  unsubscribeFromNotifications: () => axios.delete(`${API_URL}/notifications/unsubscribe`, { headers: getAuthHeader() }),
  getNotificationStatus: () => axios.get(`${API_URL}/notifications/status`, { headers: getAuthHeader() }),
  sendNotification: (data) => axios.post(`${API_URL}/notifications/send`, data, { headers: getAuthHeader() }),
  checkScheduleConflicts: (installerId, date, time, excludeJobId = null) => {
    let url = `${API_URL}/notifications/check-schedule-conflicts?installer_id=${installerId}&date=${date}&time=${time}`;
    if (excludeJobId) url += `&exclude_job_id=${excludeJobId}`;
    return axios.get(url, { headers: getAuthHeader() });
  },
  getPendingCheckins: () => axios.get(`${API_URL}/notifications/pending-checkins`, { headers: getAuthHeader() }),
  sendLateAlerts: () => axios.post(`${API_URL}/notifications/send-late-alerts`, {}, { headers: getAuthHeader() }),
  notifyJobScheduled: (jobId) => axios.post(`${API_URL}/notifications/notify-job-scheduled?job_id=${jobId}`, {}, { headers: getAuthHeader() }),
  
  // Location Alerts
  getLocationAlerts: () => axios.get(`${API_URL}/location-alerts`, { headers: getAuthHeader() }),
  
  // Job Justification
  submitJobJustification: (jobId, data) => axios.post(`${API_URL}/jobs/${jobId}/justify`, data, { headers: getAuthHeader() }),
  
  // ============ GAMIFICATION ============
  // Balance & Transactions
  getGamificationBalance: () => getCachedOrFetch(
    'gamification_balance',
    () => axios.get(`${API_URL}/gamification/balance`, { headers: getAuthHeader() }),
    60000
  ),
  getUserGamificationBalance: (userId) => axios.get(`${API_URL}/gamification/balance/${userId}`, { headers: getAuthHeader() }),
  getGamificationTransactions: (limit = 20) => getCachedOrFetch(
    'gamification_transactions',
    () => axios.get(`${API_URL}/gamification/transactions?limit=${limit}`, { headers: getAuthHeader() }),
    60000
  ),
  getUserGamificationTransactions: (userId, limit = 20) => axios.get(`${API_URL}/gamification/transactions/${userId}?limit=${limit}`, { headers: getAuthHeader() }),
  registerDailyEngagement: () => axios.post(`${API_URL}/gamification/daily-engagement`, {}, { headers: getAuthHeader() }),
  processCheckoutGamification: (checkinId) => axios.post(`${API_URL}/gamification/process-checkout/${checkinId}`, {}, { headers: getAuthHeader() }),
  
  // Rewards Store
  getRewards: () => axios.get(`${API_URL}/gamification/rewards`, { headers: getAuthHeader() }),
  createReward: (data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return axios.post(`${API_URL}/gamification/rewards`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  updateReward: (rewardId, data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return axios.put(`${API_URL}/gamification/rewards/${rewardId}`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  deleteReward: (rewardId) => axios.delete(`${API_URL}/gamification/rewards/${rewardId}`, { headers: getAuthHeader() }),
  seedRewards: () => axios.post(`${API_URL}/gamification/rewards/seed`, {}, { headers: getAuthHeader() }),
  redeemReward: (rewardId) => axios.post(`${API_URL}/gamification/redeem/${rewardId}`, {}, { headers: getAuthHeader() }),
  getMyRedemptions: () => axios.get(`${API_URL}/gamification/redemptions`, { headers: getAuthHeader() }),
  getAllRedemptions: () => axios.get(`${API_URL}/gamification/redemptions/all`, { headers: getAuthHeader() }),
  updateRedemptionStatus: (requestId, status, notes = '') => {
    const formData = new FormData();
    formData.append('status', status);
    if (notes) formData.append('notes', notes);
    return axios.put(`${API_URL}/gamification/redemptions/${requestId}/status`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  
  // Reports & Leaderboard
  getGamificationReport: (month = null, year = null) => {
    let url = `${API_URL}/gamification/report`;
    const params = [];
    if (month) params.push(`month=${month}`);
    if (year) params.push(`year=${year}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return axios.get(url, { headers: getAuthHeader() });
  },
  getLeaderboard: (period = 'month', limit = 10) => axios.get(`${API_URL}/gamification/leaderboard?period=${period}&limit=${limit}`, { headers: getAuthHeader() }),
  
  // KPIs
  getFamilyProductivityKpis: (dateFrom = null, dateTo = null) => {
    let url = `${API_URL}/reports/kpis/family-productivity`;
    const params = [];
    if (dateFrom) params.push(`date_from=${dateFrom}`);
    if (dateTo) params.push(`date_to=${dateTo}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return axios.get(url, { headers: getAuthHeader() });
  },

  // Visitas Técnicas
  listVisitas: (params = {}) => axios.get(`${API_URL}/visitas`, { params, headers: getAuthHeader() }),
  createVisita: (data) => axios.post(`${API_URL}/visitas`, data, { headers: getAuthHeader() }),
  updateVisita: (id, data) => axios.patch(`${API_URL}/visitas/${id}`, data, { headers: getAuthHeader() }),
  agendarVisita: (id, data) => axios.post(`${API_URL}/visitas/${id}/agendar`, data, { headers: getAuthHeader() }),
  cancelarVisita: (id) => axios.post(`${API_URL}/visitas/${id}/cancelar`, {}, { headers: getAuthHeader() }),
  getVisita: (id) => axios.get(`${API_URL}/visitas/${id}`, { headers: getAuthHeader() }),
  submitRelatorioVisita: (id, formData) =>
    axios.post(`${API_URL}/visitas/${id}/relatorio`, formData, {
      headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
    }),
  exportVisitasTecnicas: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/excel`, { params, headers: getAuthHeader(), responseType: 'blob' }),

  // Pesquisa de Jobs para autocomplete
  searchJobs: (q) => axios.get(`${API_URL}/jobs/search`, { params: { q, limit: 10 }, headers: getAuthHeader() }),

  // Catálogos VT
  listVendedores: () => getCachedOrFetch('catalogos_vendedores', () => axios.get(`${API_URL}/catalogos/vendedores`, { headers: getAuthHeader() }), 60000),
  createVendedor: (nome) => { clearCache('catalogos_vendedores'); return axios.post(`${API_URL}/catalogos/vendedores`, { nome }, { headers: getAuthHeader() }); },
  listTiposServico: () => getCachedOrFetch('catalogos_tipos_servico', () => axios.get(`${API_URL}/catalogos/tipos-servico`, { headers: getAuthHeader() }), 60000),
  createTipoServico: (nome) => { clearCache('catalogos_tipos_servico'); return axios.post(`${API_URL}/catalogos/tipos-servico`, { nome }, { headers: getAuthHeader() }); },
  listFerramentas: () => getCachedOrFetch('catalogos_ferramentas', () => axios.get(`${API_URL}/catalogos/ferramentas`, { headers: getAuthHeader() }), 60000),
  createFerramenta: (nome) => { clearCache('catalogos_ferramentas'); return axios.post(`${API_URL}/catalogos/ferramentas`, { nome }, { headers: getAuthHeader() }); },

  // Installer Google Calendar
  getInstallerCalendarStatus: () => getCachedOrFetch(
    'installer_calendar_status',
    () => axios.get(`${API_URL}/calendar/installer/status`, { headers: getAuthHeader() }),
    60000
  ),
  getInstallerAuthUrl: () => `${API_URL}/calendar/installer/auth/google`,
  syncJobToInstallerCalendar: (jobId) => axios.post(`${API_URL}/calendar/sync-installer/${jobId}`, {}, { headers: getAuthHeader() }),
};

export default api;