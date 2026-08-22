const DEFAULT_API_BASE_URL = 'http://127.0.0.1:5000';

export const environment = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
  apiTimeoutMs: 15000,
};
