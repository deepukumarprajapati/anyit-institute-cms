import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && localStorage.getItem('refreshToken')) {
      original._retry = true;
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {
          refreshToken: localStorage.getItem('refreshToken'),
        });
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        // Keep Pinia auth state in sync when refresh rotates tokens
        try {
          const { useAuthStore } = await import('@/stores/auth');
          useAuthStore().setTokens(data.data.accessToken, data.data.refreshToken);
        } catch {
          /* store may be unavailable during early boot */
        }
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        try {
          const { useAuthStore } = await import('@/stores/auth');
          useAuthStore().clearSession();
        } catch {
          /* ignore */
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: { code: string; message: string };
};
