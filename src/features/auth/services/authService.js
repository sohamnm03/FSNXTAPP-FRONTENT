import { apiClient } from '../../../services/api/apiClient';
import { environment } from '../../../config/environment';
import { validateGoogleCredential } from './googleCredential';

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
  async loginWithGoogle(credential, expectedAudience = environment.googleClientId) {
    const validatedCredential = validateGoogleCredential(
      credential,
      expectedAudience,
    );
    const response = await apiClient.post('/api/auth/google', {
      credential: validatedCredential,
    });

    if (loginWasRejected(response) || !response?.user) {
      throw new Error(response?.message || 'Google sign-in was rejected.');
    }

    return {
      user: response.user,
      session: response,
    };
  },
  async loginWithGoogleDesktop(authorization) {
    const response = await apiClient.post('/api/auth/google/desktop', authorization);

    if (loginWasRejected(response) || !response?.user) {
      throw new Error(response?.message || 'Google desktop sign-in was rejected.');
    }

    return {
      user: response.user,
      session: response,
    };
  },
  async logout() {
    return Promise.resolve();
  },
};
