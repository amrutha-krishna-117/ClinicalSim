import axios from 'axios';
import { clearAuthState } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token on every request — reads fresh from localStorage each time
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 401 handler: clear auth state completely and redirect ONCE.
// CRITICAL: must also clear Zustand store, not just localStorage,
// otherwise the login page sees isAuthenticated=true and bounces back to dashboard.
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const url = err.config?.url ?? '';
      if (!url.includes('/auth/')) {
        // Clear both storage locations
        localStorage.removeItem('token');
        localStorage.removeItem('clinicalsim-auth');
        // Redirect only if not already on login
        if (!window.location.pathname.startsWith('/login')) {
          window.location.replace('/login');
        }
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, full_name: string, role = 'STUDENT') =>
    api.post('/auth/register', { email, password, full_name, role }),
};

export const scenariosApi = {
  list: (params?: Record<string, string>) => api.get('/scenarios', { params }),
  get: (id: string) => api.get(`/scenarios/${id}`),
};

export const sessionsApi = {
  create: (scenario_id: string) => api.post('/sessions', { scenario_id }),
  get: (id: string) => api.get(`/sessions/${id}`),
  getMessages: (id: string) => api.get(`/sessions/${id}/messages`),
  sendMessage: (id: string, message: string, stage = 'general') =>
    api.post(`/sessions/${id}/conversation`, { message, stage }),
  examine: (id: string, region: string, method: string, instrument?: string) =>
    api.post(`/sessions/${id}/examination`, { region, method, instrument }),
  getVitals: (id: string) => api.get(`/sessions/${id}/vitals`),
  getAllowedMethods: (id: string, region: string) =>
    api.get(`/sessions/${id}/allowed-methods/${region}`),
  orderInvestigation: (id: string, investigation: string) =>
    api.post(`/sessions/${id}/investigation`, { investigation }),
  submitDiagnosis: (id: string, data: {
    primary_diagnosis: string; differentials: string[]; confidence: number; reasoning: string;
  }) => api.post(`/sessions/${id}/diagnosis`, data),
  updatePosition: (id: string, position: string) =>
    api.post(`/sessions/${id}/position`, { position }),
  complete: (id: string) => api.post(`/sessions/${id}/complete`),
  getAssessment: (id: string) => api.get(`/sessions/${id}/assessment`),
};

export const analyticsApi = {
  student: () => api.get('/analytics/student'),
  faculty: () => api.get('/analytics/faculty'),
  facultyEnhanced: () => api.get('/analytics/faculty/enhanced'),
};
