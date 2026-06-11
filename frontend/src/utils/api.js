import axios from 'axios';
import tokenManager from './tokenManager';

// REACT_APP_BACKEND_URL deve incluir /_/backend (monorepo Vercel: backend em /_/backend, frontend em /)
// Ex: https://backend-henna-one-82.vercel.app/_/backend → API_URL = .../api
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

// Contador de geração: impede que fetches em background anteriores a uma invalidação
// reescrevam dados velhos no localStorage após clearJobsCache() ser chamado.
let jobsCacheGeneration = 0;

// Limpa TANTO o Map em memória QUANTO o localStorage para jobs.
// Usar em qualquer mutation que mude jobs.status (checkin, checkout, schedule, etc.)
const clearJobsCache = () => {
  jobsCacheGeneration++; // invalida qualquer _fresh em voo
  clearCache('jobs_false');
  clearCache('jobs_true');
  clearCache('team_calendar');
  try {
    localStorage.removeItem(`${JOBS_CACHE_KEY}_false`);
    localStorage.removeItem(`${JOBS_CACHE_KEY}_true`);
  } catch { /* localStorage indisponível */ }
};

// Boot cleanup: remove chaves corrompidas de versões anteriores que usavam
// template string com objeto (ex: cache_jobs_v1_[object Object]).
try {
  Object.keys(localStorage)
    .filter(k => k.startsWith(JOBS_CACHE_KEY) && k.includes('['))
    .forEach(k => localStorage.removeItem(k));
} catch { /* localStorage indisponível */ }

// Aceita boolean (legado) ou options object { includeArchived }.
// Callers que passavam { days: 7 } recebiam object Object no key — corrigido.
const getJobsWithCache = async (options = false) => {
  const includeArchived = typeof options === 'boolean' ? options : Boolean(options?.includeArchived);
  const key = `${JOBS_CACHE_KEY}_${includeArchived}`;
  let stale = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) stale = JSON.parse(raw);
  } catch { /* localStorage indisponível */ }

  // Captura a geração atual: o .then só escreve se nenhum clearJobsCache ocorreu
  // entre o disparo do fetch e a resposta (race condition SWR).
  const capturedGeneration = jobsCacheGeneration;
  const freshPromise = axios
    .get(`${API_URL}/jobs${includeArchived ? '?include_archived=true' : ''}`, { headers: getAuthHeader() })
    .then(res => {
      // Só cacheia se o backend retornou um array real (evita cachear HTML de erros de roteamento)
      if (jobsCacheGeneration === capturedGeneration && Array.isArray(res.data)) {
        try {
          localStorage.setItem(key, JSON.stringify({ data: res.data, t: Date.now() }));
        } catch { /* quota exceeded */ }
      }
      return res;
    });

  // Só usa cache stale se contiver um array válido (proteção contra HTML cacheado por URL errada)
  if (stale && Array.isArray(stale.data) && Date.now() - stale.t < JOBS_CACHE_TTL) {
    // retorna stale agora, fresh continua em background
    return { data: stale.data, _stale: true, _fresh: freshPromise };
  }
  // Limpa cache corrompido silenciosamente
  if (stale && !Array.isArray(stale.data)) {
    try { localStorage.removeItem(key); } catch {}
  }
  return freshPromise;
};

// Interceptor global: sinaliza expiração de token via evento (sem hard reload).
// AuthContext escuta 'auth:expired' e faz setUser(null), React Router redireciona.
axios.interceptors.response.use(
  res => res,
  err => {
    const isLoginEndpoint = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginEndpoint) {
      tokenManager.clearToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(err);
  }
);

// Retry com backoff exponencial para erros de rede e 5xx.
// Não retenta em 4xx (erros de cliente são definitivos).
const withRetry = async (fn, { retries = 3, baseDelayMs = 1000 } = {}) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
      const isServerError = err.response?.status >= 500;
      const shouldRetry = (isNetworkError || isServerError) && attempt < retries;
      if (!shouldRetry) throw err;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
    }
  }
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
  getUsers: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.role) qs.set('role', params.role);
    if (typeof params.is_active === 'boolean') qs.set('is_active', String(params.is_active));
    const url = qs.toString() ? `${API_URL}/users?${qs.toString()}` : `${API_URL}/users`;
    return axios.get(url, { headers: getAuthHeader() });
  },
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
    clearJobsCache();
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
    clearJobsCache();
    clearCache(`job_${jobId}`);
    return axios.put(`${API_URL}/jobs/${jobId}`, data, { headers: getAuthHeader() });
  },
  assignJob: (jobId, installerIds) => {
    clearJobsCache();
    return axios.put(`${API_URL}/jobs/${jobId}/assign`, { installer_ids: installerIds }, { headers: getAuthHeader() });
  },
  scheduleJob: async (jobId, { scheduledDate, scheduledTimeEnd, installerIds, status, rescheduleNote } = {}) => {
    clearJobsCache();
    const response = await axios.put(`${API_URL}/jobs/${jobId}/schedule`, {
      scheduled_date: scheduledDate,
      scheduled_time_end: scheduledTimeEnd || null,
      installer_ids: installerIds || null,
      status: status || null,
      reschedule_note: rescheduleNote || null,
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
    clearJobsCache();
    clearCache('checkins_all');
    return axios.post(`${API_URL}/checkins`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
  },
  checkout: (checkinId, formData) => {
    clearJobsCache();
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
  archiveCheckin: (checkinId) => axios.put(`${API_URL}/checkins/${checkinId}/archive`, {}, { headers: getAuthHeader() }),
  deleteCheckin: (checkinId) => axios.delete(`${API_URL}/checkins/${checkinId}`, { headers: getAuthHeader() }),
  
  // Item Check-ins (per item) — submits críticos usam withRetry (instalador em campo, 3G)
  createItemCheckin: (formData) => {
    const jobId = formData.get ? formData.get('job_id') : null;
    clearJobsCache();
    if (jobId) clearCache(`item_checkins_${jobId}`);
    return withRetry(() =>
      axios.post(`${API_URL}/item-checkins`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } })
    );
  },
  completeItemCheckout: (checkinId, formData) => {
    const jobId = formData.get ? formData.get('job_id') : null;
    clearJobsCache();
    if (jobId) clearCache(`item_checkins_${jobId}`);
    clearCache(`item_pause_logs_${checkinId}`);
    clearCache('gamification_balance');
    clearCache('gamification_transactions');
    return withRetry(() =>
      axios.put(`${API_URL}/item-checkins/${checkinId}/checkout`, formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } })
    );
  },
  batchCheckin: (payload) => {
    clearJobsCache();
    if (payload.job_id) clearCache(`item_checkins_${payload.job_id}`);
    return withRetry(() =>
      axios.post(`${API_URL}/item-checkins/batch`, payload, { headers: getAuthHeader() })
    );
  },
  getItemCheckins: (jobId) => getCachedOrFetch(
    `item_checkins_${jobId}`,
    () => axios.get(`${API_URL}/item-checkins?job_id=${jobId}`, { headers: getAuthHeader() }),
    20000
  ),
  getAllItemCheckins: async () => {
    const CACHE_KEY = 'checkins_all_v1';
    const CACHE_TTL = 60 * 1000;

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          return data;
        }
      }
    } catch (_) {}

    const PAGE = 500;
    let offset = 0;
    const all = [];
    while (true) {
      const r = await axios.get(
        `${API_URL}/item-checkins/all?limit=${PAGE}&offset=${offset}&status=completed,paused,in_progress`,
        { headers: getAuthHeader(), timeout: 15000 }
      );
      const batch = r.data || [];
      all.push(...batch);
      if (batch.length < PAGE) break;
      offset += PAGE;
      if (offset > 50000) break;
    }

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: all, ts: Date.now() }));
    } catch (_) {}

    return all;
  },
  deleteItemCheckin: (checkinId) => axios.delete(`${API_URL}/item-checkins/${checkinId}`, { headers: getAuthHeader() }),
  archiveItemCheckin: (checkinId) => axios.put(`${API_URL}/item-checkins/${checkinId}/archive`, {}, { headers: getAuthHeader() }),
  bulkArchiveItemCheckins: (ids) => axios.put(`${API_URL}/item-checkins/bulk-archive`, { ids }, { headers: getAuthHeader() }),
  
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
  // @deprecated usar getJob (mesma rota, com cache de 20s). Alias mantido para compatibilidade.
  getJobById: (jobId) => api.getJob(jobId),
  deleteJob: (jobId) => axios.delete(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
  reprocessJobProducts: (jobId) => axios.post(`${API_URL}/jobs/${jobId}/reprocess-products`, {}, { headers: getAuthHeader() })
    .then((r) => { clearCache(`job_${jobId}`); return r; }), // invalida o cache de getJob — senão a releitura pós-reprocess vem stale
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
  confirmarVisita: (id, data) => axios.post(`${API_URL}/visitas/${id}/confirmar`, data, { headers: getAuthHeader() }),
  rejeitarVisita: (id, motivo) => axios.post(`${API_URL}/visitas/${id}/rejeitar`, { motivo }, { headers: getAuthHeader() }),
  getVisita: (id) => axios.get(`${API_URL}/visitas/${id}`, { headers: getAuthHeader() }),
  enviarEmailVisita: (id) =>
    axios.post(`${API_URL}/visitas/${id}/enviar-email`, {}, { headers: getAuthHeader() }),
  submitRelatorioVisita: (id, formData) =>
    axios.post(`${API_URL}/visitas/${id}/relatorio`, formData, {
      headers: getAuthHeader(),
    }),
  exportVisitasTecnicas: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/excel`, { params, headers: getAuthHeader(), responseType: 'blob' }),

  // Visitas Técnicas — Relatórios analíticos
  getVisitasReportByVendedor: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-vendedor`, { params, headers: getAuthHeader() }),
  getVisitasReportByFilial: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-filial`, { params, headers: getAuthHeader() }),
  getVisitasReportByAprovacao: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-aprovacao`, { params, headers: getAuthHeader() }),
  getVisitasReportByDificuldade: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-dificuldade`, { params, headers: getAuthHeader() }),
  getVisitasReportByTipoServico: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-tipo-servico`, { params, headers: getAuthHeader() }),
  getVisitasReportByAltura: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-altura`, { params, headers: getAuthHeader() }),
  getVisitasReportDivergenciaRemocao: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/divergencia-remocao`, { params, headers: getAuthHeader() }),
  getVisitasReportCustoDeslocamento: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/custo-deslocamento`, { params, headers: getAuthHeader() }),
  getVisitasReportByInstalador: (params = {}) =>
    axios.get(`${API_URL}/visitas/reports/by-instalador`, { params, headers: getAuthHeader() }),

  // Pesquisa de Jobs para autocomplete
  searchJobs: (q) => axios.get(`${API_URL}/jobs/search`, { params: { q, limit: 10 }, headers: getAuthHeader() }),

  // Catálogos VT
  listVendedores: () => getCachedOrFetch('catalogos_vendedores', () => axios.get(`${API_URL}/catalogos/vendedores`, { headers: getAuthHeader() }), 60000),
  createVendedor: (nome) => { clearCache('catalogos_vendedores'); return axios.post(`${API_URL}/catalogos/vendedores`, { nome }, { headers: getAuthHeader() }); },
  listTiposServico: () => getCachedOrFetch('catalogos_tipos_servico', () => axios.get(`${API_URL}/catalogos/tipos-servico`, { headers: getAuthHeader() }), 60000),
  createTipoServico: (nome) => { clearCache('catalogos_tipos_servico'); return axios.post(`${API_URL}/catalogos/tipos-servico`, { nome }, { headers: getAuthHeader() }); },
  listFerramentas: () => getCachedOrFetch('catalogos_ferramentas', () => axios.get(`${API_URL}/catalogos/ferramentas`, { headers: getAuthHeader() }), 60000),
  createFerramenta: (nome) => { clearCache('catalogos_ferramentas'); return axios.post(`${API_URL}/catalogos/ferramentas`, { nome }, { headers: getAuthHeader() }); },

  // CS Integration (proxy via backend — token nunca vai ao bundle)
  getCsResponsaveis: () => axios.get(`${API_URL}/cs/responsaveis`, { headers: getAuthHeader() }),
  getCsColaboradores: (role) => getCachedOrFetch(
    `cs_colaboradores${role ? `_${role}` : ''}`,
    () => axios.get(`${API_URL}/cs/colaboradores${role ? `?role=${role}` : ''}`, { headers: getAuthHeader() }),
    5 * 60 * 1000
  ),
  createCsTicket: (payload) => axios.post(`${API_URL}/cs/ticket`, payload, { headers: getAuthHeader() }),

  // Installer Google Calendar
  getInstallerCalendarStatus: () => getCachedOrFetch(
    'installer_calendar_status',
    () => axios.get(`${API_URL}/calendar/installer/status`, { headers: getAuthHeader() }),
    60000
  ),
  getInstallerAuthUrl: () => `${API_URL}/calendar/installer/auth/google`,
  syncJobToInstallerCalendar: (jobId) => axios.post(`${API_URL}/calendar/sync-installer/${jobId}`, {}, { headers: getAuthHeader() }),

  // Job Photos
  getJobPhotos: (jobId) => axios.get(`${API_URL}/jobs/${jobId}/photos`, { headers: getAuthHeader() }),
  uploadJobPhoto: (jobId, data) => axios.post(`${API_URL}/jobs/${jobId}/photos`, data, { headers: getAuthHeader() }),
  deleteJobPhoto: (jobId, photoId) => axios.delete(`${API_URL}/jobs/${jobId}/photos/${photoId}`, { headers: getAuthHeader() }),
};

export default api;