import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthForm = url.includes('/auth/login') || url.includes('/auth/register');

    // A 401 from the login/register form means "wrong credentials" - let the
    // page show the error instead of reloading. Any other 401 = expired session.
    if (error.response?.status === 401 && !isAuthForm) {
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;