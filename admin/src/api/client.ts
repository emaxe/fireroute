/**
 * Axios client for the admin React UI.
 *
 * - Automatically attaches the JWT token from localStorage to every request.
 * - On 401, clears the token and redirects to /login so the user never sees
 *   stale authenticated views after expiry or logout.
 */
import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1/admin',
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default API;
