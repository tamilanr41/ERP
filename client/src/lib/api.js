import axios from 'axios';

/**
 * The deployed API origin. Not a secret - it ships inside the JS bundle either
 * way - so it is held here as a safety net rather than only in the host's build
 * settings, where forgetting it fails silently.
 */
export const DEFAULT_API_ORIGIN = 'https://erp-ci2w.onrender.com/api';

const isLocalDev = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

/**
 * Resolved base URL.
 *
 * Local dev: Vite proxies /api to the local server (see vite.config.js).
 * Deployed: the page is served from the static host and the API from a different
 * origin, so a relative '/api' would be sent to the static host - whose SPA
 * fallback answers every such request with index.html. Login then fails with a
 * confusing HTML parse error and nothing pointing at the base URL. Falling back
 * to the known origin turns that silent failure into a working build.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || (isLocalDev ? '/api' : DEFAULT_API_ORIGIN);

if (!import.meta.env.VITE_API_URL && !isLocalDev) {
  // eslint-disable-next-line no-console
  console.warn(
    `[api] VITE_API_URL is not set for this build; falling back to ${DEFAULT_API_ORIGIN}. ` +
      'Set VITE_API_URL in the host build environment if the API moves.',
  );
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const TOKEN_KEY = 'erp_access_token';
export const REFRESH_KEY = 'erp_refresh_token';
export const USER_KEY = 'erp_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

let refreshing = null;

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && !original.url.includes('/auth/login')) {
      original._retry = true;
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearSession();
        window.location.href = '/login';
        return Promise.reject(error);
      }
      if (!refreshing) {
        refreshing = axios
          .post('/api/auth/refresh', { refreshToken })
          .then((res) => {
            const { accessToken, refreshToken, user, permissions } = res.data.data;
            localStorage.setItem(TOKEN_KEY, accessToken);
            localStorage.setItem(REFRESH_KEY, refreshToken);
            localStorage.setItem(USER_KEY, JSON.stringify({ ...user, permissions: resolveStoredPermissions(user, permissions) }));
            return accessToken;
          })
          .finally(() => {
            refreshing = null;
          });
      }
      try {
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        clearSession();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export const resolveStoredPermissions = (user, permissions) => {
  if (Array.isArray(user?.permissions) && user.permissions.length) return user.permissions;
  return Array.isArray(permissions) ? permissions : [];
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
};

export const apiError = (err) => {
  const msg = err?.response?.data?.message;
  const fieldErrors = err?.response?.data?.errors;
  if (fieldErrors && Array.isArray(fieldErrors) && fieldErrors.length) {
    return fieldErrors.map((f) => f.msg || f.message).join(', ');
  }
  return msg || err?.message || 'Something went wrong';
};

export default api;