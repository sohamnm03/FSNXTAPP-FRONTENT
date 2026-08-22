import { apiClient } from '../../../services/api/apiClient';

export const authService = {
  async login({ username, password }) {
    const response = await apiClient.post('/api/login', { username, password });

    if (!response?.success) {
      throw new Error(response?.message || 'Login failed. Please check your credentials.');
    }

    if (!response.access_token) {
      throw new Error('Login succeeded without an access token.');
    }
    apiClient.setAccessToken(response.access_token);

    return {
      user: { username },
      session: response,
    };
  },
  async logout() {
    apiClient.setAccessToken('');
    return Promise.resolve();
  },
};
