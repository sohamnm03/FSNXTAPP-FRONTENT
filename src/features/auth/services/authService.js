import { apiClient } from '../../../services/api/apiClient';

export const authService = {
  async login({ username, password }) {
    const response = await apiClient.post('/api/login', { username, password });

    if (!response?.success) {
      throw new Error(response?.message || 'Login failed. Please check your credentials.');
    }

    return {
      user: { username },
      session: response,
    };
  },
  async logout() {
    return Promise.resolve();
  },
};
