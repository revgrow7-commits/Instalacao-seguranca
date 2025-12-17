import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const api = {
  // Auth
  login: (email, password) => axios.post(`${API_URL}/auth/login`, { email, password }),
  getMe: () => axios.get(`${API_URL}/auth/me`, { headers: getAuthHeader() }),
  forgotPassword: (email) => axios.post(`${API_URL}/auth/forgot-password`, { email }),
  resetPassword: (token, newPassword) => axios.post(`${API_URL}/auth/reset-password`, { token, new_password: newPassword }),
  verifyResetToken: (token) => axios.get(`${API_URL}/auth/verify-reset-token?token=${token}`),
  adminResetPassword: (userId, newPassword) => axios.put(`${API_URL}/users/${userId}/reset-password`, { new_password: newPassword }, { headers: getAuthHeader() }),

  // Users
  getUsers: () => axios.get(`${API_URL}/users`, { headers: getAuthHeader() }),
  createUser: (data) => axios.post(`${API_URL}/auth/register`, data, { headers: getAuthHeader() }),
  updateUser: (userId, data) => axios.put(`${API_URL}/users/${userId}`, data, { headers: getAuthHeader() }),
  deleteUser: (userId) => axios.delete(`${API_URL}/users/${userId}`, { headers: getAuthHeader() }),
  changePassword: (currentPassword, newPassword) => axios.post(`${API_URL}/users/change-password`, { current_password: currentPassword, new_password: newPassword }, { headers: getAuthHeader() }),

  // Installers
  getInstallers: () => axios.get(`${API_URL}/installers`, { headers: getAuthHeader() }),
  updateInstaller: (installerId, data) => axios.put(`${API_URL}/installers/${installerId}`, data, { headers: getAuthHeader() }),

  // Holdprint & Jobs
  getHoldprintJobs: (branch) => axios.get(`${API_URL}/holdprint/jobs/${branch}`, { headers: getAuthHeader() }),
  createJob: (data) => axios.post(`${API_URL}/jobs`, data, { headers: getAuthHeader() }),
  getJobs: () => axios.get(`${API_URL}/jobs`, { headers: getAuthHeader() }),
  getJob: (jobId) => axios.get(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
  updateJob: (jobId, data) => axios.put(`${API_URL}/jobs/${jobId}`, data, { headers: getAuthHeader() }),
  assignJob: (jobId, installerIds) => axios.put(`${API_URL}/jobs/${jobId}/assign`, { installer_ids: installerIds }, { headers: getAuthHeader() }),
  scheduleJob: (jobId, scheduledDate, installerIds) => axios.put(`${API_URL}/jobs/${jobId}/schedule`, { scheduled_date: scheduledDate, installer_ids: installerIds }, { headers: getAuthHeader() }),
  
  // Item Assignments
  assignItemsToInstallers: (jobId, itemIndices, installerIds, options = {}) => axios.post(`${API_URL}/jobs/${jobId}/assign-items`, { 
    item_indices: itemIndices, 
    installer_ids: installerIds,
    difficulty_level: options.difficulty_level || null,
    scenario_category: options.scenario_category || null,
    apply_to_all: options.apply_to_all !== undefined ? options.apply_to_all : true
  }, { headers: getAuthHeader() }),
  getJobAssignments: (jobId) => axios.get(`${API_URL}/jobs/${jobId}/assignments`, { headers: getAuthHeader() }),
  updateAssignmentStatus: (jobId, itemIndex, data) => axios.put(`${API_URL}/jobs/${jobId}/assignments/${itemIndex}/status`, data, { headers: getAuthHeader() }),

  // Check-ins
  createCheckin: (formData) => axios.post(`${API_URL}/checkins`, formData, { 
    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } 
  }),
  checkout: (checkinId, formData) => axios.put(`${API_URL}/checkins/${checkinId}/checkout`, formData, { 
    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } 
  }),
  getCheckins: (jobId = null) => {
    const url = jobId ? `${API_URL}/checkins?job_id=${jobId}` : `${API_URL}/checkins`;
    return axios.get(url, { headers: getAuthHeader() });
  },
  getCheckinDetails: (checkinId) => axios.get(`${API_URL}/checkins/${checkinId}/details`, { headers: getAuthHeader() }),
  deleteCheckin: (checkinId) => axios.delete(`${API_URL}/checkins/${checkinId}`, { headers: getAuthHeader() }),
  
  // Item Check-ins (per item)
  createItemCheckin: (formData) => axios.post(`${API_URL}/item-checkins`, formData, { 
    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } 
  }),
  completeItemCheckout: (checkinId, formData) => axios.put(`${API_URL}/item-checkins/${checkinId}/checkout`, formData, { 
    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } 
  }),
  getItemCheckins: (jobId) => axios.get(`${API_URL}/item-checkins?job_id=${jobId}`, { headers: getAuthHeader() }),
  getAllItemCheckins: () => axios.get(`${API_URL}/item-checkins/all`, { headers: getAuthHeader() }),
  deleteItemCheckin: (checkinId) => axios.delete(`${API_URL}/item-checkins/${checkinId}`, { headers: getAuthHeader() }),
  
  // Item Pause/Resume
  pauseItemCheckin: (checkinId, reason) => {
    const formData = new FormData();
    formData.append('reason', reason);
    return axios.post(`${API_URL}/item-checkins/${checkinId}/pause`, formData, { 
      headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } 
    });
  },
  resumeItemCheckin: (checkinId) => axios.post(`${API_URL}/item-checkins/${checkinId}/resume`, {}, { headers: getAuthHeader() }),
  getItemPauseLogs: (checkinId) => axios.get(`${API_URL}/item-checkins/${checkinId}/pauses`, { headers: getAuthHeader() }),
  getPauseReasons: () => axios.get(`${API_URL}/pause-reasons`, { headers: getAuthHeader() }),
  
  // Job by ID
  getJobById: (jobId) => axios.get(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
  deleteJob: (jobId) => axios.delete(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),

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
};

export default api;