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

  // Users
  getUsers: () => axios.get(`${API_URL}/users`, { headers: getAuthHeader() }),
  createUser: (data) => axios.post(`${API_URL}/auth/register`, data, { headers: getAuthHeader() }),
  updateUser: (userId, data) => axios.put(`${API_URL}/users/${userId}`, data, { headers: getAuthHeader() }),
  deleteUser: (userId) => axios.delete(`${API_URL}/users/${userId}`, { headers: getAuthHeader() }),

  // Installers
  getInstallers: () => axios.get(`${API_URL}/installers`, { headers: getAuthHeader() }),
  updateInstaller: (installerId, data) => axios.put(`${API_URL}/installers/${installerId}`, data, { headers: getAuthHeader() }),

  // Holdprint & Jobs
  getHoldprintJobs: (branch) => axios.get(`${API_URL}/holdprint/jobs/${branch}`, { headers: getAuthHeader() }),
  createJob: (data) => axios.post(`${API_URL}/jobs`, data, { headers: getAuthHeader() }),
  getJobs: () => axios.get(`${API_URL}/jobs`, { headers: getAuthHeader() }),
  getJob: (jobId) => axios.get(`${API_URL}/jobs/${jobId}`, { headers: getAuthHeader() }),
  assignJob: (jobId, installerIds) => axios.put(`${API_URL}/jobs/${jobId}/assign`, { installer_ids: installerIds }, { headers: getAuthHeader() }),
  scheduleJob: (jobId, scheduledDate, installerIds) => axios.put(`${API_URL}/jobs/${jobId}/schedule`, { scheduled_date: scheduledDate, installer_ids: installerIds }, { headers: getAuthHeader() }),

  // Check-ins
  createCheckin: (data) => axios.post(`${API_URL}/checkins`, data, { headers: getAuthHeader() }),
  checkout: (checkinId, data) => axios.put(`${API_URL}/checkins/${checkinId}/checkout`, data, { headers: getAuthHeader() }),
  getCheckins: (jobId = null) => {
    const url = jobId ? `${API_URL}/checkins?job_id=${jobId}` : `${API_URL}/checkins`;
    return axios.get(url, { headers: getAuthHeader() });
  },

  // Metrics
  getMetrics: () => axios.get(`${API_URL}/metrics`, { headers: getAuthHeader() }),
};

export default api;