import axios from 'axios';

// Local dev: Vite proxies /api to http://localhost:5000 (see vite.config.js).
// Netlify: set VITE_API_URL in the site's build environment to the API origin,
// e.g. https://your-api.onrender.com/api
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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