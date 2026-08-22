import { mockCredentials } from '../../../config/mockCredentials';

const MOCK_NETWORK_DELAY_MS = 900;
const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

export const authService = {
  async login({ username, password }) {
    await delay(MOCK_NETWORK_DELAY_MS);
    if (username !== mockCredentials.username || password !== mockCredentials.password) {
      throw new Error('The username or password is incorrect.');
    }
    return { user: { username: mockCredentials.username }, session: { mode: 'development-mock' } };
  },
  async logout() {
    return Promise.resolve();
  },
};
