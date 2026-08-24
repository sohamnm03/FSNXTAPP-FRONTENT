const FRONTEND_USERNAME = 'admin';
const FRONTEND_PASSWORD = 'password123';

export const authService = {
  async login({ username, password }) {
    if (username !== FRONTEND_USERNAME || password !== FRONTEND_PASSWORD) {
      throw new Error('Invalid username or password.');
    }
    return {
      user: { username },
      session: { success: true },
    };
  },
  async logout() {
    return Promise.resolve();
  },
};
