import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Permission } from '@anyit/shared';
import api from '@/lib/api';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  instituteId: string;
  role: {
    id: string;
    key: string;
    name: string;
    permissions: Permission[] | ['*'];
  };
};

function readStoredAccessToken() {
  return localStorage.getItem('accessToken');
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  /** Reactive mirror of localStorage token — localStorage alone is not reactive. */
  const accessToken = ref<string | null>(readStoredAccessToken());

  const isAuthenticated = computed(() => !!accessToken.value);
  const permissions = computed(() => user.value?.role.permissions ?? []);

  function setTokens(access: string, refresh: string) {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    accessToken.value = access;
  }

  function clearSession() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    accessToken.value = null;
    user.value = null;
  }

  function can(...needed: Permission[]) {
    const perms = permissions.value as string[];
    if (perms.includes('*')) return true;
    return needed.some((p) => perms.includes(p));
  }

  async function login(email: string, password: string) {
    loading.value = true;
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setTokens(data.data.accessToken, data.data.refreshToken);
      user.value = data.data.user;
      return data.data.user as AuthUser;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMe() {
    if (!accessToken.value && !readStoredAccessToken()) return null;
    if (!accessToken.value) accessToken.value = readStoredAccessToken();
    const { data } = await api.get('/auth/me');
    user.value = {
      id: data.data.user._id,
      name: data.data.user.name,
      email: data.data.user.email,
      instituteId: data.data.user.instituteId,
      role: {
        id: data.data.role._id,
        key: data.data.role.key,
        name: data.data.role.name,
        permissions: data.data.permissions,
      },
    };
    return user.value;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore network errors — always clear local session */
    }
    clearSession();
  }

  return {
    user,
    loading,
    accessToken,
    isAuthenticated,
    permissions,
    can,
    login,
    fetchMe,
    logout,
    setTokens,
    clearSession,
  };
});
