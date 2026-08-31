import { apiClient } from '../../../services/api/apiClient';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid username or password.';

function loginWasRejected(response) {
  return response?.success === false
    || response?.authenticated === false
    || response?.loggedIn === false;
}

export const authService = {
  async login({ username, password }) {
    try {
      const response = await apiClient.post('/api/login', { username, password });

      if (loginWasRejected(response)) {
        throw new Error(INVALID_CREDENTIALS_MESSAGE);
      }

      return {
        user: response?.user || { username },
        session: response,
      };
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.message === INVALID_CREDENTIALS_MESSAGE) {
        throw new Error(INVALID_CREDENTIALS_MESSAGE);
      }
      throw error;
    }
  },
  async logout() {
    return Promise.resolve();
  },
};
